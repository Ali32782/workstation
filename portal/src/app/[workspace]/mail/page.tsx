import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getWorkspace } from "@/lib/workspaces";
import { listFolders } from "@/lib/mail/imap";
import { resolveSessionMailbox } from "@/lib/mail/session-mailbox";
import { MailClient } from "@/components/mail/MailClient";
import type { MailFolder } from "@/lib/mail/types";

export const dynamic = "force-dynamic";

export default async function MailPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace: workspaceParam } = await params;
  const workspace = getWorkspace(workspaceParam);
  if (!workspace) notFound();

  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox) redirect("/login");

  let folders: MailFolder[] = [];
  let error: string | null = null;
  try {
    folders = await listFolders(mailbox);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-text-primary font-semibold text-lg">
            Postfach nicht erreichbar
          </h1>
          <p className="text-text-secondary text-sm">
            Das IMAP-Login für <span className="font-mono">{mailbox}</span>{" "}
            ist fehlgeschlagen. Eventuell wurde das Passwort noch nicht synchronisiert.
          </p>
          <pre className="text-text-tertiary text-xs whitespace-pre-wrap text-left bg-bg-elevated border border-stroke-1 rounded p-3">
            {error}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <MailClient
        initialFolders={folders}
        selfEmail={mailbox}
        selfName={session?.user?.name ?? undefined}
        workspaceId={workspace.id}
      />
    </div>
  );
}
