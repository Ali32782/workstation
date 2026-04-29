import type { Metadata } from "next";
import { LeadForm } from "./LeadForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kontakt",
  robots: { index: false, follow: false },
};

/**
 * Minimal public lead landing at `/p/lead` (no login). Submits via Server
 * Action → `submitPublicLead` (Twenty + optional attribution). Configure
 * `PUBLIC_LEAD_DEFAULT_WORKSPACE` and Twenty tenant for the target workspace.
 */
export default function PublicLeadPage() {
  const defaultWorkspace =
    process.env.PUBLIC_LEAD_DEFAULT_WORKSPACE?.trim() ?? "";

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
        <h1 className="text-xl font-semibold text-white mb-1">Kontakt aufnehmen</h1>
        <p className="text-[13px] text-slate-400 mb-6 leading-relaxed">
          Wir melden uns zeitnah. Mit dem Absenden willigen Sie ein, dass wir
          Ihre Angaben zur Bearbeitung der Anfrage verwenden.
        </p>
        <LeadForm defaultWorkspace={defaultWorkspace} />
      </div>
    </main>
  );
}
