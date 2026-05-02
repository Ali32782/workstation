import { detectKind } from "./types";

/** TipTap / Univer — supported by `/api/office/load`. */
export function opensInPortalOfficeEditor(fileName: string): boolean {
  const k = detectKind(fileName);
  return k === "word" || k === "excel";
}

/** Präsentationen (.pptx): OpenOffice-kompatibler Editor in Nextcloud (`/api/files/safe-open`). */
export function opensInCollabora(
  fileName: string,
  fileId: number | null,
): boolean {
  return /\.(pptx?|odp)$/i.test(fileName) && fileId != null;
}

export function collaboraSafeOpenUrl(
  workspaceId: string,
  fileId: number,
): string {
  const q = new URLSearchParams({ ws: workspaceId, fileId: String(fileId) });
  return `/api/files/safe-open?${q.toString()}`;
}

export type PrimaryOpenLabels = {
  folder: string;
  portalEditor: string;
  presentationEditor: string;
  preview: string;
};

export function primaryFileOpenLabel(
  name: string,
  fileId: number | null,
  isFolder: boolean,
  labels: PrimaryOpenLabels,
): string {
  if (isFolder) return labels.folder;
  if (opensInPortalOfficeEditor(name)) return labels.portalEditor;
  if (opensInCollabora(name, fileId)) return labels.presentationEditor;
  return labels.preview;
}
