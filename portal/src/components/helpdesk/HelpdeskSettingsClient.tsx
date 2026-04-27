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
  Save,
  X,
  Plus,
  Trash2,
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

  const updateGroupLocal = useCallback(
    (next: GroupSetting) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              groups: prev.groups.map((g) => (g.id === next.id ? next : g)),
            }
          : prev,
      );
    },
    [],
  );

  const updateEmailLocal = useCallback(
    (next: EmailAddressSetting) => {
      setData((prev) =>
        prev
          ? {
              ...prev,
              emailAddresses: prev.emailAddresses.map((e) =>
                e.id === next.id ? next : e,
              ),
            }
          : prev,
      );
    },
    [],
  );

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
                Konfiguration für{" "}
                <strong className="text-text-secondary">{workspaceName}</strong>.
                Gruppen, Mitglieder und Absender-Adressen kannst du direkt hier
                bearbeiten — die Aktionen schreiben live in Zammad zurück.
                E-Mail-Kanäle (IMAP/SMTP) bleiben aus Sicherheitsgründen im
                Zammad-Admin (Deep-Link rechts).
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
                  <div className="space-y-2">
                    {data.groups.map((g) => (
                      <GroupCard
                        key={g.id}
                        workspaceId={workspaceId}
                        group={g}
                        emailAddresses={data.emailAddresses}
                        accent={accent}
                        onChange={updateGroupLocal}
                      />
                    ))}
                  </div>
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
                  <div className="space-y-2">
                    {data.emailAddresses.map((e) => (
                      <EmailAddressCard
                        key={e.id}
                        workspaceId={workspaceId}
                        workspaceName={workspaceName}
                        email={e}
                        accent={accent}
                        onChange={updateEmailLocal}
                      />
                    ))}
                  </div>
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

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Inline editors                             */
/* ─────────────────────────────────────────────────────────────────────── */

type GroupMember = {
  id: number;
  fullName: string;
  email: string;
  accessLevel: string[];
};

type GroupCandidate = {
  id: number;
  fullName: string;
  email: string;
};

function GroupCard({
  workspaceId,
  group,
  emailAddresses,
  accent,
  onChange,
}: {
  workspaceId: string;
  group: GroupSetting;
  emailAddresses: EmailAddressSetting[];
  accent: string;
  onChange: (g: GroupSetting) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(group.name);
  const [draftActive, setDraftActive] = useState(group.active);
  const [draftEmail, setDraftEmail] = useState<number | null>(
    group.emailAddressId,
  );
  const [draftNote, setDraftNote] = useState(group.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [members, setMembers] = useState<GroupMember[] | null>(null);
  const [candidates, setCandidates] = useState<GroupCandidate[] | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [memberBusy, setMemberBusy] = useState<number | null>(null);
  const [pendingAdd, setPendingAdd] = useState<number | "">("");

  const loadMembers = useCallback(async () => {
    setMemberLoading(true);
    setMemberError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/group/${group.id}/members?ws=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setMembers(j.members ?? []);
      setCandidates(j.candidates ?? []);
    } catch (e) {
      setMemberError(e instanceof Error ? e.message : String(e));
    } finally {
      setMemberLoading(false);
    }
  }, [group.id, workspaceId]);

  const startEdit = useCallback(() => {
    setDraftName(group.name);
    setDraftActive(group.active);
    setDraftEmail(group.emailAddressId);
    setDraftNote(group.note ?? "");
    setError(null);
    setOpen(true);
    if (!members) void loadMembers();
  }, [group, members, loadMembers]);

  const cancel = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/group/${group.id}?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: draftName,
            active: draftActive,
            emailAddressId: draftEmail,
            note: draftNote.trim() ? draftNote : null,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onChange({ ...group, ...j.group, memberCount: group.memberCount });
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [group, workspaceId, draftName, draftActive, draftEmail, draftNote, onChange]);

  const addMember = useCallback(
    async (userId: number) => {
      setMemberBusy(userId);
      setMemberError(null);
      try {
        const r = await fetch(
          `/api/helpdesk/settings/group/${group.id}/members?ws=${encodeURIComponent(workspaceId)}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ userId }),
          },
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        await loadMembers();
        setPendingAdd("");
      } catch (e) {
        setMemberError(e instanceof Error ? e.message : String(e));
      } finally {
        setMemberBusy(null);
      }
    },
    [group.id, workspaceId, loadMembers],
  );

  const removeMember = useCallback(
    async (userId: number) => {
      setMemberBusy(userId);
      setMemberError(null);
      try {
        const r = await fetch(
          `/api/helpdesk/settings/group/${group.id}/members?ws=${encodeURIComponent(workspaceId)}&userId=${userId}`,
          { method: "DELETE" },
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
        await loadMembers();
      } catch (e) {
        setMemberError(e instanceof Error ? e.message : String(e));
      } finally {
        setMemberBusy(null);
      }
    },
    [group.id, workspaceId, loadMembers],
  );

  const ea =
    group.emailAddressId != null
      ? emailAddresses.find((e) => e.id === group.emailAddressId) ?? null
      : null;

  return (
    <div className="rounded-md border border-stroke-1 bg-bg-base">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-text-primary text-[12.5px] font-medium">
              {group.name}
            </span>
            {group.active ? (
              <Pill tone="success">aktiv</Pill>
            ) : (
              <Pill tone="muted">inaktiv</Pill>
            )}
            {group.memberCount != null && (
              <span className="text-[10.5px] text-text-tertiary tabular-nums">
                {group.memberCount} Mitglied{group.memberCount === 1 ? "" : "er"}
              </span>
            )}
          </div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11.5px] text-text-tertiary">
            <div>
              Default Absender:{" "}
              {ea ? (
                <span className="font-mono text-text-secondary">{ea.email}</span>
              ) : (
                <span className="text-text-quaternary">—</span>
              )}
            </div>
            {group.note && (
              <div className="truncate">Notiz: {group.note}</div>
            )}
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary text-[11.5px]"
          >
            <Pencil size={11} /> Bearbeiten
          </button>
        )}
      </div>

      {open && (
        <div className="border-t border-stroke-1 px-3 py-3 space-y-3 bg-bg-chrome">
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11.5px] p-2 flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Name">
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
              />
            </Field>
            <Field label="Default Absender">
              <select
                value={draftEmail ?? ""}
                onChange={(e) =>
                  setDraftEmail(e.target.value ? Number(e.target.value) : null)
                }
                className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
              >
                <option value="">— keiner —</option>
                {emailAddresses.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.email} ({e.name})
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Status">
              <label className="inline-flex items-center gap-2 text-[12px] text-text-secondary">
                <input
                  type="checkbox"
                  checked={draftActive}
                  onChange={(e) => setDraftActive(e.target.checked)}
                  className="accent-info"
                />
                Gruppe aktiv (eingehende Tickets möglich)
              </label>
            </Field>
            <Field label="Notiz">
              <textarea
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                rows={2}
                className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none resize-y"
                placeholder="Interne Beschreibung der Gruppe"
              />
            </Field>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={saving || !draftName.trim()}
              style={{ background: accent }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Save size={11} />
              )}
              Speichern
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay text-[11.5px] disabled:opacity-50"
            >
              <X size={11} className="inline -mt-0.5" /> Abbrechen
            </button>
          </div>

          <div className="border-t border-stroke-1 pt-3">
            <div className="text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1.5 flex items-center gap-2">
              <Users size={11} /> Mitglieder
              {memberLoading && (
                <Loader2 size={11} className="animate-spin text-text-quaternary" />
              )}
            </div>
            {memberError && (
              <div className="text-red-400 text-[11px] mb-1.5">{memberError}</div>
            )}
            {!members && !memberLoading && (
              <button
                type="button"
                onClick={loadMembers}
                className="text-info hover:underline text-[11px]"
              >
                Mitglieder laden
              </button>
            )}
            {members && (
              <div className="space-y-1">
                {members.length === 0 && (
                  <div className="text-text-quaternary text-[11px]">
                    Keine Agents in dieser Gruppe.
                  </div>
                )}
                {members.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center gap-2 px-2 py-1 rounded-md bg-bg-base"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] truncate">{m.fullName}</div>
                      <div className="text-[10.5px] text-text-tertiary truncate font-mono">
                        {m.email}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeMember(m.id)}
                      disabled={memberBusy === m.id}
                      className="p-1 rounded-md text-text-quaternary hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
                      title="Aus Gruppe entfernen"
                    >
                      {memberBusy === m.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Trash2 size={11} />
                      )}
                    </button>
                  </div>
                ))}
                {candidates && candidates.length > 0 && (
                  <div className="flex items-center gap-2 pt-1">
                    <select
                      value={pendingAdd}
                      onChange={(e) =>
                        setPendingAdd(e.target.value ? Number(e.target.value) : "")
                      }
                      className="flex-1 px-2 py-1 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[11.5px] outline-none"
                    >
                      <option value="">— Agent auswählen —</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.fullName} ({c.email})
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() =>
                        typeof pendingAdd === "number" && addMember(pendingAdd)
                      }
                      disabled={memberBusy != null || !pendingAdd}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-info/10 hover:bg-info/15 text-info border border-info/20 text-[11.5px] disabled:opacity-50"
                    >
                      <Plus size={11} /> Hinzufügen
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EmailAddressCard({
  workspaceId,
  workspaceName,
  email,
  accent,
  onChange,
}: {
  workspaceId: string;
  workspaceName: string;
  email: EmailAddressSetting;
  accent: string;
  onChange: (e: EmailAddressSetting) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(email.name);
  const [draftActive, setDraftActive] = useState(email.active);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = useCallback(() => {
    setDraftName(email.name);
    setDraftActive(email.active);
    setError(null);
    setOpen(true);
  }, [email]);

  const cancel = useCallback(() => {
    setOpen(false);
    setError(null);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/email-address/${email.id}?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: draftName, active: draftActive }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onChange(j.emailAddress);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [email.id, workspaceId, draftName, draftActive, onChange]);

  const editable = email.inUseByTenant;

  return (
    <div className="rounded-md border border-stroke-1 bg-bg-base">
      <div className="flex items-start gap-3 px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[12px] text-text-primary">
              {email.email}
            </span>
            {email.active ? (
              <Pill tone="success">aktiv</Pill>
            ) : (
              <Pill tone="muted">inaktiv</Pill>
            )}
            {email.inUseByTenant && (
              <span className="inline-flex items-center gap-1 text-[10.5px] text-success">
                <CheckCircle2 size={10} />
                {workspaceName}
              </span>
            )}
          </div>
          <div className="mt-0.5 text-[11.5px] text-text-tertiary truncate">
            Anzeigename: {email.name || <span className="text-text-quaternary">—</span>}
          </div>
        </div>
        {editable && !open && (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary text-[11.5px]"
          >
            <Pencil size={11} /> Bearbeiten
          </button>
        )}
        {!editable && (
          <span className="shrink-0 text-[10.5px] text-text-quaternary uppercase tracking-wide">
            anderer Workspace
          </span>
        )}
      </div>

      {open && (
        <div className="border-t border-stroke-1 px-3 py-3 space-y-3 bg-bg-chrome">
          {error && (
            <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11.5px] p-2 flex items-start gap-1.5">
              <AlertCircle size={12} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Field label="Anzeigename (Realname im Postfach)">
            <input
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
              placeholder="z.B. Medtheris Support"
            />
          </Field>
          <Field label="Status">
            <label className="inline-flex items-center gap-2 text-[12px] text-text-secondary">
              <input
                type="checkbox"
                checked={draftActive}
                onChange={(e) => setDraftActive(e.target.checked)}
                className="accent-info"
              />
              Adresse aktiv (Versand möglich)
            </label>
          </Field>
          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={save}
              disabled={saving || !draftName.trim()}
              style={{ background: accent }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Save size={11} />
              )}
              Speichern
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay text-[11.5px] disabled:opacity-50"
            >
              <X size={11} className="inline -mt-0.5" /> Abbrechen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1">
        {label}
      </div>
      {children}
    </div>
  );
}
