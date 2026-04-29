import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { HelpdeskSettingsClient } from "@/components/helpdesk/HelpdeskSettingsClient";

export const dynamic = "force-dynamic";

export default async function HelpdeskSettingsPage({
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
    <HelpdeskSettingsClient
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      accent={workspace.accent}
    />
  );
}
