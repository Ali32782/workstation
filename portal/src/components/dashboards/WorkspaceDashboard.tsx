import Link from "next/link";
import {
  Mail,
  Calendar,
  MessageSquare,
  Kanban,
  FolderOpen,
  Code2,
  Users,
  HeadphonesIcon,
  Megaphone,
  FileText,
  PenLine,
  Video,
  Lightbulb,
  ArrowUpRight,
  Brain,
} from "lucide-react";
import { LivePulse } from "@/components/dashboards/LivePulse";
import { ScraperRunCard } from "@/components/dashboards/ScraperRunCard";
import { FunnelOverviewCard } from "@/components/dashboards/FunnelOverviewCard";
import { UnifiedInboxCard } from "@/components/dashboards/UnifiedInboxCard";
import { MyIssuesTodayCard } from "@/components/dashboards/MyIssuesTodayCard";
import { ActiveCycleCard } from "@/components/dashboards/ActiveCycleCard";
import { MailFollowupsCard } from "@/components/dashboards/MailFollowupsCard";
import { MentionsFeedCard } from "@/components/dashboards/MentionsFeedCard";
import type { WorkspaceId } from "@/lib/workspaces";

const DATE_DE = new Intl.DateTimeFormat("de-DE", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());

function greetingForHour(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "Guten Morgen";
  if (h >= 11 && h < 18) return "Guten Tag";
  if (h >= 18 && h < 22) return "Guten Abend";
  return "Gute Nacht";
}

type ShortcutDef = {
  path: string;
  label: string;
  hint: string;
  Icon: typeof Mail;
};

const SHORTCUTS: Record<WorkspaceId, ShortcutDef[]> = {
  corehub: [
    { path: "/mail", label: "Mail", hint: "Posteingang & Team-Mail", Icon: Mail },
    { path: "/chat", label: "Chat", hint: "Kanäle & DMs", Icon: MessageSquare },
    { path: "/calendar", label: "Kalender", hint: "Termine & Slots", Icon: Calendar },
    { path: "/projects", label: "Projekte", hint: "Plane · Issues & Board", Icon: Kanban },
    { path: "/files", label: "Files", hint: "Nextcloud Datei-Station", Icon: FolderOpen },
    { path: "/apps/code", label: "Code", hint: "Gitea · Repositories & CI", Icon: Code2 },
    { path: "/ai-knowledge", label: "AI-Wissen", hint: "Firmen-Kontext für Antworten", Icon: Brain },
  ],
  medtheris: [
    { path: "/mail", label: "Mail", hint: "Sales & Praxis-Kommunikation", Icon: Mail },
    { path: "/calendar", label: "Kalender", hint: "Demos & Folgetermine", Icon: Calendar },
    { path: "/crm", label: "CRM", hint: "Twenty · Pipeline & Leads", Icon: Users },
    { path: "/helpdesk", label: "Helpdesk", hint: "Zammad · Tickets", Icon: HeadphonesIcon },
    { path: "/marketing", label: "Marketing", hint: "Mautic · Kampagnen", Icon: Megaphone },
    { path: "/projects", label: "Projekte", hint: "Plane · Delivery", Icon: Kanban },
    { path: "/office", label: "Office", hint: "Dokumente & Tabellen", Icon: FileText },
    { path: "/ai-knowledge", label: "AI-Wissen", hint: "Firmen-Kontext für Mail, Tickets, SMS", Icon: Brain },
  ],
  kineo: [
    { path: "/mail", label: "Mail", hint: "Group-Mailbox", Icon: Mail },
    { path: "/calendar", label: "Kalender", hint: "Investor- & Team-Termine", Icon: Calendar },
    { path: "/calls", label: "Calls", hint: "Video & Raumhistorie", Icon: Video },
    { path: "/projects", label: "Projekte", hint: "Plane · Initiativen", Icon: Kanban },
    { path: "/crm", label: "CRM", hint: "Twenty · Partner-Pipeline", Icon: Users },
    { path: "/sign", label: "Sign", hint: "Documenso · Verträge", Icon: PenLine },
    { path: "/office", label: "Office", hint: "Dokumente im Portal", Icon: FileText },
    { path: "/helpdesk", label: "Helpdesk", hint: "Interne & Vendor-Tickets", Icon: HeadphonesIcon },
    { path: "/ai-knowledge", label: "AI-Wissen", hint: "Firmen-Kontext für Antworten", Icon: Brain },
  ],
};

const TIPS: Record<WorkspaceId, string[]> = {
  corehub: [
    "Plane-Fälligkeiten siehst du oben im Pulse — Klick öffnet SSO in deinen Workspace.",
    "Builds und externe Erreichbarkeit prüfst du über Status (Sidebar) oder Uptime.",
    "Native Apps (Mail, Chat, …) laufen im Portal; Code/Gitea öffnet eingebettet oder im Tab.",
  ],
  medtheris: [
    "Neue Leads landen nach dem Scraper-Lauf im CRM — Prüfe die Twenty-Pipeline.",
    "Kundenanfragen bündelst du im Helpdesk; Magic-Links kannst du aus dem Ticket kopieren.",
    "Office-Hub: Word/Excel im Portal; Folien im OpenOffice-Editor über Nextcloud.",
  ],
  kineo: [
    "Strategie-Arbeit: Projekte für OKRs, CRM für Partner, Sign für dokumentierte Abschlüsse.",
    "Video-Calls und Historie findest du unter Calls; Kalender synchronisiert über CalDAV.",
    "Helpdesk ist für interne Ops & Vendor-Support — getrennt von MedTheris-Kunden-Tickets.",
  ],
};

export function WorkspaceDashboard({
  workspaceId,
  workspaceName,
  tagline,
  firstName,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  tagline: string;
  firstName: string;
  accent: string;
}) {
  const shortcuts = SHORTCUTS[workspaceId];
  const tips = TIPS[workspaceId];
  const showScraper = workspaceId === "corehub" || workspaceId === "medtheris";

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-quaternary mb-1"
            style={{ color: accent }}
          >
            {workspaceName}
          </p>
          <h1 className="text-text-primary text-xl sm:text-2xl font-semibold tracking-tight">
            {greetingForHour()}, {firstName}
          </h1>
          <p className="text-text-tertiary text-sm mt-1 max-w-2xl leading-relaxed">
            {tagline}
          </p>
        </div>
        <time
          dateTime={new Date().toISOString().slice(0, 10)}
          className="text-text-tertiary text-sm shrink-0 tabular-nums sm:text-right"
        >
          {DATE_DE}
        </time>
      </header>

      <LivePulse workspace={workspaceId} workspaceName={workspaceName} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UnifiedInboxCard workspaceId={workspaceId} accent={accent} />
        <MyIssuesTodayCard workspaceId={workspaceId} accent={accent} />
        <ActiveCycleCard workspaceId={workspaceId} accent={accent} />
        <MailFollowupsCard workspaceId={workspaceId} accent={accent} />
        <MentionsFeedCard workspaceId={workspaceId} accent={accent} />
      </div>

      <FunnelOverviewCard workspaceId={workspaceId} accent={accent} />

      {showScraper && <ScraperRunCard accent={accent} />}

      <section className="flex flex-col gap-2.5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-text-primary font-semibold text-sm">Schnellzugriff</h2>
          <span className="text-text-quaternary text-[11px] hidden sm:inline">
            Direkt in diesem Workspace
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
          {shortcuts.map(({ path, label, hint, Icon }) => {
            const href = `/${workspaceId}${path}`;
            return (
              <Link
                key={href}
                href={href}
                className="group rounded-xl border border-stroke-1 bg-bg-elevated p-4 flex gap-3 hover:border-stroke-2 hover:bg-bg-overlay/80 transition-colors"
              >
                <span
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ background: `${accent}18`, color: accent }}
                >
                  <Icon size={18} strokeWidth={1.75} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="text-[13px] font-semibold text-text-primary">
                      {label}
                    </span>
                    <ArrowUpRight
                      size={14}
                      className="text-text-quaternary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                    />
                  </div>
                  <p className="text-[11.5px] text-text-tertiary mt-0.5 leading-snug">
                    {hint}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-stroke-1 bg-bg-chrome/60 px-4 py-4 flex gap-3">
        <span
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}14`, color: accent }}
        >
          <Lightbulb size={16} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
          <h2 className="text-text-primary font-semibold text-sm mb-2">
            Kurz und sinnvoll
          </h2>
          <ul className="text-[12.5px] text-text-secondary space-y-2 leading-relaxed list-none">
            {tips.map((line, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-text-quaternary shrink-0">·</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
