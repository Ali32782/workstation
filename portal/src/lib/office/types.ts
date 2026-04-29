/**
 * Native portal Office Hub — types shared by editor pages, backend converter
 * and WebDAV save/load routes. Keep this file dependency-free so it can be
 * imported from both server and client modules.
 */

export type OfficeKind = "word" | "excel" | "unknown";

/**
 * Canonical document model the Word editor (TipTap) talks to. We store HTML
 * because TipTap's `getHTML()` round-trips losslessly with the `mammoth`
 * DOCX-to-HTML pipeline. DOCX is regenerated on save via `html-to-docx`.
 */
export type WordDocument = {
  kind: "word";
  /** Sanitised HTML (TipTap-compatible). */
  html: string;
  /** Optional plain-text fallback rendered by mammoth. */
  text?: string;
  /** Original file metadata. */
  meta: OfficeFileMeta;
};

/**
 * Canonical document model the Excel editor talks to. Native, dependency-free
 * format: a list of sheets, each a dense 2D string array. Empty cells are
 * represented by empty strings ("") so the renderer never has to special-case
 * `null` / `undefined`. Cell values are always strings on the wire — formatting
 * is handled by the editor on display, parsing is done by SheetJS on save.
 *
 * Why not Univer's `IWorkbookData`? Univer's web bundle is large, lazy-loads
 * private chunks that don't always trace into Next.js standalone builds, and
 * silently fails to mount when one chunk 404s. A flat string-grid model is
 * 50 LOC instead of 50 MB and renders identically on every browser.
 */
/**
 * Per-cell formatting flags. The map is sparse — keyed by `"r,c"` — so
 * an unformatted spreadsheet costs nothing extra. Only fields that are
 * truthy are stored (we strip falsy ones in the editor before persist).
 *
 * Round-trip to `.xlsx` is best-effort: the converter copies these onto
 * SheetJS's `s` (style) field where supported. If a workspace's xlsx
 * library doesn't preserve them, the data still survives in the
 * portal's session and on the next save (the converter sees them
 * before SheetJS does).
 */
export type CellFormat = {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: "left" | "center" | "right";
  /**
   * Display only — the underlying value stays a string. Used by the
   * renderer to format numbers (`integer` / `decimal2` / `percent` /
   * `currency`) without mutating the user's input.
   */
  numberFormat?: "default" | "integer" | "decimal2" | "percent" | "currency";
  /**
   * Lowercase hex strings without a leading `#` (e.g. "ff0000"). Stored
   * lowercase so the UI can compare cheaply ("is this swatch active?")
   * and SheetJS can re-emit them as ARGB by prefixing "FF". `undefined`
   * means "inherit theme" — we never serialise empty strings.
   */
  bgColor?: string;
  textColor?: string;
};

export type SheetData = {
  /** Display name shown in the sheet-tab footer. */
  name: string;
  /**
   * Dense row-major cell grid. `rows[r][c]` is the cell at row `r`, column `c`.
   * Empty cells are `""`. Trailing empty rows/cols may be trimmed on save but
   * the editor renders at least `rowCount × columnCount` (see below).
   */
  rows: string[][];
  /** Total visible row count (renderer pads with empty rows up to this). */
  rowCount: number;
  /** Total visible column count (renderer pads with empty cells up to this). */
  columnCount: number;
  /**
   * Sparse formatting map. Keys are `"r,c"` strings (e.g. `"0,3"` for D1).
   * Absent keys mean "no formatting". The map is intentionally string-keyed
   * so it serialises cleanly to JSON and round-trips through the API.
   */
  formats?: Record<string, CellFormat>;
  /**
   * Sparse column-width / row-height overrides in pixels. Absent indices
   * fall back to the editor defaults (96 / 22). We use `Record` instead
   * of an array so saving a single resized column doesn't bloat JSON
   * with hundreds of `null` entries.
   */
  columnWidths?: Record<number, number>;
  rowHeights?: Record<number, number>;
  /**
   * How many top rows / left columns are pinned. `undefined` and `0`
   * both mean "no freeze". This lives on the sheet because Excel
   * scopes the freeze to a worksheet, not the workbook.
   */
  frozenRows?: number;
  frozenColumns?: number;
  /**
   * Auto-Filter state. `filterRow` is the row that holds the filter
   * dropdowns (typically `0` = header row). `filterValues[c]` is a
   * whitelist of allowed string values for column `c`; absent or empty
   * arrays disable the filter on that column. We store *strings* because
   * cell content is always strings on the wire — the comparison is
   * exact-match against `rows[r][c]`.
   */
  filterRow?: number;
  filterValues?: Record<number, string[]>;
  /**
   * Conditional formatting rules. Evaluated *after* explicit per-cell
   * formats so a matching rule can override the explicit colour. Sparse
   * by design — most sheets carry zero rules. Round-trip through XLSX
   * is not yet supported (SheetJS-style preserves explicit formats but
   * not Excel's stored CF rules) — they live in the in-portal session
   * only and get re-applied each time the document is opened from
   * Nextcloud as long as the workbook JSON is cached. We accept this
   * limitation because the alternative (translating to XLSX-CF XML)
   * is roughly an order of magnitude more complexity than the feature
   * is worth at this stage.
   */
  conditionalRules?: ConditionalRule[];
};

/**
 * Conditional formatting rule. Each rule applies to a rectangular A1 range
 * (e.g. "B2:B10" or "C:C") and either thresholds a numeric value into a
 * single colour, or maps a numeric range to a heat-map gradient.
 *
 * `kind` is the discriminator the renderer switches on. Only numeric
 * comparisons are supported today — we explicitly bail out on non-numeric
 * cells rather than coerce, so a stringy column doesn't silently colour
 * everything red.
 */
export type ConditionalRule =
  | {
      kind: "greater";
      /** A1 range, e.g. "B2:B10". */
      range: string;
      value: number;
      /** Hex without leading '#', lowercase. */
      bgColor: string;
      textColor?: string;
    }
  | {
      kind: "less";
      range: string;
      value: number;
      bgColor: string;
      textColor?: string;
    }
  | {
      kind: "between";
      range: string;
      min: number;
      max: number;
      bgColor: string;
      textColor?: string;
    }
  | {
      kind: "equals";
      range: string;
      /** Compared as exact string match against the cell's raw value. */
      text: string;
      bgColor: string;
      textColor?: string;
    }
  | {
      /** Heat-map gradient — auto-discovers min/max in the range. */
      kind: "color-scale";
      range: string;
      /** Three-stop gradient for the low / mid / high cell values. */
      lowColor: string;
      midColor: string;
      highColor: string;
    };

export type SimpleWorkbook = {
  sheets: SheetData[];
};

export type ExcelDocument = {
  kind: "excel";
  workbook: SimpleWorkbook;
  meta: OfficeFileMeta;
};

export type OfficeDocument = WordDocument | ExcelDocument;

export type OfficeFileMeta = {
  /** Path inside the workspace's Nextcloud, e.g. `/Documents/Brief.docx`. */
  path: string;
  /** File name with extension. */
  name: string;
  /** Detected MIME based on extension. */
  contentType: string;
  /** ISO timestamp of last modification on the Nextcloud side, if known. */
  modified?: string;
  /** Size in bytes if known. */
  size?: number;
};

export const WORD_EXTS = [".docx", ".doc", ".odt", ".rtf", ".txt", ".md"] as const;
export const EXCEL_EXTS = [".xlsx", ".xls", ".ods", ".csv", ".tsv"] as const;
export const PDF_EXTS = [".pdf"] as const;

export function detectKind(filename: string): OfficeKind {
  const lower = filename.toLowerCase();
  if (WORD_EXTS.some((e) => lower.endsWith(e))) return "word";
  if (EXCEL_EXTS.some((e) => lower.endsWith(e))) return "excel";
  return "unknown";
}

export function contentTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx"))
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".xlsx"))
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text/plain";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".tsv")) return "text/tab-separated-values";
  return "application/octet-stream";
}
