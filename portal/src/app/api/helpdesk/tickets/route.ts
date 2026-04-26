import { NextRequest, NextResponse } from "next/server";
import {
  createTicket,
  getZammadUserIdByEmail,
  listTickets,
  loadMeta,
} from "@/lib/helpdesk/zammad";
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

export async function GET(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const query = req.nextUrl.searchParams.get("q") ?? undefined;
  const stateParam = req.nextUrl.searchParams.get("state") as
    | "open"
    | "closed"
    | "all"
    | null;
  const overviewParam = req.nextUrl.searchParams.get("overview");
  const overviewId = overviewParam ? parseInt(overviewParam, 10) : undefined;
  try {
    const [tickets, meta, meId] = await Promise.all([
      listTickets(g.session.tenant, {
        query,
        state: stateParam ?? "open",
        overviewId: Number.isFinite(overviewId) ? overviewId : undefined,
      }),
      loadMeta(g.session.tenant),
      getZammadUserIdByEmail(g.session.email),
    ]);
    return NextResponse.json({
      tickets,
      meta,
      me: { id: meId, email: g.session.email },
    });
  } catch (e) {
    console.error("[/api/helpdesk/tickets] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  let body: {
    title?: string;
    body?: string;
    customerEmail?: string;
    groupId?: number;
    priorityId?: number;
    internal?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  try {
    const ticket = await createTicket(g.session.tenant, {
      title: body.title.trim(),
      body: body.body ?? "",
      customerEmail: body.customerEmail?.trim() || g.session.email,
      customerName: g.session.fullName || g.session.username,
      groupId: body.groupId,
      priorityId: body.priorityId,
      internal: body.internal,
    });
    return NextResponse.json({ ticket });
  } catch (e) {
    console.error("[/api/helpdesk/tickets POST] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
