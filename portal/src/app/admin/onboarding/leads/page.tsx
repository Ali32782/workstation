import { Info } from "lucide-react";
import { configuredTwentyTenants, hasTwentyTenant } from "@/lib/crm/config";
import { isMauticConfigured } from "@/lib/marketing/mautic";
import { LeadInboxClient } from "./LeadInboxClient";

export const dynamic = "force-dynamic";

/**
 * Lead-Inbox — admin-only review queue for fresh Twenty opportunities
 * (stage=NEW). Default source is the Google-Maps scraper; operators can switch
 * to source=web-form (embeddable lead API). Approve pushes company people into
 * a Mautic segment + advances opportunity to QUALIFIED; Reject sets LOST.
 */
export default function LeadsPage() {
  const tenants = configuredTwentyTenants();
  const defaultWs = tenants.includes("medtheris")
    ? "medtheris"
    : tenants[0] ?? null;
  const defaultSegmentIdRaw = process.env.MAUTIC_DEFAULT_SCRAPER_SEGMENT_ID;
  const defaultSegmentId = defaultSegmentIdRaw ? Number(defaultSegmentIdRaw) : null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold mb-1">
          Lead-Inbox
        </h1>
        <p className="text-text-tertiary text-sm">
          Neue Opportunities (stage=NEW): Standard-Quelle ist der Google-Maps-
          Scraper; per Dropdown auch{" "}
          <strong className="text-text-secondary">Web-Formular</strong>{" "}
          (<code className="text-text-primary">source=web-form</code>). Übernehmen
          schiebt die Company-Personen in das gewählte Mautic-Segment und setzt die
          Opportunity auf QUALIFIED. Verwerfen setzt sie auf LOST.
        </p>
      </div>

      {!defaultWs && (
        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-info" />
          <div className="text-text-secondary">
            <span className="text-info font-medium">
              Kein Twenty-Tenant konfiguriert.
            </span>{" "}
            Setze <code className="text-text-primary">TWENTY_WORKSPACE_MEDTHERIS_ID</code>{" "}
            und <code className="text-text-primary">TWENTY_WORKSPACE_MEDTHERIS_TOKEN</code>
            {" "}in der Portal-Env, damit die Inbox Daten ziehen kann.
          </div>
        </div>
      )}

      {defaultWs && !isMauticConfigured() && (
        <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-sm flex items-start gap-2">
          <Info size={14} className="mt-0.5 shrink-0 text-warning" />
          <div className="text-text-secondary">
            <span className="text-warning font-medium">
              Mautic nicht konfiguriert.
            </span>{" "}
            Übernehmen schlägt fehl, solange{" "}
            <code className="text-text-primary">MAUTIC_API_USERNAME</code> und
            {" "}<code className="text-text-primary">MAUTIC_API_TOKEN</code>
            {" "}fehlen. Verwerfen geht.
          </div>
        </div>
      )}

      {defaultWs && (
        <LeadInboxClient
          tenants={tenants.filter((t) => hasTwentyTenant(t))}
          defaultWs={defaultWs}
          defaultSegmentId={defaultSegmentId}
        />
      )}
    </div>
  );
}
