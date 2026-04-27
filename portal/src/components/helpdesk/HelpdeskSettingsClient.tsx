"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Users,
  Mail,
  AtSign,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
} from "lucide-react";

type GroupSetting = {
  id: number;
  name: string;
  active: boolean;
  emailAddressId: number | null;
  signatureId: number | null;
  memberCount: number | null;
  note: string | null;
};

type EmailAddressSetting = {
  id: number;
  name: string;
  email: string;
  channelId: number | null;
  active: boolean;
  inUseByTenant: boolean;
};

type ChannelSetting = {
  id: number;
  area: string;
  active: boolean;
  options: Record<string, unknown>;
};

type Settings = {
  workspace: string;
  tenant: { groupNames: string[] };
  groups: GroupSetting[];
  emailAddresses: EmailAddressSetting[];
  channels: ChannelSetting[];
  adminLinks: Record<string, string>;
};

export function HelpdeskSettingsClient({
  workspaceId,
  workspaceName,
  accent,
  zammadUrl,
}: {
  workspaceId: string;
  workspaceName: string;
  accent: string;
  zammadUrl: string;
}) {
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings?ws=${encodeURIComponent(workspaceId)}`,
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

  const adminBase = zammadUrl.replace(/\/$/, "");
  const emailById = new Map(data?.emailAddresses.map((e) => [e.id, e]) ?? []);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 px-5 py-3 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <Link
          href={`/${workspaceId}/helpdesk`}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Zurück zum Helpdesk"
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
            Helpdesk-Einstellungen
          </h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {workspaceName} · Gruppen, Absender und E-Mail-Kanäle
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
                Diese Übersicht zeigt die Konfiguration für{" "}
                <strong className="text-text-secondary">
                  {workspaceName}
                </strong>
                . Bearbeitung erfolgt aktuell im Zammad-Admin (Buttons unten
                öffnen den jeweiligen Bereich in einem neuen Tab). Volle
                Inline-Bearbeitung folgt im nächsten Iterationsschritt.
              </p>

              <Section
                icon={<Users size={14} style={{ color: accent }} />}
                title="Gruppen"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.groups}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> in Zammad bearbeiten
                    <ExternalLink size={10} />
                  </a>
                }
              >
                {data.groups.length === 0 ? (
                  <Empty>
                    Für diesen Workspace sind keine Gruppen konfiguriert.
                    Lege sie im Zammad-Admin an und ergänze sie unter
                    <code className="mx-1 text-[11px] bg-bg-base px-1 py-0.5 rounded">
                      HELPDESK_TENANT_{workspaceId.toUpperCase()}_GROUPS
                    </code>
                    in der `.env`.
                  </Empty>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <Tr head>
                        <Th>Name</Th>
                        <Th>Status</Th>
                        <Th>Mitglieder</Th>
                        <Th>Default Absender</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {data.groups.map((g) => {
                        const ea =
                          g.emailAddressId != null
                            ? emailById.get(g.emailAddressId)
                            : null;
                        return (
                          <Tr key={g.id}>
                            <Td>
                              <div className="font-medium text-text-primary">
                                {g.name}
                              </div>
                              {g.note && (
                                <div className="text-[10.5px] text-text-quaternary mt-0.5">
                                  {g.note}
                                </div>
                              )}
                            </Td>
                            <Td>
                              {g.active ? (
                                <Pill tone="success">aktiv</Pill>
                              ) : (
                                <Pill tone="muted">inaktiv</Pill>
                              )}
                            </Td>
                            <Td>
                              <span className="tabular-nums">
                                {g.memberCount ?? "—"}
                              </span>
                            </Td>
                            <Td>
                              {ea ? (
                                <div>
                                  <div className="font-mono text-[11.5px]">
                                    {ea.email}
                                  </div>
                                  <div className="text-[10.5px] text-text-tertiary">
                                    {ea.name}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-text-quaternary">—</span>
                              )}
                            </Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section
                icon={<AtSign size={14} style={{ color: accent }} />}
                title="Absender-Adressen"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.emailAddresses}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> in Zammad bearbeiten
                    <ExternalLink size={10} />
                  </a>
                }
              >
                {data.emailAddresses.length === 0 ? (
                  <Empty>Keine Absender-Adressen konfiguriert.</Empty>
                ) : (
                  <table className="w-full text-[12px]">
                    <thead>
                      <Tr head>
                        <Th>E-Mail</Th>
                        <Th>Anzeigename</Th>
                        <Th>Status</Th>
                        <Th>Genutzt von</Th>
                      </Tr>
                    </thead>
                    <tbody>
                      {data.emailAddresses.map((e) => (
                        <Tr key={e.id}>
                          <Td>
                            <span className="font-mono text-[11.5px]">
                              {e.email}
                            </span>
                          </Td>
                          <Td>{e.name}</Td>
                          <Td>
                            {e.active ? (
                              <Pill tone="success">aktiv</Pill>
                            ) : (
                              <Pill tone="muted">inaktiv</Pill>
                            )}
                          </Td>
                          <Td>
                            {e.inUseByTenant ? (
                              <span className="inline-flex items-center gap-1 text-[11.5px] text-success">
                                <CheckCircle2 size={11} />
                                {workspaceName}
                              </span>
                            ) : (
                              <span className="text-text-quaternary text-[11.5px]">
                                —
                              </span>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Section>

              <Section
                icon={<Mail size={14} style={{ color: accent }} />}
                title="E-Mail-Kanäle (Inbox / Outbound)"
                accent={accent}
                action={
                  <a
                    href={`${adminBase}${data.adminLinks.channels}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
                  >
                    <Pencil size={12} /> in Zammad bearbeiten
                    <ExternalLink size={10} />
                  </a>
                }
              >
                {data.channels.length === 0 ? (
                  <Empty>Keine E-Mail-Kanäle eingerichtet.</Empty>
                ) : (
                  <div className="space-y-2">
                    {data.channels.map((c) => (
                      <ChannelCard key={c.id} channel={c} />
                    ))}
                  </div>
                )}
              </Section>

              <Section
                icon={<Users size={14} style={{ color: accent }} />}
                title="Tenant-Konfiguration"
                accent={accent}
              >
                <table className="w-full text-[12px]">
                  <tbody>
                    <Tr>
                      <Td className="w-[200px] text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        Workspace
                      </Td>
                      <Td>
                        <span className="font-mono">{data.workspace}</span>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td className="text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        Erlaubte Zammad-Gruppen
                      </Td>
                      <Td>
                        <div className="flex flex-wrap gap-1">
                          {data.tenant.groupNames.map((g) => (
                            <span
                              key={g}
                              className="font-mono text-[11px] bg-bg-base border border-stroke-1 rounded px-1.5 py-0.5"
                            >
                              {g}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10.5px] text-text-quaternary mt-1.5">
                          Konfiguriert via{" "}
                          <code className="bg-bg-base px-1 rounded">
                            HELPDESK_TENANT_{workspaceId.toUpperCase()}_GROUPS
                          </code>
                          {" "}in der `.env` auf dem Server.
                        </p>
                      </Td>
                    </Tr>
                  </tbody>
                </table>
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

function ChannelCard({ channel }: { channel: ChannelSetting }) {
  const inbound = (channel.options as { inbound?: Record<string, unknown> })
    ?.inbound;
  const outbound = (channel.options as { outbound?: Record<string, unknown> })
    ?.outbound;
  const inboundOpts = (inbound as { options?: Record<string, unknown> })
    ?.options;
  const outboundOpts = (outbound as { options?: Record<string, unknown> })
    ?.options;

  return (
    <div className="rounded-md border border-stroke-1 bg-bg-base p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[12.5px] font-semibold">
            Kanal #{channel.id}
          </span>
          <span className="text-[10.5px] text-text-tertiary uppercase tracking-wide">
            {channel.area}
          </span>
        </div>
        {channel.active ? (
          <Pill tone="success">aktiv</Pill>
        ) : (
          <Pill tone="muted">inaktiv</Pill>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1">
            Inbound
          </div>
          <KvList opts={inboundOpts} />
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1">
            Outbound
          </div>
          <KvList opts={outboundOpts} />
        </div>
      </div>
    </div>
  );
}

function KvList({ opts }: { opts: Record<string, unknown> | undefined }) {
  if (!opts || typeof opts !== "object") {
    return (
      <span className="text-[11.5px] text-text-quaternary">
        nicht konfiguriert
      </span>
    );
  }
  const interesting = ["host", "port", "user", "ssl", "folder", "from"];
  const entries = Object.entries(opts).filter(([k]) => interesting.includes(k));
  if (entries.length === 0) {
    return (
      <span className="text-[11.5px] text-text-quaternary">— keine Felder —</span>
    );
  }
  return (
    <dl className="space-y-0.5 text-[11.5px]">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-baseline gap-2">
          <dt className="text-text-tertiary tabular-nums shrink-0 w-14">
            {k}
          </dt>
          <dd className="font-mono text-text-secondary break-all">
            {String(v)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function Tr({
  children,
  head,
}: {
  children: React.ReactNode;
  head?: boolean;
}) {
  return (
    <tr
      className={
        head
          ? "border-b border-stroke-1"
          : "border-b border-stroke-1 last:border-0 hover:bg-bg-overlay/40"
      }
    >
      {children}
    </tr>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="text-left text-[10.5px] uppercase tracking-wide text-text-tertiary font-semibold py-1.5 px-2">
      {children}
    </th>
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
  tone: "success" | "muted";
  children: React.ReactNode;
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success/10 text-success"
      : "border-stroke-1 bg-bg-base text-text-tertiary";
  return (
    <span
      className={`inline-flex items-center px-1.5 py-0.5 rounded border text-[10.5px] ${cls}`}
    >
      {children}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[12px] text-text-tertiary py-4 px-2">{children}</div>
  );
}
