import "server-only";
import type {
  ChatMessage,
  ChatRoom,
  ChatRoomType,
  ChatTeam,
  ChatUserSummary,
} from "./types";
import { getOrCreateUserAuthToken, invalidateUserToken } from "./user-tokens";

const BASE = process.env.ROCKETCHAT_API_BASE ?? "";
const ADMIN_USER_ID = process.env.ROCKETCHAT_ADMIN_USER_ID ?? "";
const ADMIN_TOKEN = process.env.ROCKETCHAT_ADMIN_TOKEN ?? "";

if (!BASE || !ADMIN_USER_ID || !ADMIN_TOKEN) {
  // Don't throw at import time — let API routes 503 with a clear error.
  console.warn("[chat] Rocket.Chat admin credentials not fully configured");
}

type FetchInit = Omit<RequestInit, "headers"> & {
  headers?: Record<string, string>;
};

/**
 * Low-level admin call (uses the bridge admin's PAT). Use only for endpoints
 * that genuinely need admin permissions or where impersonation isn't required
 * (lookups, user-management).
 */
async function rcAdmin<T = unknown>(path: string, init: FetchInit = {}): Promise<T> {
  return rcWith(path, init, ADMIN_TOKEN, ADMIN_USER_ID);
}

/**
 * User-context call: lazily creates an actual auth-token for the target user
 * (stored in mongo as a Personal Access Token) so impersonation works for ALL
 * Rocket.Chat REST endpoints — not just admin ones.
 */
async function rcAs<T = unknown>(
  rcUserId: string,
  path: string,
  init: FetchInit = {},
): Promise<T> {
  const token = await getOrCreateUserAuthToken(rcUserId);
  try {
    return await rcWith<T>(path, init, token, rcUserId);
  } catch (e) {
    // Self-heal: if RC says 401 (token vanished from mongo, e.g. wiped by a
    // concurrent update), invalidate the cache and try once more with a fresh
    // token. Prevents leaving the UI permanently broken after a race.
    if (e instanceof Error && /\b401\b/.test(e.message)) {
      invalidateUserToken(rcUserId);
      const freshToken = await getOrCreateUserAuthToken(rcUserId);
      return rcWith<T>(path, init, freshToken, rcUserId);
    }
    throw e;
  }
}

export class RateLimitedError extends Error {
  constructor(
    public path: string,
    public retryAfterSeconds: number,
  ) {
    super(`rocketchat ${path}: rate-limited (retry in ${retryAfterSeconds}s)`);
    this.name = "RateLimitedError";
  }
}

async function rcWith<T = unknown>(
  path: string,
  init: FetchInit,
  token: string,
  userId: string,
  attempt = 0,
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": token,
      "X-User-Id": userId,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`rocketchat ${path}: redirect ${res.status} (likely auth failure)`);
  }
  // Rate-limited (default RC config: 10 req/60s per user per endpoint).
  // Try one quick retry with a tiny back-off; otherwise throw a typed error
  // so callers can render a friendly UI / fall back to cached data.
  if (res.status === 429) {
    const retryHeader = res.headers.get("retry-after");
    const retryMs = retryHeader ? parseInt(retryHeader, 10) * 1000 : 1500;
    if (attempt === 0 && retryMs <= 2000) {
      await new Promise((r) => setTimeout(r, retryMs));
      return rcWith(path, init, token, userId, attempt + 1);
    }
    throw new RateLimitedError(path, Math.ceil(retryMs / 1000));
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`rocketchat ${path}: ${res.status} ${text.slice(0, 300)}`);
  }
  // Defensive: if Rocket.Chat returns its SPA HTML on a 200 response, that
  // signals that the requested route doesn't exist or that auth silently
  // failed. Convert this into a clean error instead of letting JSON.parse die.
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    throw new Error(
      `rocketchat ${path}: 200 with HTML body (auth or route mismatch); first bytes=${trimmed.slice(0, 80)}`,
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new Error(
      `rocketchat ${path}: invalid JSON (${e instanceof Error ? e.message : String(e)})`,
    );
  }
}

// ─── User lookup / lazy provisioning ────────────────────────────────────────

const userIdCache = new Map<string, string>();

export async function getUserIdByUsername(username: string): Promise<string> {
  const cached = userIdCache.get(username);
  if (cached) return cached;
  // Rocket.Chat's `users.info?username=` is case-sensitive. We try the value
  // as-is first, then fall back to a case-insensitive `users.list` query so
  // a Portal-side `ali` correctly resolves to a chat user named `Ali`.
  try {
    const r = await rcAdmin<{ user: { _id: string } }>(
      `/api/v1/users.info?username=${encodeURIComponent(username)}`,
    );
    userIdCache.set(username, r.user._id);
    return r.user._id;
  } catch (e) {
    if (
      !(e instanceof Error) ||
      !/404|user.?not.?found|users-not-allowed-to-view/i.test(e.message)
    ) {
      throw e;
    }
  }
  try {
    const escaped = username.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const q = encodeURIComponent(
      JSON.stringify({ username: { $regex: `^${escaped}$`, $options: "i" } }),
    );
    const r = await rcAdmin<{ users: Array<{ _id: string; username: string }> }>(
      `/api/v1/users.list?count=1&query=${q}`,
    );
    const u = r.users?.[0];
    if (u?._id) {
      userIdCache.set(username, u._id);
      return u._id;
    }
  } catch {
    // fall through to NOT_IN_CHAT
  }
  throw new Error(`USER_NOT_IN_CHAT:${username}`);
}

async function getUserIdByEmail(email: string): Promise<string | null> {
  try {
    const r = await rcAdmin<{ user: { _id: string; username: string } }>(
      `/api/v1/users.info?username=${encodeURIComponent(email)}`,
    );
    return r.user._id;
  } catch {
    // users.info doesn't lookup by email; use users.list with a query.
  }
  try {
    const q = encodeURIComponent(JSON.stringify({ "emails.address": email }));
    const r = await rcAdmin<{ users: Array<{ _id: string }> }>(
      `/api/v1/users.list?count=1&query=${q}`,
    );
    return r.users[0]?._id ?? null;
  } catch {
    return null;
  }
}

/**
 * Provision a user in Rocket.Chat if they don't exist yet. Returns the id.
 * Tries (in order):
 *   1. lookup by Keycloak username,
 *   2. lookup by email (Keycloak username might differ from chat username for
 *      users created before OIDC was wired),
 *   3. create.
 */
export async function ensureUser(opts: {
  username: string;
  email: string;
  name?: string;
}): Promise<string> {
  try {
    return await getUserIdByUsername(opts.username);
  } catch (e) {
    if (!(e instanceof Error) || !e.message.startsWith("USER_NOT_IN_CHAT:")) {
      throw e;
    }
  }
  const byEmail = await getUserIdByEmail(opts.email);
  if (byEmail) {
    userIdCache.set(opts.username, byEmail);
    return byEmail;
  }
  const password = cryptoRandom(28);
  const r = await rcAdmin<{ user: { _id: string } }>(`/api/v1/users.create`, {
    method: "POST",
    body: JSON.stringify({
      email: opts.email,
      name: opts.name ?? opts.username,
      password,
      username: opts.username,
      verified: true,
      requirePasswordChange: false,
      sendWelcomeEmail: false,
      joinDefaultChannels: true,
      active: true,
    }),
  });
  userIdCache.set(opts.username, r.user._id);
  return r.user._id;
}

function cryptoRandom(n: number): string {
  const bytes = new Uint8Array(n);
  crypto.getRandomValues(bytes);
  return Buffer.from(bytes).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, n);
}

// ─── Rooms ───────────────────────────────────────────────────────────────────

type RcChannel = {
  _id: string;
  name?: string;
  fname?: string;
  topic?: string;
  usersCount?: number;
  lastMessage?: { msg: string; ts: string; u?: { username: string } };
  t?: ChatRoomType;
  teamId?: string;
  teamMain?: boolean;
  customFields?: { workspace?: string };
};

type RcRoomLite = {
  _id: string;
  name?: string;
  fname?: string;
  topic?: string;
  usersCount?: number;
  usernames?: string[];
  lastMessage?: { msg: string; ts: string; u?: { username: string } };
  t?: ChatRoomType;
  teamId?: string;
  teamMain?: boolean;
  customFields?: { workspace?: string };
};

type RcImLite = RcRoomLite & {
  usernames?: string[];
};

function lastMessageOf(
  m?: { msg: string; ts: string; u?: { username: string } } | null,
) {
  return m
    ? { text: m.msg, at: m.ts, by: m.u?.username ?? "unknown" }
    : undefined;
}

function workspaceOf(r: RcRoomLite | RcChannel): string | null {
  const ws = r.customFields?.workspace;
  if (ws && typeof ws === "string") return ws.toLowerCase();
  // Heuristic fallback: legacy channels created before the customField
  // convention. If the slug starts with a known workspace prefix, use that.
  const name = (r.name ?? "").toLowerCase();
  for (const w of ["kineo", "corehub", "medtheris"]) {
    if (name === w || name.startsWith(`${w}-`)) return w;
  }
  return null;
}

function mapRoom(
  r: RcRoomLite,
  type: ChatRoomType,
  selfUsername: string,
): ChatRoom {
  const baseName = r.name ?? "(no name)";
  const display = r.fname && r.fname !== baseName ? r.fname : baseName;
  if (type === "d") {
    const partner =
      (r.usernames ?? []).find((u) => u !== selfUsername) ??
      r.usernames?.[0] ??
      "(direct)";
    return {
      id: r._id,
      type,
      name: partner,
      displayName: partner,
      unread: 0,
      lastMessage: lastMessageOf(r.lastMessage),
      dmPartnerUsername: partner,
      workspace: null,
    };
  }
  return {
    id: r._id,
    type,
    name: baseName,
    displayName: display,
    unread: 0,
    lastMessage: lastMessageOf(r.lastMessage),
    teamId: r.teamId || undefined,
    teamMain: r.teamMain || undefined,
    workspace: workspaceOf(r),
  };
}

export async function listRoomsForUser(userId: string): Promise<ChatRoom[]> {
  // Rocket.Chat doesn't expose a single "all subscriptions" endpoint that
  // works reliably across versions, so fan out into the three room kinds.
  const [channels, groups, ims, me] = await Promise.all([
    rcAs<{ channels: RcRoomLite[] }>(userId, `/api/v1/channels.list.joined?count=100`).catch(
      () => ({ channels: [] }),
    ),
    rcAs<{ groups: RcRoomLite[] }>(userId, `/api/v1/groups.list?count=100`).catch(() => ({
      groups: [],
    })),
    rcAs<{ ims: RcImLite[] }>(userId, `/api/v1/im.list?count=100`).catch(() => ({ ims: [] })),
    rcAs<{ username: string }>(userId, `/api/v1/me`).catch(() => ({ username: "" })),
  ]);

  const rooms: ChatRoom[] = [];
  for (const c of channels.channels) rooms.push(mapRoom(c, "c", me.username));
  for (const g of groups.groups) rooms.push(mapRoom(g, "p", me.username));
  for (const i of ims.ims) rooms.push(mapRoom(i, "d", me.username));

  rooms.sort((a, b) => {
    const at = a.lastMessage?.at ?? "";
    const bt = b.lastMessage?.at ?? "";
    return bt.localeCompare(at);
  });
  return rooms;
}

/** Map of teamId → ChatTeam. Cached briefly because teams change rarely. */
type TeamMeta = { _id: string; name: string; roomId?: string };
let teamCache: { at: number; map: Map<string, ChatTeam> } | null = null;
const TEAM_TTL_MS = 60_000;

const TEAM_DISPLAY_OVERRIDES: Record<string, string> = {
  kineo: "Kineo",
  "kineo-physiotherapie": "Kineo Physiotherapie",
  "kineo-fitness": "Kineo Fitness",
  "kineo-sportwissenschaften": "Kineo Sportwissenschaften",
};

function prettifyTeamName(slug: string): string {
  if (TEAM_DISPLAY_OVERRIDES[slug]) return TEAM_DISPLAY_OVERRIDES[slug];
  return slug
    .split("-")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function teamWorkspaceFromName(name: string): string | null {
  const n = name.toLowerCase();
  for (const w of ["kineo", "corehub", "medtheris"]) {
    if (n === w || n.startsWith(`${w}-`)) return w;
  }
  return null;
}

export async function listTeams(): Promise<ChatTeam[]> {
  if (teamCache && Date.now() - teamCache.at < TEAM_TTL_MS) {
    return [...teamCache.map.values()];
  }
  const r = await rcAdmin<{ teams: TeamMeta[] }>(
    `/api/v1/teams.listAll?count=200`,
  ).catch(() => ({ teams: [] }));
  const map = new Map<string, ChatTeam>();
  for (const t of r.teams ?? []) {
    map.set(t._id, {
      id: t._id,
      name: t.name,
      displayName: prettifyTeamName(t.name),
      workspace: teamWorkspaceFromName(t.name),
    });
  }
  teamCache = { at: Date.now(), map };
  return [...map.values()];
}

export function invalidateTeamCache() {
  teamCache = null;
}

export async function getRoomInfo(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
): Promise<{ name: string; topic?: string; membersCount?: number; type: ChatRoomType }> {
  const path =
    type === "d"
      ? `/api/v1/im.members?roomId=${roomId}`
      : type === "p"
        ? `/api/v1/groups.info?roomId=${roomId}`
        : `/api/v1/channels.info?roomId=${roomId}`;
  const r = await rcAs<{ channel?: RcChannel; group?: RcChannel; members?: { username: string }[] }>(
    asUserId,
    path,
  );
  if (type === "d") {
    const others = (r.members ?? []).filter((m) => m.username);
    return {
      name: others.map((m) => m.username).join(", "),
      type,
      membersCount: others.length,
    };
  }
  const ch = r.channel ?? r.group;
  return {
    name: ch?.fname ?? ch?.name ?? "(no name)",
    topic: ch?.topic,
    membersCount: ch?.usersCount,
    type,
  };
}

// ─── Messages ────────────────────────────────────────────────────────────────

type RcMessage = {
  _id: string;
  rid: string;
  msg: string;
  html?: string;
  ts: string;
  editedAt?: string;
  u: { _id: string; username: string; name?: string };
  attachments?: Array<{
    title?: string;
    title_link?: string;
    title_link_download?: boolean;
    description?: string;
    image_url?: string;
    type?: string;
  }>;
  t?: string;
  tmid?: string;
};

function toMessage(m: RcMessage): ChatMessage {
  return {
    id: m._id,
    roomId: m.rid,
    text: m.msg,
    html: m.html,
    at: m.ts,
    editedAt: m.editedAt,
    user: {
      id: m.u._id,
      username: m.u.username,
      name: m.u.name,
    },
    attachments: m.attachments?.map((a) => ({
      title: a.title,
      titleLink: a.title_link,
      description: a.description,
      imageUrl: a.image_url,
      type: a.type,
    })),
    isSystem: !!m.t,
    threadParentId: m.tmid,
  };
}

export async function listHistory(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
  count: number = 50,
): Promise<ChatMessage[]> {
  const path =
    type === "d"
      ? "/api/v1/im.history"
      : type === "p"
        ? "/api/v1/groups.history"
        : "/api/v1/channels.history";
  const r = await rcAs<{ messages: RcMessage[] }>(
    asUserId,
    `${path}?roomId=${roomId}&count=${count}`,
  );
  return r.messages.map(toMessage).reverse(); // chronological
}

export async function postMessage(
  asUserId: string,
  roomId: string,
  text: string,
  threadParentId?: string,
): Promise<ChatMessage> {
  const r = await rcAs<{ message: RcMessage }>(
    asUserId,
    `/api/v1/chat.postMessage`,
    {
      method: "POST",
      body: JSON.stringify({
        roomId,
        text,
        ...(threadParentId ? { tmid: threadParentId } : {}),
      }),
    },
  );
  return toMessage(r.message);
}

/**
 * Upload a file to a room (channels, private groups, DMs). Uses
 * `POST /api/v1/rooms.upload/:rid` with multipart form — same as the
 * Rocket.Chat client.
 */
export async function uploadFileToRoom(
  asUserId: string,
  roomId: string,
  data: Buffer | Uint8Array,
  filename: string,
  contentType: string,
  messageText?: string,
): Promise<ChatMessage> {
  const token = await getOrCreateUserAuthToken(asUserId);
  const form = new FormData();
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  const u8 = new Uint8Array(buf);
  form.append(
    "file",
    new File([u8], filename, {
      type: contentType || "application/octet-stream",
    }),
  );
  if (messageText?.trim()) {
    form.append("msg", messageText.trim());
  }
  const path = `/api/v1/rooms.upload/${encodeURIComponent(roomId)}`;
  return uploadMultipart(asUserId, path, form, token);
}

async function uploadMultipart(
  rcUserId: string,
  path: string,
  form: FormData,
  token: string,
): Promise<ChatMessage> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "X-Auth-Token": token,
      "X-User-Id": rcUserId,
    },
    body: form,
    cache: "no-store",
    redirect: "manual",
  });
  if (res.status >= 300 && res.status < 400) {
    throw new Error(`rocketchat ${path}: redirect ${res.status} (likely auth failure)`);
  }
  if (res.status === 429) {
    const retryHeader = res.headers.get("retry-after");
    const retryMs = retryHeader ? parseInt(retryHeader, 10) * 1000 : 1500;
    throw new RateLimitedError(path, Math.ceil(retryMs / 1000));
  }
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`rocketchat ${path}: ${res.status} ${text.slice(0, 400)}`);
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("<")) {
    throw new Error(
      `rocketchat ${path}: 200 with HTML body (auth or route mismatch); first bytes=${trimmed.slice(0, 80)}`,
    );
  }
  type UploadResp = { message?: RcMessage; success?: boolean };
  let parsed: UploadResp;
  try {
    parsed = JSON.parse(text) as UploadResp;
  } catch (e) {
    throw new Error(
      `rocketchat ${path}: invalid JSON (${e instanceof Error ? e.message : String(e)})`,
    );
  }
  const m = parsed.message;
  if (!m?._id) {
    throw new Error(`rocketchat ${path}: no message in response`);
  }
  return toMessage(m);
}

export async function markRoomRead(asUserId: string, roomId: string): Promise<void> {
  await rcAs(
    asUserId,
    `/api/v1/subscriptions.read`,
    { method: "POST", body: JSON.stringify({ rid: roomId }) },
  );
}

// ─── Users / DMs ─────────────────────────────────────────────────────────────

export async function searchUsers(query: string, asUserId: string): Promise<ChatUserSummary[]> {
  if (!query || query.length < 2) return [];
  const q = encodeURIComponent(
    JSON.stringify({
      $or: [
        { username: { $regex: query, $options: "i" } },
        { name: { $regex: query, $options: "i" } },
      ],
      active: true,
    }),
  );
  const r = await rcAs<{ users: Array<{ _id: string; username: string; name?: string; status?: string; emails?: { address: string }[] }> }>(
    asUserId,
    `/api/v1/users.list?count=10&query=${q}`,
  );
  return r.users
    .filter((u) => u.username && u.username !== "rocket.cat")
    .map((u) => ({
      id: u._id,
      username: u.username,
      name: u.name,
      status: (u.status as ChatUserSummary["status"]) ?? "offline",
      email: u.emails?.[0]?.address,
    }));
}

export async function createOrOpenDM(
  asUserId: string,
  otherUsername: string,
): Promise<{ roomId: string }> {
  const r = await rcAs<{ room: { rid: string; _id?: string } }>(
    asUserId,
    `/api/v1/im.create`,
    { method: "POST", body: JSON.stringify({ username: otherUsername }) },
  );
  return { roomId: r.room.rid ?? r.room._id ?? "" };
}

// ─── Jitsi call link helper ──────────────────────────────────────────────────

const JITSI_BASE = process.env.JITSI_PUBLIC_BASE ?? "https://meet.kineo360.work";

export function buildJitsiRoomForChat(roomId: string, roomName: string): string {
  // Stable per-channel room name; readable but not guessable from name alone (uses roomId hash)
  const slug =
    roomName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "room";
  // Append short hash of roomId so the URL is somewhat unguessable yet stable
  const hash = roomId.slice(0, 8);
  const room = `corehub-${slug}-${hash}`;
  const base = JITSI_BASE.replace(/\/$/, "");
  const u = new URL(`${base}/${encodeURIComponent(room)}`);
  u.searchParams.set("lang", "de");
  // Deep-Link-Prompts in mobiler/embedded Umgebung reduzieren (Server: ENABLE_PREJOIN_PAGE etc.)
  u.searchParams.set("config.disableDeepLinking", "true");
  return u.toString();
}

/** Post a Jitsi call invite into a room. */
export async function postCallInvite(
  asUserId: string,
  roomId: string,
  roomName: string,
): Promise<{ link: string; messageId: string }> {
  const link = buildJitsiRoomForChat(roomId, roomName);
  const text = [
    `Video-Anruf gestartet — [Hier beitreten](${link})`,
    ``,
    `_Direktlink: ${link}_`,
  ].join("\n");
  const msg = await postMessage(asUserId, roomId, text);
  return { link, messageId: msg.id };
}

// ─── Channel/Group management ────────────────────────────────────────────────

export type CreateRoomInput = {
  /** Slug-style name (lowercase, hyphenated). RC will normalise it anyway. */
  name: string;
  /** `false` => public channel (channels.create). `true` => private group. */
  isPrivate: boolean;
  /** Workspace tag (kineo|corehub|medtheris) → stored as customFields.workspace. */
  workspace: string;
  /** Optional human display name. Stored as `fname`. */
  displayName?: string;
  /** Optional one-liner for the channel header. */
  topic?: string;
  /** Optional initial member usernames (besides the creator). */
  memberUsernames?: string[];
  /** Optional team to attach this channel to (its sub-channel). */
  teamId?: string;
  /** Optional team name (alternative to teamId). */
  teamName?: string;
};

/** Slugify a free-form name into a Rocket.Chat-acceptable channel name. */
export function slugifyChannelName(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

/**
 * Create a channel (public) or group (private). Acts AS the requesting user
 * so they automatically become the owner. Tags the room with `customFields.
 * workspace=<workspace>` for portal filtering.
 */
export async function createRoom(
  asUserId: string,
  input: CreateRoomInput,
): Promise<{ roomId: string; type: "c" | "p" }> {
  const path = input.isPrivate ? "/api/v1/groups.create" : "/api/v1/channels.create";
  const body: Record<string, unknown> = {
    name: slugifyChannelName(input.name),
    members: input.memberUsernames ?? [],
    customFields: { workspace: input.workspace.toLowerCase() },
    extraData: input.teamId
      ? { teamId: input.teamId }
      : input.teamName
        ? { teamId: input.teamName }
        : undefined,
  };
  // RC ignores unknown top-level keys; pass these for completeness.
  if (input.displayName) body.fname = input.displayName;
  if (input.topic) body.topic = input.topic;

  const r = await rcAs<{ channel?: { _id: string }; group?: { _id: string } }>(
    asUserId,
    path,
    { method: "POST", body: JSON.stringify(body) },
  );
  const id = r.channel?._id ?? r.group?._id;
  if (!id) throw new Error("rocketchat createRoom: no _id in response");

  // RC sometimes ignores customFields on create — set explicitly via admin too,
  // so workspace filtering works regardless of which version we're talking to.
  try {
    const setPath = input.isPrivate
      ? "/api/v1/groups.setCustomFields"
      : "/api/v1/channels.setCustomFields";
    await rcAdmin(setPath, {
      method: "POST",
      body: JSON.stringify({
        roomId: id,
        customFields: { workspace: input.workspace.toLowerCase() },
      }),
    });
  } catch {
    // Best-effort. Heuristic name-prefix fallback in workspaceOf() will still
    // catch the room if it's named e.g. `kineo-foo`.
  }
  if (input.displayName) {
    try {
      const setNamePath = input.isPrivate
        ? "/api/v1/groups.setName"
        : "/api/v1/channels.setName";
      await rcAs(asUserId, setNamePath, {
        method: "POST",
        body: JSON.stringify({ roomId: id, name: slugifyChannelName(input.name) }),
      });
    } catch {
      // ignore — name is already set on creation
    }
  }
  return { roomId: id, type: input.isPrivate ? "p" : "c" };
}

/** Toggle channel ↔ group (public ↔ private). RC implements this as setType. */
export async function setRoomPrivacy(
  asUserId: string,
  roomId: string,
  isPrivate: boolean,
): Promise<void> {
  // RC quirk: from a public channel you call channels.setType; from a private
  // group you call groups.setType. Caller knows the current type, so they pass
  // the *desired* state and we infer the source endpoint.
  const path = isPrivate ? "/api/v1/channels.setType" : "/api/v1/groups.setType";
  await rcAs(asUserId, path, {
    method: "POST",
    body: JSON.stringify({ roomId, type: isPrivate ? "p" : "c" }),
  });
}

export async function setRoomTopic(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
  topic: string,
): Promise<void> {
  const path =
    type === "p" ? "/api/v1/groups.setTopic" : "/api/v1/channels.setTopic";
  await rcAs(asUserId, path, {
    method: "POST",
    body: JSON.stringify({ roomId, topic }),
  });
}

export async function renameRoom(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
  newName: string,
): Promise<void> {
  const path =
    type === "p" ? "/api/v1/groups.setName" : "/api/v1/channels.setName";
  await rcAs(asUserId, path, {
    method: "POST",
    body: JSON.stringify({ roomId, name: slugifyChannelName(newName) }),
  });
}

export async function archiveRoom(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
  archive: boolean,
): Promise<void> {
  const verb = archive ? "archive" : "unarchive";
  const path =
    type === "p"
      ? `/api/v1/groups.${verb}`
      : `/api/v1/channels.${verb}`;
  await rcAs(asUserId, path, {
    method: "POST",
    body: JSON.stringify({ roomId }),
  });
}

export async function inviteToRoom(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
  userIdToAdd: string,
): Promise<void> {
  const path =
    type === "p" ? "/api/v1/groups.invite" : "/api/v1/channels.invite";
  await rcAs(asUserId, path, {
    method: "POST",
    body: JSON.stringify({ roomId, userId: userIdToAdd }),
  });
}

export async function kickFromRoom(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
  userIdToKick: string,
): Promise<void> {
  const path =
    type === "p" ? "/api/v1/groups.kick" : "/api/v1/channels.kick";
  await rcAs(asUserId, path, {
    method: "POST",
    body: JSON.stringify({ roomId, userId: userIdToKick }),
  });
}

export type RoomMember = {
  id: string;
  username: string;
  name?: string;
  status?: "online" | "away" | "busy" | "offline";
  isOwner?: boolean;
  isModerator?: boolean;
};

export async function listRoomMembers(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
): Promise<RoomMember[]> {
  const path =
    type === "d"
      ? `/api/v1/im.members?roomId=${roomId}&count=100`
      : type === "p"
        ? `/api/v1/groups.members?roomId=${roomId}&count=100`
        : `/api/v1/channels.members?roomId=${roomId}&count=100`;
  const r = await rcAs<{
    members: Array<{
      _id: string;
      username: string;
      name?: string;
      status?: string;
    }>;
    // groups.members and channels.members also return roles via a separate
    // endpoint; we fetch them in parallel below.
  }>(asUserId, path);

  // Fetch roles to mark owner / moderator (best-effort).
  let owners = new Set<string>();
  let mods = new Set<string>();
  if (type !== "d") {
    try {
      const rolesPath =
        type === "p" ? "/api/v1/groups.roles" : "/api/v1/channels.roles";
      const rr = await rcAs<{
        roles: Array<{ u: { _id: string }; roles: string[] }>;
      }>(asUserId, `${rolesPath}?roomId=${roomId}`);
      for (const e of rr.roles ?? []) {
        if (e.roles.includes("owner")) owners.add(e.u._id);
        if (e.roles.includes("moderator")) mods.add(e.u._id);
      }
    } catch {
      owners = new Set();
      mods = new Set();
    }
  }

  return r.members.map((m) => ({
    id: m._id,
    username: m.username,
    name: m.name,
    status: (m.status as RoomMember["status"]) ?? "offline",
    isOwner: owners.has(m._id),
    isModerator: mods.has(m._id),
  }));
}

export type RoomFile = {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
  /** Direct download URL (Rocket.Chat-relative, e.g. `/file-upload/<id>/<name>`). */
  url: string;
};

export async function listRoomFiles(
  asUserId: string,
  roomId: string,
  type: ChatRoomType,
  count: number = 50,
): Promise<RoomFile[]> {
  const path =
    type === "d"
      ? "/api/v1/im.files"
      : type === "p"
        ? "/api/v1/groups.files"
        : "/api/v1/channels.files";
  const r = await rcAs<{
    files: Array<{
      _id: string;
      name: string;
      type?: string;
      size?: number;
      uploadedAt?: string;
      url?: string;
      path?: string;
      user?: { username?: string };
      userId?: string;
    }>;
  }>(asUserId, `${path}?roomId=${roomId}&count=${count}&sort=${encodeURIComponent('{"uploadedAt":-1}')}`);
  return (r.files ?? []).map((f) => ({
    id: f._id,
    name: f.name,
    type: f.type ?? "application/octet-stream",
    size: f.size ?? 0,
    uploadedAt: f.uploadedAt ?? "",
    uploadedBy: f.user?.username ?? "unknown",
    url:
      f.url ??
      f.path ??
      `/file-upload/${f._id}/${encodeURIComponent(f.name)}`,
  }));
}

/**
 * Resolve a username → Rocket.Chat user id, but only if a user exists.
 * Differs from getUserIdByUsername() in that it doesn't throw when missing —
 * useful for invite flows where we want to surface a friendly "user not found".
 */
export async function findUserIdByUsername(username: string): Promise<string | null> {
  try {
    return await getUserIdByUsername(username);
  } catch {
    return null;
  }
}
