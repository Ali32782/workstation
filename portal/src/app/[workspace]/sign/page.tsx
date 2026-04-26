import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { SignClient } from "@/components/sign/SignClient";
import { documensoPublicUrl } from "@/lib/sign/config";

export default async function SignPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  return (
    <SignClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      documensoUrl={documensoPublicUrl()}
    />
  );
}
