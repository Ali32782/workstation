import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import {
  buildJitsiRoomForChat,
  postCallInvite,
  RateLimitedError,
} from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });

  let body: { roomId?: string; roomName?: string; postInvite?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.roomId || !body.roomName) {
    return NextResponse.json(
      { error: "roomId and roomName required" },
      { status: 400 },
    );
  }

  try {
    if (body.postInvite !== false) {
      const r = await postCallInvite(s.ctx.rcUserId, body.roomId, body.roomName);
      return NextResponse.json(r);
    }
    const link = buildJitsiRoomForChat(body.roomId, body.roomName);
    return NextResponse.json({ link, messageId: null });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      // Even if posting the invite is rate-limited, give the user the link
      // anyway so they can join immediately. We just won't post into the chat.
      const link = buildJitsiRoomForChat(body.roomId, body.roomName);
      return NextResponse.json(
        { link, messageId: null, rateLimited: true, retryAfter: e.retryAfterSeconds },
        { status: 200 },
      );
    }
    console.error("[/api/chat/call] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
