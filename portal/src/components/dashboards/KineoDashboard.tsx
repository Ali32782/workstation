import { FeedItem } from "@/components/ui/FeedItem";
import { LivePulse } from "@/components/dashboards/LivePulse";

const TODAY_DE = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "long",
  year: "numeric",
}).format(new Date());

export function KineoDashboard({
  firstName,
  accent,
}: {
  firstName: string;
  accent: string;
}) {
  const feed = [
    {
      time: "08:15",
      who: "Plane",
      what: "Initiative 'Q3 Hiring Plan' · 4 neue Sub-Tasks",
      kind: "info" as const,
    },
    {
      time: "07:45",
      who: "Calendar",
      what: "Heute 14:00 — Investor-Call mit Bruno",
      kind: "info" as const,
    },
    {
      time: "07:32",
      who: "Zammad Kineo",
      what: "Vendor-Ticket #41 'Hetzner Quota Increase' resolved",
      kind: "ok" as const,
    },
    {
      time: "Gestern",
      who: "Files",
      what: "Diana hat 'Pitch-Deck v3.pptx' aktualisiert",
      kind: "info" as const,
    },
    {
      time: "Gestern",
      who: "Twenty CRM",
      what: "Neuer Lead: Praxis Sutter (Bern) · Demo angefragt",
      kind: "info" as const,
    },
  ];

  const quickActions = [
    "Neue Initiative",
    "1:1 vorbereiten",
    "Strategie-Doc öffnen",
    "Investor-Update entwerfen",
  ];

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-3">
        <h1 className="text-text-primary text-xl font-semibold">
          Guten Morgen, {firstName}
        </h1>
        <div className="flex-1" />
        <span className="text-text-tertiary text-sm">{TODAY_DE}</span>
      </div>

      <LivePulse workspace="kineo" />

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <h2 className="text-text-primary font-semibold text-sm">Aktivität</h2>
            <span className="text-text-tertiary text-[11px] uppercase tracking-wide">
              Beispieldaten
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {feed.map((f, i) => (
              <FeedItem key={i} {...f} accent={accent} />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <h2 className="text-text-primary font-semibold text-sm">Quick Actions</h2>
          <div className="flex flex-col gap-1.5">
            {quickActions.map((a) => (
              <button
                key={a}
                className="flex items-center gap-2 px-3 py-2 rounded-md border border-stroke-1 bg-bg-elevated text-text-secondary text-sm text-left hover:border-stroke-2 hover:text-text-primary transition-colors"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: accent }}
                />
                {a}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
