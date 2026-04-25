import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { OfficeHubClient } from "@/components/files/OfficeHubClient";

export default async function OfficePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  return (
    <OfficeHubClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
    />
  );
}
