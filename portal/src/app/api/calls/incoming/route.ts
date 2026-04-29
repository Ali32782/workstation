import { NextRequest, NextResponse } from "next/server";

import { listCalls } from "@/lib/calls/store";
import { filterIncomingCallsForViewer } from "@/lib/calls/incoming";
import { resolveCallsSession } from "@/lib/calls/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Aktive Calls, die für die Session noch „anklingeln“ (noch nicht beigetreten). */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCallsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }

  const active = await listCalls(r.session.workspace, {
    activeOnly: true,
    limit: 80,
  });
  const incoming = filterIncomingCallsForViewer(active, r.session.email);
  return NextResponse.json({ incoming });
}
