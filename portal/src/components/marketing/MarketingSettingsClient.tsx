"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Users,
  Mail,
  Layers,
  Send,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  KeyRound,
  Building2,
  Database,
  Plug,
} from "lucide-react";
import { useLocale } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

type Settings = {
  workspace: string;
  apiReachable: boolean;
  apiUser: string;
  publicUrl: string;
  internalUrl: string;
  totals: {
    contacts: number;
    segments: number;
    campaigns: number;
    emails: number;
  };
  topSegments: Array<{
    id: number;
    name: string;
    contactCount: number;
    isPublished: boolean;
  }>;
  channels: Array<{
    type: string;
    fromName?: string;
    fromAddress?: string;
    transport?: string;
  }>;
  adminLinks: {
    apiCredentials: string;
    users: string;
    emailConfig: string;
    segments: string;
    campaigns: string;
    forms: string;
  };
  warnings: string[];
};

export function MarketingSettingsClient({
  workspaceId,
  workspaceName,
  accent,
  mauticUrl,
}: {
  workspaceId: string;
  workspaceName: string;
  accent: string;
  mauticUrl: string;
}) {
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/marketing/settings?ws=${encodeURIComponent(workspaceId)}`,
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

  const adminBase = mauticUrl.replace(/\/$/, "");

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 px-5 py-3 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <Link
          href={`/${workspaceId}/marketing`}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Zurück zum Marketing"
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
            Marketing-Einstellungen
          </h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {workspaceName} · Mautic-Bridge, Segmente & Versand
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
                Übersicht der Mautic-Konfiguration für{" "}
                <strong className="text-text-secondary">{workspaceName}</strong>
                . Mail-Designer, Segmentregeln und Versand-Transport pflegst du
                weiterhin direkt in Mautic – die Buttons unten öffnen den
                jeweiligen Bereich.
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
                title="API-Bridge"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.apiCredentials}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <KeyRound size={12} /> API-Credentials in Mautic
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
                        Bridge-User
                      </Td>
                      <Td>
                        <code className="font-mono text-[11px]">
                          {data.apiUser}
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
                  icon={<Users size={14} />}
                  label="Kontakte"
                  value={data.totals.contacts}
                  accent={accent}
                />
                <KpiCard
                  icon={<Layers size={14} />}
                  label="Segmente"
                  value={data.totals.segments}
                  accent={accent}
                />
                <KpiCard
                  icon={<Send size={14} />}
                  label="Kampagnen"
                  value={data.totals.campaigns}
                  accent={accent}
                />
                <KpiCard
                  icon={<Mail size={14} />}
                  label="Mails"
                  value={data.totals.emails}
                  accent={accent}
                />
              </div>

              <Section
                icon={<Layers size={14} style={{ color: accent }} />}
                title="Top-Segmente"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.segments}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> in Mautic bearbeiten
                    <ExternalLink size={10} />
                  </a>
                }
              >
                {data.topSegments.length === 0 ? (
                  <Empty>
                    Keine Segmente angelegt. Lege z.B. „Newsletter Allgemein",
                    „Onboarding-Drip" und „Reaktivierung" an, um Kampagnen
                    gezielt zu adressieren.
                  </Empty>
                ) : (
                  <ul className="space-y-1.5">
                    {data.topSegments.map((s) => (
                      <li
                        key={s.id}
                        className="flex items-center justify-between gap-2 rounded-md border border-stroke-1 bg-bg-base px-2.5 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-[12px] font-medium truncate">
                            {s.name}
                          </p>
                          <p className="text-[10.5px] text-text-tertiary">
                            {s.contactCount} Kontakt
                            {s.contactCount === 1 ? "" : "e"}
                          </p>
                        </div>
                        {s.isPublished ? (
                          <Pill tone="success">
                            <CheckCircle2 size={10} /> aktiv
                          </Pill>
                        ) : (
                          <Pill tone="muted">Entwurf</Pill>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </Section>

              <Section
                icon={<Send size={14} style={{ color: accent }} />}
                title="Versand-Transport"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.emailConfig}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> Email-Settings in Mautic
                    <ExternalLink size={10} />
                  </a>
                }
              >
                <p className="text-[11.5px] text-text-tertiary leading-relaxed">
                  Mautic übergibt Mails an einen externen SMTP- oder
                  Mailgun-Endpunkt – konfiguriert wird das in Mautic unter
                  Settings → Configuration → Email Settings. Empfohlene
                  Setup-Werte für MedTheris:
                </p>
                <ul className="mt-2 text-[11.5px] text-text-secondary space-y-0.5 list-disc pl-5">
                  <li>
                    Transport: <code>smtp</code> (Migadu)
                  </li>
                  <li>
                    Host: <code>smtp.migadu.com</code>, Port{" "}
                    <code>465 / SSL</code>
                  </li>
                  <li>
                    From-Adresse:{" "}
                    <code>marketing@medtheris.kineo360.work</code> (oder{" "}
                    <code>johannes@…</code>)
                  </li>
                  <li>Frequency-Cap & Bounce-Handling aktivieren.</li>
                </ul>
              </Section>

              <Section
                icon={<Plug size={14} style={{ color: accent }} />}
                title="Verknüpfungen"
                accent={accent}
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Link
                    href={`/${workspaceId}/crm/settings`}
                    className="rounded-md border border-stroke-1 bg-bg-base px-3 py-2.5 flex items-center gap-2.5 hover:bg-bg-overlay"
                    style={{ borderColor: `${accent}40` }}
                  >
                    <Building2
                      size={16}
                      className="shrink-0"
                      style={{ color: accent }}
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium">
                        CRM (Twenty)
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        Companies, People, Pipeline-Stages
                      </p>
                    </div>
                  </Link>
                  <a
                    href={`${adminBase}${data.adminLinks.users}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-stroke-1 bg-bg-base px-3 py-2.5 flex items-center gap-2.5 hover:bg-bg-overlay"
                  >
                    <Users
                      size={16}
                      className="shrink-0 text-text-tertiary"
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium">
                        Mautic-Users
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        Bridge-Account, Rollen, Berechtigungen
                      </p>
                    </div>
                  </a>
                  <a
                    href={`${adminBase}${data.adminLinks.forms}`}
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
                        Forms / Landing Pages
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        Web-Formulare → automatische Kontakt-Anlage
                      </p>
                    </div>
                  </a>
                  <a
                    href={`${adminBase}${data.adminLinks.campaigns}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-md border border-stroke-1 bg-bg-base px-3 py-2.5 flex items-center gap-2.5 hover:bg-bg-overlay"
                  >
                    <Send
                      size={16}
                      className="shrink-0 text-text-tertiary"
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium">
                        Kampagnen-Builder
                      </p>
                      <p className="text-[10.5px] text-text-tertiary truncate">
                        Drip-Sequenzen, Verzweigungen, Trigger
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
  const { locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
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
