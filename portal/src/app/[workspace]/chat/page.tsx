import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import {
  ensureUser,
  listRoomsForUser,
  listTeams,
} from "@/lib/chat/rocketchat";
import { ChatClient } from "@/components/chat/ChatClient";
import type { ChatRoom, ChatTeam } from "@/lib/chat/types";

export const dynamic = "force-dynamic";

export default async function ChatPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  const email = session?.user?.email;
  const username = session?.user?.username ?? session?.user?.name;
  if (!email || !username) redirect("/login");

  const ws = workspaceParam.toLowerCase();

  let rooms: ChatRoom[] = [];
  let teams: ChatTeam[] = [];
  let me = { username, id: "" };
  let error: string | null = null;

  try {
    const rcUserId = await ensureUser({
      username,
      email,
      name: session.user?.name ?? username,
    });
    me = { username, id: rcUserId };
    const [allRooms, allTeams] = await Promise.all([
      listRoomsForUser(rcUserId),
      listTeams(),
    ]);
    const teamWsById = new Map<string, string | null>(
      allTeams.map((t) => [t.id, t.workspace]),
    );
    rooms = allRooms.filter((r) => {
      if (r.type === "d") return true;
      const teamWs = r.teamId ? teamWsById.get(r.teamId) ?? null : null;
      const effective = r.workspace ?? teamWs;
      if (!effective) return false;
      return effective === ws;
    });
    const visibleTeamIds = new Set(
      rooms.map((r) => r.teamId).filter(Boolean) as string[],
    );
    teams = allTeams.filter(
      (t) => visibleTeamIds.has(t.id) && t.workspace === ws,
    );
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-text-primary font-semibold text-lg">
            Chat nicht erreichbar
          </h1>
          <p className="text-text-secondary text-sm">
            Der Chat-Service kann gerade nicht angesprochen werden. Bitte gleich
            erneut versuchen oder einem Admin Bescheid geben.
          </p>
          <pre className="text-text-tertiary text-xs whitespace-pre-wrap text-left bg-bg-elevated border border-stroke-1 rounded p-3">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  const rocketChatWebBase = (
    process.env.ROCKETCHAT_PUBLIC_URL ??
    process.env.ROCKETCHAT_URL ??
    "https://chat.kineo360.work"
  ).replace(/\/$/, "");

  return (
    <div className="h-full">
      <ChatClient
        workspace={ws}
        workspaceLabel={workspace.name}
        initialRooms={rooms}
        initialTeams={teams}
        initialMe={me}
        rocketChatWebBase={rocketChatWebBase}
      />
    </div>
  );
}
