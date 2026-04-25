import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { createOrOpenDM, RateLimitedError } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });

  let body: { username?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }

  try {
    const room = await createOrOpenDM(s.ctx.rcUserId, body.username);
    return NextResponse.json(room);
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        {
          error: `Bitte warte ${e.retryAfterSeconds}s — Chat-Server hat das Limit erreicht.`,
          rateLimited: true,
          retryAfter: e.retryAfterSeconds,
        },
        { status: 429 },
      );
    }
    console.error("[/api/chat/dm] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
