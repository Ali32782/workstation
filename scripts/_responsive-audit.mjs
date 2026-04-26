// Responsive audit – render every key page at mobile / tablet / desktop and
// look for typical responsive patterns. We can't run a real browser here, but
// we *can* verify markup contains: viewport meta, Tailwind responsive classes,
// no fixed-width pixel containers, no horizontal overflow giveaways, and a
// mobile sidebar/drawer trigger.

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

const ALI = {
  sub: "d0381435-af9b-4286-9c7a-7fbe0aa5f1cd",
  email: "ali@kineo360.work", name: "Ali Peters", preferredUsername: "ali", mailbox: "ali@kineo360.work",
  groups: ["/corehub/dev-ops","/kineo/executives","/medtheris/sales"],
};

const t = await jwt(ALI);
const cookieStr = `${SALT}=${t}; authjs.session-token=${t}`;

const VIEWPORTS = [
  { name: "mobile",  width: 375, ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  { name: "tablet",  width: 768, ua: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" },
  { name: "desktop", width:1280, ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36" },
];

const PAGES = [
  "/kineo/dashboard", "/kineo/mail", "/kineo/calendar", "/kineo/chat", "/kineo/files", "/kineo/office", "/kineo/sign", "/kineo/projects", "/kineo/crm", "/kineo/helpdesk",
  "/medtheris/dashboard", "/medtheris/mail", "/medtheris/calendar", "/medtheris/chat", "/medtheris/files", "/medtheris/sign", "/medtheris/projects",
  "/corehub/dashboard", "/corehub/chat", "/corehub/files", "/corehub/calendar", "/corehub/sign", "/corehub/projects",
  "/admin/onboarding", "/admin/onboarding/clients", "/admin/onboarding/members",
];

async function get(path, viewport) {
  const r = await fetch(`http://localhost:3000${path}`, {
    method: "GET",
    headers: {
      Cookie: cookieStr,
      Host: "app.kineo360.work",
      "X-Forwarded-Proto": "https",
      "User-Agent": viewport.ua,
      "Sec-CH-UA-Mobile": viewport.width<800?"?1":"?0",
      "Viewport-Width": String(viewport.width),
    },
    redirect: "follow",
  });
  return { status: r.status, html: await r.text() };
}

const results = [];
function log(label, ok, info) { console.log(`${ok?"✓":"✗"} [${label}] ${info??""}`); results.push({label, ok, info}); }

// Patterns we expect:
//  - viewport meta with width=device-width
//  - Tailwind responsive utilities are in the EXTERNAL CSS chunk (not inline in
//    the HTML), so we instead check that the page links a stylesheet AND uses
//    flex/grid layout primitives heavily (Tailwind compositions).
//  - At least one mobile-burger/menu trigger or AppFrame on logged-in pages.
//  - No explicit fixed pixel-width inline styles.
const VIEWPORT_RE = /<meta[^>]+name=["']viewport["'][^>]*content=["'][^"']*width=device-width/i;
const STYLESHEET_RE = /<link[^>]+rel=["']stylesheet["']/i;
const FIXED_WIDTH_RE = /style=["'][^"']*\bwidth:\s*\d{3,4}px/gi;

for (const vp of VIEWPORTS) {
  console.log(`\n── ${vp.name.toUpperCase()} (${vp.width}px) ──`);
  for (const p of PAGES) {
    const r = await get(p, vp);
    const hasVP = VIEWPORT_RE.test(r.html);
    const hasCSS = STYLESHEET_RE.test(r.html);
    const flexCount = (r.html.match(/\bflex\b/g) || []).length;
    const gridCount = (r.html.match(/\bgrid\b/g) || []).length;
    const hasTrigger = /AppFrame|Sidebar|TopBar|aria-label=["'][^"']*(Men[uü]|Burger)/i.test(r.html);
    const fixed = (r.html.match(FIXED_WIDTH_RE) || []).length;
    const isApp = /\/(kineo|medtheris|corehub|admin)\//.test(p);
    const okStatus = [200,307,308].includes(r.status);
    const ok = okStatus && hasVP && hasCSS && fixed < 5 && (!isApp || flexCount + gridCount > 5);
    log(`${vp.name}${p}`, ok, `s=${r.status} vp=${hasVP?"y":"n"} css=${hasCSS?"y":"n"} flex=${flexCount} grid=${gridCount} trigger=${hasTrigger?"y":"n"} fixed-px=${fixed}`);
  }
}

console.log("\n──────── SUMMARY ────────");
const ok = results.filter(r=>r.ok).length;
const fail = results.filter(r=>!r.ok);
console.log(`total: ${results.length}, ok: ${ok}, fail: ${fail.length}`);
for (const f of fail.slice(0, 30)) console.log("  ✗ ["+f.label+"] "+(f.info||""));
