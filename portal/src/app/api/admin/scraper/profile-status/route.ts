import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxy for the scraper runner's `/profile_status` endpoint.
 *
 * Surfaces the per-profile run history (first/last run, run count, force
 * timestamp, current lock state) so the admin UI can:
 *   * disable the trigger button for one-shot profiles that already ran,
 *   * render "letzter Lauf: 12.04.2026, 3 Läufe" badges on each profile
 *     card,
 *   * tell the operator which profiles have never been touched yet.
 */
export async function GET() {
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
        profiles: [],
        reachable: false,
        error: "scraper runner not configured (SCRAPER_RUNNER_URL/TOKEN)",
      },
      { status: 200 },
    );
  }

  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/profile_status`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const j = await r.json();
    return NextResponse.json({ ...j, reachable: true });
  } catch (e) {
    return NextResponse.json({
      profiles: [],
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
