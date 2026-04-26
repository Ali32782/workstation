import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { fetchHealthSummary } from "@/lib/health";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { TopBar } from "@/components/TopBar";
import { MobileShell } from "@/components/MobileShell";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  const isAdmin = isAdminUsername(session?.user?.username);
  const health = await fetchHealthSummary();

  return (
    <div className="min-h-screen flex flex-col bg-bg-base">
      <TopBar
        workspace={workspace}
        user={{
          name: session?.user?.name ?? "Unbekannt",
          username: session?.user?.username,
          email: session?.user?.email ?? undefined,
        }}
        isAdmin={isAdmin}
        groups={session?.groups ?? []}
      />
      <MobileShell
        workspaceId={workspace.id as WorkspaceId}
        isAdmin={isAdmin}
        health={health}
      >
        {children}
      </MobileShell>
    </div>
  );
}
