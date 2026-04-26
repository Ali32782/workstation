import { Info } from "lucide-react";

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
    </div>
  );
}
