#!/usr/bin/env node
/**
 * chat-sync-team-members.mjs
 *
 * For every Keycloak user in `main` realm, look at their group paths and
 * make sure they are a member of the matching Rocket.Chat workspace teams
 * (`kineo`, `medtheris`, `corehub`).  Already-members are skipped.
 *
 * As a second pass — and the reason why a previous run stopped feeling
 * complete — we also auto-join every workspace-scoped *public* sub-channel
 * (boards like `leadership-board`, sub-team mains like `kineo-fitness`,
 * topic rooms like `physio-wissen`) for users who belong to that workspace.
 * Private rooms (e.g. the `kineo-<standort>` groups) are intentionally
 * left opt-in so location-specific data stays with the people that
 * actually need it. Pass `--include-private` to also auto-join private
 * groups (used for staging / testing).
 *
 * Required env (already present inside the portal container):
 *   KEYCLOAK_URL                 e.g. https://auth.kineo360.work
 *   KEYCLOAK_ADMIN               e.g. admin
 *   KEYCLOAK_ADMIN_PASSWORD
 *   ROCKETCHAT_API_BASE          e.g. http://rocketchat:3000
 *   ROCKETCHAT_ADMIN_TOKEN
 *   ROCKETCHAT_ADMIN_USER_ID
 *
 * Flags:
 *   --include-private             also invite into private groups
 *   --only-user=<username>        restrict to a single Keycloak user
 *   --dry                         log only, do not invite
 */

const KC = process.env.KEYCLOAK_URL || "https://auth.kineo360.work";
const KC_USER = process.env.KEYCLOAK_ADMIN || "admin";
const KC_PASS = process.env.KEYCLOAK_ADMIN_PASSWORD;
const KC_REALM = "main";

const RC = process.env.ROCKETCHAT_API_BASE || "http://rocketchat:3000";
const RC_TOKEN = process.env.ROCKETCHAT_ADMIN_TOKEN;
const RC_UID = process.env.ROCKETCHAT_ADMIN_USER_ID;

if (!KC_PASS || !RC_TOKEN || !RC_UID) {
  console.error("Missing KEYCLOAK_ADMIN_PASSWORD or ROCKETCHAT_ADMIN_TOKEN/_USER_ID");
  process.exit(1);
}

async function kcToken() {
  const res = await fetch(`${KC}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: KC_USER,
      password: KC_PASS,
    }),
  });
  if (!res.ok) throw new Error(`kc token: ${res.status}`);
  return (await res.json()).access_token;
}

async function kc(token, path) {
  const r = await fetch(`${KC}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`kc ${path}: ${r.status}`);
  return r.json();
}

async function rc(path, init = {}) {
  const r = await fetch(`${RC}${path}`, {
    ...init,
    headers: {
      "X-Auth-Token": RC_TOKEN,
      "X-User-Id": RC_UID,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { throw new Error(`${path}: ${text.slice(0, 200)}`); }
  if (!r.ok || json.success === false) throw new Error(`${path}: ${json.error ?? text.slice(0, 200)}`);
  return json;
}

async function findTeamByName(name) {
  const r = await rc(`/api/v1/teams.info?teamName=${encodeURIComponent(name)}`);
  return r.teamInfo;
}

async function listTeamMembers(teamId) {
  const r = await rc(`/api/v1/teams.members?teamId=${teamId}&count=500`);
  return new Set((r.members ?? []).map((m) => m.user?.username?.toLowerCase()).filter(Boolean));
}

async function ensureMember(teamId, username) {
  // Look up RC user; if missing, skip.
  let rcUser;
  try {
    rcUser = await rc(`/api/v1/users.info?username=${encodeURIComponent(username)}`);
  } catch {
    // Try case-insensitive
    const q = encodeURIComponent(JSON.stringify({ username: { $regex: `^${username}$`, $options: "i" } }));
    const r = await rc(`/api/v1/users.list?count=1&query=${q}`);
    if (!r.users?.length) return { skipped: true, reason: "no-rc-user" };
    rcUser = { user: r.users[0] };
  }
  await rc(`/api/v1/teams.addMembers`, {
    method: "POST",
    body: JSON.stringify({ teamId, members: [{ userId: rcUser.user._id, roles: ["member"] }] }),
  });
  return { added: true };
}

const WORKSPACES = ["kineo", "medtheris", "corehub"];

const FLAGS = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const INCLUDE_PRIVATE = FLAGS.has("--include-private");
const DRY = FLAGS.has("--dry");
const ONLY_USER = (process.argv.slice(2).find((a) => a.startsWith("--only-user=")) ?? "")
  .split("=")[1]
  ?.toLowerCase();

/**
 * Build a workspace-channel index from `customFields.workspace`. We skip the
 * team-main channel itself (handled by `teams.addMembers`) and split into
 * public/private buckets so callers can decide which to auto-join.
 */
async function listWorkspaceChannels(workspace) {
  const out = { public: [], private: [] };
  // /api/v1/channels.list returns at most 100 by default; bump to 500.
  const ch = await rc(`/api/v1/channels.list?count=500`);
  for (const r of ch.channels ?? []) {
    if (r.customFields?.workspace !== workspace) continue;
    if (r.customFields?.teamMainChannel) continue; // already handled by teams.addMembers
    out.public.push({ _id: r._id, name: r.name });
  }
  const gr = await rc(`/api/v1/groups.listAll?count=500`);
  for (const r of gr.groups ?? []) {
    if (r.customFields?.workspace !== workspace) continue;
    if (r.customFields?.teamMainChannel) continue;
    out.private.push({ _id: r._id, name: r.name });
  }
  return out;
}

/**
 * Returns Set<channelId> the user is already in (channels + groups).
 * Used to skip already-invited rooms cheaply without per-room API calls.
 */
async function userSubscriptionRoomIds(userId) {
  // Use users.info to fetch the user; then channels.list / groups.listAll
  // would not tell us about the *other* user's memberships. Instead use
  // the moderation/admin endpoint:
  //   GET /api/v1/users.listSubscriptions?userId=… (admin)
  // is not part of the stable public API across all RC versions, so we
  // fall back to the impersonating-token trick used elsewhere in the
  // portal: query subscriptions via /api/v1/subscriptions.getOne per-room.
  // For the volumes we deal with (≤200 rooms) and the cost of a 409 from
  // channels.invite, just return an empty set and let the invite endpoint
  // tell us "user already in room".
  return new Set();
}

async function inviteIntoChannel(roomId, userId, type) {
  const ep = type === "private" ? "groups.invite" : "channels.invite";
  if (DRY) return { dryRun: true };
  const r = await fetch(`${RC}/api/v1/${ep}`, {
    method: "POST",
    headers: {
      "X-Auth-Token": RC_TOKEN,
      "X-User-Id": RC_UID,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ roomId, userId }),
  });
  const text = await r.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (r.ok) return { added: true };
  if (/already in/i.test(JSON.stringify(body))) return { skipped: true };
  return { failed: true, error: typeof body === "string" ? body : body.error };
}

(async () => {
  const token = await kcToken();
  const users = await kc(token, `/admin/realms/${KC_REALM}/users?max=500`);
  console.log(
    `KC users: ${users.length}` +
      (ONLY_USER ? `  (filtered to --only-user=${ONLY_USER})` : "") +
      (INCLUDE_PRIVATE ? "  +private" : "") +
      (DRY ? "  DRY-RUN" : ""),
  );

  const teamsByWs = {};
  const channelsByWs = {};
  for (const ws of WORKSPACES) {
    try {
      const t = await findTeamByName(ws);
      teamsByWs[ws] = { id: t._id, members: await listTeamMembers(t._id) };
      channelsByWs[ws] = await listWorkspaceChannels(ws);
      console.log(
        `team ${ws} → ${t._id}, current members=${teamsByWs[ws].members.size}, ` +
          `public-subchannels=${channelsByWs[ws].public.length}, ` +
          `private-subchannels=${channelsByWs[ws].private.length}`,
      );
    } catch (e) {
      console.log(`team ${ws} not found: ${e.message}`);
    }
  }

  const counts = { added: 0, kept: 0, skipped: 0, failed: 0, subAdded: 0, subSkipped: 0, subFailed: 0 };
  for (const u of users) {
    if (!u.username || !u.enabled) continue;
    if (ONLY_USER && u.username.toLowerCase() !== ONLY_USER) continue;
    const groups = await kc(token, `/admin/realms/${KC_REALM}/users/${u.id}/groups`);
    const memberWs = new Set();
    for (const g of groups) {
      const path = g.path?.toLowerCase() ?? "";
      for (const ws of WORKSPACES) {
        if (path === `/${ws}` || path.startsWith(`/${ws}/`)) memberWs.add(ws);
      }
    }
    if (memberWs.size === 0) continue;

    // Resolve RC user once per Keycloak user — we need the userId for
    // both teams.addMembers (via ensureMember) and channels.invite.
    let rcUserId = null;
    try {
      const res = await rc(`/api/v1/users.info?username=${encodeURIComponent(u.username)}`);
      rcUserId = res.user?._id ?? null;
    } catch {
      // fall through; ensureMember will retry case-insensitive
    }

    for (const ws of memberWs) {
      const t = teamsByWs[ws];
      if (!t) { counts.skipped++; continue; }

      // Pass 1: team-main membership
      if (t.members.has(u.username.toLowerCase())) {
        counts.kept++;
      } else if (DRY) {
        console.log(`  [dry] + ${u.username} → ${ws} (team-main)`);
        counts.added++;
      } else {
        try {
          const r = await ensureMember(t.id, u.username);
          if (r.skipped) { counts.skipped++; console.log(`  skip ${u.username} → ${ws}: ${r.reason}`); }
          else { counts.added++; console.log(`  + ${u.username} → ${ws} (team-main)`); }
          t.members.add(u.username.toLowerCase());
        } catch (e) {
          counts.failed++;
          console.log(`  ! ${u.username} → ${ws}: ${e.message}`);
          continue; // don't try sub-channels if team-add failed
        }
      }

      // Pass 2: workspace sub-channels (public always, private only if flag set)
      if (!rcUserId) continue;
      const channels = channelsByWs[ws];
      if (!channels) continue;
      const targets = INCLUDE_PRIVATE
        ? [
            ...channels.public.map((c) => ({ ...c, type: "public" })),
            ...channels.private.map((c) => ({ ...c, type: "private" })),
          ]
        : channels.public.map((c) => ({ ...c, type: "public" }));

      for (const room of targets) {
        try {
          const r = await inviteIntoChannel(room._id, rcUserId, room.type);
          if (r.added) {
            counts.subAdded++;
            console.log(`     + ${u.username} → ${ws}/${room.name}`);
          } else if (r.dryRun) {
            counts.subAdded++;
            console.log(`     [dry] + ${u.username} → ${ws}/${room.name}`);
          } else if (r.skipped) {
            counts.subSkipped++;
          } else {
            counts.subFailed++;
            console.log(`     ! ${u.username} → ${ws}/${room.name}: ${r.error ?? "unknown"}`);
          }
        } catch (e) {
          counts.subFailed++;
          console.log(`     ! ${u.username} → ${ws}/${room.name}: ${e.message}`);
        }
      }
    }
  }
  console.log("\nDONE", counts);
})().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
