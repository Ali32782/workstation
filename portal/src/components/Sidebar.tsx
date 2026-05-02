"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import {
  SECTIONS,
  resolveWorkspace,
  type WorkspaceId,
  type AppSection,
  type App,
} from "@/lib/workspaces";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocale, useT } from "./LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";

const SECTION_LABELS: Record<AppSection, keyof Messages> = {
  "Übersicht": "section.overview",
  "Kommunikation": "section.communication",
  "Office-Hub": "section.officeHub",
  "Projekt-Hub": "section.projectHub",
  "System": "section.system",
};

const APP_LABELS: Record<string, keyof Messages> = {
  dashboard: "nav.dashboard",
  mail: "nav.mail",
  chat: "nav.chat",
  calendar: "nav.calendar",
  calls: "nav.calls",
  files: "nav.files",
  office: "nav.office",
  crm: "nav.crm",
  helpdesk: "nav.helpdesk",
  marketing: "nav.marketing",
  projects: "nav.projects",
  sign: "nav.sign",
  code: "nav.code",
  status: "nav.status",
  identity: "nav.identity",
  proxy: "nav.proxy",
  "gap-report": "nav.gapReport",
  "ops-dashboard": "nav.opsDashboard",
  admin: "nav.admin",
  onboarding: "nav.onboarding",
  aiKnowledge: "nav.aiKnowledge",
};

export function Sidebar({
  workspaceId,
  isAdmin,
  health,
}: {
  workspaceId: WorkspaceId;
  isAdmin?: boolean;
  health?: HealthSummary;
}) {
  const workspace = resolveWorkspace(workspaceId);
  const pathname = usePathname();
  const t = useT();

  const grouped = useMemo(() => {
    const map = new Map<AppSection, App[]>();
    for (const sec of SECTIONS) map.set(sec, []);
    for (const app of workspace.apps) {
      if (app.adminOnly && !isAdmin) continue;
      map.get(app.section)?.push(app);
    }
    return map;
  }, [workspace, isAdmin]);

  return (
    <nav className="w-64 shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
      <div
        className="relative px-4 py-5 border-b border-stroke-1 flex items-center gap-3 overflow-hidden"
      >
        <div
          aria-hidden
          className="absolute inset-0 opacity-[0.18] pointer-events-none"
          style={{
            background: `radial-gradient(180px 80px at 0% 0%, ${workspace.accent}, transparent 70%)`,
          }}
        />
        <div className="relative shrink-0">
          <span
            aria-hidden
            className="absolute inset-0 rounded-lg blur-md opacity-50"
            style={{ background: workspace.accent }}
          />
          <div
            className="relative w-11 h-11 rounded-lg flex items-center justify-center"
            style={{
              background: `linear-gradient(140deg, ${workspace.accent}33, ${workspace.accent}10)`,
              boxShadow: `inset 0 0 0 1px ${workspace.accent}55`,
            }}
          >
            <Image
              src={workspace.brandLogo}
              alt={workspace.name}
              width={28}
              height={28}
              priority
            />
          </div>
        </div>
        <div className="relative flex flex-col leading-tight min-w-0">
          <span className="text-text-primary text-[15px] font-semibold truncate tracking-tight">
            {workspace.name}
          </span>
          <span className="text-text-tertiary text-[11px] truncate">
            {workspace.tagline}
          </span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto py-3">
        {SECTIONS.map((section) => {
          const apps = grouped.get(section) ?? [];
          if (apps.length === 0) return null;
          return (
            <div key={section} className="mb-3">
              <div className="px-4 pt-2 pb-1.5">
                <span className="text-text-quaternary text-[10px] font-semibold uppercase tracking-[0.14em]">
                  {t(SECTION_LABELS[section] ?? "section.overview", section)}
                </span>
              </div>
              <ul className="flex flex-col gap-px px-2">
                {apps.map((app) => (
                  <SidebarItem
                    key={app.id}
                    app={app}
                    workspaceId={workspaceId}
                    accent={workspace.accent}
                    pathname={pathname}
                    label={
                      APP_LABELS[app.id]
                        ? t(APP_LABELS[app.id], app.name)
                        : app.name
                    }
                  />
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      <div className="border-t border-stroke-1 px-3 py-2.5">
        <HealthFooter health={health} />
      </div>
    </nav>
  );
}

export type HealthSummary = {
  total: number;
  up: number;
  down: number;
  /** ISO timestamp from Uptime Kuma. */
  fetchedAt: string;
  /** Status page URL to deep-link to. */
  url: string;
};

function HealthFooter({ health }: { health?: HealthSummary }) {
  const { locale, t } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-CH";

  if (!health) {
    return (
      <a
        href="https://status.medtheris.kineo360.work"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 text-text-quaternary hover:text-text-tertiary text-[11px] transition-colors"
      >
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: "var(--color-text-quaternary)" }}
        />
        {t("sidebar.healthUnknown")}
      </a>
    );
  }

  const allUp = health.down === 0;
  const tone = allUp ? "var(--color-success)" : "var(--color-warning)";
  const label = allUp
    ? t("sidebar.healthAllUp").replace("{up}", String(health.up)).replace("{total}", String(health.total))
    : t("sidebar.healthPartialDown")
        .replace("{down}", String(health.down))
        .replace("{up}", String(health.up))
        .replace("{total}", String(health.total));

  return (
    <a
      href={health.url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 text-text-tertiary hover:text-text-secondary text-[11px] transition-colors"
      title={t("sidebar.healthLastCheck").replace(
        "{time}",
        new Date(health.fetchedAt).toLocaleTimeString(localeTag),
      )}
    >
      <span className="relative inline-flex">
        <span
          className="w-1.5 h-1.5 rounded-full"
          style={{ background: tone, boxShadow: `0 0 6px ${tone}` }}
        />
        {allUp && (
          <span
            aria-hidden
            className="absolute inset-0 w-1.5 h-1.5 rounded-full animate-ping"
            style={{ background: tone, opacity: 0.5 }}
          />
        )}
      </span>
      {label}
    </a>
  );
}

function SidebarItem({
  app,
  workspaceId,
  accent,
  pathname,
  label,
}: {
  app: App;
  workspaceId: WorkspaceId;
  accent: string;
  pathname: string;
  label: string;
}) {
  const Icon = app.icon;
  const t = useT();

  const href =
    app.embed === "native"
      ? `/${workspaceId}/${app.id}`
      : `/${workspaceId}/apps/${app.id}`;

  const isActive =
    pathname === href ||
    (app.embed === "native" && pathname === `/${workspaceId}/${app.id}`);

  const content = (
    <>
      <Icon
        size={16}
        className="shrink-0"
        style={{ color: isActive ? accent : "var(--color-text-tertiary)" }}
      />
      <span className="flex-1 truncate text-sm">{label}</span>
      {app.embed === "newtab" && (
        <ExternalLink
          size={11}
          className="text-text-quaternary shrink-0"
        />
      )}
      {app.badge && (
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
          style={{
            background:
              app.badge.tone === "info"
                ? "var(--color-info)20"
                : app.badge.tone === "warning"
                  ? "var(--color-warning)20"
                  : "var(--color-success)20",
            color:
              app.badge.tone === "info"
                ? "var(--color-info)"
                : app.badge.tone === "warning"
                  ? "var(--color-warning)"
                  : "var(--color-success)",
          }}
        >
          {app.badge.label === "bald" ? t("nav.badge.soon") : app.badge.label}
        </span>
      )}
    </>
  );

  return (
    <li>
      {app.embed === "newtab" ? (
        <a
          href={app.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-text-secondary hover:bg-bg-elevated hover:text-text-primary transition-colors"
        >
          {content}
        </a>
      ) : (
        <Link
          href={href}
          className={cn(
            "group w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md transition-colors",
            isActive
              ? "bg-bg-elevated text-text-primary"
              : "text-text-secondary hover:bg-bg-elevated hover:text-text-primary",
          )}
          style={
            isActive
              ? { boxShadow: `inset 2px 0 0 ${accent}` }
              : undefined
          }
        >
          {content}
        </Link>
      )}
    </li>
  );
}
