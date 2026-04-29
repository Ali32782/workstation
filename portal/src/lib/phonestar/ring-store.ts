import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type { PhonestarRingEventRecord } from "@/lib/phonestar/ring-types";

export type { PhonestarRingEventRecord } from "@/lib/phonestar/ring-types";

/**
 * Short-lived ring buffer of Phonestar → Helpdesk events for portal-wide
 * “push” (client poll). Documented in webhook handler; not a durability
 * guarantee — only so open browser tabs learn about fresh inbound calls.
 */

type StoreFile = {
  version: 1;
  nextId: number;
  events: PhonestarRingEventRecord[];
};

const MAX_EVENTS = 400;

function dataDir(): string {
  return process.env.PORTAL_DATA_DIR?.trim() || "/data";
}

function storePath(): string {
  return path.join(dataDir(), "phonestar-ring-events.json");
}

let cache: { mtimeMs: number; data: StoreFile } | null = null;

function emptyStore(): StoreFile {
  return { version: 1, nextId: 1, events: [] };
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
    const data: StoreFile = {
      version: 1,
      nextId: Math.max(1, Number(parsed.nextId) || 1),
      events: Array.isArray(parsed.events)
        ? (parsed.events as PhonestarRingEventRecord[])
        : [],
    };
    cache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const z = emptyStore();
      cache = { mtimeMs: 0, data: z };
      return z;
    }
    console.error("[phonestar/ring-store] read failed:", err);
    return emptyStore();
  }
}

async function writeStore(data: StoreFile): Promise<void> {
  const file = storePath();
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  while (data.events.length > MAX_EVENTS) {
    data.events.shift();
  }
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  cache = null;
}

export async function appendPhonestarRingEvent(
  input: Omit<PhonestarRingEventRecord, "id" | "at">,
): Promise<void> {
  const ws = input.workspace.trim().toLowerCase();
  if (!ws || !Number.isFinite(input.ticketId) || input.ticketId <= 0) {
    return;
  }
  const store = await readStore();
  const id = store.nextId;
  store.nextId = id + 1;
  const rec: PhonestarRingEventRecord = {
    ...input,
    workspace: ws,
    id,
    at: new Date().toISOString(),
  };
  store.events.push(rec);
  await writeStore(store);
}

export async function listPhonestarRingSince(
  workspace: string,
  sinceId: number,
  limit = 80,
): Promise<PhonestarRingEventRecord[]> {
  const ws = workspace.trim().toLowerCase();
  const store = await readStore();
  const cap = Math.min(200, Math.max(1, limit));
  return store.events
    .filter((e) => e.workspace === ws && e.id > sinceId)
    .sort((a, b) => a.id - b.id)
    .slice(0, cap);
}
