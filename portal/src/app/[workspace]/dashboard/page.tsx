import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { WorkspaceDashboard } from "@/components/dashboards/WorkspaceDashboard";

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
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <WorkspaceDashboard
          workspaceId={workspace.id as WorkspaceId}
          workspaceName={workspace.name}
          tagline={workspace.tagline}
          firstName={firstName}
          accent={workspace.accent}
        />
      </div>
    </div>
  );
}
