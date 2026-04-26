import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { OfficeEditorPage } from "@/components/office/OfficeEditorPage";

export const dynamic = "force-dynamic";

/**
 * Office Hub editor entry point. Path query parameter:
 *   /<workspace>/office?path=/Documents/Brief.docx
 * The editor pulls the file via `/api/office/load`, lets the user edit it
 * in TipTap (Word) or Univer (Excel), then PUTs the result back via
 * `/api/office/save`. PDF export goes through `/api/office/export-pdf`.
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
      <div className="h-full flex items-center justify-center p-8 text-text-tertiary text-[13px]">
        Keine Datei ausgewählt. Öffne eine Datei aus der Datei-Station.
      </div>
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
