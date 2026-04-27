import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { WorkspaceId } from "@/lib/workspaces";

/**
 * Persistent runtime store for Documenso tenant configs.
 *
 * Why this exists:
 *   The original `getSignTenant` only read environment variables, which means
 *   adding a new workspace token required SSH-ing into the host, editing
 *   `/opt/corelab/.env` and restarting the portal. Admins want to provision
 *   on-demand from the browser when they hit Sign for a workspace and see
 *   "tenant not configured" — same workflow as the rest of the onboarding
 *   tooling. So we layer a JSON file on top of the env: env wins (so secrets
 *   committed to the host's `.env` keep working), and the JSON acts as a
 *   browser-writable extension.
 *
 * The file lives in a Docker volume mounted at `${PORTAL_DATA_DIR}` (default
 * `/data`) so it survives container rebuilds. Writes go through a temp-file +
 * rename to be atomic on POSIX. Reads are cached per-process and invalidated
 * by mtime, which is enough for our single-replica deployment.
 */

export type SignTenantRecord = {
  apiToken: string;
  teamUrl: string | null;
  provisionedAt: string;
  provisionedBy: string;
};

type StoreFile = {
  version: 1;
  tenants: Partial<Record<WorkspaceId, SignTenantRecord>>;
};

const VALID_WORKSPACES: ReadonlyArray<WorkspaceId> = [
  "corehub",
  "medtheris",
  "kineo",
];

function dataDir(): string {
  return process.env.PORTAL_DATA_DIR?.trim() || "/data";
}

function storePath(): string {
  return path.join(dataDir(), "sign-tenants.json");
}

let cache: { mtimeMs: number; data: StoreFile } | null = null;

async function readStore(): Promise<StoreFile> {
  const file = storePath();
  try {
    const stat = await fs.stat(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) {
      return cache.data;
    }
    const buf = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(buf) as Partial<StoreFile>;
    const data: StoreFile = {
      version: 1,
      tenants: parsed?.tenants ?? {},
    };
    cache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const empty: StoreFile = { version: 1, tenants: {} };
      cache = { mtimeMs: 0, data: empty };
      return empty;
    }
    // Don't throw on parse errors — refuse to silently destroy the file but
    // surface a clear error in logs and treat as empty so reads keep working.
    console.error("[sign/runtime-store] read failed:", err);
    return { version: 1, tenants: {} };
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
  // Invalidate cache so the next read picks up the new mtime.
  cache = null;
}

export function isValidWorkspaceId(s: string): s is WorkspaceId {
  return (VALID_WORKSPACES as ReadonlyArray<string>).includes(s);
}

export async function getRuntimeTenant(
  workspace: string,
): Promise<SignTenantRecord | null> {
  if (!isValidWorkspaceId(workspace)) return null;
  const store = await readStore();
  return store.tenants[workspace] ?? null;
}

export async function listRuntimeTenants(): Promise<
  Partial<Record<WorkspaceId, SignTenantRecord>>
> {
  const store = await readStore();
  return { ...store.tenants };
}

export async function upsertRuntimeTenant(
  workspace: WorkspaceId,
  record: { apiToken: string; teamUrl: string | null; provisionedBy: string },
): Promise<SignTenantRecord> {
  const store = await readStore();
  const next: SignTenantRecord = {
    apiToken: record.apiToken.trim(),
    teamUrl: record.teamUrl?.trim() || null,
    provisionedAt: new Date().toISOString(),
    provisionedBy: record.provisionedBy,
  };
  store.tenants[workspace] = next;
  await writeStore(store);
  return next;
}

export async function deleteRuntimeTenant(
  workspace: WorkspaceId,
): Promise<boolean> {
  const store = await readStore();
  if (!store.tenants[workspace]) return false;
  delete store.tenants[workspace];
  await writeStore(store);
  return true;
}
