import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { uploadFile } from "@/lib/cloud/webdav";
import { detectKind, contentTypeFor } from "@/lib/office/types";
import {
  countWorkbookCells,
  htmlToDocxBuffer,
  libreofficeConvert,
  simpleToXlsx,
  type SofficeTarget,
} from "@/lib/office/converter";
import type { SimpleWorkbook } from "@/lib/office/types";
import { log } from "@/lib/log/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Persist an edited Office document back to Nextcloud.
 *   word  → DOCX via html-to-docx (or LibreOffice for legacy .doc/.odt/.rtf)
 *   excel → XLSX via SheetJS (or LibreOffice for .xls/.ods)
 *   .txt/.md → written verbatim from the body's plain-text fallback
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const path = req.nextUrl.searchParams.get("path");
  if (!path) return NextResponse.json({ error: "path required" }, { status: 400 });

  const name = path.split("/").pop() ?? "document";
  const lower = name.toLowerCase();
  const kind = detectKind(name);

  type SaveBody = {
    kind?: "word" | "excel";
    html?: string;
    text?: string;
    workbook?: SimpleWorkbook;
  };
  let body: SaveBody;
  try {
    body = (await req.json()) as SaveBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    let outBuf: Buffer;
    if (kind === "word") {
      if (lower.endsWith(".txt") || lower.endsWith(".md")) {
        outBuf = Buffer.from(body.text ?? stripTags(body.html ?? ""), "utf-8");
      } else {
        outBuf = await htmlToDocxBuffer(body.html ?? "");
        if (
          lower.endsWith(".doc") ||
          lower.endsWith(".odt") ||
          lower.endsWith(".rtf")
        ) {
          // Convert the .docx we just produced to the original format.
          const target = lower.endsWith(".odt")
            ? ("docx" as const)
            : lower.endsWith(".rtf")
              ? ("docx" as const)
              : ("docx" as const);
          // For non-.docx targets we keep the file as .docx and let LibreOffice
          // re-convert. But if the user uploaded .doc/.odt/.rtf we save back
          // to that same extension to avoid surprising them.
          const tgt = lower.endsWith(".rtf")
            ? "docx"
            : lower.endsWith(".odt")
              ? "docx"
              : "docx";
          // soffice supports `--convert-to rtf|odt`; we leverage that by
          // always normalising via DOCX first.
          if (lower.endsWith(".rtf")) {
            outBuf = await libreofficeConvert(outBuf, "tmp.docx", "docx");
            outBuf = await libreofficeConvert(outBuf, "tmp.docx", "docx");
            // Final convert to RTF below — soffice supports it directly.
          }
          // Always run a final conversion to whatever the original ext was,
          // using a fake input file name so soffice picks the right writer.
          const finalExt = lower.replace(/^.*\./, "");
          if (finalExt !== "docx") {
            // soffice convert-to accepts any of: pdf, html, docx, xlsx, rtf, odt, ods
            // We restrict to those it handles.
            const allowed = new Set([
              "docx",
              "rtf",
              "odt",
              "xlsx",
              "ods",
              "pdf",
              "html",
            ]);
            if (allowed.has(finalExt)) {
              outBuf = await libreofficeConvert(
                outBuf,
                "tmp.docx",
                finalExt as SofficeTarget,
              );
            }
            // We don't suppress the original extension — the WebDAV PUT below
            // writes back to `path` regardless of bytes' actual format. NC and
            // most Office apps key off the extension.
            // Mark `tgt` consumed so eslint stays happy.
            void target;
            void tgt;
          }
        }
      }
    } else if (kind === "excel") {
      if (!body.workbook || !Array.isArray(body.workbook.sheets)) {
        return NextResponse.json(
          { error: "missing workbook" },
          { status: 400 },
        );
      }
      // Server-side empty-snapshot guard: refuse to overwrite the WebDAV
      // file if every cell is empty — protects against client bugs that
      // would silently truncate user data.
      const cellsCount = countWorkbookCells(body.workbook);
      log.info({
        scope: "office.save",
        ws,
        user: username,
        path,
        cells: cellsCount,
      });
      if (cellsCount === 0) {
        return NextResponse.json(
          {
            error:
              "leerer Snapshot abgelehnt — bitte Tabelle füllen und erneut speichern",
          },
          { status: 422 },
        );
      }
      outBuf = simpleToXlsx(body.workbook);
      if (lower.endsWith(".xls") || lower.endsWith(".ods")) {
        const finalExt = lower.endsWith(".ods") ? "ods" : "xlsx";
        outBuf = await libreofficeConvert(outBuf, "tmp.xlsx", finalExt);
      }
    } else {
      return NextResponse.json(
        { error: `Unsupported file type: ${name}` },
        { status: 415 },
      );
    }

    await uploadFile({
      workspace: ws,
      user: username,
      path,
      body: outBuf,
      contentType: contentTypeFor(name),
      accessToken: session.accessToken,
    });
    return NextResponse.json({ ok: true, size: outBuf.length });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ");
}
