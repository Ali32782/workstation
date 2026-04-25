import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { CorehubDashboard } from "@/components/dashboards/CorehubDashboard";
import { MedtherisDashboard } from "@/components/dashboards/MedtherisDashboard";
import { KineoDashboard } from "@/components/dashboards/KineoDashboard";

export default async function DashboardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  const firstName = session?.user?.name?.split(" ")[0] ?? "Team";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-6">
        {workspace.id === "corehub" ? (
          <CorehubDashboard firstName={firstName} accent={workspace.accent} />
        ) : workspace.id === "kineo" ? (
          <KineoDashboard firstName={firstName} accent={workspace.accent} />
        ) : (
          <MedtherisDashboard firstName={firstName} accent={workspace.accent} />
        )}
      </div>
    </div>
  );
}
