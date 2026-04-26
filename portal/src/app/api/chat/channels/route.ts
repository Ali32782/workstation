import { NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import { createRoom, RateLimitedError } from "@/lib/chat/rocketchat";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/chat/channels
 *
 * Creates a public channel or a private group, tagged with the current
 * portal workspace so it shows up in the right sidebar.
 *
 * Body: {
 *   name: string,            // free-form, will be slugified server-side
 *   isPrivate?: boolean,     // default false (public channel)
 *   workspace: string,       // required: kineo|corehub|medtheris|…
 *   topic?: string,
 *   memberUsernames?: string[],
 *   teamId?: string,         // optional: nest under a Rocket.Chat team
 *   displayName?: string,
 * }
 */
export async function POST(req: Request) {
  const s = await requireChatSession();
  if (s.error) {
    return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  }
  let body: {
    name?: string;
    isPrivate?: boolean;
    workspace?: string;
    topic?: string;
    memberUsernames?: string[];
    teamId?: string;
    displayName?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const name = (body.name ?? "").trim();
  const workspace = (body.workspace ?? "").trim().toLowerCase();
  if (!name) {
    return NextResponse.json({ error: "name required" }, { status: 400 });
  }
  if (!workspace) {
    return NextResponse.json({ error: "workspace required" }, { status: 400 });
  }
  if (name.length > 80) {
    return NextResponse.json({ error: "name too long" }, { status: 400 });
  }

  try {
    const r = await createRoom(s.ctx.rcUserId, {
      name,
      isPrivate: !!body.isPrivate,
      workspace,
      topic: body.topic,
      memberUsernames: body.memberUsernames ?? [],
      teamId: body.teamId,
      displayName: body.displayName ?? name,
    });
    return NextResponse.json({
      ok: true,
      roomId: r.roomId,
      type: r.type,
    });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        { error: "rate-limited", retryAfter: e.retryAfterSeconds },
        { status: 429 },
      );
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/name-already-in-use|name-invalid|duplicate/i.test(msg)) {
      return NextResponse.json({ error: "name-already-in-use" }, { status: 409 });
    }
    console.error("[/api/chat/channels] create failed:", msg);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
