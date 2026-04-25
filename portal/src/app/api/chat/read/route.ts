import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { markRoomRead, RateLimitedError } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });

  let body: { roomId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  try {
    await markRoomRead(s.ctx.rcUserId, body.roomId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    // Read-marking is purely cosmetic; never bubble an error to the UI.
    if (e instanceof RateLimitedError) {
      return NextResponse.json({ ok: false, rateLimited: true }, { status: 200 });
    }
    console.error("[/api/chat/read] failed:", e);
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
