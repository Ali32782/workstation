import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Pre-flight check for the medtheris-scraper sidecar. Surfaces *which*
 * required env keys are missing so the admin onboarding UI can block the
 * Trigger button and show a precise hint instead of letting the operator
 * click and discover an exit-2 failure 10 seconds later.
 *
 * Never returns secret values — only booleans and a 4-char/length hint.
 */
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminUsername(session.user.username)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = process.env.SCRAPER_RUNNER_URL;
  const token = process.env.SCRAPER_RUNNER_TOKEN;
  if (!url || !token) {
    return NextResponse.json(
      {
        ok: false,
        reachable: false,
        error: "scraper runner not configured (SCRAPER_RUNNER_URL/TOKEN)",
        missing: [],
        present: [],
        details: {},
      },
      { status: 200 },
    );
  }

  // The scraper supports per-profile preflight (medtheris vs kineo
  // workspaces have separate API keys) — pass the profile through.
  const profile = new URL(req.url).searchParams.get("profile");
  const target = `${url.replace(/\/$/, "")}/preflight${
    profile ? `?profile=${encodeURIComponent(profile)}` : ""
  }`;

  try {
    const r = await fetch(target, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const j = await r.json();
    return NextResponse.json({ ...j, reachable: true });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
      missing: [],
      present: [],
      details: {},
    });
  }
}
