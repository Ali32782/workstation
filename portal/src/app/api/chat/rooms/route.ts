import { NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { listRoomsForUser, RateLimitedError } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  try {
    const rooms = await listRoomsForUser(s.ctx.rcUserId);
    return NextResponse.json({ rooms, me: { username: s.ctx.username, id: s.ctx.rcUserId } });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        {
          rooms: [],
          me: { username: s.ctx.username, id: s.ctx.rcUserId },
          rateLimited: true,
          retryAfter: e.retryAfterSeconds,
        },
        { status: 200, headers: { "X-RateLimited": "1" } },
      );
    }
    console.error("[/api/chat/rooms] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
