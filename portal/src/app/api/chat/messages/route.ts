import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { listHistory, RateLimitedError } from "@/lib/chat/rocketchat";
import type { ChatRoomType } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });

  const roomId = req.nextUrl.searchParams.get("roomId");
  const type = (req.nextUrl.searchParams.get("type") ?? "c") as ChatRoomType;
  const count = Math.min(200, Math.max(10, Number(req.nextUrl.searchParams.get("count") ?? 50)));
  if (!roomId) return NextResponse.json({ error: "roomId required" }, { status: 400 });
  if (!["c", "p", "d"].includes(type)) {
    return NextResponse.json({ error: "invalid type" }, { status: 400 });
  }

  try {
    const messages = await listHistory(s.ctx.rcUserId, roomId, type, count);
    return NextResponse.json({ messages });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      // Don't fail the UI on background polling — return an empty payload with
      // a hint header so the client can back off.
      return NextResponse.json(
        { messages: [], rateLimited: true, retryAfter: e.retryAfterSeconds },
        { status: 200, headers: { "X-RateLimited": "1" } },
      );
    }
    console.error("[/api/chat/messages] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
