import { NextRequest, NextResponse } from "next/server";

import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import {
  listAgents,
  listGroupMembers,
  setGroupMembership,
} from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_ACCESS = ["full"];

async function gate(req: NextRequest) {
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
    return { err: NextResponse.json({ error: r.message }, { status: 503 }) };
  }
  return { session: r.session };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if ("err" in g) return g.err;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ungültige id" }, { status: 400 });
  }

  try {
    const [members, allAgents] = await Promise.all([
      listGroupMembers(g.session.tenant, id),
      listAgents(),
    ]);
    const memberIds = new Set(members.map((m) => m.id));
    const candidates = allAgents.filter((a) => !memberIds.has(a.id));
    return NextResponse.json({ members, candidates });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if ("err" in g) return g.err;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ungültige id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as {
    userId?: number;
    accessLevel?: string[];
  } | null;
  if (!body?.userId) {
    return NextResponse.json({ error: "userId fehlt." }, { status: 400 });
  }
  try {
    await setGroupMembership(
      g.session.tenant,
      id,
      Number(body.userId),
      body.accessLevel?.length ? body.accessLevel : DEFAULT_ACCESS,
    );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const g = await gate(req);
  if ("err" in g) return g.err;
  const { id: idParam } = await params;
  const id = Number(idParam);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: "ungültige id" }, { status: 400 });
  }
  const userId = Number(req.nextUrl.searchParams.get("userId"));
  if (!Number.isFinite(userId) || userId <= 0) {
    return NextResponse.json({ error: "userId fehlt." }, { status: 400 });
  }
  try {
    await setGroupMembership(g.session.tenant, id, userId, null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
