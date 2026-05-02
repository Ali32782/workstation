import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import {
  buildJitsiRoomForChat,
  listRoomMembers,
  postCallInvite,
  RateLimitedError,
  roomInfoForUser,
} from "@/lib/chat/rocketchat";
import type { ChatRoomType } from "@/lib/chat/types";
import { appendCallRingChatInvite } from "@/lib/comms/call-ring-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const gate = await requireChatSession();
  if (gate.error) {
    return NextResponse.json({ error: gate.error.message }, { status: gate.error.status });
  }
  const ctx = gate.ctx;

  let body: {
    roomId?: string;
    roomName?: string;
    /** When true (default), post the markdown invite into Rocket.Chat. */
    postInvite?: boolean;
    /** When true (default), notify other members via portal call-ring (incoming banner). */
    notifyRecipients?: boolean;
    portalWorkspace?: string;
    roomType?: ChatRoomType;
    /** `voice` = Sprach-Anruf (Jitsi Audio-first); default video */
    callMode?: "video" | "voice";
  };
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

  const callMode = body.callMode === "voice" ? "voice" : "video";
  const notifyRecipients = body.notifyRecipients !== false;

  async function pushRing(link: string, rocketMessageId: string | null): Promise<void> {
    if (!notifyRecipients) return;
    try {
      const info = await roomInfoForUser(ctx.rcUserId, body.roomId!);
      const roomType = body.roomType ?? info.type;
      const portalWs = (body.portalWorkspace ?? "").trim().toLowerCase();
      const workspaceTag = portalWs || info.workspace;
      const members = await listRoomMembers(
        ctx.rcUserId,
        body.roomId!,
        roomType,
      );
      const recipientRcUserIds = members
        .map((m) => m.id)
        .filter((id) => id !== ctx.rcUserId);
      const ringMsgId =
        rocketMessageId?.trim() ||
        `silent:${Date.now()}:${randomBytes(8).toString("hex")}`;
      await appendCallRingChatInvite({
        workspace: workspaceTag || null,
        roomId: body.roomId!,
        roomName: body.roomName!,
        joinUrl: link,
        messageId: ringMsgId,
        initiatorRcUserId: ctx.rcUserId,
        initiatorUsername: ctx.username,
        initiatorName: ctx.name,
        recipientRcUserIds,
        callMedia: callMode,
      });
    } catch (err) {
      console.warn("[/api/chat/call] ring store:", err);
    }
  }

  try {
    if (body.postInvite !== false) {
      const r = await postCallInvite(
        ctx.rcUserId,
        body.roomId,
        body.roomName,
        callMode,
      );
      await pushRing(r.link, r.messageId);
      return NextResponse.json(r);
    }
    const link = buildJitsiRoomForChat(body.roomId, body.roomName, callMode);
    await pushRing(link, null);
    return NextResponse.json({ link, messageId: null });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      // Even if posting the invite is rate-limited, give the user the link
      // anyway so they can join immediately. We just won't post into the chat.
      const link = buildJitsiRoomForChat(body.roomId, body.roomName, callMode);
      await pushRing(link, null);
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
