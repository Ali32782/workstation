import { NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { listRoomFiles, RateLimitedError } from "@/lib/chat/rocketchat";
import type { ChatRoomType } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/chat/channels/:id/files?type=c|p|d */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const s = await requireChatSession();
  if (s.error) {
    return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  }
  const url = new URL(req.url);
  const t = (url.searchParams.get("type") || "c").toLowerCase();
  const type: ChatRoomType = t === "p" ? "p" : t === "d" ? "d" : "c";
  try {
    const files = await listRoomFiles(s.ctx.rcUserId, id, type, 50);
    return NextResponse.json({ files });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        { error: "rate-limited", retryAfter: e.retryAfterSeconds },
        { status: 429 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
