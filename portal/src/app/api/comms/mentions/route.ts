import { NextRequest, NextResponse } from "next/server";
import { listMyMentions } from "@/lib/chat/rocketchat";
import { requireChatSession } from "@/lib/chat/session";

/**
 * Cross-channel mention feed for the Daily-Home card.
 *
 * Phase 1 (this endpoint): chat-only. We surface every Rocket.Chat
 * subscription where the user has at least one unread @-mention or
 * @here group-mention. Zammad ticket-mentions are deliberately out of
 * scope until we have user-impersonated calls — without those we'd
 * either need to fan out per-article or settle for "tickets owned by me
 * with new customer activity", which is a different UX promise than the
 * "@-mention" we're presenting on the card.
 *
 * Optional `?workspace=kineo|corehub|medtheris` filter limits to rooms
 * tagged with that workspace. The dashboard always passes the current
 * workspace so a corehub user doesn't see kineo mentions in their card.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const workspaceFilter = url.searchParams.get("workspace")?.toLowerCase() ?? null;

  const sess = await requireChatSession();
  if (sess.error) {
    return NextResponse.json(
      { error: sess.error.message },
      { status: sess.error.status },
    );
  }

  try {
    const all = await listMyMentions(sess.ctx.rcUserId, sess.ctx.username);
    const filtered = workspaceFilter
      ? all.filter((m) => !m.workspace || m.workspace === workspaceFilter)
      : all;
    return NextResponse.json({
      items: filtered,
      totalUserMentions: filtered.reduce((acc, m) => acc + m.userMentions, 0),
      totalGroupMentions: filtered.reduce((acc, m) => acc + m.groupMentions, 0),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
