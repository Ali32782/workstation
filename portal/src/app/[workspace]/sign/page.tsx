import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { SignClient } from "@/components/sign/SignClient";
import { documensoPublicUrl } from "@/lib/sign/config";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";

export default async function SignPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  const isAdmin = isAdminUsername(session?.user?.username);

  return (
    <SignClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      documensoUrl={documensoPublicUrl()}
      isAdmin={isAdmin}
    />
  );
}
