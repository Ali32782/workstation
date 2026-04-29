import { notFound, redirect } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { resolveCrmSession } from "@/lib/crm/session";
import { getCompany } from "@/lib/crm/twenty";
import { CompanyHubView } from "@/components/crm/CompanyHubView";

export const dynamic = "force-dynamic";

export default async function CompanyHubPage({
  params,
}: {
  params: Promise<{ workspace: string; companyId: string }>;
}) {
  const { workspace: workspaceParam, companyId } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const callbackPath = `/${workspaceParam}/crm/company/${companyId}`;

  const crm = await resolveCrmSession(workspace.id);
  if (crm.kind === "unauthenticated") {
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackPath)}`);
  }
  if (crm.kind === "forbidden" || crm.kind === "not_configured") {
    return (
      <div className="min-h-full p-8 text-text-secondary text-[14px] whitespace-pre-wrap">
        {crm.message}
      </div>
    );
  }

  const company = await getCompany(crm.session.tenant, companyId);
  if (!company) notFound();

  const twentyPublic = (
    process.env.TWENTY_URL ?? "https://crm.kineo360.work"
  ).replace(/\/$/, "");

  return (
    <CompanyHubView
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      company={company}
      twentyPublicUrl={twentyPublic}
    />
  );
}
