// testuser1 / "Test One" – wirklicher Workspace-Audit:
// Für jeden der 3 Workspaces: Pages, alle wichtigen APIs, Sign-Editor öffnen,
// CRM-, Helpdesk-, Plane-Tenant-Zugriff prüfen.

import { encode } from "@auth/core/jwt";
const SECRET = process.env.AUTH_SECRET;
const SALT = "__Secure-authjs.session-token";
if (!SECRET) { console.error("AUTH_SECRET missing"); process.exit(1); }

async function jwt(p) {
  return encode({
    token: { ...p, iat: Math.floor(Date.now()/1000), exp: Math.floor(Date.now()/1000)+3600 },
    secret: SECRET, salt: SALT, maxAge: 3600,
  });
}

const TU1 = {
  sub: "b6b51673-5850-45bb-b462-ad601308d85e",
  email: "testuser1@kineo360.work",
  name: "Test One",
  preferredUsername: "testuser1",
  mailbox: "testuser1@kineo360.work",
  groups: ["/corehub","/corehub/dev-ops","/kineo","/kineo/leadership","/medtheris","/medtheris/sales"],
};

const cookie = (() => null);
const t = await jwt(TU1);
const cookieStr = `${SALT}=${t}; authjs.session-token=${t}`;

async function call(label, method, path, body, opts={}) {
  const init = {
    method,
    headers: { Cookie: cookieStr, Host: "app.kineo360.work", "X-Forwarded-Proto": "https", ...(opts.headers||{}) },
    redirect: "manual",
  };
  if (body !== undefined) {
    if (opts.json) { init.headers["Content-Type"]="application/json"; init.body = typeof body==="string"?body:JSON.stringify(body); }
    else init.body = body;
  }
  const r = await fetch(`http://localhost:3000${path}`, init);
  const text = await r.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed, raw: text, headers: r.headers };
}

const results = [];
function log(label, ok, info) { console.log(`${ok?"✓":"✗"} [${label}] ${info??""}`); results.push({label, ok, info}); }

const WORKSPACES = ["kineo","medtheris","corehub"];

console.log("\n══════ TESTUSER1 — AUTH SESSION ══════");
{
  const s = await call("auth", "GET", "/api/auth/session");
  const ok = s.status===200 && s.body?.user?.username === "testuser1";
  log("auth/session", ok, `status=${s.status} groups=${(s.body?.user?.groups||[]).length}`);
}

for (const ws of WORKSPACES) {
  console.log(`\n══════ TESTUSER1 — Workspace: ${ws} ══════`);

  // Pages
  for (const p of ["dashboard","mail","calendar","chat","files","office"]) {
    const r = await call(`page/${ws}/${p}`, "GET", `/${ws}/${p}`);
    log(`page/${ws}/${p}`, [200,307].includes(r.status), `status=${r.status}`);
  }

  // Mail folders
  const folders = await call(`mail/folders/${ws}`, "GET", "/api/mail/folders");
  log(`mail/folders/${ws}`, folders.status===200, `status=${folders.status} cnt=${folders.body?.folders?.length||0}`);

  // Calendar list + events range
  const cals = await call(`cal/list/${ws}`, "GET", `/api/calendar/calendars?ws=${ws}`);
  log(`cal/list/${ws}`, cals.status===200, `status=${cals.status} cals=${cals.body?.calendars?.length||0}`);
  const f = new Date(); f.setDate(f.getDate()-3);
  const tt = new Date(); tt.setDate(tt.getDate()+30);
  const evs = await call(`cal/events/${ws}`, "GET", `/api/calendar/events?ws=${ws}&from=${f.toISOString()}&to=${tt.toISOString()}`);
  log(`cal/events/${ws}`, evs.status===200, `status=${evs.status} cnt=${evs.body?.events?.length||0}`);

  // Files
  const list = await call(`files/${ws}`, "GET", `/api/cloud/list?ws=${ws}&path=/`);
  log(`files/${ws}`, list.status===200, `status=${list.status} entries=${list.body?.entries?.length||0}`);

  // Chat rooms for ws
  const rooms = await call(`chat/rooms/${ws}`, "GET", `/api/chat/rooms?workspace=${ws}`);
  log(`chat/rooms/${ws}`, rooms.status===200, `status=${rooms.status} cnt=${(rooms.body?.rooms||[]).length}`);

  // CRM ping
  const crm = await call(`crm/${ws}`, "GET", `/api/crm/people?ws=${ws}&limit=3`);
  log(`crm/${ws}`, [200,503].includes(crm.status), `status=${crm.status} err=${(crm.body?.error||"").slice(0,40)}`);

  // Helpdesk tickets
  const help = await call(`helpdesk/${ws}`, "GET", `/api/helpdesk/tickets?ws=${ws}`);
  log(`helpdesk/${ws}`, [200,503].includes(help.status), `status=${help.status} cnt=${help.body?.tickets?.length||0}`);

  // Plane projects
  const projs = await call(`projects/${ws}`, "GET", `/api/projects/projects?ws=${ws}`);
  log(`projects/${ws}`, [200,503].includes(projs.status), `status=${projs.status} cnt=${projs.body?.projects?.length||0}`);

  // Sign upload + open editor (via /api/sign/document/:id GET that returns embed URL)
  const fd = new FormData();
  fd.append("file", new Blob([new TextEncoder().encode(`Test ${ws}`)], {type:"text/plain"}), `tu1-${ws}.txt`);
  const up = await call(`sign/upload/${ws}`, "POST", `/api/sign/upload?ws=${ws}`, fd);
  const docId = up.body?.documentId;
  log(`sign/upload/${ws}`, up.status===200 && !!docId, `status=${up.status} doc=${docId}`);
  if (docId) {
    const det = await call(`sign/get/${ws}`, "GET", `/api/sign/document/${docId}?ws=${ws}`);
    const editorUrl = det.body?.document?.embedUrl || det.body?.document?.editUrl || det.body?.embedUrl || det.body?.editUrl;
    log(`sign/editor/${ws}`, det.status===200 && !!det.body?.document, `status=${det.status} editor=${editorUrl?"yes":"no"}`);
    await call(`sign/del/${ws}`, "DELETE", `/api/sign/document/${docId}?ws=${ws}`);
  }
}

console.log("\n──────── SUMMARY ────────");
const ok = results.filter(r=>r.ok).length;
const fail = results.filter(r=>!r.ok);
console.log(`total: ${results.length}, ok: ${ok}, fail: ${fail.length}`);
for (const f of fail) console.log("  ✗ ["+f.label+"] "+(f.info||""));
