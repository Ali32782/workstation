#!/usr/bin/env node
/**
 * Idempotent provisioning of Migadu mailboxes + per-user derived
 * passwords for the test users (testuser1..4).
 *
 * Run on the server:
 *   docker run --rm --env-file /opt/corelab/.env --network host \
 *     -v $(pwd):/work node:22-slim node /work/provision-test-mailboxes.mjs
 *
 * Or simply via SSH inline since we just need crypto+fetch:
 *   ssh root@... "node -e '<minified>'"
 */
import crypto from "node:crypto";

const ADMIN_USER = process.env.MIGADU_ADMIN_USER;
const API_KEY = process.env.MIGADU_API_KEY;
const SECRET = process.env.DERIVED_PASSWORD_SECRET;
if (!ADMIN_USER || !API_KEY) {
  console.error("MIGADU_ADMIN_USER / MIGADU_API_KEY missing");
  process.exit(2);
}
if (!SECRET || SECRET.length < 16) {
  console.error("DERIVED_PASSWORD_SECRET missing or too short");
  process.exit(2);
}

function derivePassword(namespace, email) {
  const mac = crypto
    .createHmac("sha256", SECRET)
    .update(`${namespace}:${email.toLowerCase().trim()}`)
    .digest("base64url");
  return `A!a${mac.slice(0, 28)}#9`;
}

const TEST_USERS = [
  { local: "testuser1", domain: "corehub.kineo360.work",  name: "Test One"   },
  { local: "testuser2", domain: "corehub.kineo360.work",  name: "Test Two"   },
  { local: "testuser3", domain: "medtheris.kineo360.work",name: "Test Three" },
  { local: "testuser4", domain: "kineo.kineo360.work",    name: "Test Four"  },
];

const auth = "Basic " + Buffer.from(`${ADMIN_USER}:${API_KEY}`).toString("base64");

async function ensureMailbox({ local, domain, name }) {
  const email = `${local}@${domain}`;
  const password = derivePassword("mail", email);

  const listRes = await fetch(`https://api.migadu.com/v1/domains/${domain}/mailboxes`, {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!listRes.ok) {
    console.error(`  list ${domain} failed: HTTP ${listRes.status}`);
    return;
  }
  const list = await listRes.json();
  const exists = (list.mailboxes ?? []).some(
    (m) => m.address.toLowerCase() === email.toLowerCase(),
  );

  if (exists) {
    // Already there — reset the password to the derived one to keep things in sync.
    const upd = await fetch(
      `https://api.migadu.com/v1/domains/${domain}/mailboxes/${local}`,
      {
        method: "PUT",
        headers: {
          Authorization: auth,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ password }),
      },
    );
    console.log(
      `  ${email}: existed, password reset → HTTP ${upd.status}  (pw=${password.slice(0,6)}…)`,
    );
    return;
  }

  const create = await fetch(`https://api.migadu.com/v1/domains/${domain}/mailboxes`, {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      local_part: local,
      name,
      password,
      may_send: true,
      may_receive: true,
      may_access_imap: true,
      may_access_pop3: false,
      may_access_managesieve: true,
    }),
  });
  const txt = await create.text();
  console.log(
    `  ${email}: created → HTTP ${create.status}  (pw=${password.slice(0,6)}…)  ${txt.slice(0, 80)}`,
  );
}

console.log("Provisioning test mailboxes ...");
for (const u of TEST_USERS) await ensureMailbox(u);
console.log("Done.");
