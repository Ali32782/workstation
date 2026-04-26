#!/usr/bin/env node
/**
 * chat-bootstrap-kineo-teams.mjs
 *
 * Provisions a Microsoft-Teams-style channel hierarchy in Rocket.Chat for
 * the Kineo workspace. Re-runnable: skips anything that already exists.
 *
 * Structure (matches the user's MS Teams mockup):
 *
 *   Kineo                         (team, public)
 *     └─ #allgemein               (team main channel — auto-created)
 *     └─ #bereichsleitungs-board  (public)
 *     └─ #customer-care-board     (public)
 *     └─ #leadership-board        (public)
 *     └─ #marketing-board         (public)
 *
 *   Kineo Physiotherapie          (team, public)
 *     └─ #allgemein               (team main channel)
 *     └─ Kineo Escherwyss         🔒 private group
 *     └─ Kineo Seefeld            🔒 private group
 *     └─ Kineo Stauffacher        🔒 private group
 *     └─ Kineo Tertianum          🔒 private group
 *     └─ Kineo Thalwil            🔒 private group
 *     └─ Kineo Wipkingen          🔒 private group
 *     └─ Kineo Zollikon           🔒 private group
 *     └─ #physio-wissen           (public)
 *
 *   Kineo Fitness                 (team, public)
 *     └─ #allgemein
 *     └─ #fitness
 *     └─ #hyrox
 *     └─ #kurse
 *
 *   Kineo Sportwissenschaften     (team, public)
 *     └─ #allgemein
 *     └─ #performancelab
 *     └─ #teamlab
 *
 * All teams + channels carry customField `workspace=kineo` so the portal
 * can filter them per workspace.
 *
 * Usage (inside the portal container, env vars already present):
 *   node /tmp/chat-bootstrap-kineo-teams.mjs [ownerUsername]
 *
 * Falls back to OWNER_USERNAME=ali if not given.
 */

const BASE = process.env.ROCKETCHAT_API_BASE;
const TOKEN = process.env.ROCKETCHAT_ADMIN_TOKEN;
const USER_ID = process.env.ROCKETCHAT_ADMIN_USER_ID;
const OWNER_USERNAME = process.argv[2] || process.env.OWNER_USERNAME || "ali";

if (!BASE || !TOKEN || !USER_ID) {
  console.error(
    "Missing ROCKETCHAT_API_BASE / ROCKETCHAT_ADMIN_TOKEN / ROCKETCHAT_ADMIN_USER_ID",
  );
  process.exit(1);
}

const HEADERS = {
  "X-Auth-Token": TOKEN,
  "X-User-Id": USER_ID,
  "Content-Type": "application/json",
};

async function api(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return json;
}

async function teamIdByName(name) {
  // teams.info errors with "Room not found" when the team document exists but
  // its main channel was never created (orphan from a failed teams.create).
  // teams.listAll returns the orphan too, so we use that for the check and
  // refuse to proceed if we hit an orphan (caller must clean it via mongo).
  const r = await api("GET", `/api/v1/teams.listAll?count=200`);
  const t = (r?.teams ?? []).find((x) => x.name === name);
  if (!t) return null;
  if (!t.roomId) {
    throw new Error(
      `team '${name}' exists in mongo but has no roomId (orphan from earlier failed create). ` +
        `Run: docker exec rocketchat-mongo mongosh --quiet rocketchat --eval ` +
        `'db.rocketchat_team.deleteOne({_id: "${t._id}"})'  and re-run.`,
    );
  }
  return t._id;
}
async function publicChannelIdByName(name) {
  const r = await api("GET", `/api/v1/channels.info?roomName=${encodeURIComponent(name)}`);
  return r?.channel?._id ?? null;
}
async function privateGroupIdByName(name) {
  const r = await api("GET", `/api/v1/groups.info?roomName=${encodeURIComponent(name)}`);
  return r?.group?._id ?? null;
}

async function ensureTeam(slug) {
  const existing = await teamIdByName(slug);
  if (existing) {
    console.log(`[skip] team ${slug} exists (${existing})`);
    return existing;
  }
  // NOTE: do not send `owner` — Rocket.Chat 6.x rejects teams.create with
  // both `owner` and `members` set ("error-team-creation"). The calling admin
  // user becomes owner automatically.
  const r = await api("POST", "/api/v1/teams.create", {
    name: slug,
    type: 0, // public
    members: [OWNER_USERNAME],
  });
  if (!r?.team?._id) {
    throw new Error(`team.create(${slug}) failed: ${JSON.stringify(r)}`);
  }
  console.log(`[ok]   team ${slug} created (${r.team._id})`);
  return r.team._id;
}

async function ensureSubChannel(teamId, slug, type /* "c" | "p" */) {
  const isPrivate = type === "p";
  let id = isPrivate
    ? await privateGroupIdByName(slug)
    : await publicChannelIdByName(slug);
  if (id) {
    console.log(`  [skip] ${slug} (${type}) exists`);
  } else {
    const r = await api(
      "POST",
      isPrivate ? "/api/v1/groups.create" : "/api/v1/channels.create",
      {
        name: slug,
        members: [OWNER_USERNAME],
        extraData: { teamId, teamMain: false },
      },
    );
    id = r?.channel?._id ?? r?.group?._id ?? null;
    if (!id) {
      console.error(`  [err]  create ${slug} (${type}) failed: ${JSON.stringify(r)}`);
      return null;
    }
    console.log(`  [ok]   ${slug} (${type}) created (${id})`);
  }
  // Attach to team (idempotent — RC throws "already-exists" if so).
  const attach = await api("POST", "/api/v1/teams.addRooms", {
    rooms: [id],
    teamId,
  });
  if (!attach?.success && !JSON.stringify(attach).includes("already-exists")) {
    console.warn(`  [warn] addRooms(${slug} → ${teamId}): ${JSON.stringify(attach)}`);
  }
  // Tag with workspace customField for cross-tenant filtering.
  await api(
    "POST",
    isPrivate ? "/api/v1/groups.setCustomFields" : "/api/v1/channels.setCustomFields",
    { roomId: id, customFields: { workspace: "kineo" } },
  ).catch((e) => console.warn(`  [warn] setCustomFields(${slug}): ${e.message}`));
  return id;
}

async function tagTeamMain(slug) {
  const id = await publicChannelIdByName(slug);
  if (!id) return;
  await api("POST", "/api/v1/channels.setCustomFields", {
    roomId: id,
    customFields: { workspace: "kineo", teamMainChannel: true },
  }).catch(() => {});
}

(async () => {
  // sanity: owner exists?
  const u = await api(
    "GET",
    `/api/v1/users.info?username=${encodeURIComponent(OWNER_USERNAME)}`,
  );
  if (!u?.user?._id) {
    console.error(
      `Owner ${OWNER_USERNAME} not in Rocket.Chat. Have they logged in once?`,
    );
    process.exit(1);
  }
  console.log(`[ok] owner: ${OWNER_USERNAME} (${u.user._id})`);

  /* ─── Kineo (root) ─── */
  console.log("\n═══ Kineo (root) ═══");
  const kineo = await ensureTeam("kineo");
  await tagTeamMain("kineo");
  await ensureSubChannel(kineo, "bereichsleitungs-board", "c");
  await ensureSubChannel(kineo, "customer-care-board", "c");
  await ensureSubChannel(kineo, "leadership-board", "c");
  await ensureSubChannel(kineo, "marketing-board", "c");

  /* ─── Kineo Physiotherapie ─── */
  console.log("\n═══ Kineo Physiotherapie ═══");
  const physio = await ensureTeam("kineo-physiotherapie");
  await tagTeamMain("kineo-physiotherapie");
  for (const loc of [
    "kineo-escherwyss",
    "kineo-seefeld",
    "kineo-stauffacher",
    "kineo-tertianum",
    "kineo-thalwil",
    "kineo-wipkingen",
    "kineo-zollikon",
  ]) {
    await ensureSubChannel(physio, loc, "p");
  }
  await ensureSubChannel(physio, "physio-wissen", "c");

  /* ─── Kineo Fitness ─── */
  console.log("\n═══ Kineo Fitness ═══");
  const fit = await ensureTeam("kineo-fitness");
  await tagTeamMain("kineo-fitness");
  await ensureSubChannel(fit, "fitness", "c");
  await ensureSubChannel(fit, "hyrox", "c");
  await ensureSubChannel(fit, "kurse", "c");

  /* ─── Kineo Sportwissenschaften ─── */
  console.log("\n═══ Kineo Sportwissenschaften ═══");
  const sport = await ensureTeam("kineo-sportwissenschaften");
  await tagTeamMain("kineo-sportwissenschaften");
  await ensureSubChannel(sport, "performancelab", "c");
  await ensureSubChannel(sport, "teamlab", "c");

  console.log("\n═══ Done ═══");
})().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
