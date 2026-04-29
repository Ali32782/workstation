import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import mammoth from "mammoth";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const htmlToDocx: (html: string, header?: unknown, options?: unknown) => Promise<Buffer> = require("html-to-docx");
// `xlsx-js-style` is API-compatible with the upstream `xlsx` package
// but adds the missing styles writer (bold/italic/underline/align/
// numFmt/fill). We only swap the *server-side* converter; the editor
// still keeps its own in-memory format model, so this dependency stays
// confined to the save/load codepath.
import * as XLSX from "xlsx-js-style";

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

export async function docxToHtml(buf: Buffer): Promise<{
  html: string;
  text: string;
  messages: string[];
}> {
  const arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const [htmlRes, textRes] = await Promise.all([
    mammoth.convertToHtml({ buffer: Buffer.from(arrayBuffer) }),
    mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) }),
  ]);
  return {
    html: htmlRes.value,
    text: textRes.value,
    messages: (htmlRes.messages ?? []).map((m) => m.message),
  };
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

/* ─── XLSX ↔ SimpleWorkbook ──────────────────────────────────────────── */

import type { CellFormat, SheetData, SimpleWorkbook } from "./types";

/** Minimum visible grid size for a freshly-loaded sheet. */
const MIN_ROWS = 50;
const MIN_COLS = 15;

/** Minimal valid .xlsx bytes for an empty sheet (new files from create-doc). */
export function emptyXlsxBuffer(): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([[]]);
  XLSX.utils.book_append_sheet(wb, ws, "Tabelle1");
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Convert an XLSX buffer to our flat `SimpleWorkbook` model. Only cell
 * values are preserved (formulas evaluated, styles dropped, merges
 * collapsed) — same trade-off Univer's free tier made, but with a model
 * we own end-to-end.
 *
 * Numbers and booleans are stringified using SheetJS's formatted text
 * (`cell.w`) when available, then falling back to the raw value. This
 * keeps `12,5` (DE locale) as-typed for display, while save serialises
 * back through SheetJS so the round-trip stays stable.
 */
export function xlsxToSimple(buf: Buffer): SimpleWorkbook {
  // `cellStyles: true` ensures the parser keeps `cell.s` style objects
  // around so the round-trip preserves bold/italic/align/numFmt the user
  // already set in another tool.
  const wb = XLSX.read(buf, {
    type: "buffer",
    cellDates: true,
    cellStyles: true,
  });
  const sheets: SheetData[] = [];

  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name];
    const ref = sheet["!ref"] || "A1";
    const range = XLSX.utils.decode_range(ref);
    const dataRowCount = range.e.r + 1;
    const dataColCount = range.e.c + 1;

    const rows: string[][] = [];
    const formats: Record<string, CellFormat> = {};
    for (let r = 0; r < dataRowCount; r++) {
      const row: string[] = [];
      for (let c = 0; c < dataColCount; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        row.push(cellToString(cell));
        const fmt = sheetjsStyleToFormat(cell);
        if (fmt) formats[`${r},${c}`] = fmt;
      }
      rows.push(row);
    }

    // SheetJS exposes column widths via `!cols[c].wpx` (pixels) or `.wch`
    // (character units). We round-trip the `wpx` value where present —
    // it's the closest analogue to our pixel-based width model.
    const columnWidths: Record<number, number> = {};
    const cols = (sheet["!cols"] ?? []) as Array<
      { wpx?: number; wch?: number } | undefined
    >;
    for (let c = 0; c < cols.length; c++) {
      const col = cols[c];
      if (!col) continue;
      if (typeof col.wpx === "number") columnWidths[c] = Math.round(col.wpx);
      else if (typeof col.wch === "number")
        columnWidths[c] = Math.round(col.wch * 7); // approx Excel char→px
    }
    const rowHeights: Record<number, number> = {};
    const rowsMeta = (sheet["!rows"] ?? []) as Array<
      { hpx?: number; hpt?: number } | undefined
    >;
    for (let r = 0; r < rowsMeta.length; r++) {
      const row = rowsMeta[r];
      if (!row) continue;
      if (typeof row.hpx === "number") rowHeights[r] = Math.round(row.hpx);
      else if (typeof row.hpt === "number")
        rowHeights[r] = Math.round((row.hpt * 96) / 72); // pt→px
    }

    // Freeze panes: SheetJS stores them at `sheet["!freeze"]` with
    // `xSplit` / `ySplit` (number of frozen cols / rows). Older files
    // use `!views[0].state === "frozen"`. We honour the simpler shape
    // first because that's what we emit ourselves.
    let frozenRows: number | undefined;
    let frozenColumns: number | undefined;
    const freezeRaw = (
      sheet as unknown as {
        "!freeze"?: { xSplit?: number; ySplit?: number };
      }
    )["!freeze"];
    if (freezeRaw) {
      if (freezeRaw.xSplit && freezeRaw.xSplit > 0) frozenColumns = freezeRaw.xSplit;
      if (freezeRaw.ySplit && freezeRaw.ySplit > 0) frozenRows = freezeRaw.ySplit;
    }

    sheets.push({
      name,
      rows,
      rowCount: Math.max(dataRowCount, MIN_ROWS),
      columnCount: Math.max(dataColCount, MIN_COLS),
      formats: Object.keys(formats).length > 0 ? formats : undefined,
      columnWidths: Object.keys(columnWidths).length > 0 ? columnWidths : undefined,
      rowHeights: Object.keys(rowHeights).length > 0 ? rowHeights : undefined,
      frozenRows,
      frozenColumns,
    });
  }

  if (sheets.length === 0) {
    sheets.push({
      name: "Tabelle1",
      rows: [],
      rowCount: MIN_ROWS,
      columnCount: MIN_COLS,
    });
  }

  return { sheets };
}

function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell) return "";
  // Preserve formulas: if the .xlsx had `=A1+B1`, return it as a formula
  // string so the editor (and later this converter on save) keep it as a
  // live formula rather than baking in the cached result.
  if (typeof cell.f === "string" && cell.f.length > 0) {
    return cell.f.startsWith("=") ? cell.f : `=${cell.f}`;
  }
  // `cell.w` is the formatted display value SheetJS computed during read.
  // It honours the locale-aware number format from the original .xlsx,
  // which is what the user expects to see for plain (non-formula) cells.
  if (typeof cell.w === "string" && cell.w.length > 0) return cell.w;
  const v = cell.v;
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v);
}

/**
 * Reverse of `xlsxToSimple` — build an XLSX buffer from a `SimpleWorkbook`.
 *
 *   • Strings that look numeric are emitted as numbers so consumers (Excel,
 *     LibreOffice Calc, Numbers) treat them as such.
 *   • Strings starting with `=` are emitted as **formula cells** (cell.f),
 *     so opening the saved file in real Excel re-evaluates the formula
 *     instead of showing the literal text.
 *   • Cell formatting (bold/italic/underline/align/numberFormat) is
 *     translated to SheetJS `cell.s` style objects. We use the
 *     `xlsx-js-style` fork because the upstream `xlsx` Community Edition
 *     can read styles but cannot write them.
 *   • Everything else stays text.
 */
export function simpleToXlsx(workbook: SimpleWorkbook): Buffer {
  const out = XLSX.utils.book_new();

  for (const sheet of workbook.sheets) {
    const ws: XLSX.WorkSheet = {};
    let maxR = 0;
    let maxC = 0;
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r] ?? [];
      for (let c = 0; c < row.length; c++) {
        const raw = row[c] ?? "";
        const fmt = sheet.formats?.[`${r},${c}`];
        const cell = buildCell(raw, fmt);
        if (cell == null) continue;
        ws[XLSX.utils.encode_cell({ r, c })] = cell;
        if (r > maxR) maxR = r;
        if (c > maxC) maxC = c;
      }
    }
    // Sheets can also have format-only cells (formatting on an empty
    // cell, e.g. a pre-formatted header row). Walk `formats` to make
    // sure those get a stub `s`-only cell so the styling survives.
    if (sheet.formats) {
      for (const [key, fmt] of Object.entries(sheet.formats)) {
        const [rs, cs] = key.split(",");
        const r = Number(rs);
        const c = Number(cs);
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) {
          const cell = buildCell("", fmt);
          if (cell) {
            ws[addr] = cell;
            if (r > maxR) maxR = r;
            if (c > maxC) maxC = c;
          }
        }
      }
    }
    // Always write a !ref, even for empty sheets — many readers fail without.
    ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxR, c: maxC } });

    // Column widths: SheetJS expects an array of `{ wpx }` objects,
    // densely indexed up to the highest custom column.
    if (sheet.columnWidths && Object.keys(sheet.columnWidths).length > 0) {
      const colKeys = Object.keys(sheet.columnWidths)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n));
      const maxCol = Math.max(...colKeys, maxC);
      const cols: Array<{ wpx?: number } | undefined> = new Array(maxCol + 1);
      for (const [k, wpx] of Object.entries(sheet.columnWidths)) {
        cols[Number(k)] = { wpx };
      }
      ws["!cols"] = cols as unknown as XLSX.ColInfo[];
    }
    if (sheet.rowHeights && Object.keys(sheet.rowHeights).length > 0) {
      const rowKeys = Object.keys(sheet.rowHeights)
        .map((k) => Number(k))
        .filter((n) => Number.isFinite(n));
      const maxRow = Math.max(...rowKeys, maxR);
      const rowsArr: Array<{ hpx?: number } | undefined> = new Array(maxRow + 1);
      for (const [k, hpx] of Object.entries(sheet.rowHeights)) {
        rowsArr[Number(k)] = { hpx };
      }
      ws["!rows"] = rowsArr as unknown as XLSX.RowInfo[];
    }

    // Freeze panes. SheetJS supports `!views` for freezing — the runtime
    // shape tolerates both `xSplit/ySplit` (older API) and the modern
    // `pane` block. We write both for maximum compatibility with the
    // ecosystem of readers (LibreOffice, Numbers, Excel).
    if ((sheet.frozenRows ?? 0) > 0 || (sheet.frozenColumns ?? 0) > 0) {
      const fr = sheet.frozenRows ?? 0;
      const fc = sheet.frozenColumns ?? 0;
      (ws as unknown as Record<string, unknown>)["!freeze"] = {
        xSplit: fc,
        ySplit: fr,
      };
      (ws as unknown as Record<string, unknown>)["!views"] = [
        {
          state: "frozen",
          xSplit: fc,
          ySplit: fr,
          topLeftCell: XLSX.utils.encode_cell({ r: fr, c: fc }),
          activePane: "bottomRight",
        },
      ];
    }

    // Auto-Filter: emit the underlying range so reopening in Excel keeps
    // the filter dropdowns alive. We don't translate `filterValues`
    // (per-column whitelists) because SheetJS doesn't currently model
    // the criteria — they'd be lost on save anyway, even in upstream.
    if (sheet.filterRow != null && maxR >= sheet.filterRow) {
      ws["!autofilter"] = {
        ref: XLSX.utils.encode_range({
          s: { r: sheet.filterRow, c: 0 },
          e: { r: maxR, c: maxC },
        }),
      };
    }

    XLSX.utils.book_append_sheet(out, ws, normaliseSheetName(sheet.name));
  }

  if (out.SheetNames.length === 0) {
    XLSX.utils.book_append_sheet(
      out,
      XLSX.utils.aoa_to_sheet([[""]]),
      "Tabelle1",
    );
  }
  return XLSX.write(out, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/**
 * Build a single SheetJS CellObject from our raw string + optional
 * format. Returns null for unwritten cells (no value AND no styling)
 * so the resulting worksheet stays sparse.
 */
function buildCell(
  raw: string,
  format: CellFormat | undefined,
): XLSX.CellObject | null {
  const style = formatToSheetjsStyle(format);
  if (raw === "") {
    if (!style) return null;
    return { t: "z", s: style } as unknown as XLSX.CellObject;
  }
  if (raw.startsWith("=")) {
    // Formula cell. We don't pre-compute the result here because we have no
    // formula engine on the server; Excel/Calc/Numbers will evaluate on open.
    const cell: XLSX.CellObject = { t: "n", f: raw.slice(1) } as unknown as XLSX.CellObject;
    if (style) (cell as unknown as { s: unknown }).s = style;
    return cell;
  }
  const coerced = coerceForXlsx(raw);
  let cell: XLSX.CellObject;
  if (typeof coerced === "number") cell = { t: "n", v: coerced };
  else if (typeof coerced === "boolean") cell = { t: "b", v: coerced };
  else cell = { t: "s", v: String(coerced) };
  if (style) (cell as unknown as { s: unknown }).s = style;
  return cell;
}

/* ─── CellFormat ↔ SheetJS style ─────────────────────────────────────── */

/**
 * Excel number-format codes corresponding to our high-level enum.
 * The CHF currency format hard-codes the suffix so the rendered cell
 * matches what the editor's `formatDisplay` produces in the de-CH
 * locale; if/when we add per-workspace currency this will need a
 * lookup, not a literal.
 */
const NUM_FORMAT_CODES: Record<NonNullable<CellFormat["numberFormat"]>, string> = {
  default: "General",
  integer: "#,##0",
  decimal2: "#,##0.00",
  percent: "0.00%",
  currency: '#,##0.00 "CHF"',
};

type SheetjsStyle = {
  font?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    color?: { rgb?: string };
  };
  alignment?: { horizontal?: "left" | "center" | "right" };
  numFmt?: string;
  fill?: {
    patternType?: string;
    fgColor?: { rgb?: string };
    bgColor?: { rgb?: string };
  };
};

function formatToSheetjsStyle(format: CellFormat | undefined): SheetjsStyle | null {
  if (!format) return null;
  const style: SheetjsStyle = {};
  const font: NonNullable<SheetjsStyle["font"]> = {};
  if (format.bold) font.bold = true;
  if (format.italic) font.italic = true;
  if (format.underline) font.underline = true;
  if (format.textColor) {
    // SheetJS expects ARGB. Our model stores RGB hex without `#`; we
    // prepend "FF" alpha so the colour shows up fully opaque in Excel.
    font.color = { rgb: ("FF" + format.textColor).toUpperCase() };
  }
  if (Object.keys(font).length > 0) style.font = font;
  if (format.align) style.alignment = { horizontal: format.align };
  if (format.numberFormat && format.numberFormat !== "default") {
    style.numFmt = NUM_FORMAT_CODES[format.numberFormat];
  }
  if (format.bgColor) {
    style.fill = {
      patternType: "solid",
      fgColor: { rgb: ("FF" + format.bgColor).toUpperCase() },
    };
  }
  if (Object.keys(style).length === 0) return null;
  return style;
}

type SheetjsCellWithStyle = XLSX.CellObject & {
  s?: SheetjsStyle & { numFmt?: string | number };
  z?: string | number;
};

/**
 * Map a SheetJS-parsed cell back to our high-level CellFormat. We only
 * recognise styles that we can also emit on save — anything richer
 * (custom fonts, fills, borders) is dropped on the editor side; the
 * raw bytes still survive on disk because the file we eventually emit
 * was loaded byte-for-byte from the same XLSX. (For now: we re-emit,
 * so unknown styles do get lost. Acceptable trade-off.)
 */
function sheetjsStyleToFormat(cell: XLSX.CellObject | undefined): CellFormat | null {
  if (!cell) return null;
  const c = cell as SheetjsCellWithStyle;
  const s = c.s;
  if (!s && c.z == null) return null;
  const out: CellFormat = {};
  if (s?.font?.bold) out.bold = true;
  if (s?.font?.italic) out.italic = true;
  if (s?.font?.underline) out.underline = true;
  const h = s?.alignment?.horizontal;
  if (h === "left" || h === "center" || h === "right") out.align = h;
  // Number format: prefer the cell-level `s.numFmt`, fall back to the
  // top-level `z` SheetJS sometimes uses for built-in formats.
  const code = typeof s?.numFmt === "string" ? s.numFmt : typeof c.z === "string" ? c.z : undefined;
  if (code) {
    const matched = matchNumberFormat(code);
    if (matched) out.numberFormat = matched;
  }
  // Colours: SheetJS gives us ARGB ("FFRRGGBB"); we strip the alpha and
  // store lowercase hex so it round-trips identically with what the
  // toolbar emits.
  const textRgb = s?.font?.color?.rgb;
  if (typeof textRgb === "string" && /^[0-9a-fA-F]{6,8}$/.test(textRgb)) {
    out.textColor = textRgb.length === 8 ? textRgb.slice(2).toLowerCase() : textRgb.toLowerCase();
  }
  const bgRgb = s?.fill?.fgColor?.rgb ?? s?.fill?.bgColor?.rgb;
  if (typeof bgRgb === "string" && /^[0-9a-fA-F]{6,8}$/.test(bgRgb)) {
    out.bgColor = bgRgb.length === 8 ? bgRgb.slice(2).toLowerCase() : bgRgb.toLowerCase();
  }
  if (Object.keys(out).length === 0) return null;
  return out;
}

function matchNumberFormat(code: string): CellFormat["numberFormat"] | null {
  // Light-touch matcher: we only normalise codes that round-trip cleanly
  // through our enum. Everything else falls through to "default" so the
  // user can re-pick from the toolbar without us guessing wrong.
  const c = code.replace(/\s+/g, "").toLowerCase();
  if (c === "general") return "default";
  if (c === "0" || c === "#,##0") return "integer";
  if (c === "0.00" || c === "#,##0.00") return "decimal2";
  if (c.endsWith("%")) return "percent";
  if (/chf|€|eur|usd|\$/.test(c)) return "currency";
  return null;
}

function coerceForXlsx(value: string): unknown {
  if (value === "") return null;
  // German + neutral number parsing: "1.234,56", "1234.56", "1234,56" → 1234.56
  const trimmed = value.trim();
  if (/^-?\d+([.,]\d+)?$/.test(trimmed)) {
    const normalised = trimmed.replace(/\./g, "").replace(",", ".");
    const n = Number(normalised);
    if (!Number.isNaN(n)) return n;
  }
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  return value;
}

function normaliseSheetName(name: string): string {
  // Excel sheet names: max 31 chars, no `:\/?*[]`.
  return (
    name
      .replace(/[\\/*?:[\]]/g, "_")
      .slice(0, 31)
      .trim() || "Sheet1"
  );
}

/** Count non-empty cells across every sheet. Used by the empty-snapshot
 *  guards on both client and server. */
export function countWorkbookCells(workbook: SimpleWorkbook): number {
  let n = 0;
  for (const sheet of workbook.sheets) {
    for (const row of sheet.rows) {
      for (const cell of row) {
        if (typeof cell === "string" && cell.length > 0) n += 1;
      }
    }
  }
  return n;
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
