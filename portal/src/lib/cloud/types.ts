export type CloudEntry = {
  /** Path relative to the user's root, always starts with `/`. */
  path: string;
  name: string;
  type: "folder" | "file";
  size: number;
  /** Last modified, ISO. */
  mtime: string;
  /** Nextcloud fileid — required for OpenOffice-style rich-document opens. */
  fileId: number | null;
  contentType: string | null;
};

export type CloudList = {
  cwd: string;
  parent: string | null;
  entries: CloudEntry[];
};

/** Office doc subset editable via Nextcloud rich documents (OpenOffice-compatible). */
export const OFFICE_EXTS = new Set([
  "docx",
  "xlsx",
  "pptx",
  "odt",
  "ods",
  "odp",
  "doc",
  "xls",
  "ppt",
  "rtf",
  "txt",
  "md",
  "csv",
]);

export function isOfficeFile(name: string): boolean {
  const dot = name.lastIndexOf(".");
  if (dot < 0) return false;
  return OFFICE_EXTS.has(name.slice(dot + 1).toLowerCase());
}

export function isImage(name: string): boolean {
  return /\.(png|jpe?g|gif|webp|svg|bmp|heic)$/i.test(name);
}

export function isPdf(name: string): boolean {
  return /\.pdf$/i.test(name);
}
