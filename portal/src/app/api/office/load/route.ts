import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { downloadFile } from "@/lib/cloud/webdav";
import {
  contentTypeFor,
  detectKind,
  type OfficeDocument,
} from "@/lib/office/types";
import {
  docxToHtml,
  emptyXlsxBuffer,
  libreofficeConvert,
  xlsxToSimple,
} from "@/lib/office/converter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Load an Office file from Nextcloud and convert it into the editor's
 * canonical model:
 *   word  → { html, text }
 *   excel → { workbook: SimpleWorkbook }
 * Legacy formats (.doc, .xls, .odt, .ods) are upcasted via LibreOffice.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const name = path.split("/").pop() ?? "document";
  const lower = name.toLowerCase();
  const kind = detectKind(name);

  try {
    const upstream = await downloadFile({
      workspace: ws,
      user: username,
      path,
      accessToken: session.accessToken,
    });
    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return NextResponse.json(
        { error: `Nextcloud GET ${upstream.status}: ${text.slice(0, 200)}` },
        { status: upstream.status },
      );
    }
    const ab = await upstream.arrayBuffer();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let buf: Buffer = Buffer.from(new Uint8Array(ab)) as any;

    const meta = {
      path,
      name,
      contentType: contentTypeFor(name),
      modified: upstream.headers.get("last-modified") ?? undefined,
      size: buf.length,
    };

    if (kind === "word") {
      // Upcast legacy formats to .docx via LibreOffice first.
      if (
        (lower.endsWith(".doc") ||
          lower.endsWith(".odt") ||
          lower.endsWith(".rtf")) &&
        buf.length > 0
      ) {
        buf = await libreofficeConvert(buf, name, "docx");
      } else if (lower.endsWith(".txt") || lower.endsWith(".md")) {
        const txt = buf.toString("utf-8");
        const html = txt
          .split(/\n\n+/)
          .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
          .join("");
        const doc: OfficeDocument = { kind: "word", html, text: txt, meta };
        return NextResponse.json(doc);
      }
      if (buf.length === 0) {
        const doc: OfficeDocument = {
          kind: "word",
          html: "<p></p>",
          text: "",
          meta,
        };
        return NextResponse.json(doc);
      }
      const { html, text } = await docxToHtml(buf);
      const doc: OfficeDocument = { kind: "word", html, text, meta };
      return NextResponse.json(doc);
    }

    if (kind === "excel") {
      if (
        (lower.endsWith(".xls") || lower.endsWith(".ods")) &&
        buf.length > 0
      ) {
        buf = await libreofficeConvert(buf, name, "xlsx");
      }
      // Empty cloud files (create-doc placeholders, or 0-byte uploads) break
      // SheetJS — seed a minimal workbook for every spreadsheet kind.
      if (buf.length === 0) {
        buf = emptyXlsxBuffer();
      }
      const workbook = xlsxToSimple(buf);
      const doc: OfficeDocument = { kind: "excel", workbook, meta };
      return NextResponse.json(doc);
    }

    return NextResponse.json(
      { error: `Unsupported file type: ${name}` },
      { status: 415 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
