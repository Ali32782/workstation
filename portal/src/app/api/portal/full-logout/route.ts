/**
 * Full session reset across the whole stack.
 *
 *   Flow when a user clicks "Aus allen Apps abmelden":
 *
 *   1. Browser navigates to this endpoint.
 *   2. Server-side: delete the cookies we control directly via the
 *      `.kineo360.work` domain (right now: Plane's `session-id` and `csrftoken`).
 *   3. Render an HTML page that loads ~7 hidden iframes pointing at each
 *      app's logout endpoint. Each iframe load triggers a server-side
 *      session destroy at the app, regardless of whether the response
 *      page itself is X-Frame-Options-blocked (the request still hits
 *      the app and clears the cookie via Set-Cookie).
 *   4. After ~2.5s, top-window navigates to the Keycloak end-session
 *      endpoint with post_logout_redirect_uri pointing back to our portal
 *      sign-out callback, which finally clears NextAuth's own session
 *      cookie and redirects to /login.
 */
import "server-only";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const KEYCLOAK_ISSUER =
  process.env.KEYCLOAK_ISSUER ?? "https://auth.kineo360.work/realms/main";
const PORTAL_URL =
  process.env.AUTH_URL ?? process.env.NEXTAUTH_URL ?? "https://app.kineo360.work";

/** App-side logout URLs to load in hidden iframes. Even when the response
 *  page is blocked from rendering by X-Frame-Options, the GET request
 *  still hits the server and the app clears its session cookie via
 *  Set-Cookie in the response. */
const APP_LOGOUT_URLS = [
  // Nextcloud (Files / Office)
  "https://cloud.kineo360.work/index.php/logout",
  "https://files.medtheris.kineo360.work/index.php/logout",
  // Gitea (Code)
  "https://code.kineo360.work/user/logout",
  // Rocket.Chat (Chat) – hits the FE logout route which clears localStorage tokens
  "https://chat.kineo360.work/home?logout=1",
  "https://chat.medtheris.kineo360.work/home?logout=1",
  // Documenso (Sign)
  "https://sign.kineo360.work/api/auth/signout",
  // Plane (Projekte)
  "https://plane.kineo360.work/auth/sign-out/",
  // Twenty (CRM) – Twenty's own session
  "https://crm.medtheris.kineo360.work/logout",
];

function logoutHtml(opts: { keycloakLogoutUrl: string }): string {
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aus allen Apps abmelden …</title>
  <style>
    :root { color-scheme: dark; }
    html, body {
      margin: 0; height: 100%;
      background: #0a0c10; color: #c5c8cf;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
    }
    .card {
      max-width: 460px; padding: 32px; text-align: center;
      border: 1px solid #20242c; border-radius: 14px;
      background: #11141a;
      box-shadow: 0 10px 40px -10px rgba(0,0,0,0.6);
    }
    h1 { color: #f5f6f8; margin: 16px 0 4px; font-size: 18px; font-weight: 600; }
    p { margin: 6px 0; color: #8b91a0; font-size: 13px; }
    .spinner {
      width: 32px; height: 32px; margin: 0 auto;
      border: 3px solid #1f2330; border-top-color: #6b8df0;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .progress {
      margin-top: 14px; font-size: 11px; color: #6e7585;
    }
    iframe {
      position: absolute; width: 1px; height: 1px;
      opacity: 0; pointer-events: none; border: 0;
      left: -9999px; top: -9999px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Aus allen Apps abmelden …</h1>
    <p>Sessions werden in <strong>${APP_LOGOUT_URLS.length}</strong> Anwendungen beendet.</p>
    <p class="progress" id="progress">Bitte warten …</p>
  </div>
  ${APP_LOGOUT_URLS
    .map((u) => `<iframe src="${u}" referrerpolicy="no-referrer"></iframe>`)
    .join("\n  ")}
  <script>
    let done = 0;
    const total = ${APP_LOGOUT_URLS.length};
    const progress = document.getElementById("progress");
    document.querySelectorAll("iframe").forEach((f) => {
      const tick = () => {
        done++;
        progress.textContent = done + " / " + total + " erledigt";
      };
      f.addEventListener("load", tick);
      f.addEventListener("error", tick);
    });
    // Hard timeout: 2.5s — even if some iframes never fire load (CSP-blocked)
    // we still proceed to the SSO logout. The underlying GET request was
    // already made when the iframe started loading.
    setTimeout(() => {
      window.location.replace(${JSON.stringify(opts.keycloakLogoutUrl)});
    }, 2500);
  </script>
</body>
</html>`;
}

export async function GET() {
  const session = await auth();
  const idToken = session?.idToken;

  // Where Keycloak sends us *after* it killed the SSO session.
  const postLogoutRedirect = `${PORTAL_URL}/api/portal/post-logout`;
  const clientId = process.env.KEYCLOAK_CLIENT_ID ?? "portal";
  // Keycloak requires either id_token_hint OR client_id to validate the
  // post_logout_redirect_uri. We pass both when available.
  const params = new URLSearchParams({
    post_logout_redirect_uri: postLogoutRedirect,
    client_id: clientId,
  });
  if (idToken) params.set("id_token_hint", idToken);
  const keycloakLogoutUrl =
    `${KEYCLOAK_ISSUER}/protocol/openid-connect/logout?${params.toString()}`;

  const res = new NextResponse(logoutHtml({ keycloakLogoutUrl }), {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });

  // --- Domain-stretched cookies we can clear directly ---
  // Plane's session/csrf cookies live on .kineo360.work (we configured
  // COOKIE_DOMAIN there), so the portal can expire them in one shot.
  for (const name of ["session-id", "csrftoken"]) {
    res.cookies.set({
      name,
      value: "",
      domain: ".kineo360.work",
      path: "/",
      maxAge: 0,
      secure: true,
      sameSite: "lax",
      httpOnly: true,
    });
  }

  return res;
}
