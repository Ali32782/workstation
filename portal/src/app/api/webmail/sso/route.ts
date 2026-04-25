/**
 * Webmail (SnappyMail) SSO bridge.
 *
 *   1. Require an authenticated portal session.
 *   2. Determine which mailbox to log into:
 *        - default = the user's primary email (session.user.email)
 *        - ?email=… can override (admins can use this to debug, ignored otherwise)
 *   3. Call SnappyMail's bridge.php (server-to-server in the docker network)
 *      with the per-user derived mail password to mint a one-shot SSO hash.
 *   4. Redirect the browser to https://webmail.kineo360.work/?Sso&hash=<hash>.
 *      SnappyMail's ServiceSso reads the cache, performs the IMAP login,
 *      sets its own auth cookie, and lands on the inbox.
 *
 * The hash is single-use and expires after 10s in SnappyMail's cache, so
 * leaking it via referer/history is bounded — and SnappyMail::ServiceSso
 * deletes the cache entry on first use.
 */
import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createSnappyMailSso, SNAPPYMAIL_PUBLIC_BASE } from "@/lib/snappymail";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const ADMIN_USERNAMES = (process.env.PORTAL_ADMIN_USERNAMES ?? "ali,johannes")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

function htmlError(title: string, detail: string, status = 500): NextResponse {
  const body = `<!doctype html>
<html lang="de"><head><meta charset="utf-8"><title>${title}</title>
<style>body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0a0c10;color:#c5c8cf;display:flex;align-items:center;justify-content:center;height:100vh}
.card{max-width:480px;padding:32px;border:1px solid #20242c;border-radius:14px;background:#11141a;box-shadow:0 10px 40px -10px rgba(0,0,0,.6)}
h1{margin:0 0 8px;color:#f5f6f8;font-size:18px}p{margin:6px 0;color:#8b91a0;font-size:13px}
a{display:inline-block;margin-top:14px;padding:8px 16px;background:#1e4d8c;color:#fff;border-radius:6px;text-decoration:none;font-size:13px}</style>
</head><body><div class="card"><h1>${title}</h1><p>${detail}</p>
<a href="${SNAPPYMAIL_PUBLIC_BASE}">Webmail manuell öffnen</a></div></body></html>`;
  return new NextResponse(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    const back = new URL("/login", req.url);
    back.searchParams.set("callbackUrl", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(back);
  }

  let email = session.user.email;
  const override = req.nextUrl.searchParams.get("email");
  if (override) {
    const username = (session.user.username ?? "").toLowerCase();
    if (!ADMIN_USERNAMES.includes(username)) {
      return htmlError(
        "Zugriff verweigert",
        "Nur Admins dürfen die Mailbox per ?email= überschreiben.",
        403,
      );
    }
    email = override;
  }

  try {
    const { publicRedirectUrl } = await createSnappyMailSso({ email });
    return NextResponse.redirect(publicRedirectUrl);
  } catch (e) {
    return htmlError(
      "Webmail-Login fehlgeschlagen",
      `Bridge-Fehler: ${(e as Error).message}`,
    );
  }
}
