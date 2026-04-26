import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { CrmClient } from "@/components/crm/CrmClient";

export default async function CrmPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  const isAdmin = isAdminUsername(session?.user?.username);
  // The scraper writes into a single Twenty workspace (TENANT_TAG, currently
  // `medtheris`), but the trigger UI is useful from any CRM context — admins
  // tend to live in the corehub workspace day-to-day and shouldn't have to
  // workspace-hop just to kick off a lead run. Backend permission is still
  // enforced server-side (`/api/admin/scraper/trigger` rejects non-admins).
  const scraperAvailable =
    isAdmin &&
    !!process.env.SCRAPER_RUNNER_URL &&
    !!process.env.SCRAPER_RUNNER_TOKEN;

  return (
    <CrmClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      scraperAvailable={scraperAvailable}
    />
  );
}
