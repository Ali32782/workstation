import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { mauticPublicUrl } from "@/lib/marketing/mautic";
import { MarketingSettingsClient } from "@/components/marketing/MarketingSettingsClient";

export const dynamic = "force-dynamic";

export default async function MarketingSettingsPage({
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
    <MarketingSettingsClient
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      accent={workspace.accent}
      mauticUrl={mauticPublicUrl()}
    />
  );
}
