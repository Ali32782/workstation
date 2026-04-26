import { NextResponse } from "next/server";
import { requireChatSession } from "@/lib/chat/session";
import {
  listRoomsForUser,
  listTeams,
  RateLimitedError,
} from "@/lib/chat/rocketchat";
import type { ChatRoom, ChatTeam } from "@/lib/chat/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lists rooms + teams for the current user, optionally filtered to a single
 * portal workspace.
 *
 * Query params:
 *   - `ws`: workspace slug (`kineo` | `corehub` | `medtheris` | …).
 *           When set, only rooms tagged with this workspace are returned;
 *           DMs are always included regardless of workspace.
 *
 * Untagged channels (legacy / no `customFields.workspace`) are returned for
 * every workspace so existing rooms stay visible until cleanly migrated.
 */
function filterRoomsForWorkspace(
  rooms: ChatRoom[],
  ws: string | null,
  teamWsById: Map<string, string | null>,
): ChatRoom[] {
  if (!ws) return rooms;
  return rooms.filter((r) => {
    if (r.type === "d") return true;
    // Prefer workspace from the team this room belongs to (covers rooms whose
    // own customField slipped through provisioning), fall back to room's own.
    const teamWs = r.teamId ? teamWsById.get(r.teamId) ?? null : null;
    const effective = r.workspace ?? teamWs;
    if (!effective) return false; // hide untagged team channels per workspace
    return effective === ws;
  });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const ws = (url.searchParams.get("ws") || "").toLowerCase().trim() || null;

  const s = await requireChatSession();
  if (s.error) return NextResponse.json({ error: s.error.message }, { status: s.error.status });
  try {
    const [rooms, allTeams] = await Promise.all([
      listRoomsForUser(s.ctx.rcUserId),
      listTeams(),
    ]);
    const teamWsById = new Map<string, string | null>(
      allTeams.map((t) => [t.id, t.workspace]),
    );
    const filteredRooms = filterRoomsForWorkspace(rooms, ws, teamWsById);
    // Only return teams that have at least one visible room AND match workspace.
    const visibleTeamIds = new Set(
      filteredRooms.map((r) => r.teamId).filter(Boolean) as string[],
    );
    const teams: ChatTeam[] = allTeams.filter(
      (t) => visibleTeamIds.has(t.id) && (!ws || t.workspace === ws),
    );

    return NextResponse.json({
      rooms: filteredRooms,
      teams,
      me: { username: s.ctx.username, id: s.ctx.rcUserId },
      workspace: ws,
    });
  } catch (e) {
    if (e instanceof RateLimitedError) {
      return NextResponse.json(
        {
          rooms: [],
          teams: [],
          me: { username: s.ctx.username, id: s.ctx.rcUserId },
          workspace: ws,
          rateLimited: true,
          retryAfter: e.retryAfterSeconds,
        },
        { status: 200, headers: { "X-RateLimited": "1" } },
      );
    }
    console.error("[/api/chat/rooms] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
