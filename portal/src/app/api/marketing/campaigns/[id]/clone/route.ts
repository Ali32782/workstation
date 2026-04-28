import { NextRequest, NextResponse } from "next/server";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { cloneCampaign } from "@/lib/marketing/mautic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/marketing/campaigns/{id}/clone?ws={workspace}
 *
 * Body (optional): { name?: string }
 *
 * Creates a new draft campaign that mirrors the source's flow and
 * audience selection. The clone is always paused (`isPublished: false`)
 * so admins can review the steps before activating it.
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveMarketingSession(ws);
  if (r.kind === "unauthenticated")
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (r.kind === "forbidden")
    return NextResponse.json({ error: r.message }, { status: 403 });
  if (r.kind === "not_configured")
    return NextResponse.json(
      { error: r.message, code: "not_configured" },
      { status: 503 },
    );

  const { id: idParam } = await ctx.params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }

  let body: { name?: unknown } = {};
  try {
    body = (await req.json().catch(() => ({}))) as { name?: unknown };
  } catch {
    body = {};
  }
  const newName = typeof body.name === "string" ? body.name : undefined;

  try {
    const out = await cloneCampaign(id, { newName });
    return NextResponse.json({
      campaign: out.campaign,
      eventsCopied: out.eventsCopied,
    });
  } catch (e) {
    console.error(`[/api/marketing/campaigns/${id}/clone] failed:`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
