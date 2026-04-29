import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { CompanyAttributionRecord, UtmTouchPayload } from "./attribution-types";

type StoreFile = {
  version: 1;
  entries: Record<string, CompanyAttributionRecord>;
};

function dataDir(): string {
  return process.env.PORTAL_DATA_DIR?.trim() || "/data";
}

function storePath(): string {
  return path.join(dataDir(), "marketing-attribution.json");
}

let cache: { mtimeMs: number; data: StoreFile } | null = null;

function empty(): StoreFile {
  return { version: 1, entries: {} };
}

function key(workspace: string, companyId: string): string {
  return `${workspace.trim().toLowerCase()}:${companyId.trim()}`;
}

async function readStore(): Promise<StoreFile> {
  const file = storePath();
  try {
    const stat = await fs.stat(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) return cache.data;
    const buf = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(buf) as Partial<StoreFile>;
    const data: StoreFile = {
      version: 1,
      entries:
        parsed.entries && typeof parsed.entries === "object" && !Array.isArray(parsed.entries)
          ? (parsed.entries as Record<string, CompanyAttributionRecord>)
          : {},
    };
    cache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") {
      const z = empty();
      cache = { mtimeMs: 0, data: z };
      return z;
    }
    console.error("[marketing/attribution-store] read:", e);
    return empty();
  }
}

async function writeStore(data: StoreFile): Promise<void> {
  const file = storePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  cache = null;
}

export async function getCompanyAttribution(
  workspace: string,
  companyId: string,
): Promise<CompanyAttributionRecord | null> {
  const k = key(workspace, companyId);
  const store = await readStore();
  return store.entries[k] ?? null;
}

/**
 * Merge a touch onto the record. `touch === "first"` only fills if empty.
 */
export async function upsertCompanyAttribution(input: {
  workspace: string;
  companyId: string;
  touch: "first" | "last";
  payload: Omit<UtmTouchPayload, "capturedAt"> & { capturedAt?: string };
}): Promise<CompanyAttributionRecord> {
  const ws = input.workspace.trim().toLowerCase();
  const companyId = input.companyId.trim();
  if (!ws || !companyId) {
    throw new Error("workspace and companyId required");
  }
  const store = await readStore();
  const k = key(ws, companyId);
  const nowIso = new Date().toISOString();
  const touchPayload: UtmTouchPayload = {
    utm_source: input.payload.utm_source ?? null,
    utm_medium: input.payload.utm_medium ?? null,
    utm_campaign: input.payload.utm_campaign ?? null,
    utm_term: input.payload.utm_term ?? null,
    utm_content: input.payload.utm_content ?? null,
    referrer: input.payload.referrer ?? null,
    landingPath: input.payload.landingPath ?? null,
    capturedAt: input.payload.capturedAt ?? nowIso,
  };

  const prev = store.entries[k];
  let next: CompanyAttributionRecord;

  if (!prev) {
    next = {
      companyId,
      workspace: ws,
      firstTouch: touchPayload,
      lastTouch: touchPayload,
      updatedAt: nowIso,
    };
  } else {
    next = { ...prev, updatedAt: nowIso };
    if (input.touch === "first" && !prev.firstTouch) {
      next.firstTouch = touchPayload;
    }
    if (input.touch === "last") {
      next.lastTouch = touchPayload;
    }
  }

  store.entries[k] = next;
  await writeStore(store);
  return next;
}
