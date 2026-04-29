import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Proxy for the scraper runner's `/profiles` endpoint.
 *
 * Returns the static profile metadata (key, label, specialties, locked
 * canton, …) that the admin UI needs to render the profile picker.
 * No auth on the runner side — purely descriptive — but we still
 * gate the proxy on admin session so non-admins don't see vertical
 * configuration that hints at internal workspace structure.
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
  if (!url) {
    return NextResponse.json(
      { profiles: [], reachable: false, error: "SCRAPER_RUNNER_URL not set" },
      { status: 200 },
    );
  }

  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/profiles`, {
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
