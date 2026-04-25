import { notFound, redirect } from "next/navigation";
import { getApp, getWorkspace } from "@/lib/workspaces";
import { AppFrame } from "@/components/AppFrame";

export default async function AppPage({
  params,
}: {
  params: Promise<{ workspace: string; appId: string }>;
}) {
  const { workspace: workspaceParam, appId } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const app = getApp(workspaceParam, appId);
  if (!app) notFound();

  if (app.embed === "newtab") {
    redirect(app.url);
  }

  if (app.embed === "native") {
    redirect(`/${workspaceParam}/${appId}`);
  }

  return (
    <AppFrame
      appId={app.id}
      name={app.name}
      description={app.description}
      url={app.url}
      accent={workspace.accent}
    />
  );
}
