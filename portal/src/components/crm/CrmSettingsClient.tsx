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
          title="Zurück zum CRM"
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
            CRM-Einstellungen
          </h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {workspaceName} · Twenty-Tenant, Mitglieder & Pipeline
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-50"
          disabled={loading}
          title="Aktualisieren"
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
                <p className="font-medium">Konnte Einstellungen nicht laden</p>
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
                Übersicht der Twenty-Tenant-Konfiguration für{" "}
                <strong className="text-text-secondary">
                  {workspaceName}
                </strong>
                . Bearbeitung von Custom-Feldern, Pipelines und Integrationen
                erfolgt aktuell direkt in Twenty (Buttons unten öffnen den
                jeweiligen Bereich in einem neuen Tab).
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
                title="API-Verbindung"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.apiKeys}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <KeyRound size={12} /> API-Keys in Twenty
                    <ExternalLink size={10} />
                  </a>
                }
              >
                <table className="w-full text-[12px]">
                  <tbody>
                    <Tr>
                      <Td className="w-[200px] text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        Status
                      </Td>
                      <Td>
                        {data.apiReachable ? (
                          <Pill tone="success">
                            <CheckCircle2 size={10} /> erreichbar
                          </Pill>
                        ) : (
                          <Pill tone="warn">
                            <AlertCircle size={10} /> nicht erreichbar
                          </Pill>
                        )}
                      </Td>
                    </Tr>
                    <Tr>
                      <Td className="text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        Twenty-Workspace-ID
                      </Td>
                      <Td>
                        <code className="font-mono text-[11px]">
                          {data.workspaceId}
                        </code>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td className="text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        Public-URL
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
                        Compose-URL
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
                  label="Firmen"
                  value={data.totals.companies}
                  accent={accent}
                />
                <KpiCard
                  icon={<Users size={14} />}
                  label="Personen"
                  value={data.totals.people}
                  accent={accent}
                />
                <KpiCard
                  icon={<Briefcase size={14} />}
                  label="Pipeline-Stages"
                  value={data.pipeline.length}
                  accent={accent}
                />
                <KpiCard
                  icon={<Tag size={14} />}
                  label="Lead-Quellen"
                  value={data.leadSources.length}
                  accent={accent}
                />
              </div>

              <Section
                icon={<Users size={14} style={{ color: accent }} />}
                title="Workspace-Mitglieder"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.members}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> in Twenty bearbeiten
                    <ExternalLink size={10} />
                  </a>
                }
              >
                {data.members.length === 0 ? (
                  <Empty>
                    Keine Mitglieder gefunden – API-Token könnte zu eng
                    skopt sein, oder im Workspace ist nur der Bridge-User
                    aktiv.
                  </Empty>
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
                            {m.name || "(ohne Name)"}
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
                title="Pipeline (Deals nach Stage)"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.dataModel}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> Datenmodell
                    <ExternalLink size={10} />
                  </a>
                }
              >
                {data.pipeline.length === 0 ? (
                  <Empty>
                    Noch keine Deals erfasst. Lege im CRM die Pipeline-Stages
                    an und bewege Opportunities zwischen ihnen.
                  </Empty>
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
                              {p.count}
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
                title="Lead-Quellen"
                accent={accent}
              >
                {data.leadSources.length === 0 ? (
                  <Empty>Keine Lead-Quellen erfasst.</Empty>
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
                title="Integrationen"
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
                        Marketing (Mautic)
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        Bridge-Token, Segmente, Kampagnen
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
                        Twenty-Integrationen
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        Webhooks, API-Keys, externe Datenquellen
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
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  accent: string;
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
        {value.toLocaleString("de-DE")}
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
