import { NextRequest, NextResponse } from "next/server";
import { downloadDocumentPdf } from "@/lib/sign/documenso";
import { resolveSignSession } from "@/lib/sign/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams the document PDF back to the browser, so the in-portal field
 * editor can render it via pdf.js. We always proxy through the portal —
 * the signed Documenso URL has tight expiration / IP restrictions that
 * would otherwise break in some setups.
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

  try {
    const pdf = await downloadDocumentPdf(r.session.tenant, id);
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (e) {
    console.error(`[/api/sign/document/${idStr}/pdf] failed:`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
