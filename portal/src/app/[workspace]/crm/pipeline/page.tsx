import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { hasTwentyTenant } from "@/lib/crm/config";
import { CrmPipelineClient } from "@/components/crm/CrmPipelineClient";

export const dynamic = "force-dynamic";

export default async function CrmPipelinePage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  if (!session?.user?.username) redirect("/login");

  if (!hasTwentyTenant(workspace.id)) {
    redirect(`/${workspace.id}/crm`);
  }

  return (
    <CrmPipelineClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
    />
  );
}
