import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { ensureUser, listRoomsForUser } from "@/lib/chat/rocketchat";
import { ChatClient } from "@/components/chat/ChatClient";
import type { ChatRoom } from "@/lib/chat/types";

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

  let rooms: ChatRoom[] = [];
  let me = { username, id: "" };
  let error: string | null = null;

  try {
    const rcUserId = await ensureUser({
      username,
      email,
      name: session.user?.name ?? username,
    });
    me = { username, id: rcUserId };
    rooms = await listRoomsForUser(rcUserId);
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
        initialRooms={rooms}
        initialMe={me}
        rocketChatWebBase={rocketChatWebBase}
      />
    </div>
  );
}
