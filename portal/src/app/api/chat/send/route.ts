import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { postMessage, RateLimitedError } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });

  let body: { roomId?: string; text?: string; threadParentId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.roomId || !body.text?.trim()) {
    return NextResponse.json({ error: "roomId and non-empty text required" }, { status: 400 });
  }

  try {
    const message = await postMessage(
      s.ctx.rcUserId,
      body.roomId,
      body.text.trim(),
      body.threadParentId,
    );
    return NextResponse.json({ message });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        {
          error: `Bitte warte kurz – Chat-Server hat das Limit erreicht (in ${e.retryAfterSeconds}s erneut versuchen).`,
          rateLimited: true,
          retryAfter: e.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
    console.error("[/api/chat/send] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
