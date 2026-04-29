import { NextRequest, NextResponse } from "next/server";

import {
  listRoomMembers,
  roomInfoForUser,
} from "@/lib/chat/rocketchat";
import { appendCallRingChatInvite } from "@/lib/comms/call-ring-store";
import {
  extractMeetUrlFromRocketchatMessage,
  rocketchatMessageLooksLikePortalVideoInvite,
} from "@/lib/comms/rocketchat-call-invite";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.ROCKETCHAT_CALL_RING_WEBHOOK_SECRET?.trim();
  if (!secret) return false;
  const q = req.nextUrl.searchParams.get("token");
  const h = req.headers.get("x-rocketchat-token");
  return q === secret || h === secret;
}

type RcPayload = {
  user_id?: string;
  userId?: string;
  user_name?: string;
  username?: string;
  text?: string;
  channel_id?: string;
  channelId?: string;
  rid?: string;
  message_id?: string;
  message?: {
    _id?: string;
    msg?: string;
    u?: { _id?: string; username?: string; name?: string };
    rid?: string;
  };
};

function normalizePayload(raw: unknown): RcPayload | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as RcPayload;
}

/** RC Outgoing Webhook may POST urlencoded `payload=<json>`. */
async function readHookPayload(req: NextRequest): Promise<unknown> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("application/x-www-form-urlencoded")) {
    const text = await req.text();
    const params = new URLSearchParams(text);
    const payload = params.get("payload");
    if (payload) {
      try {
        return JSON.parse(payload) as unknown;
      } catch {
        return null;
      }
    }
    return null;
  }
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function extractHookFields(p: RcPayload): {
  senderId: string;
  rid: string;
  text: string;
  messageId: string;
  senderUsername: string;
  senderName?: string;
} | null {
  const msg = p.message;
  const text =
    (typeof msg?.msg === "string" ? msg.msg : undefined) ??
    (typeof p.text === "string" ? p.text : "");
  const senderId =
    (typeof p.user_id === "string" ? p.user_id : undefined) ??
    (typeof p.userId === "string" ? p.userId : undefined) ??
    (typeof msg?.u?._id === "string" ? msg.u._id : "");
  const rid =
    (typeof p.channel_id === "string" ? p.channel_id : undefined) ??
    (typeof p.channelId === "string" ? p.channelId : undefined) ??
    (typeof p.rid === "string" ? p.rid : undefined) ??
    (typeof msg?.rid === "string" ? msg.rid : "");
  const messageId =
    (typeof p.message_id === "string" ? p.message_id : undefined) ??
    (typeof msg?._id === "string" ? msg._id : "");
  const senderUsername =
    (typeof p.user_name === "string" ? p.user_name : undefined) ??
    (typeof p.username === "string" ? p.username : undefined) ??
    (typeof msg?.u?.username === "string" ? msg.u.username : "") ??
    "";
  const senderName =
    typeof msg?.u?.name === "string" ? msg.u.name : undefined;
  if (!senderId || !rid || !text || !messageId) return null;
  return {
    senderId,
    rid,
    text,
    messageId,
    senderUsername,
    senderName,
  };
}

/**
 * Rocket.Chat Outgoing Webhook → canonical portal ring store.
 * Configure in RC: trigger on “message sent”, point to this URL + shared secret.
 */
export async function POST(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const raw = await readHookPayload(req);
  const p = normalizePayload(raw);
  if (!p) {
    return NextResponse.json({ ok: true, ignored: "no-payload" });
  }

  const fields = extractHookFields(p);
  if (!fields) {
    return NextResponse.json({ ok: true, ignored: "incomplete" });
  }

  if (!rocketchatMessageLooksLikePortalVideoInvite(fields.text)) {
    return NextResponse.json({ ok: true, ignored: "not-call-invite" });
  }

  const joinUrl = extractMeetUrlFromRocketchatMessage(fields.text);
  if (!joinUrl) {
    return NextResponse.json({ ok: true, ignored: "no-url" });
  }

  try {
    const info = await roomInfoForUser(fields.senderId, fields.rid);
    const members = await listRoomMembers(fields.senderId, fields.rid, info.type);
    const recipientRcUserIds = members
      .map((m) => m.id)
      .filter((id) => id !== fields.senderId);

    const roomName =
      info.type === "d"
        ? members
            .filter((m) => m.id !== fields.senderId)
            .map((m) => m.username)
            .join(", ") || "Direktnachricht"
        : info.fname || info.name || `Kanal · ${fields.rid.slice(0, 8)}`;

    await appendCallRingChatInvite({
      workspace: info.workspace,
      roomId: fields.rid,
      roomName,
      joinUrl,
      messageId: fields.messageId,
      initiatorRcUserId: fields.senderId,
      initiatorUsername: fields.senderUsername || "unknown",
      initiatorName: fields.senderName,
      recipientRcUserIds,
    });

    return NextResponse.json({ ok: true, appended: true });
  } catch (e) {
    console.error("[rocketchat/call-ring] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "rc-failed" },
      { status: 502 },
    );
  }
}
