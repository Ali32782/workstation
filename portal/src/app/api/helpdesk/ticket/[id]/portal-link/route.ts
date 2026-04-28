import { NextRequest, NextResponse } from "next/server";
import { getTicket } from "@/lib/helpdesk/zammad";
import {
  resolveHelpdeskSession,
  type HelpdeskSession,
} from "@/lib/helpdesk/session";
import { signPortalToken } from "@/lib/helpdesk/portal-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(
  req: NextRequest,
): Promise<
  | { session: HelpdeskSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveHelpdeskSession(ws);
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
 * Mint a signed magic-link the agent can paste into chat / email so a
 * customer can view the ticket and reply without having a portal account.
 *
 * Body: { ttlDays?: number }   (1..90, default 30)
 * Response: { url, expiresAt }
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if (g.err) return g.err;
  const { id } = await ctx.params;
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }

  let body: { ttlDays?: number } = {};
  try {
    body = await req.json();
  } catch {
    /* empty body is fine */
  }
  const ttlDays = Math.min(90, Math.max(1, Number(body.ttlDays) || 30));

  // Make sure the ticket actually belongs to this tenant before handing
  // out a signed token for it.
  try {
    const ticket = await getTicket(g.session.tenant, tid);
    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket nicht im Workspace." },
        { status: 404 },
      );
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const token = signPortalToken(
    g.session.tenant.workspace,
    tid,
    ttlDays * 24 * 60 * 60,
  );
  const origin = req.nextUrl.origin;
  const url = `${origin}/p/helpdesk/${token}`;
  const expiresAt = new Date(
    Date.now() + ttlDays * 24 * 60 * 60 * 1000,
  ).toISOString();
  return NextResponse.json({ url, expiresAt });
}
