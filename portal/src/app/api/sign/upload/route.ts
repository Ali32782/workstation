import { NextRequest, NextResponse } from "next/server";
import {
  convertToPdf,
  isSupportedInput,
  PdfConversionError,
  UnsupportedFileTypeError,
} from "@/lib/sign/converter";
import { createDocumentFromPdf } from "@/lib/sign/documenso";
import { resolveSignSession } from "@/lib/sign/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Documenso erlaubt 50 MB pro Upload (Default). Wir ziehen die Grenze
// konservativ etwas darunter und lehnen ab, bevor wir Collabora belasten.
const MAX_BYTES = 40 * 1024 * 1024;

export async function POST(req: NextRequest) {
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
      { error: r.message, code: "not_configured", workspace: r.workspace },
      { status: 503 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch (e) {
    return NextResponse.json(
      { error: `multipart parse fehlgeschlagen: ${e instanceof Error ? e.message : e}` },
      { status: 400 },
    );
  }

  const file = form.get("file");
  const titleInput = (form.get("title") as string | null)?.trim() || "";
  if (!(file instanceof File)) {
    return NextResponse.json(
      { error: "Feld `file` fehlt im multipart-Body." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json({ error: "Datei ist leer." }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        error: `Datei zu groß (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum ${MAX_BYTES / 1024 / 1024} MB.`,
      },
      { status: 413 },
    );
  }
  const filename = file.name || "upload";
  if (!isSupportedInput(filename)) {
    return NextResponse.json(
      {
        error: `Dateityp wird nicht unterstützt: ${filename}. Erlaubt: PDF, DOC(X), ODT, RTF, TXT, XLS(X), PPT(X), Bilder.`,
      },
      { status: 415 },
    );
  }

  const buf = Buffer.from(await file.arrayBuffer());

  let pdf: Buffer;
  let outputFilename: string;
  let converted: boolean;
  try {
    const result = await convertToPdf(buf, filename, file.type || undefined);
    pdf = result.pdf;
    outputFilename = result.outputFilename;
    converted = result.converted;
  } catch (e) {
    if (e instanceof UnsupportedFileTypeError) {
      return NextResponse.json({ error: e.message }, { status: 415 });
    }
    if (e instanceof PdfConversionError) {
      return NextResponse.json({ error: e.message }, { status: 502 });
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }

  const title =
    titleInput || filename.replace(/\.[^.]+$/, "") || "Unbenanntes Dokument";

  try {
    const { documentId } = await createDocumentFromPdf(r.session.tenant, {
      title,
      pdf,
      filename: outputFilename,
    });
    return NextResponse.json({
      documentId,
      title,
      filename: outputFilename,
      converted,
      teamUrl: r.session.tenant.teamUrl ?? null,
    });
  } catch (e) {
    console.error("[/api/sign/upload] documenso create failed:", e);
    return NextResponse.json(
      {
        error: `Documenso-Upload fehlgeschlagen: ${e instanceof Error ? e.message : e}`,
      },
      { status: 502 },
    );
  }
}
