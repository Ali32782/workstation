import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { WorkspaceId } from "@/lib/workspaces";

import { isValidWorkspaceId } from "./runtime-store";

/**
 * Tracks which Sign documents are visible only to the creating portal user,
 * not listed for other team members. Documenso itself only has team-role
 * visibility (EVERYONE / MANAGER_AND_ABOVE / ADMIN); this file adds a
 * workspace-scoped "private to owner" layer for the portal UI and API.
 *
 * Stored next to `sign-tenants.json` under PORTAL_DATA_DIR (default /data).
 */

type StoreFile = {
  version: 2;
  /** key `${workspace}:${docId}` → portal username (lowercase): hidden from teammates */
  privateByDocument: Record<string, string>;
  /** key `${workspace}:${docId}` → portal username who created the doc via portal upload */
  uploadedViaPortal: Record<string, string>;
};

function dataDir(): string {
  return process.env.PORTAL_DATA_DIR?.trim() || "/data";
}

function storePath(): string {
  return path.join(dataDir(), "sign-document-privacy.json");
}

let cache: { mtimeMs: number; data: StoreFile } | null = null;

function migrate(parsed: Partial<StoreFile>): StoreFile {
  return {
    version: 2,
    privateByDocument: parsed.privateByDocument ?? {},
    uploadedViaPortal: parsed.uploadedViaPortal ?? {},
  };
}

async function readStore(): Promise<StoreFile> {
  const file = storePath();
  try {
    const stat = await fs.stat(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) {
      return cache.data;
    }
    const buf = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(buf) as Partial<StoreFile>;
    const data = migrate(parsed);
    cache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const empty: StoreFile = {
        version: 2,
        privateByDocument: {},
        uploadedViaPortal: {},
      };
      cache = { mtimeMs: 0, data: empty };
      return empty;
    }
    console.error("[sign/document-privacy-store] read failed:", err);
    return {
      version: 2,
      privateByDocument: {},
      uploadedViaPortal: {},
    };
  }
}

async function writeStore(data: StoreFile): Promise<void> {
  const file = storePath();
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  cache = null;
}

function docKey(workspace: string, documentId: number): string {
  return `${workspace.toLowerCase()}:${documentId}`;
}

/** Map document id → lowercase owner username for docs marked portal-private. */
export async function getPortalPrivateOwners(
  workspace: string,
): Promise<Map<number, string>> {
  const store = await readStore();
  const prefix = `${workspace.toLowerCase()}:`;
  const map = new Map<number, string>();
  for (const [k, owner] of Object.entries(store.privateByDocument)) {
    if (!k.startsWith(prefix)) continue;
    const idStr = k.slice(prefix.length);
    const id = Number(idStr);
    if (!Number.isFinite(id) || id <= 0) continue;
    map.set(id, (owner ?? "").toLowerCase());
  }
  return map;
}

export async function getPortalUploader(
  workspace: string,
  documentId: number,
): Promise<string | null> {
  const store = await readStore();
  const uploader = store.uploadedViaPortal[docKey(workspace, documentId)];
  return uploader ? uploader.toLowerCase() : null;
}

export async function isPortalPrivate(
  workspace: string,
  documentId: number,
): Promise<{ private: boolean; ownerUsername: string | null }> {
  const store = await readStore();
  const owner = store.privateByDocument[docKey(workspace, documentId)];
  if (!owner) return { private: false, ownerUsername: null };
  return { private: true, ownerUsername: owner };
}

export async function registerPortalUpload(
  workspace: WorkspaceId,
  documentId: number,
  portalUsername: string,
): Promise<void> {
  const store = await readStore();
  const u = portalUsername.trim().toLowerCase();
  if (!u) return;
  store.uploadedViaPortal[docKey(workspace, documentId)] = u;
  await writeStore(store);
}

export async function setPortalPrivate(
  workspace: WorkspaceId,
  documentId: number,
  ownerPortalUsername: string,
): Promise<void> {
  const store = await readStore();
  const owner = ownerPortalUsername.trim().toLowerCase();
  if (!owner) return;
  store.privateByDocument[docKey(workspace, documentId)] = owner;
  await writeStore(store);
}

export async function clearPortalPrivate(
  workspace: string,
  documentId: number,
): Promise<void> {
  const store = await readStore();
  const k = docKey(workspace, documentId);
  if (!store.privateByDocument[k]) return;
  delete store.privateByDocument[k];
  await writeStore(store);
}

export async function deletePortalAnnotations(
  workspace: string,
  documentId: number,
): Promise<void> {
  const store = await readStore();
  const k = docKey(workspace, documentId);
  let touched = false;
  if (store.privateByDocument[k]) {
    delete store.privateByDocument[k];
    touched = true;
  }
  if (store.uploadedViaPortal[k]) {
    delete store.uploadedViaPortal[k];
    touched = true;
  }
  if (touched) await writeStore(store);
}

export async function copyPortalDocumentAnnotations(
  workspace: WorkspaceId,
  fromDocumentId: number,
  toDocumentId: number,
): Promise<void> {
  const store = await readStore();
  const fromK = docKey(workspace, fromDocumentId);
  const upload = store.uploadedViaPortal[fromK];
  const prv = store.privateByDocument[fromK];
  const destK = docKey(workspace, toDocumentId);
  if (!upload && !prv) return;

  let touched = false;
  if (upload) {
    store.uploadedViaPortal[destK] = upload;
    touched = true;
  }
  if (prv) {
    store.privateByDocument[destK] = prv;
    touched = true;
  }
  if (touched) await writeStore(store);
}

export function workspaceIdOrNull(ws: string): WorkspaceId | null {
  return isValidWorkspaceId(ws) ? (ws as WorkspaceId) : null;
}
