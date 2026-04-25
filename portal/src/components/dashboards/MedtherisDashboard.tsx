import { FeedItem } from "@/components/ui/FeedItem";
import { LivePulse } from "@/components/dashboards/LivePulse";

const TODAY_DE = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "long",
  year: "numeric",
}).format(new Date());

export function MedtherisDashboard({
  firstName,
  accent,
}: {
  firstName: string;
  accent: string;
}) {
  const feed = [
    {
      time: "07:45",
      who: "Migadu",
      what: "Neue Mail von dr.weber@praxis-weber.de · 'Demo-Termin'",
      kind: "info" as const,
    },
    {
      time: "07:22",
      who: "Zammad",
      what: "Ticket #142 'Frage zu Abrechnung' geschlossen",
      kind: "ok" as const,
    },
    {
      time: "07:00",
      who: "Twenty CRM",
      what: "Lead 'Praxis Müller' in Stage 'Demo' verschoben",
      kind: "info" as const,
    },
    {
      time: "06:45",
      who: "Kalender",
      what: "Demo-Termin um 14:00 mit Praxis Schmidt",
      kind: "info" as const,
    },
    {
      time: "06:30",
      who: "Ali",
      what: "Vertragsentwurf für Praxis Becker versendet",
      kind: "ok" as const,
    },
  ];

  const quickActions = [
    "Neuen Lead anlegen",
    "Ticket öffnen",
    "Demo planen",
    "Angebot erstellen",
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

      <LivePulse workspace="medtheris" />

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
