import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-allowlist";
import { readRecent } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/admin/audit?limit=200
 *
 * Returns the most recent audit entries for the dashboard's audit-log
 * viewer. Admin-only; the underlying JSONL files contain enough detail
 * (actor email, resource id) that they shouldn't leak to operators.
 */
export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json(
      { error: guard.reason },
      { status: guard.reason === "unauthenticated" ? 401 : 403 },
    );
  }
  const url = new URL(req.url);
  const limit = Math.min(
    1000,
    Math.max(10, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200),
  );
  const entries = await readRecent(limit);
  return NextResponse.json({ entries, count: entries.length });
}
