import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const htmlToDocx: (html: string, header?: unknown, options?: unknown) => Promise<Buffer> = require("html-to-docx");
import * as XLSX from "xlsx";

/**
 * Server-side conversions for the native Office Hub.
 *
 *   DOCX  ──mammoth──▶  HTML   (round-trips into TipTap)
 *   HTML  ──html-to-docx──▶  DOCX
 *   XLSX  ──xlsx──▶  Univer IWorkbookData (JSON) and back
 *   any  ──libreoffice headless──▶  PDF
 *
 * LibreOffice is required in the container image for PDF export and for
 * lossy formats we don't support natively (legacy .doc/.xls, .odt/.ods).
 * The Dockerfile installs `libreoffice-core libreoffice-writer libreoffice-calc`.
 */

/* ─── DOCX ↔ HTML ──────────────────────────────────────────────────── */

export async function docxToHtml(buf: Buffer): Promise<{ html: string; text: string }> {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const [htmlRes, textRes] = await Promise.all([
    mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) }),
    mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }),
  ]);
  return { html: htmlRes.value, text: textRes.value };
}

export async function htmlToDocxBuffer(html: string): Promise<Buffer> {
  // html-to-docx returns a Blob in the browser, a Buffer in Node — we always
  // hit the Node path here.
  const wrapped = `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>${html}</body></html>`;
  const res = await htmlToDocx(wrapped, undefined, {
    table: { row: { cantSplit: true } },
    footer: false,
    pageNumber: false,
  });
  if (Buffer.isBuffer(res)) return res;
  // Fallback for environments returning Blob/ArrayBuffer.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ab = await (res as any).arrayBuffer();
  return Buffer.from(ab);
}

/* ─── XLSX ↔ Univer IWorkbookData ──────────────────────────────────── */

/**
 * Convert an XLSX buffer to a Univer `IWorkbookData` JSON. We deliberately
 * keep the conversion shallow (cell values + sheet names) — Univer's own
 * import would handle merges/styles but only ships in the paid tier. For
 * day-1 we get readable, editable, savable spreadsheets.
 */
/** Minimal valid .xlsx bytes for an empty sheet (new files from create-doc). */
export function emptyXlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  XLSX.utils.book_append_sheet(wb, ws, "Tabelle1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

export function xlsxToUniver(buf: Buffer): unknown {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
  const sheetOrder: string[] = [];
  const sheets: Record<string, unknown> = {};

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const sheetId = name.replace(/[^A-Za-z0-9_]/g, "_") || `sheet_${sheetOrder.length}`;
    sheetOrder.push(sheetId);

    const ref = sheet["!ref"] || "A1";
    const range = XLSX.utils.decode_range(ref);
    const cellData: Record<number, Record<number, unknown>> = {};
    let rowCount = range.e.r + 1;
    let colCount = range.e.c + 1;

    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell) continue;
        cellData[r] = cellData[r] || {};
        let v: unknown = cell.v;
        if (cell.t === "d" && v instanceof Date) v = v.toISOString();
        cellData[r][c] = { v, t: typeForUniver(cell.t) };
      }
    }
    rowCount = Math.max(rowCount, 50);
    colCount = Math.max(colCount, 15);

    sheets[sheetId] = {
      id: sheetId,
      name,
      rowCount,
      columnCount: colCount,
      cellData,
      defaultColumnWidth: 88,
      defaultRowHeight: 22,
    };
  }

  return {
    id: "workbook-1",
    sheetOrder,
    name: "Workbook",
    appVersion: "3.0.0-alpha",
    locale: "deDE",
    styles: {},
    sheets,
    resources: [],
  };
}

function typeForUniver(t: string | undefined): number {
  switch (t) {
    case "n":
      return 2;
    case "b":
      return 3;
    case "d":
      return 5;
    case "e":
      return 6;
    case "s":
    case "str":
    default:
      return 1;
  }
}

/**
 * Reverse of `xlsxToUniver` — builds an XLSX buffer from a Univer
 * IWorkbookData JSON. Same caveat: we only persist cell values, not styles.
 */
export function univerToXlsx(workbook: unknown): Buffer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wb = workbook as any;
  const out = XLSX.utils.book_new();

  const order: string[] = wb?.sheetOrder || [];
  for (const sheetId of order) {
    const s = wb?.sheets?.[sheetId];
    if (!s) continue;
    const aoa: unknown[][] = [];
    const cellData = s.cellData || {};
    const maxRow = Math.max(0, ...Object.keys(cellData).map((k) => Number(k)));
    for (let r = 0; r <= maxRow; r++) {
      const row = cellData[r] || {};
      const maxCol = Math.max(0, ...Object.keys(row).map((k) => Number(k)));
      const arr: unknown[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const cell = row[c];
        arr.push(cell ? cell.v : null);
      }
      aoa.push(arr);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    XLSX.utils.book_append_sheet(out, ws, s.name || sheetId);
  }
  if (out.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(out, XLSX.utils.aoa_to_sheet([[""]]), "Sheet1");
  }
  return XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/* ─── PDF / format conversion via LibreOffice ──────────────────────── */

/**
 * Spawn `soffice --headless --convert-to <fmt>` against an ephemeral file.
 * Used for DOCX→PDF, XLSX→PDF, and to ingest legacy .doc/.xls/.odt/.ods.
 *
 * Required in the runner image:
 *   apk add libreoffice libreoffice-langpack-de
 */
export type SofficeTarget = "pdf" | "html" | "docx" | "xlsx" | "rtf" | "odt" | "ods";

export async function libreofficeConvert(
  input: Buffer,
  inputName: string,
  targetFormat: SofficeTarget,
): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "office-"));
  try {
    const inPath = join(dir, inputName);
    await writeFile(inPath, input);

    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        "soffice",
        [
          "--headless",
          "--norestore",
          "--nolockcheck",
          "--convert-to",
          targetFormat,
          "--outdir",
          dir,
          inPath,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      let stderr = "";
      proc.stderr.on("data", (d) => (stderr += String(d)));
      proc.on("error", reject);
      proc.on("exit", (code) =>
        code === 0
          ? resolve()
          : reject(new Error(`soffice exit ${code}: ${stderr.slice(0, 400)}`)),
      );
    });

    const baseName = inputName.replace(/\.[^.]+$/, "");
    const outPath = join(dir, `${baseName}.${targetFormat}`);
    const out = await readFile(outPath);
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
