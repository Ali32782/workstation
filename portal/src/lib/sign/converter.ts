import "server-only";

/**
 * PDF-Konverter für Signatur-Uploads.
 *
 * Documenso akzeptiert ausschließlich PDFs. Damit Anwender direkt aus dem
 * Portal `.docx` / `.doc` / `.odt` / `.rtf` / `.txt` etc. zur Signatur
 * hochladen können, leiten wir Nicht-PDF-Uploads serverseitig durch
 * Collabora's HTTP-Konverter (`/cool/convert-to/pdf`) — Collabora läuft eh
 * für Office-Hub und ist via internem Docker-Netz erreichbar.
 *
 * Sicherheits-/Robustheits-Prinzipien:
 *   - PDFs gehen ungeprüft durch (kein Re-Encoding).
 *   - Nicht unterstützte Dateitypen werfen einen typisierten Fehler, damit der
 *     Client eine saubere Fehlermeldung anzeigen kann.
 *   - Nach der Konvertierung prüfen wir die ersten 4 Bytes auf `%PDF`, sonst
 *     hat Collabora vermutlich eine HTML-Fehlerseite zurückgegeben — wir
 *     werfen, bevor wir Müll an Documenso senden.
 */

const COLLABORA_BASE = (
  process.env.COLLABORA_INTERNAL_BASE ?? "http://collabora:9980"
).replace(/\/+$/, "");

const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46]); // %PDF

/**
 * Erweiterungen, die Collabora zuverlässig nach PDF konvertiert. Erweiterungen
 * außerhalb dieser Liste werden mit einer klaren Fehlermeldung abgewiesen.
 */
const SUPPORTED_INPUT_EXTENSIONS = new Set([
  "pdf",
  // Textverarbeitung
  "doc",
  "docx",
  "docm",
  "odt",
  "ott",
  "rtf",
  "txt",
  // Tabellen
  "xls",
  "xlsx",
  "xlsm",
  "ods",
  "csv",
  // Präsentationen
  "ppt",
  "pptx",
  "odp",
  // Bilder
  "png",
  "jpg",
  "jpeg",
  // OpenDocument-Sonstiges
  "fodt",
  "fods",
  "fodp",
]);

const PDF_EXT = new Set(["pdf"]);

export class UnsupportedFileTypeError extends Error {
  constructor(public extension: string) {
    super(
      `Dateityp "${extension}" wird nicht unterstützt. Erlaubt: PDF, Word (.doc/.docx), OpenDocument (.odt), RTF, TXT, Excel, PowerPoint, Bilder.`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

export class PdfConversionError extends Error {
  constructor(message: string) {
    super(`PDF-Konvertierung fehlgeschlagen: ${message}`);
    this.name = "PdfConversionError";
  }
}

export function extensionOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}

export function isSupportedInput(filename: string): boolean {
  return SUPPORTED_INPUT_EXTENSIONS.has(extensionOf(filename));
}

export function isPdf(filename: string, mimeType?: string): boolean {
  if (mimeType === "application/pdf") return true;
  return PDF_EXT.has(extensionOf(filename));
}

/**
 * Konvertiert einen Upload nach PDF. Gibt das ursprüngliche Buffer zurück,
 * wenn die Datei bereits ein PDF ist; ansonsten Collabora-Konvertierung.
 *
 * Behaviorally idempotent: PDFs durchlaufen nicht den Konverter, sodass kein
 * Re-Encoding stattfindet (wichtig für signierte/zertifizierte PDFs).
 */
export async function convertToPdf(
  data: Uint8Array | Buffer,
  filename: string,
  mimeType?: string,
): Promise<{ pdf: Buffer; outputFilename: string; converted: boolean }> {
  const ext = extensionOf(filename);
  if (!isSupportedInput(filename)) {
    throw new UnsupportedFileTypeError(ext || "(unbekannt)");
  }
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (isPdf(filename, mimeType)) {
    return { pdf: buf, outputFilename: filename, converted: false };
  }

  const fd = new FormData();
  const u8 = new Uint8Array(buf);
  fd.append(
    "data",
    new Blob([u8], { type: mimeType || "application/octet-stream" }),
    filename,
  );

  let res: Response;
  try {
    res = await fetch(`${COLLABORA_BASE}/cool/convert-to/pdf`, {
      method: "POST",
      body: fd,
      // Collabora kann bei großen Dateien etwas dauern; erlauben Sie 30s.
      signal: AbortSignal.timeout(30_000),
    });
  } catch (e) {
    throw new PdfConversionError(
      `Collabora unter ${COLLABORA_BASE} nicht erreichbar (${e instanceof Error ? e.message : e}).`,
    );
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "(unable to read body)");
    throw new PdfConversionError(
      `Collabora HTTP ${res.status}: ${body.slice(0, 200)}`,
    );
  }
  const out = Buffer.from(await res.arrayBuffer());
  if (out.length < 4 || !out.subarray(0, 4).equals(PDF_MAGIC)) {
    throw new PdfConversionError(
      `Collabora-Antwort ist kein PDF (erste Bytes: ${out
        .subarray(0, 8)
        .toString("hex")}).`,
    );
  }
  const base = filename.replace(/\.[^.]+$/, "");
  return {
    pdf: out,
    outputFilename: `${base || "dokument"}.pdf`,
    converted: true,
  };
}
