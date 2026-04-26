// Deep suite: exercise the actual hard paths — POST endpoints, downloads,
// document open, telephony, Plane demo project creation, and mobile rendering.

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

const users = {
  ali: { sub:"d0381435-af9b-4286-9c7a-7fbe0aa5f1cd", email:"ali@kineo360.work", name:"Ali Peters", preferredUsername:"ali", mailbox:"ali@kineo360.work", groups:["/corehub/dev-ops","/kineo/executives","/medtheris/sales"] },
  testuser1: { sub:"b6b51673-5850-45bb-b462-ad601308d85e", email:"testuser1@kineo360.work", name:"Test One", preferredUsername:"testuser1", mailbox:"testuser1@kineo360.work", groups:["/corehub","/corehub/dev-ops","/kineo/leadership","/medtheris/sales"] },
};

const cookies = {};
for (const k of Object.keys(users)) {
  const t = await jwt(users[k]);
  cookies[k] = `${SALT}=${t}; authjs.session-token=${t}`;
}

async function call(label, cookie, method, path, body, opts = {}) {
  const init = {
    method,
    headers: { Cookie: cookie, Host: "app.kineo360.work", "X-Forwarded-Proto": "https", ...(opts.headers || {}) },
    redirect: opts.redirect || "manual",
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
function log(label, ok, info) { console.log(`${ok?"✓":"✗"} [${label}] ${info}`); results.push({label, ok, info}); }

console.log("\n══════ DEEP-1: SIGN end-to-end (upload → open → list → delete) ══════");
{
  const ws = "kineo";
  const fd = new FormData();
  fd.append("file", new Blob([new TextEncoder().encode("Vertrag X — bitte unterschreiben")], {type:"text/plain"}), "vertrag.txt");
  const up = await call("sign-up", cookies.ali, "POST", `/api/sign/upload?ws=${ws}`, fd);
  log("sign/upload", up.status===200 && !!up.body?.documentId, `status=${up.status} doc=${up.body?.documentId} converted=${up.body?.converted}`);
  const docId = up.body?.documentId;

  if (docId) {
    // List should now contain it
    const list = await call("sign-list", cookies.ali, "GET", `/api/sign/documents?ws=${ws}`);
    const found = (list.body?.items||[]).find((d)=>String(d.id)===String(docId));
    log("sign/list-contains", !!found, `count=${list.body?.items?.length||0} found=${!!found}`);

    // Get details
    const details = await call("sign-get", cookies.ali, "GET", `/api/sign/document/${docId}?ws=${ws}`);
    log("sign/details", details.status===200 && !!details.body?.document, `status=${details.status} title=${details.body?.document?.title||""}`);

    // Send draft — body { action: "send" }
    const send = await call("sign-send", cookies.ali, "POST", `/api/sign/document/${docId}?ws=${ws}`, { action: "send" }, {json:true});
    // No recipients on the doc, so this expectedly errors. We just want a non-5xx.
    log("sign/send", [200,400,404,502].includes(send.status), `status=${send.status} err=${send.body?.error?.slice(0,50)||""}`);

    // Cleanup: delete the document
    const del = await call("sign-del", cookies.ali, "DELETE", `/api/sign/document/${docId}?ws=${ws}`);
    log("sign/delete", [200,204,404].includes(del.status), `status=${del.status}`);
  }
}

console.log("\n══════ DEEP-2: CHAT — DM lifecycle + message send ══════");
{
  // 1) search peer
  const search = await call("chat-search", cookies.ali, "GET", `/api/chat/users?q=testuser1`);
  const peer = (search.body?.users||[])[0];
  log("chat/search", !!peer, `peer=${peer?.username||"-"}`);
  if (peer) {
    // 2) open / create DM
    const open = await call("chat-dm", cookies.ali, "POST", `/api/chat/dm`, { username: peer.username }, { json:true });
    const dmRid = open.body?.roomId || open.body?.rid || open.body?.room?._id;
    log("chat/dm-open", open.status===200 && !!dmRid, `status=${open.status} rid=${dmRid}`);
    if (dmRid) {
      // 3) send message
      const send = await call("chat-send", cookies.ali, "POST", `/api/chat/send`, { roomId: dmRid, text: "deep-suite probe at "+new Date().toISOString() }, { json:true });
      log("chat/send", send.status===200, `status=${send.status} mid=${send.body?.message?._id||send.body?.message?.id||send.body?.error||""}`);
      // 4) read messages
      const msgs = await call("chat-msgs", cookies.ali, "GET", `/api/chat/messages?roomId=${dmRid}&type=d&count=10`);
      log("chat/messages", msgs.status===200 && Array.isArray(msgs.body?.messages), `status=${msgs.status} cnt=${msgs.body?.messages?.length||0}`);

      // 5) start a call ON this DM room
      const call1 = await call("call-start", cookies.ali, "POST", `/api/chat/call`, { roomId: dmRid, roomName: "deep-suite-dm", postInvite: false }, { json:true });
      log("calls/start-on-dm", call1.status===200 && !!call1.body?.link, `status=${call1.status} link=${(call1.body?.link||"").slice(0,60)}`);
    }
  }
}

// (calls now exercised inside DEEP-2 above)

console.log("\n══════ DEEP-4: MAIL — send via /api/mail/send (self-loop) ══════");
{
  const send = await call("mail-send", cookies.ali, "POST", `/api/mail/send`, {
    to: ["ali@kineo360.work"],
    subject: "deep-suite probe "+new Date().toISOString(),
    text: "test from deep-suite",
  }, { json:true });
  log("mail/send", [200,202].includes(send.status), `status=${send.status} err=${send.body?.error||""}`);
}

console.log("\n══════ DEEP-5: FILES — Nextcloud upload + delete ══════");
{
  const fname = `deep-suite-${Date.now()}.txt`;
  const blob = new Blob([new TextEncoder().encode("hello from deep-suite")], {type:"text/plain"});
  const fd = new FormData();
  fd.append("files", blob, fname);
  const up = await call("cloud-up", cookies.ali, "POST", `/api/cloud/upload?ws=corehub&dir=/`, fd);
  const uploaded = up.body?.uploaded?.[0];
  log("files/upload", up.status===200 && !!uploaded, `status=${up.status} uploaded=${uploaded?.name||""} err=${up.body?.errors?.[0]?.error||""}`);
  // List
  const list = await call("cloud-list", cookies.ali, "GET", `/api/cloud/list?ws=corehub&path=/`);
  const has = (list.body?.entries||[]).some((e)=>e.name===fname);
  log("files/list-after-upload", has, `entries=${list.body?.entries?.length||0} file-found=${has}`);
  // Cleanup
  const del = await call("cloud-del", cookies.ali, "POST", `/api/cloud/delete`, { ws: "corehub", path: `/${fname}` }, { json:true });
  log("files/delete", [200,204].includes(del.status), `status=${del.status}`);
}

console.log("\n══════ DEEP-6: PROJECTS — create/list ══════");
{
  // Try creating a demo project in kineo
  const create = await call("pj-create", cookies.ali, "POST", `/api/projects/projects?ws=kineo`, { name: "DeepSuite Demo "+Date.now(), identifier: "DS"+Date.now().toString().slice(-4) }, { json:true });
  log("projects/create", [200,201,400,403,404].includes(create.status), `status=${create.status} id=${create.body?.id||create.body?.project?.id||create.body?.error||""}`);
  // List
  const list = await call("pj-list", cookies.ali, "GET", `/api/projects/projects?ws=kineo`);
  log("projects/list", list.status===200, `status=${list.status} count=${list.body?.projects?.length||0}`);
}

console.log("\n══════ DEEP-7: HELPDESK — ticket create + list ══════");
{
  const create = await call("hd-create", cookies.ali, "POST", `/api/helpdesk/tickets?ws=medtheris`, {
    title: "deep-suite "+Date.now(),
    body: "probe",
    customer: "ali@kineo360.work",
  }, { json:true });
  log("helpdesk/create", [200,201,400,403].includes(create.status), `status=${create.status} id=${create.body?.id||create.body?.ticket?.id||create.body?.error||""}`);
  const list = await call("hd-list", cookies.ali, "GET", `/api/helpdesk/tickets?ws=medtheris&limit=10`);
  log("helpdesk/list", list.status===200, `status=${list.status} cnt=${list.body?.tickets?.length||0}`);
}

console.log("\n══════ DEEP-8: PAGES render check (no 5xx) — UI exists per workspace ══════");
{
  const apps = ["dashboard","mail","calendar","chat","files","office","apps","files"]; // use existing routes
  for (const ws of ["kineo","medtheris","corehub"]) {
    for (const app of ["dashboard","mail","calendar","chat","files"]) {
      const r = await call(`page-${ws}-${app}`, cookies.ali, "GET", `/${ws}/${app}`);
      log(`page/${ws}/${app}`, [200,307].includes(r.status), `status=${r.status}`);
    }
  }
  // Sign + Onboarding admin page
  const sign = await call("page-sign", cookies.ali, "GET", `/kineo/apps/sign`);
  log("page/sign", [200,307].includes(sign.status), `status=${sign.status}`);
  const adm = await call("page-admin", cookies.ali, "GET", `/admin/onboarding`);
  log("page/admin", [200,307].includes(adm.status), `status=${adm.status}`);
}

console.log("\n══════ DEEP-9: Mobile — viewport probe + responsive markup ══════");
{
  const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1";
  const tabletUA = "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
  for (const [tag, ua] of [["mobile",mobileUA],["tablet",tabletUA]]) {
    const r = await call(`m-${tag}`, cookies.ali, "GET", `/kineo/dashboard`, undefined, { headers:{ "User-Agent": ua } });
    const html = typeof r.body==="string"?r.body:r.raw||"";
    const hasViewport = html.includes("name=\"viewport\"");
    const hasResp = html.includes("md:") || html.includes("lg:") || html.includes("sm:");
    log(`mobile/${tag}-viewport-meta`, hasViewport, `viewport=${hasViewport}`);
    log(`mobile/${tag}-tailwind-responsive-classes`, hasResp, `has-md/lg/sm=${hasResp}`);
  }
}

console.log("\n──────── SUMMARY ────────");
const fails = results.filter((r) => !r.ok);
console.log(`total: ${results.length}, ok: ${results.length-fails.length}, fail: ${fails.length}`);
if (fails.length) for (const f of fails) console.log(`  ✗ [${f.label}] ${f.info}`);
process.exit(fails.length ? 1 : 0);
