import { AlertTriangle } from "lucide-react";

import { listClientTenants } from "../client-actions";
import { ClientsTable } from "./ClientsTable";
import { CreateClientForm } from "./CreateClientForm";

export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const snapshot = await listClientTenants();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold mb-1">
          Clients
        </h1>
        <p className="text-text-tertiary text-sm">
          Externe Praxis-Tenants. Jeder Client bekommt einen eigenen Keycloak-Realm,
          eigene Nextcloud-Instanz, eigene Subdomain (<code className="text-text-secondary text-xs">files.&lt;slug&gt;.kineo360.work</code>) und einen
          eigenen Chat-Workspace.
        </p>
      </div>

      {snapshot.errors.length > 0 && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm">
          <div className="flex items-start gap-2 text-warning">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            <div className="flex-1">
              <div className="font-medium mb-1">
                {snapshot.errors.length} Warnung(en):
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

      <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
        <div className="px-5 py-4 border-b border-stroke-1">
          <h2 className="text-text-primary text-base font-semibold">
            Neuen Client anlegen
          </h2>
          <p className="text-text-tertiary text-xs mt-0.5">
            Provisioning erfolgt via{" "}
            <code className="text-text-secondary">scripts/onboard-practice.sh</code>{" "}
            auf dem Server (Realm + DB + Nextcloud + DNS-Reminder). Dauer ~2-5 Min.
          </p>
        </div>
        <div className="p-5">
          <CreateClientForm />
        </div>
      </section>

      <section className="rounded-lg border border-stroke-1 bg-bg-chrome">
        <div className="px-5 py-4 border-b border-stroke-1 flex items-baseline justify-between">
          <h2 className="text-text-primary text-base font-semibold">
            Bestehende Clients
          </h2>
          <span className="text-text-tertiary text-xs">
            {snapshot.tenants.length} Tenant
            {snapshot.tenants.length === 1 ? "" : "s"}
          </span>
        </div>
        <ClientsTable tenants={snapshot.tenants} />
      </section>
    </div>
  );
}
