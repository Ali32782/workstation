import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { detectKind } from "@/lib/office/types";
import {
  htmlToDocxBuffer,
  libreofficeConvert,
  univerToXlsx,
} from "@/lib/office/converter";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 90;

/**
 * Render the in-memory editor state as PDF without round-tripping through
 * Nextcloud. The client posts the same shape as `/api/office/save` and gets
 * back a PDF stream that can either be downloaded or displayed in a sidecar.
 *
 *   word  → html-to-docx → soffice --convert-to pdf
 *   excel → SheetJS write → soffice --convert-to pdf
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const filename = req.nextUrl.searchParams.get("name") ?? "document";
  const kind = detectKind(filename);

  type Body = {
    kind?: "word" | "excel";
    html?: string;
    text?: string;
    workbook?: unknown;
  };
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    let intermediate: Buffer;
    let intermediateName: string;
    if (kind === "word" || body.kind === "word") {
      intermediate = await htmlToDocxBuffer(body.html ?? "");
      intermediateName = "tmp.docx";
    } else if (kind === "excel" || body.kind === "excel") {
      if (!body.workbook) {
        return NextResponse.json(
          { error: "missing workbook" },
          { status: 400 },
        );
      }
      intermediate = univerToXlsx(body.workbook);
      intermediateName = "tmp.xlsx";
    } else {
      return NextResponse.json(
        { error: `Unsupported file kind for PDF export: ${filename}` },
        { status: 415 },
      );
    }

    const pdf = await libreofficeConvert(intermediate, intermediateName, "pdf");
    const headers = new Headers();
    headers.set("content-type", "application/pdf");
    const safe = filename.replace(/\.[^.]+$/, ".pdf").replace(/"/g, "");
    headers.set("content-disposition", `inline; filename="${safe}"`);
    headers.set("content-length", String(pdf.length));
    return new Response(new Uint8Array(pdf), { headers });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
