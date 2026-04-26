#!/usr/bin/env node
/**
 * chat-bootstrap-medtheris-corehub.mjs
 *
 * Provision basic team + channel structure for the Medtheris and Corehub
 * workspaces (the kineo workspace already has its own bootstrapper). Each
 * team and channel is tagged with `customFields.workspace` so the portal
 * filter knows which workspace it belongs to.
 *
 * Re-runnable: every step is idempotent. New channels are added but existing
 * ones are left untouched.
 *
 * Structure:
 *   medtheris  → #allgemein, #helpdesk, #onboarding, #sales, #tech-support
 *   corehub    → #allgemein, #engineering, #design, #ops, #release-notes
 */

const BASE = process.env.ROCKETCHAT_API_BASE || "http://rocketchat:3000";
const TOKEN = process.env.ROCKETCHAT_ADMIN_TOKEN;
const USER_ID = process.env.ROCKETCHAT_ADMIN_USER_ID;
const OWNER = process.argv[2] || process.env.OWNER_USERNAME || "ali";

if (!TOKEN || !USER_ID) {
  console.error("Missing ROCKETCHAT_ADMIN_TOKEN / ROCKETCHAT_ADMIN_USER_ID");
  process.exit(1);
}

const HEADERS = { "X-Auth-Token": TOKEN, "X-User-Id": USER_ID };

async function rc(path, init = {}) {
  const r = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...HEADERS, "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
  const text = await r.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} → ${r.status}: ${text.slice(0, 200)}`);
  }
  if (!r.ok || json.success === false) {
    throw new Error(`${path} → ${r.status}: ${json.error ?? text.slice(0, 200)}`);
  }
  return json;
}

async function getOwnerId() {
  const r = await rc(`/api/v1/users.info?username=${encodeURIComponent(OWNER)}`);
  return r.user._id;
}

async function getOrCreateTeam(name, workspace) {
  try {
    const r = await rc(`/api/v1/teams.info?teamName=${encodeURIComponent(name)}`);
    return r.teamInfo;
  } catch {
    /* not found, create */
  }
  const r = await rc(`/api/v1/teams.create`, {
    method: "POST",
    body: JSON.stringify({
      name,
      type: 0,
      members: [],
      customFields: { workspace },
    }),
  });
  return r.team;
}

async function getOrCreateChannel(name, isPrivate, teamId, workspace) {
  const ep = isPrivate ? "/api/v1/groups.info" : "/api/v1/channels.info";
  try {
    const r = await rc(`${ep}?roomName=${encodeURIComponent(name)}`);
    const room = r.channel || r.group;
    if (room) return room;
  } catch {
    /* not found */
  }
  const create = isPrivate ? "/api/v1/groups.create" : "/api/v1/channels.create";
  const r = await rc(create, {
    method: "POST",
    body: JSON.stringify({
      name,
      members: [],
      customFields: { workspace },
    }),
  });
  const room = r.channel || r.group;
  if (teamId && room) {
    try {
      await rc(`/api/v1/teams.addRooms`, {
        method: "POST",
        body: JSON.stringify({ teamId, rooms: [room._id] }),
      });
    } catch (e) {
      if (!String(e.message).includes("already-exists") && !String(e.message).includes("room-already-on-team")) {
        throw e;
      }
    }
  }
  return room;
}

async function tagRoomWorkspace(roomId, workspace) {
  try {
    await rc(`/api/v1/rooms.adminRooms.saveCustomFields`, {
      method: "POST",
      body: JSON.stringify({ rid: roomId, customFields: { workspace } }),
    });
  } catch {
    // older RC versions: fall back to channels.setCustomFields
    try {
      await rc(`/api/v1/channels.setCustomFields`, {
        method: "POST",
        body: JSON.stringify({ roomId, customFields: { workspace } }),
      });
    } catch {
      /* ignore */
    }
  }
}

const PLAN = {
  medtheris: [
    { name: "medtheris-helpdesk", priv: false },
    { name: "medtheris-onboarding", priv: false },
    { name: "medtheris-sales", priv: false },
    { name: "medtheris-tech-support", priv: false },
    { name: "medtheris-leadership", priv: true },
  ],
  corehub: [
    { name: "corehub-engineering", priv: false },
    { name: "corehub-design", priv: false },
    { name: "corehub-ops", priv: false },
    { name: "corehub-release-notes", priv: false },
    { name: "corehub-leadership", priv: true },
  ],
};

(async () => {
  const ownerId = await getOwnerId();
  console.log("owner:", OWNER, "·", ownerId);

  for (const [ws, channels] of Object.entries(PLAN)) {
    const team = await getOrCreateTeam(ws, ws);
    console.log(`\n· team ${ws} (${team._id}, room=${team.roomId ?? "?"})`);
    if (team.roomId) await tagRoomWorkspace(team.roomId, ws);
    for (const ch of channels) {
      try {
        const room = await getOrCreateChannel(ch.name, ch.priv, team._id, ws);
        await tagRoomWorkspace(room._id, ws);
        console.log(`  ✓ ${ch.priv ? "🔒" : "#"} ${ch.name} (${room._id})`);
      } catch (e) {
        console.log(`  ✗ ${ch.name}: ${e.message}`);
      }
    }
  }
})().catch((e) => {
  console.error("FATAL:", e.message);
  process.exit(1);
});
