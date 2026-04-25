/**
 * Plane "SSO" bridge — Plane Community has no real OIDC, so we operate
 * a deterministic-password shim:
 *
 *   1. Authenticated portal session is required (else: redirect to /login).
 *   2. Compute a per-user Plane password = HMAC(secret, email).
 *   3. Server-side: ensure the user is a member of the target workspace
 *      via the Plane admin API (sends an invite if not).
 *   4. Render an HTML page that runs in the browser:
 *        a. fetch Plane /auth/get-csrf-token/ (cross-origin, with credentials)
 *        b. POST /auth/sign-up/ first (with the derived password) — if it
 *           fails with "already exists", fall through to sign-in.
 *        c. POST /auth/sign-in/ with the same password
 *        d. window.location.replace(`${PLANE}/${workspaceSlug}`)
 *
 * The browser submits cross-origin POSTs to Plane directly — Plane sets its
 * own session-id cookie for plane.kineo360.work and the user lands logged in.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  derivePlanePassword,
  ensureWorkspaceMembership,
  planeWorkspaceForGroups,
  PLANE_PUBLIC_BASE,
  PLANE_WORKSPACE_SLUG_BY_CORE,
} from "@/lib/plane";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function bridgeHtml(opts: {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  planeBase: string;
  workspaceSlug: string;
}): string {
  const { email, password, firstName, lastName, planeBase, workspaceSlug } = opts;
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Plane wird geöffnet …</title>
  <style>
    :root { color-scheme: dark; }
    html, body {
      margin: 0; height: 100%;
      background: #0a0c10; color: #c5c8cf;
      font: 14px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex; align-items: center; justify-content: center;
    }
    .card {
      max-width: 420px; padding: 32px; text-align: center;
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
    .err {
      display: none; margin-top: 16px;
      padding: 12px; border-radius: 8px;
      background: rgba(220, 38, 38, 0.1);
      border: 1px solid rgba(220, 38, 38, 0.3);
      color: #fca5a5; text-align: left; font-size: 12px;
    }
    .err.show { display: block; }
    .btn {
      display: inline-block; margin-top: 12px; padding: 8px 16px;
      background: #1e4d8c; color: white; border-radius: 6px;
      text-decoration: none; font-size: 13px;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="spinner"></div>
    <h1>Plane wird geöffnet …</h1>
    <p>Du wirst eingeloggt und zum Workspace weitergeleitet.</p>
    <div class="err" id="err">
      <p><strong>Bridge fehlgeschlagen.</strong></p>
      <p id="errmsg"></p>
      <a class="btn" href="${planeBase}">Plane manuell öffnen</a>
    </div>
  </div>
  <script>
    (async () => {
      const PLANE = ${JSON.stringify(planeBase)};
      const EMAIL = ${JSON.stringify(email)};
      const PASSWORD = ${JSON.stringify(password)};
      const FIRST = ${JSON.stringify(firstName)};
      const LAST = ${JSON.stringify(lastName)};
      const WORKSPACE_URL = PLANE + "/" + ${JSON.stringify(workspaceSlug)};
      const showError = (msg) => {
        document.getElementById("errmsg").textContent = msg;
        document.getElementById("err").classList.add("show");
      };
      // Iframe-bust: cross-origin fetch+credentials inside an iframe
      // is a third-party context — modern browsers (esp. Incognito) block
      // Plane's session cookie from being persisted. Re-run as the top
      // window so cookies are set first-party for app.kineo360.work.
      try {
        if (window.top && window.top !== window.self) {
          window.top.location.replace(window.location.href);
          return;
        }
      } catch (_) {
        // cross-origin top access denied; we already are at top.
      }
      try {
        // 1) Get CSRF cookie + token (Django sets cookie cross-origin via fetch+credentials).
        const csrfRes = await fetch(PLANE + "/auth/get-csrf-token/", {
          credentials: "include",
        });
        if (!csrfRes.ok) throw new Error("csrf-token fetch failed: " + csrfRes.status);
        const { csrf_token } = await csrfRes.json();

        const post = (path, params) => {
          const body = new URLSearchParams();
          body.set("csrfmiddlewaretoken", csrf_token);
          for (const [k, v] of Object.entries(params)) body.set(k, v);
          return fetch(PLANE + path, {
            method: "POST",
            credentials: "include",
            redirect: "manual",
            headers: {
              "Content-Type": "application/x-www-form-urlencoded",
              "X-CSRFToken": csrf_token,
            },
            body,
          });
        };

        const signedInOk = (r) =>
          r.status === 0 || r.type === "opaqueredirect" || (r.status >= 200 && r.status < 400);

        // 2) Sign in. If user doesn't exist yet, fall back to sign-up.
        let signIn = await post("/auth/sign-in/", { email: EMAIL, password: PASSWORD });
        if (!signedInOk(signIn)) {
          await post("/auth/sign-up/", {
            email: EMAIL,
            password: PASSWORD,
            first_name: FIRST,
            last_name: LAST,
          });
          signIn = await post("/auth/sign-in/", { email: EMAIL, password: PASSWORD });
          if (!signedInOk(signIn)) {
            throw new Error("sign-in failed after sign-up: " + signIn.status);
          }
        }

        // 3) Accept any pending workspace invitations for this user.
        //    Plane filters them server-side by request.user.email, so this is safe.
        try {
          const invRes = await fetch(PLANE + "/api/users/me/workspaces/invitations/", {
            credentials: "include",
            headers: { "X-CSRFToken": csrf_token },
          });
          if (invRes.ok) {
            const invites = await invRes.json();
            const ids = (Array.isArray(invites) ? invites : (invites.results || []))
              .map((i) => i.id)
              .filter(Boolean);
            if (ids.length > 0) {
              await fetch(PLANE + "/api/users/me/workspaces/invitations/", {
                method: "POST",
                credentials: "include",
                headers: {
                  "Content-Type": "application/json",
                  "X-CSRFToken": csrf_token,
                },
                body: JSON.stringify({ invitations: ids }),
              });
            }
          }
        } catch (e) {
          console.warn("[plane-bridge] invitation accept failed (non-fatal)", e);
        }

        // 4) Redirect to the workspace.
        window.location.replace(WORKSPACE_URL);
      } catch (e) {
        console.error("[plane-bridge]", e);
        showError(String(e && e.message || e));
      }
    })();
  </script>
</body>
</html>`;
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    const back = new URL("/login", req.url);
    back.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(back);
  }

  const requestedWorkspace = req.nextUrl.searchParams.get("ws") ?? undefined;
  const groups = (session.groups ?? []) as string[];

  // For platform admins, allow access to any workspace; otherwise restrict
  // to the workspaces granted by their Keycloak groups.
  let workspaceSlug: string | null = null;
  if (requestedWorkspace && PLANE_WORKSPACE_SLUG_BY_CORE[requestedWorkspace]) {
    const adminUsernames = (process.env.PORTAL_ADMIN_USERNAMES ?? "ali,johannes")
      .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    const isAdmin = adminUsernames.includes((session.user.username ?? "").toLowerCase());
    if (isAdmin) {
      workspaceSlug = PLANE_WORKSPACE_SLUG_BY_CORE[requestedWorkspace];
    } else {
      workspaceSlug = planeWorkspaceForGroups(requestedWorkspace, groups);
    }
  } else {
    workspaceSlug = planeWorkspaceForGroups(undefined, groups);
  }

  if (!workspaceSlug) {
    return new NextResponse(
      `<h1>Kein Plane-Workspace verfügbar</h1><p>Dein Account ist in keiner Keycloak-Gruppe, die einem Plane-Workspace zugeordnet ist (corehub, medtheris, kineo).</p>`,
      { status: 403, headers: { "content-type": "text/html; charset=utf-8" } },
    );
  }

  const email = session.user.email;
  const fullName = session.user.name ?? "";
  const [firstRaw, ...restRaw] = fullName.split(" ");
  const firstName = firstRaw || email.split("@")[0];
  const lastName = restRaw.join(" ") || "";
  const password = derivePlanePassword(email);

  // Ensure the user is a member of the target Plane workspace.
  // We swallow errors here: if the user already exists & is a member, great;
  // if invite fails because user doesn't exist in Plane yet, the browser-side
  // sign-up will create them and Plane will auto-link the pending invite.
  try {
    await ensureWorkspaceMembership(workspaceSlug, email);
  } catch (e) {
    console.warn("[plane-bridge] ensureWorkspaceMembership warning:", e);
  }

  const html = bridgeHtml({
    email,
    password,
    firstName: htmlEscape(firstName),
    lastName: htmlEscape(lastName),
    planeBase: PLANE_PUBLIC_BASE,
    workspaceSlug,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
      "x-frame-options": "SAMEORIGIN",
    },
  });
}
