import { NextRequest, NextResponse } from "next/server";
import { getHelpdeskQueueStats } from "@/lib/helpdesk/zammad";
import { resolveHelpdeskSession } from "@/lib/helpdesk/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveHelpdeskSession(ws);
  if (r.kind === "unauthenticated") {
    return { err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (r.kind === "forbidden") {
    return { err: NextResponse.json({ error: r.message }, { status: 403 }) };
  }
  if (r.kind === "not_configured") {
    return {
      err: NextResponse.json(
        { error: r.message, workspace: r.workspace, code: "not_configured" },
        { status: 503 },
      ),
    };
  }
  return { session: r.session };
}

/**
 * Queue snapshot for the helpdesk header: paginated counts (see
 * getHelpdeskQueueStats caps).
 */
export async function GET(req: NextRequest) {
  const g = await gate(req);
  if ("err" in g && g.err) return g.err;
  const { session } = g;
  try {
    const stats = await getHelpdeskQueueStats(session.tenant);
    return NextResponse.json({
      openCount: stats.openCount,
      openCapped: stats.openCountCapped,
      closedToday: stats.closedTodayCount,
      /** True when more closed tickets may exist beyond the paginated scan. */
      closedCapped: stats.closedTodayCapped,
      slaAtRiskCount: stats.slaAtRiskCount,
      slaAtRiskCapped: stats.slaAtRiskCapped,
    });
  } catch (e) {
    console.error("[/api/helpdesk/stats]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
