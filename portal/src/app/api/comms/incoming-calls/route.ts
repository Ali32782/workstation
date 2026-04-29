import { NextRequest, NextResponse } from "next/server";

import { filterIncomingCallsForViewer } from "@/lib/calls/incoming";
import { resolveCallsSession } from "@/lib/calls/session";
import { listCalls } from "@/lib/calls/store";
import { lookupRcUserId } from "@/lib/chat/rocketchat";
import { callRingEventsForViewer, readCallRingEvents } from "@/lib/comms/call-ring-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Unified “incoming ring” feed: Mongo portal.calls + ephemeral Chat/Jitsi invites.
 * Client should poll this (future: SSE / Web Push).
 */
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
  const portal = filterIncomingCallsForViewer(active, r.session.email);

  let chat: ReturnType<typeof callRingEventsForViewer> = [];
  const rcId = await lookupRcUserId({
    username: r.session.username,
    email: r.session.email,
  });
  if (rcId) {
    const events = await readCallRingEvents();
    chat = callRingEventsForViewer(events, {
      workspace: r.session.workspace,
      viewerRcUserId: rcId,
    });
  }

  return NextResponse.json({ portal, chat });
}
