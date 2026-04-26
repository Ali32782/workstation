import "server-only";
import { randomBytes, randomUUID } from "node:crypto";
import { MongoClient, type Collection } from "mongodb";
import type { CallContext, CallParticipant, CallSummary } from "./types";

/**
 * Mongo-backed store for native call records. Reuses the Rocket.Chat Mongo
 * cluster (already running) but writes into a separate `portal` database
 * so the two never collide.
 *
 * The collection is `portal.calls`. We keep it append-only-ish: the server
 * patches `participants` and `endedAt`/`durationSeconds` in place, but we
 * never delete records so the call history stays auditable.
 */

const MONGO_URL =
  process.env.PORTAL_CALLS_MONGO_URL ??
  process.env.ROCKETCHAT_MONGO_URL ??
  "mongodb://rocketchat-mongo:27017/portal?replicaSet=rs0";

const PUBLIC_JITSI_BASE =
  process.env.JITSI_PUBLIC_URL ??
  process.env.JITSI_PUBLIC_BASE ??
  "https://meet.kineo360.work";
const ROOM_PREFIX = process.env.JITSI_ROOM_PREFIX ?? "portal-";

let clientPromise: Promise<MongoClient> | null = null;

function getClient(): Promise<MongoClient> {
  if (!clientPromise) {
    clientPromise = new MongoClient(MONGO_URL, {
      serverSelectionTimeoutMS: 5_000,
      directConnection: false,
    }).connect();
  }
  return clientPromise;
}

type CallDoc = {
  _id: string;
  roomName: string;
  subject: string;
  workspaceId: string;
  createdBy: string;
  createdByName: string;
  startedAt: Date;
  endedAt: Date | null;
  durationSeconds: number | null;
  participants: {
    email: string;
    displayName: string;
    joinedAt: Date;
    leftAt: Date | null;
  }[];
  context: CallContext;
};

let indexEnsured = false;
async function callsCol(): Promise<Collection<CallDoc>> {
  const c = await getClient();
  const col = c.db("portal").collection<CallDoc>("calls");
  if (!indexEnsured) {
    indexEnsured = true;
    try {
      await col.createIndex({ workspaceId: 1, startedAt: -1 });
      await col.createIndex({ endedAt: 1 });
      await col.createIndex({ roomName: 1 });
    } catch (e) {
      // Index errors are non-fatal — keep going.
      console.warn("[calls store] index warn:", e);
    }
  }
  return col;
}

function makeRoomName(): string {
  return `${ROOM_PREFIX}${randomBytes(6).toString("hex")}`;
}

function joinUrlFor(roomName: string): string {
  return `${PUBLIC_JITSI_BASE.replace(/\/$/, "")}/${roomName}`;
}

function toSummary(doc: CallDoc): CallSummary {
  return {
    id: doc._id,
    roomName: doc.roomName,
    subject: doc.subject,
    workspaceId: doc.workspaceId,
    createdBy: doc.createdBy,
    createdByName: doc.createdByName,
    startedAt: doc.startedAt.toISOString(),
    endedAt: doc.endedAt ? doc.endedAt.toISOString() : null,
    durationSeconds: doc.durationSeconds ?? null,
    participants: (doc.participants ?? []).map(toParticipant),
    context: doc.context,
    joinUrl: joinUrlFor(doc.roomName),
  };
}

function toParticipant(p: CallDoc["participants"][number]): CallParticipant {
  return {
    email: p.email,
    displayName: p.displayName,
    joinedAt: p.joinedAt.toISOString(),
    leftAt: p.leftAt ? p.leftAt.toISOString() : null,
  };
}

/* --------------------------------------------------------------------- */
/*                              Operations                                */
/* --------------------------------------------------------------------- */

export async function listCalls(
  workspaceId: string,
  filter: { activeOnly?: boolean; limit?: number } = {},
): Promise<CallSummary[]> {
  const col = await callsCol();
  const q: Record<string, unknown> = { workspaceId };
  if (filter.activeOnly) q.endedAt = null;
  const docs = await col
    .find(q)
    .sort({ startedAt: -1 })
    .limit(filter.limit ?? 200)
    .toArray();
  return docs.map(toSummary);
}

export async function getCall(id: string): Promise<CallSummary | null> {
  const col = await callsCol();
  const doc = await col.findOne({ _id: id });
  return doc ? toSummary(doc) : null;
}

export async function startCall(input: {
  workspaceId: string;
  createdBy: string;
  createdByName: string;
  subject: string;
  context?: CallContext;
}): Promise<CallSummary> {
  const col = await callsCol();
  const id = randomUUID();
  const now = new Date();
  const doc: CallDoc = {
    _id: id,
    roomName: makeRoomName(),
    subject: input.subject || "Spontan-Call",
    workspaceId: input.workspaceId,
    createdBy: input.createdBy,
    createdByName: input.createdByName,
    startedAt: now,
    endedAt: null,
    durationSeconds: null,
    participants: [
      {
        email: input.createdBy,
        displayName: input.createdByName,
        joinedAt: now,
        leftAt: null,
      },
    ],
    context: input.context ?? { kind: "adhoc" },
  };
  await col.insertOne(doc);
  return toSummary(doc);
}

/**
 * Idempotently mark a participant as having joined. If they're already in
 * the list with no `leftAt`, this is a no-op (keeps the original joinedAt).
 */
export async function joinCall(
  id: string,
  participant: { email: string; displayName: string },
): Promise<CallSummary | null> {
  const col = await callsCol();
  const existing = await col.findOne({ _id: id });
  if (!existing) return null;

  const already = existing.participants.find(
    (p) => p.email.toLowerCase() === participant.email.toLowerCase() && !p.leftAt,
  );
  if (!already) {
    await col.updateOne(
      { _id: id },
      {
        $push: {
          participants: {
            email: participant.email,
            displayName: participant.displayName,
            joinedAt: new Date(),
            leftAt: null,
          },
        },
      },
    );
  }
  return getCall(id);
}

/**
 * Mark the call ended (and the requesting participant as left). If `email`
 * is null we treat it as an explicit "end-for-everyone" by the host.
 */
export async function endCall(
  id: string,
  opts: { email: string | null; everyone?: boolean } = { email: null },
): Promise<CallSummary | null> {
  const col = await callsCol();
  const doc = await col.findOne({ _id: id });
  if (!doc) return null;
  const now = new Date();

  if (opts.email && !opts.everyone) {
    // Mark only this participant as left. End the call only if no one else
    // remains.
    const updated = doc.participants.map((p) =>
      p.email.toLowerCase() === opts.email!.toLowerCase() && !p.leftAt
        ? { ...p, leftAt: now }
        : p,
    );
    const stillActive = updated.some((p) => !p.leftAt);
    const set: Partial<CallDoc> = { participants: updated };
    if (!stillActive && !doc.endedAt) {
      set.endedAt = now;
      set.durationSeconds = Math.max(
        1,
        Math.round((now.getTime() - doc.startedAt.getTime()) / 1000),
      );
    }
    await col.updateOne({ _id: id }, { $set: set });
  } else {
    // End for everyone.
    const updated = doc.participants.map((p) =>
      p.leftAt ? p : { ...p, leftAt: now },
    );
    await col.updateOne(
      { _id: id },
      {
        $set: {
          participants: updated,
          endedAt: doc.endedAt ?? now,
          durationSeconds:
            doc.durationSeconds ??
            Math.max(
              1,
              Math.round((now.getTime() - doc.startedAt.getTime()) / 1000),
            ),
        },
      },
    );
  }
  return getCall(id);
}
