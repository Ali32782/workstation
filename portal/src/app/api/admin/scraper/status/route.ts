import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
      { state: "idle", reachable: false, error: "not configured" },
      { status: 200 },
    );
  }

  try {
    const r = await fetch(`${url.replace(/\/$/, "")}/status`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5_000),
      cache: "no-store",
    });
    const j = await r.json();
    return NextResponse.json({ ...j, reachable: true });
  } catch (e) {
    return NextResponse.json({
      state: "error",
      reachable: false,
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
