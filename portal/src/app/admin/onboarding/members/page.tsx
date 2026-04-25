import { AlertTriangle, Info } from "lucide-react";

import { loadMembers } from "../actions";
import { TEAM_LIST } from "@/lib/onboarding-config";
import { CreateMemberForm } from "./CreateMemberForm";
import { MembersTable } from "./MembersTable";

export const dynamic = "force-dynamic";

export default async function MembersPage() {
  const snapshot = await loadMembers();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold mb-1">
          Mitglieder
        </h1>
        <p className="text-text-tertiary text-sm">
          Eine Identität in Keycloak (Realm <code className="text-text-primary">main</code>),
          mit Sichtbarkeit für die gewählten Workspaces (Group-Membership) und
          optionaler Migadu-Mailbox je Workspace-Domain.
        </p>
      </div>

      {snapshot.errors.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <div className="flex items-start gap-2 text-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium mb-1">
                {snapshot.errors.length} Warnung(en) beim Laden:
              </div>
              <ul className="text-text-secondary list-disc pl-5 space-y-0.5">
                {snapshot.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {!snapshot.migaduConfigured && (
        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm flex items-start gap-2 text-info">
          <Info size={14} className="mt-0.5 shrink-0" />
          <div className="text-text-secondary">
            <span className="text-info font-medium">Migadu API nicht konfiguriert.</span>{" "}
            Mailbox-Spalte zeigt &laquo;?&raquo; und Mailbox-Auto-Provisioning bleibt deaktiviert.
            Setze <code className="text-text-primary">MIGADU_ADMIN_USER</code> + <code className="text-text-primary">MIGADU_API_KEY</code> in der Portal-.env, um Mailboxen automatisch anzulegen.
          </div>
        </div>
      )}

      <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
        <div className="px-5 py-4 border-b border-stroke-1">
          <h2 className="text-text-primary text-base font-semibold">
            Neues Mitglied anlegen
          </h2>
          <p className="text-text-tertiary text-xs mt-0.5">
            Wählt Workspaces, in denen ein Account entstehen soll. Pro Workspace
            wird zusätzlich automatisch eine Mailbox angelegt (sofern aktiviert).
          </p>
        </div>
        <div className="p-5">
          <CreateMemberForm migaduConfigured={snapshot.migaduConfigured} />
        </div>
      </section>

      <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
        <div className="px-5 py-4 border-b border-stroke-1 flex items-baseline justify-between">
          <h2 className="text-text-primary text-base font-semibold">
            Bestehende Mitglieder
          </h2>
          <span className="text-text-tertiary text-xs">
            {snapshot.members.length} User · {TEAM_LIST.length} Workspaces
          </span>
        </div>
        <MembersTable members={snapshot.members} />
      </section>
    </div>
  );
}
