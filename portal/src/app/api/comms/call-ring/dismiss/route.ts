import { NextRequest, NextResponse } from "next/server";

import { resolveCallsSession } from "@/lib/calls/session";
import { removeChatRingForViewer } from "@/lib/comms/call-ring-store";
import { lookupRcUserId } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Entfernt einen Chat-Jitsi-Klingel-Eintrag serverseitig (z. B. nach Annahme).
 * Ermöglicht, dass andere Geräte/Tabs den Ring nach dem nächsten Poll nicht mehr sehen.
 */
export async function POST(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCallsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }

  let body: { messageId?: string };
  try {
    body = (await req.json()) as { messageId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const messageId = typeof body.messageId === "string" ? body.messageId.trim() : "";
  if (!messageId) {
    return NextResponse.json({ error: "messageId required" }, { status: 400 });
  }

  const rcId = await lookupRcUserId({
    username: r.session.username,
    email: r.session.email,
  });
  if (!rcId) {
    return NextResponse.json({ error: "Rocket.Chat user not linked" }, { status: 409 });
  }

  await removeChatRingForViewer(messageId, {
    viewerRcUserId: rcId,
    workspace: r.session.workspace,
  });
  return NextResponse.json({ ok: true });
}
