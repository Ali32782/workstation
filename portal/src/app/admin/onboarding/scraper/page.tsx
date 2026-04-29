import Link from "next/link";
import { ArrowRight, Info, Inbox } from "lucide-react";

import { ScraperPanel } from "./ScraperPanel";

export const dynamic = "force-dynamic";

export default function ScraperPage() {
  const configured = !!(
    process.env.SCRAPER_RUNNER_URL && process.env.SCRAPER_RUNNER_TOKEN
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-text-primary text-2xl font-semibold mb-1">
          Lead-Scraper
        </h1>
        <p className="text-text-tertiary text-sm">
          Stösst die MedTheris Physio-Praxis-Pipeline an: Discovery via Google
          Maps → Website-Enrichment (Playwright) → Booking-System-Erkennung →
          LLM-Extraktion → Twenty CRM. Pro Run wird genau eine Subprozess-
          Pipeline ausgeführt; ein zweiter Klick wartet, bis der erste Lauf
          fertig ist.
        </p>
      </div>

      {!configured && (
        <div className="rounded-md border border-info/30 bg-info/5 p-3 text-sm flex items-start gap-2 text-info">
          <Info size={14} className="mt-0.5 shrink-0" />
          <div className="text-text-secondary">
            <span className="text-info font-medium">
              Scraper-Runner nicht konfiguriert.
            </span>{" "}
            Setze <code className="text-text-primary">SCRAPER_RUNNER_URL</code>{" "}
            und <code className="text-text-primary">SCRAPER_RUNNER_TOKEN</code>{" "}
            in der Portal-Env, deploye den{" "}
            <code className="text-text-primary">medtheris-scraper</code>-
            Container (siehe{" "}
            <code className="text-text-primary">docs/scraper-runner.md</code>),
            dann wird dieses Panel scharf geschaltet.
          </div>
        </div>
      )}

      <ScraperPanel disabled={!configured} />

      <div className="rounded-md border border-stroke-1 bg-bg-chrome p-4 flex items-start gap-3">
        <div className="w-8 h-8 rounded-md bg-bg-elevated flex items-center justify-center text-text-tertiary shrink-0">
          <Inbox size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-text-primary text-sm font-medium">
            Frische Leads prüfen?
          </div>
          <p className="text-text-tertiary text-xs mt-0.5">
            Sobald der Scraper neue Companies + Opportunities (stage=NEW) in
            Twenty schreibt, landen sie in der Lead-Inbox. Dort lassen sie
            sich pro Klick übernehmen (Mautic-Segment) oder verwerfen.
          </p>
        </div>
        <Link
          href="/admin/onboarding/leads"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 bg-bg-base text-text-secondary text-xs hover:text-text-primary"
        >
          Zur Lead-Inbox
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}
