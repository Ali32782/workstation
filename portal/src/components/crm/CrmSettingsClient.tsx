"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Users,
  Building2,
  Briefcase,
  Tag,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  KeyRound,
  Database,
  Plug,
  Megaphone,
} from "lucide-react";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

type Member = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
};

type Settings = {
  workspace: string;
  apiReachable: boolean;
  publicUrl: string;
  internalUrl: string;
  workspaceId: string;
  totals: { companies: number; people: number };
  members: Member[];
  pipeline: { stage: string; count: number }[];
  leadSources: string[];
  adminLinks: {
    profile: string;
    workspace: string;
    members: string;
    apiKeys: string;
    dataModel: string;
    integrations: string;
  };
  warnings: string[];
};

export function CrmSettingsClient({
  workspaceId,
  workspaceName,
  accent,
  twentyUrl,
}: {
  workspaceId: string;
  workspaceName: string;
  accent: string;
  twentyUrl: string;
}) {
  const t = useT();
  const { locale } = useLocale();
  const localeFmt = localeTag(locale);
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/crm/settings?ws=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as Settings & { error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setData(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const adminBase = twentyUrl.replace(/\/$/, "");

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 px-5 py-3 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <Link
          href={`/${workspaceId}/crm`}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title={t("crm.nav.backToCrm")}
        >
          <ArrowLeft size={14} />
        </Link>
        <div
          className="w-9 h-9 rounded flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}
        >
          <SettingsIcon size={18} style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">
            {t("crm.settingsPage.title")}
          </h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {t("crm.settingsPage.subtitle").replace("{workspace}", workspaceName)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-50"
          disabled={loading}
          title={t("common.refresh")}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <RefreshCw size={14} />
          )}
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-5 space-y-5">
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12.5px] p-3 flex items-start gap-2">
              <AlertCircle size={14} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{t("crm.settingsPage.loadFailed")}</p>
                <p className="text-[11.5px] opacity-90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {loading && !data && (
            <div className="flex items-center justify-center py-12">
              <Loader2
                className="w-6 h-6 animate-spin"
                style={{ color: accent }}
              />
            </div>
          )}

          {data && (
            <>
              <p className="text-[12px] text-text-tertiary leading-relaxed">
                {t("crm.settingsPage.intro").replace("{workspace}", workspaceName)}
              </p>

              {data.warnings.length > 0 && (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11.5px] p-3 space-y-1">
                  {data.warnings.map((w, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <AlertCircle size={12} className="mt-0.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}
                </div>
              )}

              <Section
                icon={<Database size={14} style={{ color: accent }} />}
                title={t("crm.settingsPage.sectionApi")}
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.apiKeys}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <KeyRound size={12} /> {t("crm.settingsPage.linkApiKeysTwenty")}
                    <ExternalLink size={10} />
                  </a>
                }
              >
                <table className="w-full text-[12px]">
                  <tbody>
                    <Tr>
                      <Td className="w-[200px] text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        {t("common.status")}
                      </Td>
                      <Td>
                        {data.apiReachable ? (
                          <Pill tone="success">
                            <CheckCircle2 size={10} /> {t("crm.settingsPage.apiReachable")}
                          </Pill>
                        ) : (
                          <Pill tone="warn">
                            <AlertCircle size={10} /> {t("crm.settingsPage.apiUnreachable")}
                          </Pill>
                        )}
                      </Td>
                    </Tr>
                    <Tr>
                      <Td className="text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        {t("crm.settingsPage.labelTwentyWorkspaceId")}
                      </Td>
                      <Td>
                        <code className="font-mono text-[11px]">
                          {data.workspaceId}
                        </code>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td className="text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        {t("crm.settingsPage.labelPublicUrl")}
                      </Td>
                      <Td>
                        <a
                          href={data.publicUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-blue-400 underline"
                        >
                          {data.publicUrl}
                        </a>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td className="text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        {t("crm.settingsPage.labelComposeUrl")}
                      </Td>
                      <Td>
                        <code className="font-mono text-[11px] text-text-tertiary">
                          {data.internalUrl}
                        </code>
                      </Td>
                    </Tr>
                  </tbody>
                </table>
              </Section>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiCard
                  icon={<Building2 size={14} />}
                  label={t("crm.companies")}
                  value={data.totals.companies}
                  accent={accent}
                  localeFmt={localeFmt}
                />
                <KpiCard
                  icon={<Users size={14} />}
                  label={t("crm.people")}
                  value={data.totals.people}
                  accent={accent}
                  localeFmt={localeFmt}
                />
                <KpiCard
                  icon={<Briefcase size={14} />}
                  label={t("crm.settingsPage.kpiPipelineStages")}
                  value={data.pipeline.length}
                  accent={accent}
                  localeFmt={localeFmt}
                />
                <KpiCard
                  icon={<Tag size={14} />}
                  label={t("crm.settingsPage.sectionLeadSources")}
                  value={data.leadSources.length}
                  accent={accent}
                  localeFmt={localeFmt}
                />
              </div>

              <Section
                icon={<Users size={14} style={{ color: accent }} />}
                title={t("crm.settingsPage.sectionMembers")}
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.members}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> {t("crm.settingsPage.linkEditInTwenty")}
                    <ExternalLink size={10} />
                  </a>
                }
              >
                {data.members.length === 0 ? (
                  <Empty>{t("crm.settingsPage.membersEmpty")}</Empty>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {data.members.map((m) => (
                      <li
                        key={m.id}
                        className="rounded-md border border-stroke-1 bg-bg-base px-2.5 py-2 flex items-center gap-2.5"
                      >
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10.5px] font-semibold"
                          style={{ background: `${accent}22`, color: accent }}
                        >
                          {(m.name || m.email || "?").slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-medium truncate">
                            {m.name || t("crm.company.unnamed")}
                          </p>
                          <p className="text-[10.5px] text-text-tertiary truncate">
                            {m.email}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                icon={<Briefcase size={14} style={{ color: accent }} />}
                title={t("crm.settingsPage.sectionPipeline")}
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.dataModel}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> {t("crm.settingsPage.linkDataModel")}
                    <ExternalLink size={10} />
                  </a>
                }
              >
                <p className="text-[11px] text-text-tertiary leading-relaxed mb-3">
                  {t("crm.settingsPage.pipelineIntroPrefix")}
                  <code className="text-[10px] text-text-secondary">
                    docs/playbooks/TWENTY-DEAL-STAGES-ALIGNMENT.md
                  </code>
                  {t("crm.settingsPage.pipelineIntroSuffix")}
                </p>
                {data.pipeline.length === 0 ? (
                  <Empty>{t("crm.settingsPage.pipelineEmpty")}</Empty>
                ) : (
                  <div className="space-y-1.5">
                    {data.pipeline.map((p) => {
                      const max =
                        Math.max(...data.pipeline.map((x) => x.count)) || 1;
                      const pct = (p.count / max) * 100;
                      return (
                        <div key={p.stage}>
                          <div className="flex items-center justify-between text-[11.5px]">
                            <span className="truncate">{p.stage}</span>
                            <span className="text-text-tertiary tabular-nums">
                              {p.count.toLocaleString(localeFmt)}
                            </span>
                          </div>
                          <div className="h-1.5 rounded bg-bg-base overflow-hidden">
                            <div
                              className="h-full rounded"
                              style={{
                                width: `${pct}%`,
                                background: accent,
                                opacity: 0.7,
                              }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>

              <Section
                icon={<Tag size={14} style={{ color: accent }} />}
                title={t("crm.settingsPage.sectionLeadSources")}
                accent={accent}
              >
                {data.leadSources.length === 0 ? (
                  <Empty>{t("crm.settingsPage.leadSourcesEmpty")}</Empty>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {data.leadSources.map((s) => (
                      <span
                        key={s}
                        className="px-1.5 py-0.5 rounded text-[11px] border border-stroke-1 text-text-secondary"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </Section>

              <Section
                icon={<Plug size={14} style={{ color: accent }} />}
                title={t("crm.settingsPage.sectionIntegrations")}
                accent={accent}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href={`/${workspaceId}/marketing/settings`}
                    className="rounded-md border border-stroke-1 bg-bg-base px-3 py-2.5 flex items-center gap-2.5 hover:bg-bg-overlay"
                    style={{ borderColor: `${accent}40` }}
                  >
                    <Megaphone
                      size={16}
                      className="shrink-0"
                      style={{ color: accent }}
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium">
                        {t("crm.settingsPage.integrationMauticTitle")}
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        {t("crm.settingsPage.integrationMauticSubtitle")}
                      </p>
                    </div>
                  </Link>
                  <a
                    href={`${adminBase}${data.adminLinks.integrations}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-stroke-1 bg-bg-base px-3 py-2.5 flex items-center gap-2.5 hover:bg-bg-overlay"
                  >
                    <ExternalLink
                      size={16}
                      className="shrink-0 text-text-tertiary"
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium">
                        {t("crm.settingsPage.integrationTwentyTitle")}
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        {t("crm.settingsPage.integrationTwentySubtitle")}
                      </p>
                    </div>
                  </a>
                </div>
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({
  icon,
  title,
  accent,
  action,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  accent: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-stroke-1 bg-bg-chrome overflow-hidden">
      <header
        className="px-4 py-2.5 border-b border-stroke-1 flex items-center justify-between"
        style={{ background: `${accent}08` }}
      >
        <div className="flex items-center gap-2 text-[12.5px] font-semibold">
          {icon}
          {title}
        </div>
        {action}
      </header>
      <div className="p-3">{children}</div>
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  accent,
  localeFmt,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
  localeFmt: string;
}) {
  return (
    <div
      className="rounded-md border border-stroke-1 bg-bg-chrome px-3 py-3"
      style={{ boxShadow: `inset 3px 0 0 0 ${accent}40` }}
    >
      <div className="flex items-center gap-1.5 text-text-tertiary mb-1">
        <span style={{ color: accent }}>{icon}</span>
        <p className="text-[10px] uppercase tracking-wide font-semibold">
          {label}
        </p>
      </div>
      <p className="text-[20px] font-semibold leading-none tabular-nums">
        {value.toLocaleString(localeFmt)}
      </p>
    </div>
  );
}

function Tr({ children }: { children: React.ReactNode }) {
  return (
    <tr className="border-b border-stroke-1 last:border-0 hover:bg-bg-overlay/40">
      {children}
    </tr>
  );
}
function Td({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`py-2 px-2 align-top ${className}`}>{children}</td>;
}
function Pill({
  tone,
  children,
}: {
  tone: "success" | "warn" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
        : "border-stroke-1 bg-bg-base text-text-tertiary";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10.5px] ${cls}`}
    >
      {children}
    </span>
  );
}
function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] text-text-tertiary py-3 px-1">{children}</div>
  );
}
