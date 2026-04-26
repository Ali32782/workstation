import { NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import {
  archiveRoom,
  RateLimitedError,
  renameRoom,
  setRoomPrivacy,
  setRoomTopic,
} from "@/lib/chat/rocketchat";
import type { ChatRoomType } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * PATCH /api/chat/channels/:id
 *
 * Mutate one (or several) properties of a channel/group. Body fields:
 *   - `topic`: string         → set topic
 *   - `name`: string          → rename (slug-style)
 *   - `isPrivate`: boolean    → toggle public/private (must include current type)
 *   - `archive`: boolean      → archive/unarchive
 *
 * Required body field for typed operations:
 *   - `type`: 'c' | 'p' (the room's CURRENT type)
 *
 * The caller must have permission in Rocket.Chat — RC will return 401/403
 * which we surface as 403 here.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const s = await requireChatSession();
  if (s.error) {
    return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  }

  let body: {
    topic?: string;
    name?: string;
    isPrivate?: boolean;
    archive?: boolean;
    type?: ChatRoomType;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const type: ChatRoomType = body.type === "p" ? "p" : "c";

  try {
    if (typeof body.topic === "string") {
      await setRoomTopic(s.ctx.rcUserId, id, type, body.topic);
    }
    if (typeof body.name === "string" && body.name.trim()) {
      await renameRoom(s.ctx.rcUserId, id, type, body.name.trim());
    }
    if (typeof body.isPrivate === "boolean") {
      await setRoomPrivacy(s.ctx.rcUserId, id, body.isPrivate);
    }
    if (typeof body.archive === "boolean") {
      await archiveRoom(s.ctx.rcUserId, id, type, body.archive);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        { error: "rate-limited", retryAfter: e.retryAfterSeconds },
        { status: 429 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/unauthorized|forbidden|not-allowed|permission/i.test(msg)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[/api/chat/channels/:id PATCH] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
