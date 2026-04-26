import { notFound, redirect } from "next/navigation";
import { getWorkspace, type WorkspaceId } from "@/lib/workspaces";
import { listCalls } from "@/lib/calls/store";
import { resolveCallsSession } from "@/lib/calls/session";
import { CallsClient } from "@/components/calls/CallsClient";

export const dynamic = "force-dynamic";

export default async function CallsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const r = await resolveCallsSession(workspace.id);
  if (r.kind === "unauthenticated") {
    redirect(`/login?callbackUrl=/${workspace.id}/calls`);
  }
  if (r.kind === "forbidden") {
    return (
      <div className="p-8 max-w-md mx-auto text-center">
        <h1 className="text-lg font-semibold mb-2">Kein Zugriff</h1>
        <p className="text-sm text-text-secondary">{r.message}</p>
      </div>
    );
  }

  let calls = [] as Awaited<ReturnType<typeof listCalls>>;
  try {
    calls = await listCalls(workspace.id, { limit: 100 });
  } catch (e) {
    console.warn("[CallsPage] initial listCalls failed:", e);
  }

  return (
    <CallsClient
      workspaceId={workspace.id as WorkspaceId}
      workspaceName={workspace.name}
      accent={workspace.accent}
      initial={{ calls }}
      meEmail={r.session.email}
      meName={r.session.fullName || r.session.email}
    />
  );
}
