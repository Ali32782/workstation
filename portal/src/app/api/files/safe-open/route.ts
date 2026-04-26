import { auth } from "@/lib/auth";
import type { NextRequest } from "next/server";

/**
 * Cookie-cleansing bridge for opening Nextcloud documents.
 *
 * Problem
 * -------
 * Even after we rotate Nextcloud's auth tokens server-side, the browser keeps
 * sending the old `nc_token` / `__Host-nc_token` cookies on every request to
 * `files.kineo360.work`. NC's `Session::loginWithCookie()` then throws
 * `TokenPasswordExpiredException` / `InvalidTokenException` BEFORE the
 * `user_oidc` controller has a chance to run, and the browser ends up on
 * NC's "CSRF check failed / 412" error page.
 *
 * Fix
 * ---
 * Rather than pointing the user directly at NC, we serve a same-origin HTML
 * page that:
 *   1. Loads a hidden iframe pointing at NC's `/index.php/logout` (NC always
 *      emits `Set-Cookie: nc_token=; Max-Age=0` on that endpoint, even when
 *      the request is anonymous).
 *   2. Once the iframe load fires (≈250ms), navigates the top-level window
 *      to the actual document URL via the `user_oidc` login flow. With the
 *      stale cookie nuked, NC takes the OIDC path cleanly.
 *
 * The whole dance is invisible — users see ~half a second of a "Dokument
 * wird geöffnet …" splash before Collabora opens.
 */

const NC_BASE: Record<string, string> = {
  corehub: "https://files.kineo360.work",
  medtheris: "https://files.medtheris.kineo360.work",
  kineo: "https://files.kineo360.work",
};

const OIDC_PROVIDER_ID = "1";

export async function GET(req: NextRequest) {
  // Auth gate so we don't accidentally turn this into an open redirect.
  const session = await auth();
  if (!session?.user) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const fileId = (searchParams.get("fileId") ?? "").trim();
  const ws = (searchParams.get("ws") ?? "corehub").trim();
  const targetPath = (searchParams.get("path") ?? "").trim();

  if (!/^\d+$/.test(fileId) && !targetPath) {
    return new Response("Bad request", { status: 400 });
  }
  const base = NC_BASE[ws] ?? NC_BASE.corehub;
  if (!base) {
    return new Response("Unknown workspace", { status: 400 });
  }

  // Build the redirect target inside NC.
  //
  // Use the Files-app route (`/index.php/f/<id>`) instead of richdocuments'
  // internal `/apps/richdocuments/index?fileId=` controller — the Files
  // route is a regular authenticated GET, embeds richdocuments via the
  // viewer, and survives the `nc_session_id` rotation that occasionally
  // happens during the OIDC bounce. The richdocuments-internal controller
  // requires an already-warm session and bails with "CSRF check failed"
  // when the cookie set is half-stale (mixed old + new auth tokens).
  const ncRedirect =
    targetPath || `/index.php/f/${encodeURIComponent(fileId)}`;

  const finalUrl = `${base}/apps/user_oidc/login/${OIDC_PROVIDER_ID}?redirectUrl=${encodeURIComponent(ncRedirect)}`;
  const logoutUrl = `${base}/index.php/logout`;

  const html = `<!DOCTYPE html>
<html lang="de"><head>
<meta charset="utf-8" />
<title>Dokument wird geöffnet …</title>
<style>
  :root{color-scheme:dark light}
  html,body{height:100%;margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0b1220;color:#e6e8ef}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px}
  .spinner{width:36px;height:36px;border:3px solid rgba(255,255,255,.15);border-top-color:#4a7fc1;border-radius:50%;animation:spin .8s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  h1{font-size:16px;font-weight:600;margin:0}
  p{font-size:13px;opacity:.65;margin:0;max-width:420px;line-height:1.5}
  a.fallback{margin-top:14px;color:#4a7fc1;font-size:12px;text-decoration:underline}
</style>
</head><body>
<div class="wrap">
  <div class="spinner" aria-hidden="true"></div>
  <h1>Dokument wird vorbereitet</h1>
  <p>Es wird kurz die Nextcloud-Sitzung erneuert, damit das Dokument im Editor öffnen kann.</p>
  <a id="fallback" class="fallback" href="${finalUrl}" target="_self" rel="noopener">Falls nichts passiert: hier klicken</a>
</div>
<iframe src="${logoutUrl}" style="display:none" referrerpolicy="no-referrer" sandbox="allow-same-origin allow-scripts" aria-hidden="true"></iframe>
<script>
(function(){
  var TARGET = ${JSON.stringify(finalUrl)};
  var done = false;
  function go(){
    if (done) return;
    done = true;
    window.location.replace(TARGET);
  }
  // 1) Fastest possible path: navigate as soon as the logout iframe loaded.
  var f = document.querySelector('iframe');
  if (f) f.addEventListener('load', function(){ setTimeout(go, 200); }, { once: true });
  // 2) Hard upper bound — even if NC is offline / blocks the iframe, we move on.
  setTimeout(go, 1500);
})();
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-robots-tag": "noindex,nofollow",
    },
  });
}
