import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { FileStationClient } from "@/components/files/FileStationClient";

export default async function FilesPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  return (
    <FileStationClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
    />
  );
}
