import { notFound } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { FileStationClient } from "@/components/files/FileStationClient";

export default async function FilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ workspace: workspaceParam }, sp] = await Promise.all([
    params,
    searchParams,
  ]);
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const qRaw =
    typeof sp.q === "string"
      ? sp.q
      : typeof sp.search === "string"
        ? sp.search
        : "";
  const trimmed = qRaw.trim();
  const initialGlobalSearchQuery =
    trimmed.length >= 2 ? trimmed : undefined;

  return (
    <FileStationClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      initialGlobalSearchQuery={initialGlobalSearchQuery}
    />
  );
}
