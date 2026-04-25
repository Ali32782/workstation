import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { CalendarClient } from "@/components/calendar/CalendarClient";

export const dynamic = "force-dynamic";

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  if (!session?.user?.username) redirect("/login");

  return (
    <div className="h-full">
      <CalendarClient
        workspace={workspace.id}
        accent={workspace.accent}
        selfEmail={session.user.email ?? ""}
        selfName={session.user.name ?? session.user.username}
      />
    </div>
  );
}
