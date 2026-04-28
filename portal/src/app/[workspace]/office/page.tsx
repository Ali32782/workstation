import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { OfficeEditorPage } from "@/components/office/OfficeEditorPage";
import { OfficeHubClient } from "@/components/files/OfficeHubClient";

export const dynamic = "force-dynamic";

/**
 * Office page.
 *
 * Two modes share the same route:
 *   • Hub view (no `?path` param): lists the workspace's recent Office files
 *     and exposes Quick-Actions to spin up new documents / sheets / slides /
 *     notes, opens presentations in the OpenOffice-style Nextcloud panel.
 *   • Editor view (`?path=/Documents/Brief.docx`): opens that file directly
 *     in TipTap (Word) or Univer (Excel) for editing. Used when other parts
 *     of the portal deep-link into a specific file.
 */
export default async function OfficePage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { workspace: workspaceParam } = await params;
  const sp = await searchParams;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  if (!session?.user?.username) redirect("/login");

  const path = typeof sp.path === "string" ? sp.path : null;
  if (!path) {
    return (
      <OfficeHubClient
        workspaceId={workspace.id as WorkspaceId}
        workspaceName={workspace.name}
        accent={workspace.accent}
      />
    );
  }

  return (
    <OfficeEditorPage
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      path={path}
      accent={workspace.accent}
    />
  );
}
