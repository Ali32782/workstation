import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Returns a summary of the scraper's local SQLite dedup-cache:
 *
 *   { total, pushed, unpushed, by_canton: [{canton, total, pushed, unpushed}] }
 *
 * "pushed" = rows with `twenty_company_id` set (already in CRM).
 * "unpushed" = scraped + enriched (often during a dry-run) but never sent
 * to Twenty. The admin UI uses this to surface a "Cache → CRM pushen"
 * button so the operator can drain the queue without re-running discovery.
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
      { reachable: false, error: "scraper runner not configured" },
      { status: 200 },
    );
  }

  // ?profile=aerzte returns only that vertical's rows; without the param
  // the runner returns the full mix plus a `by_profile` breakdown.
  const profile = new URL(req.url).searchParams.get("profile");
  const target = `${url.replace(/\/$/, "")}/cache_summary${
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
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
