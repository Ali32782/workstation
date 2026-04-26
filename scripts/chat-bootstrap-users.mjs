#!/usr/bin/env node
/**
 * chat-bootstrap-users.mjs
 *
 * Pre-provisions all Keycloak users into Rocket.Chat so they are searchable
 * and DM-able from the portal even before they have logged in for the first
 * time.
 *
 * - Reads the user list from Keycloak (`KC_REALM`, default `main`) via the
 *   admin REST API using the `KEYCLOAK_ADMIN_*` credentials.
 * - For each user with an email + username, ensures a Rocket.Chat account
 *   exists with that username/email (via `users.create`, idempotent).
 * - The account is created with a deterministic password so that the user's
 *   first SSO login through OIDC matches up.
 *
 * Usage (anywhere with docker access to keycloak + portal env):
 *
 *   ssh server
 *   docker cp scripts/chat-bootstrap-users.mjs portal:/tmp/
 *   docker exec -e KC_REALM=main \
 *     -e KC_ADMIN=admin -e KC_ADMIN_PASSWORD=… \
 *     -e KC_BASE=https://auth.kineo360.work \
 *     portal node /tmp/chat-bootstrap-users.mjs
 */

const RC_BASE = process.env.ROCKETCHAT_API_BASE;
const RC_TOKEN = process.env.ROCKETCHAT_ADMIN_TOKEN;
const RC_USER = process.env.ROCKETCHAT_ADMIN_USER_ID;
const KC_BASE = (process.env.KC_BASE || "https://auth.kineo360.work").replace(/\/+$/, "");
const KC_REALM = process.env.KC_REALM || "main";
const KC_ADMIN = process.env.KC_ADMIN || process.env.KEYCLOAK_ADMIN || "admin";
const KC_PASS = process.env.KC_ADMIN_PASSWORD || process.env.KEYCLOAK_ADMIN_PASSWORD;
const DRY_RUN = process.env.DRY_RUN === "1";

if (!RC_BASE || !RC_TOKEN || !RC_USER) {
  console.error("ROCKETCHAT_API_BASE / ROCKETCHAT_ADMIN_TOKEN / ROCKETCHAT_ADMIN_USER_ID required");
  process.exit(1);
}
if (!KC_PASS) {
  console.error("KC_ADMIN_PASSWORD (or KEYCLOAK_ADMIN_PASSWORD) required");
  process.exit(1);
}

const RC_HEADERS = {
  "X-Auth-Token": RC_TOKEN,
  "X-User-Id": RC_USER,
  "Content-Type": "application/json",
};

async function rc(method, path, body) {
  const res = await fetch(RC_BASE + path, {
    method,
    headers: RC_HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const t = await res.text();
  let j;
  try { j = JSON.parse(t); } catch { throw new Error(`${method} ${path} → ${res.status}: ${t.slice(0,200)}`); }
  return j;
}

async function kcToken() {
  const res = await fetch(`${KC_BASE}/realms/master/protocol/openid-connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "password",
      client_id: "admin-cli",
      username: KC_ADMIN,
      password: KC_PASS,
    }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error("KC token failed: " + JSON.stringify(j));
  return j.access_token;
}

async function kcUsers(token) {
  const res = await fetch(`${KC_BASE}/admin/realms/${KC_REALM}/users?max=500`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}

function cryptoRandom(n) {
  const buf = new Uint8Array(n);
  globalThis.crypto.getRandomValues(buf);
  return Buffer.from(buf).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, n);
}

async function existsRcByUsername(username) {
  const j = await rc("GET", `/api/v1/users.info?username=${encodeURIComponent(username)}`).catch(() => null);
  return j?.user?._id ?? null;
}

async function existsRcByEmail(email) {
  const q = encodeURIComponent(JSON.stringify({ "emails.address": email }));
  const j = await rc("GET", `/api/v1/users.list?count=1&query=${q}`).catch(() => null);
  return j?.users?.[0]?._id ?? null;
}

async function ensureRcUser(u) {
  const username = u.username;
  const email = u.email;
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || username;
  if (!username || !email) {
    console.log(`[skip] ${username || "(?)"} — missing username or email`);
    return;
  }
  const byU = await existsRcByUsername(username);
  if (byU) {
    console.log(`[skip] ${username} already in RC (${byU})`);
    return;
  }
  const byE = await existsRcByEmail(email);
  if (byE) {
    console.log(`[skip] ${username} already in RC by email (${byE})`);
    return;
  }
  if (DRY_RUN) {
    console.log(`[dry]  would create ${username} <${email}> "${name}"`);
    return;
  }
  const password = cryptoRandom(28);
  const r = await rc("POST", "/api/v1/users.create", {
    email,
    name,
    password,
    username,
    verified: true,
    requirePasswordChange: false,
    sendWelcomeEmail: false,
    joinDefaultChannels: true,
    active: true,
  });
  if (!r?.user?._id) {
    console.error(`[err]  create ${username}: ${JSON.stringify(r)}`);
    return;
  }
  console.log(`[ok]   created ${username} <${email}> (${r.user._id})`);
}

(async () => {
  console.log(`KC realm: ${KC_REALM} @ ${KC_BASE}`);
  console.log(`RC base : ${RC_BASE}`);
  const token = await kcToken();
  const users = await kcUsers(token);
  console.log(`Fetched ${users.length} KC users`);
  for (const u of users) {
    if (!u.enabled) {
      console.log(`[skip] ${u.username} disabled`);
      continue;
    }
    try {
      await ensureRcUser(u);
    } catch (e) {
      console.error(`[err]  ${u.username}: ${e.message}`);
    }
  }
  console.log("\n═══ done ═══");
})().catch((e) => { console.error("FATAL:", e); process.exit(1); });
