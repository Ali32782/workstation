import { NextRequest, NextResponse } from "next/server";
import { downloadDocumentPdf } from "@/lib/sign/documenso";
import { blockIfSignDocumentInaccessible } from "@/lib/sign/document-access-guard";
import { resolveSignSession } from "@/lib/sign/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safePdfDownloadName(raw: string | null, documentId: number): string {
  const fallback = `signiert-${documentId}.pdf`;
  const trimmed = raw?.trim();
  if (!trimmed) return fallback;
  const noQuotes = trimmed.replace(/["\r\n]/g, "");
  const stripped = noQuotes
    .replace(/[/\\?%*:|<>]/g, "_")
    .slice(0, 180)
    .trim();
  if (!stripped) return fallback;
  return stripped.toLowerCase().endsWith(".pdf") ? stripped : `${stripped}.pdf`;
}

/**
 * Streams the document PDF back to the browser, so the in-portal field
 * editor can render it via pdf.js. We always proxy through the portal —
 * the signed Documenso URL has tight expiration / IP restrictions that
 * would otherwise break in some setups.
 *
 * Query:
 *   download=1 — send Content-Disposition: attachment (archive download)
 *   filename=… — suggested filename (sanitized; should end in .pdf)
 */
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveSignSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json(
      { error: r.message, workspace: r.workspace, code: "not_configured" },
      { status: 503 },
    );
  }

  const { id: idStr } = await context.params;
  const id = Number(idStr);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  const deny = await blockIfSignDocumentInaccessible(
    r.session.workspace,
    id,
    r.session.username,
  );
  if (deny) return deny;

  try {
    const pdf = await downloadDocumentPdf(r.session.tenant, id);
    const wantDownload =
      req.nextUrl.searchParams.get("download") === "1" ||
      req.nextUrl.searchParams.get("disposition") === "attachment";
    const filename = wantDownload
      ? safePdfDownloadName(req.nextUrl.searchParams.get("filename"), id)
      : null;

    const headers: Record<string, string> = {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.length),
      "Cache-Control": "private, max-age=60",
    };
    if (filename) {
      headers["Content-Disposition"] = `attachment; filename="${filename.replace(/"/g, "_")}"`;
    }

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers,
    });
  } catch (e) {
    console.error(`[/api/sign/document/${idStr}/pdf] failed:`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
