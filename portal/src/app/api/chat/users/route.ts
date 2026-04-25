import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { searchUsers, RateLimitedError } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });

  const q = req.nextUrl.searchParams.get("q") ?? "";
  try {
    const users = await searchUsers(q, s.ctx.rcUserId);
    return NextResponse.json({ users });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        { users: [], rateLimited: true, retryAfter: e.retryAfterSeconds },
        { status: 200 },
      );
    }
    console.error("[/api/chat/users] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
