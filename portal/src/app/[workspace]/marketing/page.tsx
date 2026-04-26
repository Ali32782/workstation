import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { MarketingClient } from "@/components/marketing/MarketingClient";
import { mauticPublicUrl } from "@/lib/marketing/mautic";

export default async function MarketingPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  return (
    <MarketingClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      mauticUrl={mauticPublicUrl()}
    />
  );
}
