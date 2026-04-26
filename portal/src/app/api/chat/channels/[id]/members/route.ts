import { NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import {
  findUserIdByUsername,
  inviteToRoom,
  kickFromRoom,
  listRoomMembers,
  RateLimitedError,
} from "@/lib/chat/rocketchat";
import type { ChatRoomType } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseType(req: Request): ChatRoomType {
  const url = new URL(req.url);
  const t = (url.searchParams.get("type") || "c").toLowerCase();
  return t === "p" ? "p" : t === "d" ? "d" : "c";
}

/** GET /api/chat/channels/:id/members?type=c|p|d */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const s = await requireChatSession();
  if (s.error) {
    return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  }
  try {
    const members = await listRoomMembers(s.ctx.rcUserId, id, parseType(req));
    return NextResponse.json({ members });
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

/**
 * POST /api/chat/channels/:id/members
 * Body: { username: string, type: 'c' | 'p' }
 *
 * Adds the named user to the channel/group.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const s = await requireChatSession();
  if (s.error) {
    return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  }
  let body: { username?: string; type?: ChatRoomType };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const username = (body.username ?? "").trim();
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }
  const type: ChatRoomType = body.type === "p" ? "p" : "c";

  try {
    const userId = await findUserIdByUsername(username);
    if (!userId) {
      return NextResponse.json({ error: "user-not-found" }, { status: 404 });
    }
    await inviteToRoom(s.ctx.rcUserId, id, type, userId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        { error: "rate-limited", retryAfter: e.retryAfterSeconds },
        { status: 429 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/already-in-room|user-already/i.test(msg)) {
      return NextResponse.json({ ok: true, note: "already-member" });
    }
    if (/unauthorized|forbidden|not-allowed|permission/i.test(msg)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    console.error("[/api/chat/channels/:id/members POST] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * DELETE /api/chat/channels/:id/members?username=foo&type=c|p
 *
 * Removes the named user from the channel/group.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const s = await requireChatSession();
  if (s.error) {
    return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  }
  const url = new URL(req.url);
  const username = (url.searchParams.get("username") || "").trim();
  const type = parseType(req) === "d" ? "c" : parseType(req); // can't kick from DM
  if (!username) {
    return NextResponse.json({ error: "username required" }, { status: 400 });
  }
  try {
    const userId = await findUserIdByUsername(username);
    if (!userId) {
      return NextResponse.json({ error: "user-not-found" }, { status: 404 });
    }
    await kickFromRoom(s.ctx.rcUserId, id, type, userId);
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
    console.error("[/api/chat/channels/:id/members DELETE] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
