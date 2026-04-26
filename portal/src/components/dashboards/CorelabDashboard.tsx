import { Stat } from "@/components/ui/Stat";
import { FeedItem } from "@/components/ui/FeedItem";

const TODAY_DE = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "long",
  year: "numeric",
}).format(new Date());

export function CorelabDashboard({
  firstName,
  accent,
}: {
  firstName: string;
  accent: string;
}) {
  const stats = [
    { value: "3", label: "Active PRs", tone: "info" as const },
    { value: "2", label: "Failing builds", tone: "warning" as const },
    { value: "1", label: "Deploys heute", tone: "success" as const },
    { value: "0", label: "Alerts", tone: "success" as const },
  ];

  const feed = [
    {
      time: "07:32",
      who: "Gitea CI",
      what: "kineo360/portal · main · pipeline #482 passed",
      kind: "ok" as const,
    },
    {
      time: "07:18",
      who: "Diana",
      what: "PR #28 'twenty-sso fix' bereit für Review",
      kind: "info" as const,
    },
    {
      time: "07:05",
      who: "Richard",
      what: "Branch 'feat/portal-shell' gepusht (12 commits)",
      kind: "info" as const,
    },
    {
      time: "06:48",
      who: "Hetzner",
      what: "Snapshot-Backup Medtheris1 abgeschlossen (3 GB)",
      kind: "ok" as const,
    },
    {
      time: "06:30",
      who: "Uptime Kuma",
      what: "chat.kineo360.work zurück online (Downtime 12s)",
      kind: "warn" as const,
    },
  ];

  const quickActions = [
    "Neue Notiz",
    "Deploy starten",
    "PR-Review öffnen",
    "Status-Page",
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Stat key={s.label} value={s.value} label={s.label} tone={s.tone} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4">
        <div className="flex flex-col gap-2.5">
          <h2 className="text-text-primary font-semibold text-sm">Heute</h2>
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
