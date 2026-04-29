import { fetchHealthSummary } from "@/lib/health";

export const dynamic = "force-dynamic";
export const revalidate = 30;

/**
 * Public status page at `/p/status` (no login required).
 *
 * Lightweight wrapper over the Uptime Kuma status board — gives our
 * customers a clean, branded view they can bookmark, while still
 * benefitting from Uptime Kuma's actual probe network. The deep-link
 * "vollständige Übersicht öffnen" jumps to status.medtheris.kineo360.work
 * for monitor-level detail.
 */
export default async function PublicStatusPage() {
  const summary = await fetchHealthSummary();

  const overall: "ok" | "degraded" | "down" | "unknown" = summary
    ? summary.down === 0
      ? "ok"
      : summary.down >= summary.total
        ? "down"
        : "degraded"
    : "unknown";

  const palette = {
    ok: { bg: "bg-emerald-500", text: "text-emerald-50", label: "Alle Systeme online" },
    degraded: { bg: "bg-amber-500", text: "text-amber-50", label: "Eingeschränkt" },
    down: { bg: "bg-red-500", text: "text-red-50", label: "Störung" },
    unknown: { bg: "bg-slate-500", text: "text-slate-50", label: "Status unbekannt" },
  };
  const p = palette[overall];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-semibold">MedTheris · Status</h1>
              <p className="text-sm text-slate-400 mt-1">
                Live-Status der Plattform-Dienste
              </p>
            </div>
            <span
              className={`px-3 py-1.5 rounded-full text-sm font-semibold ${p.bg} ${p.text}`}
            >
              {p.label}
            </span>
          </div>

          {summary ? (
            <>
              <div className="grid grid-cols-3 gap-3 mb-6">
                <Stat label="Online" value={summary.up} accent="text-emerald-400" />
                <Stat label="Offline" value={summary.down} accent="text-red-400" />
                <Stat label="Insgesamt" value={summary.total} accent="text-slate-300" />
              </div>
              <p className="text-xs text-slate-500">
                Zuletzt aktualisiert:{" "}
                {new Date(summary.fetchedAt).toLocaleString("de-CH")}
              </p>
              <a
                href={summary.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-sky-400 hover:text-sky-300"
              >
                Vollständige Übersicht öffnen →
              </a>
            </>
          ) : (
            <p className="text-sm text-slate-400">
              Status-Daten konnten nicht geladen werden. Bitte versuche es in
              ein paar Sekunden erneut, oder besuche{" "}
              <a
                href="https://status.medtheris.kineo360.work"
                className="text-sky-400 hover:text-sky-300"
              >
                status.medtheris.kineo360.work
              </a>
              .
            </p>
          )}
        </div>
        <p className="mt-6 text-center text-xs text-slate-500">
          Bei Fragen:{" "}
          <a
            href="mailto:support@medtheris.com"
            className="text-slate-400 hover:text-slate-200"
          >
            support@medtheris.com
          </a>
        </p>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent: string;
}) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950 p-3">
      <div className={`text-2xl font-bold ${accent}`}>{value}</div>
      <div className="text-xs text-slate-400 uppercase tracking-wide mt-0.5">
        {label}
      </div>
    </div>
  );
}
