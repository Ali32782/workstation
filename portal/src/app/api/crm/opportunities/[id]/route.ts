import { NextRequest, NextResponse } from "next/server";
import { getOpportunityById, updateOpportunity } from "@/lib/crm/twenty";
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
 * GET /api/crm/opportunities/{id}?ws={workspace}
 *
 * Returns one opportunity (with company id/name) for CRM deep-links (`?deal=`).
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    const opportunity = await getOpportunityById(g.session.tenant, id);
    if (!opportunity) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ opportunity });
  } catch (e) {
    console.error(`[/api/crm/opportunities/${id} GET] failed:`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * PATCH /api/crm/opportunities/{id}?ws={workspace}
 *
 * Body: any subset of OpportunityUpdateInput — typically `{ stage }`
 * during a kanban drag, or `{ amount, closeDate, name }` from inline
 * edits. The whitelist below is conservative on purpose; expand it as
 * the UI grows.
 */
const ALLOWED_FIELDS = new Set(["stage", "name", "amount", "closeDate"]);

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let raw: Record<string, unknown>;
  try {
    raw = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (ALLOWED_FIELDS.has(k)) patch[k] = v;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "no_updatable_fields" }, { status: 400 });
  }
  try {
    const opportunity = await updateOpportunity(g.session.tenant, id, patch);
    return NextResponse.json({ opportunity });
  } catch (e) {
    console.error(`[/api/crm/opportunities/${id} PATCH] failed:`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
