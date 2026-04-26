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
 * Canonical document model the Excel editor (Univer Sheets) talks to.
 * Univer's API consumes/produces a `IWorkbookData` object — to keep this
 * file dependency-free we type it as `unknown` and cast on the editor side.
 */
export type ExcelDocument = {
  kind: "excel";
  /** Univer `IWorkbookData` — opaque JSON consumed by `@univerjs/preset-sheets-core`. */
  workbook: unknown;
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
