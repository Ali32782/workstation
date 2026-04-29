import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  CallRingEventRecord,
  IncomingChatRingDto,
} from "@/lib/comms/call-ring-types";

export type { CallRingEventRecord, IncomingChatRingDto } from "@/lib/comms/call-ring-types";

type StoreFile = {
  version: 1;
  nextId: number;
  events: CallRingEventRecord[];
};

const MAX_EVENTS = 320;
const MAX_AGE_MS = 60 * 60 * 1000;

function dataDir(): string {
  return process.env.PORTAL_DATA_DIR?.trim() || "/data";
}

function storePath(): string {
  return path.join(dataDir(), "portal-call-ring-events.json");
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
        ? (parsed.events as CallRingEventRecord[])
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
    console.error("[comms/call-ring-store] read failed:", err);
    return emptyStore();
  }
}

async function writeStore(data: StoreFile): Promise<void> {
  const file = storePath();
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  const now = Date.now();
  data.events = data.events.filter((e) => now - new Date(e.at).getTime() <= MAX_AGE_MS);
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

function pruneInMemory(events: CallRingEventRecord[]): CallRingEventRecord[] {
  const now = Date.now();
  return events.filter((e) => now - new Date(e.at).getTime() <= MAX_AGE_MS);
}

/**
 * Append a Chat Jitsi invite ring. Idempotent per Rocket.Chat message id.
 */
export async function appendCallRingChatInvite(
  input: Omit<CallRingEventRecord, "id" | "at" | "source"> & { source?: "chat_jitsi" },
): Promise<void> {
  const w =
    input.workspace === undefined ||
    input.workspace === null ||
    `${input.workspace}`.trim() === ""
      ? null
      : `${input.workspace}`.trim().toLowerCase();
  const workspace = w;
  if (!input.roomId || !input.joinUrl || !input.messageId) return;
  if (!Array.isArray(input.recipientRcUserIds)) return;

  const store = await readStore();
  store.events = pruneInMemory(store.events);
  if (
    store.events.some(
      (e) => e.source === "chat_jitsi" && e.messageId === input.messageId,
    )
  ) {
    return;
  }

  const id = store.nextId;
  store.nextId = id + 1;
  const rec: CallRingEventRecord = {
    id,
    at: new Date().toISOString(),
    workspace,
    source: "chat_jitsi",
    roomId: input.roomId,
    roomName: input.roomName || "Chat",
    joinUrl: input.joinUrl,
    messageId: input.messageId,
    initiatorRcUserId: input.initiatorRcUserId,
    initiatorUsername: input.initiatorUsername,
    initiatorName: input.initiatorName,
    recipientRcUserIds: [...new Set(input.recipientRcUserIds)],
  };
  store.events.push(rec);
  await writeStore(store);
}

export function callRingEventsForViewer(
  events: CallRingEventRecord[],
  opts: {
    workspace: string;
    viewerRcUserId: string;
  },
): IncomingChatRingDto[] {
  const ws = opts.workspace.trim().toLowerCase();
  const me = opts.viewerRcUserId;
  const fresh = pruneInMemory(events);
  const out: IncomingChatRingDto[] = [];
  for (const e of fresh) {
    if (e.source !== "chat_jitsi") continue;
    if (!e.recipientRcUserIds.includes(me)) continue;
    if (e.workspace != null && e.workspace !== ws) continue;
    const label =
      (e.initiatorName?.trim() || e.initiatorUsername || "Chat").trim() ||
      "Chat";
    out.push({
      ringId: e.id,
      at: e.at,
      joinUrl: e.joinUrl,
      roomName: e.roomName,
      messageId: e.messageId,
      fromLabel: label,
    });
  }
  out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return out;
}

/** Raw read for the merged incoming-calls API (applies TTL in-memory). */
export async function readCallRingEvents(): Promise<CallRingEventRecord[]> {
  const store = await readStore();
  return pruneInMemory(store.events);
}
