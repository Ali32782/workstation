import { NextRequest, NextResponse } from "next/server";
import { executeMacro } from "@/lib/helpdesk/zammad";
import {
  resolveHelpdeskSession,
  type HelpdeskSession,
} from "@/lib/helpdesk/session";

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

/** POST /api/helpdesk/ticket/[id]/macro { macroId } → returns updated TicketDetail */
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
  let body: { macroId?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const macroId = Number(body.macroId);
  if (!Number.isFinite(macroId)) {
    return NextResponse.json({ error: "macroId required" }, { status: 400 });
  }
  try {
    const ticket = await executeMacro(g.session.tenant, tid, macroId, {
      onBehalfOf: g.session.email,
    });
    return NextResponse.json({ ticket });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
