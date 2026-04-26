// Big regression suite: simulate testuser1 as logged in, exercise every app's
// API across all three workspaces. Uses NextAuth v5 JWE-encoded session cookie.

import { encode } from "@auth/core/jwt";

const PORTAL = "http://localhost:3000";
const SECRET = process.env.AUTH_SECRET;
const SECURE_NAME = "__Secure-authjs.session-token";

if (!SECRET) {
  console.error("AUTH_SECRET missing");
  process.exit(1);
}

const users = {
  testuser1: {
    sub: "b6b51673-5850-45bb-b462-ad601308d85e",
    email: "testuser1@kineo360.work",
    name: "Test One",
    preferredUsername: "testuser1",
    mailbox: "testuser1@kineo360.work",
    groups: ["/corehub", "/corehub/dev-ops", "/kineo/leadership", "/medtheris/sales"],
  },
  ali: {
    sub: "d0381435-af9b-4286-9c7a-7fbe0aa5f1cd",
    email: "ali@kineo360.work",
    name: "Ali Peters",
    preferredUsername: "ali",
    mailbox: "ali@kineo360.work",
    groups: ["/corehub/dev-ops", "/kineo/executives", "/medtheris/sales"],
  },
  // synthetic kineo-only user (in /kineo only, no sub-group → must work after fix)
  kineoTop: {
    sub: "synthetic-kineo-top",
    email: "kineo.top@kineo360.work",
    name: "Kineo Top",
    preferredUsername: "kineo.top",
    mailbox: "kineo.top@kineo360.work",
    groups: ["/kineo"],
  },
  noGroup: {
    sub: "synthetic-no-group",
    email: "no.group@kineo360.work",
    name: "No Group",
    preferredUsername: "no.group",
    mailbox: "no.group@kineo360.work",
    groups: [],
  },
};

async function mintCookie(payload) {
  const tok = await encode({
    token: { ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 },
    secret: SECRET,
    salt: SECURE_NAME,
    maxAge: 3600,
  });
  return `${SECURE_NAME}=${tok}; authjs.session-token=${tok}`;
}

async function api(label, cookie, method, path, body, contentType) {
  const init = {
    method,
    headers: {
      Cookie: cookie,
      Host: "app.kineo360.work",
      "X-Forwarded-Proto": "https",
    },
    redirect: "manual",
  };
  if (body !== undefined) {
    if (contentType === "json") {
      init.headers["Content-Type"] = "application/json";
      init.body = typeof body === "string" ? body : JSON.stringify(body);
    } else {
      init.body = body;
    }
  }
  const r = await fetch(`${PORTAL}${path}`, init);
  let parsed;
  const text = await r.text();
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { label, path, status: r.status, body: parsed };
}

const results = [];
function record(label, ok, info) {
  const sym = ok ? "✓" : "✗";
  console.log(`${sym} [${label}] ${info}`);
  results.push({ label, ok, info });
}

const cookies = {
  testuser1: await mintCookie(users.testuser1),
  ali: await mintCookie(users.ali),
  kineoTop: await mintCookie(users.kineoTop),
  noGroup: await mintCookie(users.noGroup),
};

console.log("\n══════ BLOCK 1: Auth/Session ══════");
for (const [name, cookie] of Object.entries(cookies)) {
  const r = await api(`auth-${name}`, cookie, "GET", "/api/auth/session");
  const hasEmail = !!r.body?.user?.email;
  record(`auth/${name}`, r.status === 200 && hasEmail, `status=${r.status} user=${r.body?.user?.email ?? "-"} groups=${(r.body?.groups ?? []).length}`);
}

console.log("\n══════ BLOCK 2: SIGN ══════");
async function probeSign(userName, ws) {
  const fd = new FormData();
  fd.append("file", new Blob([new TextEncoder().encode("hi")], { type: "text/plain" }), "p.txt");
  const r = await api(`sign-${userName}-${ws}`, cookies[userName], "POST", `/api/sign/upload?ws=${ws}`, fd);
  return r;
}
for (const u of ["testuser1", "ali", "kineoTop"]) {
  for (const ws of ["kineo", "medtheris", "corehub"]) {
    const r = await probeSign(u, ws);
    const expect200 =
      u === "ali" ||                                // admin everywhere
      (u === "testuser1") ||                        // member everywhere
      (u === "kineoTop" && ws === "kineo");         // top-level kineo only
    const ok = expect200 ? r.status === 200 : r.status === 403;
    record(`sign/${u}/${ws}`, ok, `expected ${expect200 ? 200 : 403}, got ${r.status} (${typeof r.body === "object" ? r.body.error ?? r.body.documentId ?? "" : ""})`);
    if (r.body?.documentId && process.env[`DOCUMENSO_TEAM_${ws.toUpperCase()}_TOKEN`]) {
      // cleanup
      const TOKEN = process.env[`DOCUMENSO_TEAM_${ws.toUpperCase()}_TOKEN`];
      await fetch(`${process.env.DOCUMENSO_INTERNAL_URL || "http://documenso:3000"}/api/v2/document/delete`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: r.body.documentId }),
      });
    }
  }
}
{
  const r = await probeSign("noGroup", "kineo");
  record("sign/noGroup/kineo", r.status === 403, `expected 403, got ${r.status}`);
}

// Sign LIST
for (const u of ["testuser1", "ali"]) {
  for (const ws of ["kineo", "medtheris", "corehub"]) {
    const r = await api(`sign-list-${u}-${ws}`, cookies[u], "GET", `/api/sign/documents?ws=${ws}`);
    record(`sign-list/${u}/${ws}`, r.status === 200, `status=${r.status} count=${r.body?.totals?.total ?? r.body?.items?.length ?? "-"}`);
  }
}

console.log("\n══════ BLOCK 3: CHAT ══════");
for (const u of ["testuser1", "ali"]) {
  for (const ws of ["kineo", "medtheris", "corehub"]) {
    const r = await api(`chat-rooms-${u}-${ws}`, cookies[u], "GET", `/api/chat/rooms?ws=${ws}`);
    record(`chat-rooms/${u}/${ws}`, r.status === 200, `status=${r.status} rooms=${r.body?.rooms?.length ?? "-"} teams=${r.body?.teams?.length ?? "-"}`);
  }
}
for (const u of ["testuser1", "ali"]) {
  const r = await api(`chat-users-${u}`, cookies[u], "GET", `/api/chat/users?q=kathrin`);
  record(`chat-users-search/${u}`, r.status === 200 && (r.body?.users?.length ?? 0) > 0, `status=${r.status} found=${r.body?.users?.length ?? 0}`);
}
// Calls listing for telephony
for (const u of ["testuser1", "ali"]) {
  for (const ws of ["kineo", "medtheris", "corehub"]) {
    const r = await api(`calls-${u}-${ws}`, cookies[u], "GET", `/api/chat/call?ws=${ws}`);
    record(`calls/${u}/${ws}`, r.status === 200 || r.status === 405, `status=${r.status}`);
  }
}

console.log("\n══════ BLOCK 4: MAIL ══════");
for (const u of ["testuser1", "ali"]) {
  const r = await api(`mail-folders-${u}`, cookies[u], "GET", `/api/mail/folders`);
  record(`mail/folders/${u}`, r.status === 200, `status=${r.status} folders=${Array.isArray(r.body?.folders) ? r.body.folders.length : "-"} err=${r.body?.error ?? ""}`);
  const r2 = await api(`mail-msgs-${u}`, cookies[u], "GET", `/api/mail/messages?folder=INBOX&limit=5`);
  record(`mail/messages/${u}`, r2.status === 200, `status=${r2.status} msgs=${Array.isArray(r2.body?.messages) ? r2.body.messages.length : "-"} err=${r2.body?.error ?? ""}`);
}

console.log("\n══════ BLOCK 5: CALENDAR ══════");
for (const u of ["testuser1", "ali"]) {
  const r = await api(`cal-${u}`, cookies[u], "GET", `/api/calendar/calendars`);
  record(`calendar/calendars/${u}`, r.status === 200, `status=${r.status} cals=${Array.isArray(r.body?.calendars) ? r.body.calendars.length : "-"} err=${r.body?.error ?? ""}`);
  const r2 = await api(`cal-events-${u}`, cookies[u], "GET", `/api/calendar/events?from=2026-04-01T00:00:00.000Z&to=2026-05-01T00:00:00.000Z`);
  record(`calendar/events/${u}`, [200, 207].includes(r2.status), `status=${r2.status} events=${Array.isArray(r2.body?.events) ? r2.body.events.length : "-"} err=${r2.body?.error ?? ""}`);
}

console.log("\n══════ BLOCK 6: FILES (Nextcloud) ══════");
for (const u of ["testuser1", "ali"]) {
  const r = await api(`files-list-${u}`, cookies[u], "GET", `/api/cloud/list?path=/`);
  record(`files/list/${u}`, r.status === 200, `status=${r.status} entries=${Array.isArray(r.body?.entries) ? r.body.entries.length : "-"} err=${r.body?.error ?? ""}`);
}

console.log("\n══════ BLOCK 7: CRM (Twenty) ══════");
for (const u of ["testuser1", "ali"]) {
  for (const ws of ["kineo", "medtheris", "corehub"]) {
    const r = await api(`crm-${u}-${ws}`, cookies[u], "GET", `/api/crm/people?ws=${ws}&limit=5`);
    record(`crm/people/${u}/${ws}`, [200, 404, 503].includes(r.status), `status=${r.status} items=${Array.isArray(r.body?.people) ? r.body.people.length : "-"} err=${r.body?.error ?? ""}`);
  }
}

console.log("\n══════ BLOCK 8: HELPDESK (Zammad) ══════");
for (const u of ["testuser1", "ali"]) {
  for (const ws of ["kineo", "medtheris", "corehub"]) {
    const r = await api(`hd-${u}-${ws}`, cookies[u], "GET", `/api/helpdesk/tickets?ws=${ws}&limit=5`);
    record(`helpdesk/tickets/${u}/${ws}`, [200, 404, 503].includes(r.status), `status=${r.status} count=${Array.isArray(r.body?.tickets) ? r.body.tickets.length : "-"} err=${r.body?.error ?? ""}`);
  }
}

console.log("\n══════ BLOCK 9: PROJECTS (Plane) ══════");
for (const u of ["testuser1", "ali"]) {
  let firstProject = null;
  for (const ws of ["kineo", "medtheris", "corehub"]) {
    const r = await api(`pj-${u}-${ws}`, cookies[u], "GET", `/api/projects/projects?ws=${ws}`);
    const list = Array.isArray(r.body?.projects) ? r.body.projects : [];
    record(`projects/projects/${u}/${ws}`, [200, 404].includes(r.status), `status=${r.status} list=${list.length} err=${r.body?.error ?? ""}`);
    if (!firstProject && list.length > 0) firstProject = { ws, id: list[0].id ?? list[0].slug };
  }
  if (firstProject) {
    const r2 = await api(`pj-issues-${u}`, cookies[u], "GET", `/api/projects/issues?ws=${firstProject.ws}&project=${firstProject.id}&limit=5`);
    record(`projects/issues/${u}`, [200, 404].includes(r2.status), `status=${r2.status} issues=${Array.isArray(r2.body?.issues) ? r2.body.issues.length : "-"} err=${r2.body?.error ?? ""}`);
  } else {
    record(`projects/issues/${u}`, true, "skipped (no projects yet)");
  }
}

console.log("\n══════ BLOCK 10: DASHBOARD ══════");
for (const u of ["testuser1", "ali"]) {
  const r = await api(`dash-${u}`, cookies[u], "GET", `/api/dashboard/pulse`);
  record(`dashboard/pulse/${u}`, r.status === 200, `status=${r.status}`);
}

console.log("\n══════ BLOCK 11: ONBOARDING ADMIN ══════");
{
  const r = await api(`onboard-clients-ali`, cookies.ali, "GET", `/admin/onboarding/clients`);
  const aliBody = typeof r.body === "string" ? r.body : "";
  const aliSeesAdmin = r.status === 200 && aliBody.includes("Onboarding") && !aliBody.includes("Kein Admin-Zugriff");
  record(`onboarding/clients/ali`, aliSeesAdmin, `status=${r.status} sees-admin=${aliSeesAdmin}`);
  const r2 = await api(`onboard-clients-testuser1`, cookies.testuser1, "GET", `/admin/onboarding/clients`);
  const tBody = typeof r2.body === "string" ? r2.body : "";
  const tBlocked = r2.status === 200 && tBody.includes("Kein Admin-Zugriff");
  record(`onboarding/clients/testuser1-blocked`, tBlocked, `status=${r2.status} blocked-ui=${tBlocked}`);
}

console.log("\n──────── SUMMARY ────────");
const total = results.length;
const fails = results.filter((r) => !r.ok);
console.log(`total: ${total}, ok: ${total - fails.length}, fail: ${fails.length}`);
if (fails.length) {
  console.log("\nFailures:");
  for (const f of fails) console.log(`  ✗ [${f.label}] ${f.info}`);
}
process.exit(fails.length ? 1 : 0);
