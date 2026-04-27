import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { CrmSettingsClient } from "@/components/crm/CrmSettingsClient";

export const dynamic = "force-dynamic";

export default async function CrmSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  if (!session?.user?.username) redirect("/login");

  const twentyUrl = process.env.TWENTY_URL ?? "https://crm.kineo360.work";

  return (
    <CrmSettingsClient
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      accent={workspace.accent}
      twentyUrl={twentyUrl}
    />
  );
}
