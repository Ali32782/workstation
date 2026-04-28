import { NextRequest, NextResponse } from "next/server";
import { listAllOpportunities } from "@/lib/crm/twenty";
import { resolveCrmSession, type CrmSession } from "@/lib/crm/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(
  req: NextRequest,
): Promise<
  | { session: CrmSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return {
      err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
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
 * GET /api/crm/opportunities?ws={workspace}&q={search}&first={limit}
 *
 * Returns the workspace's deal pipeline. The kanban view fetches this
 * once and groups client-side by stage so dragging never needs a list
 * refresh — only a stage PATCH on the moved deal.
 */
export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const search = req.nextUrl.searchParams.get("q") ?? undefined;
  const firstParam = req.nextUrl.searchParams.get("first");
  const first = firstParam ? Math.max(1, Math.min(500, Number(firstParam))) : 200;
  try {
    const items = await listAllOpportunities(g.session.tenant, { search, first });
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[/api/crm/opportunities GET] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
