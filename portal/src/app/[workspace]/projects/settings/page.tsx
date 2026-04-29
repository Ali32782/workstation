import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { PLANE_PUBLIC_BASE } from "@/lib/plane";
import { ProjectsSettingsClient } from "@/components/projects/ProjectsSettingsClient";

export const dynamic = "force-dynamic";

export default async function ProjectsSettingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  if (!session?.user?.username) redirect("/login");

  const planePublicBase = PLANE_PUBLIC_BASE.replace(/\/$/, "");

  return (
    <ProjectsSettingsClient
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      accent={workspace.accent}
      planePublicBase={planePublicBase}
    />
  );
}
