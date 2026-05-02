import { NextRequest, NextResponse } from "next/server";
import { addArticle, getTicket, updateTicket } from "@/lib/helpdesk/zammad";
import {
  resolveHelpdeskSession,
  type HelpdeskSession,
} from "@/lib/helpdesk/session";
import { log } from "@/lib/log/server";

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

export async function GET(
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
  try {
    const ticket = await getTicket(g.session.tenant, tid);
    if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });
    return NextResponse.json({ ticket });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function PATCH(
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
  let patch: Parameters<typeof updateTicket>[2];
  try {
    patch = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    const ticket = await updateTicket(g.session.tenant, tid, patch);
    return NextResponse.json({ ticket });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  // POST /api/helpdesk/ticket/[id] → add article (reply)
  const g = await gate(req);
  if (g.err) return g.err;
  const { id } = await ctx.params;
  const tid = parseInt(id, 10);
  if (!Number.isFinite(tid)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  let body: {
    body?: string;
    type?: "note" | "email" | "phone";
    internal?: boolean;
    subject?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.body?.trim()) {
    return NextResponse.json({ error: "body required" }, { status: 400 });
  }
  try {
    const article = await addArticle(g.session.tenant, tid, {
      body: body.body,
      type: body.type ?? "note",
      internal: body.internal,
      subject: body.subject,
      onBehalfOf: g.session.email,
    });
    return NextResponse.json({ article });
  } catch (e) {
    log.error({
      scope: "helpdesk.ticket.add-article",
      error: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : undefined,
    });
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
