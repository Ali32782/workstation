import { NextRequest, NextResponse } from "next/server";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { setCampaignPublished } from "@/lib/marketing/mautic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/marketing/campaigns/{id}?ws={workspace}
 *
 * Body: { isPublished: boolean }
 *
 * Mautic doesn't have a separate "play / pause" semantic — toggling
 * `isPublished` is exactly what the campaign UI does, and execution
 * resumes from the same node when the campaign is re-published.
 */
export async function PATCH(
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

  let body: { isPublished?: unknown } = {};
  try {
    body = (await req.json()) as { isPublished?: unknown };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof body.isPublished !== "boolean") {
    return NextResponse.json(
      { error: "isPublished must be boolean" },
      { status: 400 },
    );
  }

  try {
    const campaign = await setCampaignPublished(id, body.isPublished);
    return NextResponse.json({ campaign });
  } catch (e) {
    console.error(`[/api/marketing/campaigns/${id}] PATCH failed:`, e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
