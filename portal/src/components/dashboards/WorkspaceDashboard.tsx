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
import { DashboardClock } from "@/components/dashboards/DashboardClock";
import { ScraperRunCard } from "@/components/dashboards/ScraperRunCard";
import { FunnelOverviewCard } from "@/components/dashboards/FunnelOverviewCard";
import { UnifiedInboxCard } from "@/components/dashboards/UnifiedInboxCard";
import { MyIssuesTodayCard } from "@/components/dashboards/MyIssuesTodayCard";
import { ActiveCycleCard } from "@/components/dashboards/ActiveCycleCard";
import { MailFollowupsCard } from "@/components/dashboards/MailFollowupsCard";
import { MentionsFeedCard } from "@/components/dashboards/MentionsFeedCard";
import type { WorkspaceId } from "@/lib/workspaces";
import { localeFromCookies } from "@/lib/i18n/server-locale";
import { localeTag, tFor, type Messages } from "@/lib/i18n/messages";

type HubKey = "communication" | "office" | "project";

type ShortcutSpec = {
  path: string;
  labelKey: keyof Messages;
  hintKey: keyof Messages;
  Icon: typeof Mail;
};

type HubSpec = {
  key: HubKey;
  blurbKey: keyof Messages;
  items: ShortcutSpec[];
};

function hubTitleKey(k: HubKey): keyof Messages {
  switch (k) {
    case "communication":
      return "dash.hub.communication.title";
    case "office":
      return "dash.hub.office.title";
    case "project":
      return "dash.hub.project.title";
  }
}

function greetingKey(): keyof Messages {
  const h = new Date().getHours();
  if (h >= 5 && h < 11) return "dash.greeting.morning";
  if (h >= 11 && h < 18) return "dash.greeting.day";
  if (h >= 18 && h < 22) return "dash.greeting.evening";
  return "dash.greeting.night";
}

const HUB_LAYOUT: Record<WorkspaceId, HubSpec[]> = {
  corehub: [
    {
      key: "communication",
      blurbKey: "dash.corehub.communication.blurb",
      items: [
        { path: "/mail", labelKey: "nav.mail", hintKey: "dash.corehub.hint.mail", Icon: Mail },
        { path: "/chat", labelKey: "nav.chat", hintKey: "dash.corehub.hint.chat", Icon: MessageSquare },
        { path: "/calendar", labelKey: "nav.calendar", hintKey: "dash.corehub.hint.calendar", Icon: Calendar },
        { path: "/calls", labelKey: "nav.calls", hintKey: "dash.corehub.hint.calls", Icon: Video },
      ],
    },
    {
      key: "office",
      blurbKey: "dash.corehub.office.blurb",
      items: [
        { path: "/files", labelKey: "nav.files", hintKey: "dash.corehub.hint.files", Icon: FolderOpen },
        { path: "/office", labelKey: "nav.office", hintKey: "dash.corehub.hint.office", Icon: FileText },
        { path: "/sign", labelKey: "nav.sign", hintKey: "dash.corehub.hint.sign", Icon: PenLine },
        { path: "/crm", labelKey: "nav.crm", hintKey: "dash.corehub.hint.crm", Icon: Users },
        {
          path: "/ai-knowledge",
          labelKey: "nav.aiKnowledge",
          hintKey: "dash.corehub.hint.aiKnowledge",
          Icon: Brain,
        },
      ],
    },
    {
      key: "project",
      blurbKey: "dash.corehub.project.blurb",
      items: [
        { path: "/projects", labelKey: "nav.projects", hintKey: "dash.corehub.hint.projects", Icon: Kanban },
        { path: "/apps/code", labelKey: "nav.code", hintKey: "dash.corehub.hint.code", Icon: Code2 },
      ],
    },
  ],
  medtheris: [
    {
      key: "communication",
      blurbKey: "dash.medtheris.communication.blurb",
      items: [
        { path: "/mail", labelKey: "nav.mail", hintKey: "dash.medtheris.hint.mail", Icon: Mail },
        { path: "/chat", labelKey: "nav.chat", hintKey: "dash.medtheris.hint.chat", Icon: MessageSquare },
        { path: "/calendar", labelKey: "nav.calendar", hintKey: "dash.medtheris.hint.calendar", Icon: Calendar },
        { path: "/calls", labelKey: "nav.calls", hintKey: "dash.medtheris.hint.calls", Icon: Video },
        {
          path: "/helpdesk",
          labelKey: "nav.helpdesk",
          hintKey: "dash.medtheris.hint.helpdesk",
          Icon: HeadphonesIcon,
        },
      ],
    },
    {
      key: "office",
      blurbKey: "dash.medtheris.office.blurb",
      items: [
        { path: "/files", labelKey: "nav.files", hintKey: "dash.medtheris.hint.files", Icon: FolderOpen },
        { path: "/office", labelKey: "nav.office", hintKey: "dash.medtheris.hint.office", Icon: FileText },
        { path: "/crm", labelKey: "nav.crm", hintKey: "dash.medtheris.hint.crm", Icon: Users },
        { path: "/marketing", labelKey: "nav.marketing", hintKey: "dash.medtheris.hint.marketing", Icon: Megaphone },
        { path: "/sign", labelKey: "nav.sign", hintKey: "dash.medtheris.hint.sign", Icon: PenLine },
        {
          path: "/ai-knowledge",
          labelKey: "nav.aiKnowledge",
          hintKey: "dash.medtheris.hint.aiKnowledge",
          Icon: Brain,
        },
      ],
    },
    {
      key: "project",
      blurbKey: "dash.medtheris.project.blurb",
      items: [
        { path: "/projects", labelKey: "nav.projects", hintKey: "dash.medtheris.hint.projects", Icon: Kanban },
      ],
    },
  ],
  kineo: [
    {
      key: "communication",
      blurbKey: "dash.kineo.communication.blurb",
      items: [
        { path: "/mail", labelKey: "nav.mail", hintKey: "dash.kineo.hint.mail", Icon: Mail },
        { path: "/chat", labelKey: "nav.chat", hintKey: "dash.kineo.hint.chat", Icon: MessageSquare },
        { path: "/calls", labelKey: "nav.calls", hintKey: "dash.kineo.hint.calls", Icon: Video },
        {
          path: "/calendar",
          labelKey: "nav.calendar",
          hintKey: "dash.kineo.hint.calendar",
          Icon: Calendar,
        },
        {
          path: "/helpdesk",
          labelKey: "nav.helpdesk",
          hintKey: "dash.kineo.hint.helpdesk",
          Icon: HeadphonesIcon,
        },
      ],
    },
    {
      key: "office",
      blurbKey: "dash.kineo.office.blurb",
      items: [
        { path: "/files", labelKey: "nav.files", hintKey: "dash.kineo.hint.files", Icon: FolderOpen },
        { path: "/office", labelKey: "nav.office", hintKey: "dash.kineo.hint.office", Icon: FileText },
        { path: "/crm", labelKey: "nav.crm", hintKey: "dash.kineo.hint.crm", Icon: Users },
        { path: "/sign", labelKey: "nav.sign", hintKey: "dash.kineo.hint.sign", Icon: PenLine },
        {
          path: "/ai-knowledge",
          labelKey: "nav.aiKnowledge",
          hintKey: "dash.kineo.hint.aiKnowledge",
          Icon: Brain,
        },
      ],
    },
    {
      key: "project",
      blurbKey: "dash.kineo.project.blurb",
      items: [
        { path: "/projects", labelKey: "nav.projects", hintKey: "dash.kineo.hint.projects", Icon: Kanban },
      ],
    },
  ],
};

const TIP_KEYS: Record<WorkspaceId, (keyof Messages)[]> = {
  corehub: ["dash.corehub.tip1", "dash.corehub.tip2", "dash.corehub.tip3"],
  medtheris: ["dash.medtheris.tip1", "dash.medtheris.tip2", "dash.medtheris.tip3"],
  kineo: ["dash.kineo.tip1", "dash.kineo.tip2", "dash.kineo.tip3"],
};

export async function WorkspaceDashboard({
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
  const locale = await localeFromCookies();
  const tag = localeTag(locale);
  const dateLong = new Intl.DateTimeFormat(tag, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  const hubBlocks = HUB_LAYOUT[workspaceId];
  const tipKeys = TIP_KEYS[workspaceId];
  const showScraper = workspaceId === "corehub" || workspaceId === "medtheris";

  return (
    <div className="flex flex-col gap-6 min-w-0 overflow-x-hidden">
      <header className="flex flex-col sm:flex-row sm:items-end gap-2 sm:gap-4">
        <div className="min-w-0 flex-1">
          <p
            className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-quaternary mb-1"
            style={{ color: accent }}
          >
            {workspaceName}
          </p>
          <h1 className="text-text-primary text-xl sm:text-2xl font-semibold tracking-tight">
            {tFor(locale, greetingKey())}, {firstName}
          </h1>
          <p className="text-text-tertiary text-sm mt-1 max-w-2xl leading-relaxed">
            {tagline}
          </p>
        </div>
        <div className="flex flex-col items-start sm:items-end gap-0.5 shrink-0 tabular-nums sm:text-right">
          <DashboardClock className="text-text-primary text-base sm:text-lg font-semibold leading-tight" />
          <time
            dateTime={new Date().toISOString().slice(0, 10)}
            className="text-text-tertiary text-[12px] sm:text-sm"
          >
            {dateLong}
          </time>
        </div>
      </header>

      <LivePulse workspace={workspaceId} workspaceName={workspaceName} locale={locale} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UnifiedInboxCard workspaceId={workspaceId} accent={accent} />
        <MyIssuesTodayCard workspaceId={workspaceId} accent={accent} />
        <ActiveCycleCard workspaceId={workspaceId} accent={accent} />
        <MailFollowupsCard workspaceId={workspaceId} accent={accent} />
        <MentionsFeedCard workspaceId={workspaceId} accent={accent} />
      </div>

      <FunnelOverviewCard workspaceId={workspaceId} accent={accent} />

      {showScraper && <ScraperRunCard accent={accent} />}

      <section className="flex flex-col gap-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-text-primary font-semibold text-sm">{tFor(locale, "dash.quick.title")}</h2>
          <span className="text-text-quaternary text-[11px] hidden sm:inline">
            {tFor(locale, "dash.quick.subtitle")}
          </span>
        </div>
        <div className="flex flex-col gap-8">
          {hubBlocks.map((hub) => (
            <div key={hub.key} className="flex flex-col gap-3">
              <div className="px-0.5 border-l-2 pl-3" style={{ borderColor: accent }}>
                <h3 className="text-text-primary text-[13px] font-semibold tracking-tight">
                  {tFor(locale, hubTitleKey(hub.key))}
                </h3>
                <p className="text-text-tertiary text-[11.5px] mt-0.5 leading-snug max-w-2xl">
                  {tFor(locale, hub.blurbKey)}
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {hub.items.map(({ path, labelKey, hintKey, Icon }) => {
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
                            {tFor(locale, labelKey)}
                          </span>
                          <ArrowUpRight
                            size={14}
                            className="text-text-quaternary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
                          />
                        </div>
                        <p className="text-[11.5px] text-text-tertiary mt-0.5 leading-snug">
                          {tFor(locale, hintKey)}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
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
            {tFor(locale, "dash.tips.heading")}
          </h2>
          <ul className="text-[12.5px] text-text-secondary space-y-2 leading-relaxed list-none">
            {tipKeys.map((lineKey) => (
              <li key={lineKey} className="flex gap-2">
                <span className="text-text-quaternary shrink-0">·</span>
                <span>{tFor(locale, lineKey)}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
