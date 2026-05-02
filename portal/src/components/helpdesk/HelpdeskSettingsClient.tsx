"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useT } from "@/components/LocaleProvider";
import {
  ArrowLeft,
  Settings as SettingsIcon,
  Users,
  Mail,
  AtSign,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Pencil,
  Save,
  X,
  Plus,
  Trash2,
  Server,
  ShieldCheck,
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
}: {
  workspaceId: string;
  workspaceName: string;
  accent: string;
  /** @deprecated Kept for backwards compat with the page wrapper. */
  zammadUrl?: string;
}) {
  const t = useT();
  const [data, setData] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [emailAddDialog, setEmailAddDialog] = useState(false);
  const [channelAddDialog, setChannelAddDialog] = useState(false);

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
          title={t("helpdesk.settings.backTitle")}
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
            {t("helpdesk.settings.title")}
          </h1>
          <p className="text-[10.5px] text-text-tertiary truncate">
            {t("helpdesk.settings.subtitle").replace(
              "{workspace}",
              workspaceName,
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-50"
          disabled={loading}
          title={t("helpdesk.settings.refreshTitle")}
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
                <p className="font-medium">{t("helpdesk.settings.loadError")}</p>
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
                {t("helpdesk.settings.introBefore")}{" "}
                <strong className="text-text-secondary">{workspaceName}</strong>
                {t("helpdesk.settings.introAfter")}
              </p>

              <Section
                icon={<Users size={14} style={{ color: accent }} />}
                title={t("helpdesk.settings.groupsTitle")}
                accent={accent}
              >
                {data.groups.length === 0 ? (
                  <Empty>
                    {t("helpdesk.settings.groupsEmptyBefore")}{" "}
                    <code className="mx-1 text-[11px] bg-bg-base px-1 py-0.5 rounded">
                      HELPDESK_TENANT_{workspaceId.toUpperCase()}_GROUPS
                    </code>{" "}
                    {t("helpdesk.settings.groupsEmptyAfter")}
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
                title={t("helpdesk.settings.emailsTitle")}
                accent={accent}
                action={
                  <button
                    type="button"
                    onClick={() => setEmailAddDialog(true)}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-info/10 hover:bg-info/15 text-info border border-info/20 text-[11.5px]"
                  >
                    <Plus size={11} /> {t("helpdesk.settings.emailsAdd")}
                  </button>
                }
              >
                {data.emailAddresses.length === 0 ? (
                  <Empty>{t("helpdesk.settings.emailsEmpty")}</Empty>
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
                        onDelete={() => void load()}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section
                icon={<Mail size={14} style={{ color: accent }} />}
                title={t("helpdesk.settings.channelsTitle")}
                accent={accent}
                action={
                  <button
                    type="button"
                    onClick={() => setChannelAddDialog(true)}
                    disabled={data.groups.length === 0}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-info/10 hover:bg-info/15 text-info border border-info/20 text-[11.5px] disabled:opacity-50"
                    title={
                      data.groups.length === 0
                        ? t("helpdesk.settings.channelsNeedGroup")
                        : t("helpdesk.settings.channelsNewHint")
                    }
                  >
                    <Plus size={11} /> {t("helpdesk.settings.channelsAdd")}
                  </button>
                }
              >
                {data.channels.length === 0 ? (
                  <Empty>{t("helpdesk.settings.channelsEmpty")}</Empty>
                ) : (
                  <div className="space-y-2">
                    {data.channels.map((c) => (
                      <ChannelCard
                        key={c.id}
                        workspaceId={workspaceId}
                        channel={c}
                        groups={data.groups}
                        accent={accent}
                        onDelete={() => void load()}
                        onUpdate={() => void load()}
                      />
                    ))}
                  </div>
                )}
              </Section>

              <Section
                icon={<Users size={14} style={{ color: accent }} />}
                title={t("helpdesk.settings.tenantTitle")}
                accent={accent}
              >
                <table className="w-full text-[12px]">
                  <tbody>
                    <Tr>
                      <Td className="w-[200px] text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        {t("helpdesk.settings.tenantWorkspace")}
                      </Td>
                      <Td>
                        <span className="font-mono">{data.workspace}</span>
                      </Td>
                    </Tr>
                    <Tr>
                      <Td className="text-text-tertiary uppercase text-[10.5px] tracking-wide">
                        {t("helpdesk.settings.tenantGroups")}
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
                          {t("helpdesk.settings.tenantEnvHint")}{" "}
                          <code className="bg-bg-base px-1 rounded">
                            HELPDESK_TENANT_{workspaceId.toUpperCase()}_GROUPS
                          </code>{" "}
                          {t("helpdesk.settings.tenantEnvSuffix")}
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
      {emailAddDialog && (
        <EmailAddressAddDialog
          workspaceId={workspaceId}
          channels={data?.channels ?? []}
          accent={accent}
          onClose={() => setEmailAddDialog(false)}
          onCreated={() => {
            setEmailAddDialog(false);
            void load();
          }}
        />
      )}
      {channelAddDialog && data && (
        <ChannelAddDialog
          workspaceId={workspaceId}
          groups={data.groups}
          accent={accent}
          onClose={() => setChannelAddDialog(false)}
          onCreated={() => {
            setChannelAddDialog(false);
            void load();
          }}
        />
      )}
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

function ChannelCard({
  workspaceId,
  channel,
  groups,
  accent,
  onDelete,
  onUpdate,
}: {
  workspaceId: string;
  channel: ChannelSetting;
  groups: GroupSetting[];
  accent: string;
  onDelete: () => void;
  onUpdate: () => void;
}) {
  const t = useT();
  const inbound = (channel.options as { inbound?: Record<string, unknown> })
    ?.inbound;
  const outbound = (channel.options as { outbound?: Record<string, unknown> })
    ?.outbound;
  const inboundOpts = (inbound as { options?: Record<string, unknown> })
    ?.options;
  const outboundOpts = (outbound as { options?: Record<string, unknown> })
    ?.options;
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onConfirmDelete = useCallback(async () => {
    if (
      !window.confirm(
        t("helpdesk.settings.channelDeleteConfirm").replace(
          "{id}",
          String(channel.id),
        ),
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/channel/${channel.id}?ws=${encodeURIComponent(workspaceId)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [channel.id, workspaceId, onDelete, t]);

  const onToggleActive = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/channel/${channel.id}?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ active: !channel.active }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onUpdate();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [channel.id, channel.active, workspaceId, onUpdate]);

  return (
    <div className="rounded-md border border-stroke-1 bg-bg-base p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server size={12} className="text-text-tertiary" />
          <span className="text-[12.5px] font-semibold">
            {t("helpdesk.settings.channelId").replace(
              "{id}",
              String(channel.id),
            )}
          </span>
          <span className="text-[10.5px] text-text-tertiary uppercase tracking-wide">
            {channel.area}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {channel.active ? (
            <Pill tone="success">{t("helpdesk.settings.active")}</Pill>
          ) : (
            <Pill tone="muted">{t("helpdesk.settings.inactive")}</Pill>
          )}
          <button
            type="button"
            onClick={() => {
              setError(null);
              setEditOpen((v) => !v);
            }}
            disabled={busy}
            className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-50"
            title={t("helpdesk.settings.edit")}
          >
            <Pencil size={11} />
          </button>
          <button
            type="button"
            onClick={onToggleActive}
            disabled={busy}
            className="px-1.5 py-0.5 rounded-md text-[10.5px] text-text-tertiary hover:text-text-primary hover:bg-bg-overlay disabled:opacity-50"
            title={
              channel.active
                ? t("helpdesk.settings.deactivate")
                : t("helpdesk.settings.activate")
            }
          >
            {channel.active
              ? t("helpdesk.settings.pause")
              : t("helpdesk.settings.activate")}
          </button>
          <button
            type="button"
            onClick={onConfirmDelete}
            disabled={busy}
            className="p-1 rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
            title={t("helpdesk.settings.delete")}
          >
            {busy ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Trash2 size={11} />
            )}
          </button>
        </div>
      </div>
      {error && (
        <div className="mb-2 rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] p-1.5 flex items-start gap-1.5">
          <AlertCircle size={11} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1">
            {t("helpdesk.settings.inboundShort")}
          </div>
          <KvList opts={inboundOpts} />
        </div>
        <div>
          <div className="text-[10.5px] uppercase tracking-wide text-text-tertiary mb-1">
            {t("helpdesk.settings.outboundShort")}
          </div>
          <KvList opts={outboundOpts} />
        </div>
      </div>
      {editOpen && (
        <ChannelEditPanel
          workspaceId={workspaceId}
          channel={channel}
          groups={groups}
          accent={accent}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            onUpdate();
          }}
        />
      )}
    </div>
  );
}

function KvList({ opts }: { opts: Record<string, unknown> | undefined }) {
  const t = useT();
  if (!opts || typeof opts !== "object") {
    return (
      <span className="text-[11.5px] text-text-quaternary">
        {t("helpdesk.settings.notConfigured")}
      </span>
    );
  }
  const interesting = ["host", "port", "user", "ssl", "folder", "from"];
  const entries = Object.entries(opts).filter(([k]) => interesting.includes(k));
  if (entries.length === 0) {
    return (
      <span className="text-[11.5px] text-text-quaternary">
        {t("helpdesk.settings.noFields")}
      </span>
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
  const t = useT();
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
              <Pill tone="success">{t("helpdesk.settings.active")}</Pill>
            ) : (
              <Pill tone="muted">{t("helpdesk.settings.inactive")}</Pill>
            )}
            {group.memberCount != null && (
              <span className="text-[10.5px] text-text-tertiary tabular-nums">
                {group.memberCount === 1
                  ? t("helpdesk.settings.memberCountOne").replace(
                      "{n}",
                      String(group.memberCount),
                    )
                  : t("helpdesk.settings.memberCountMany").replace(
                      "{n}",
                      String(group.memberCount),
                    )}
              </span>
            )}
          </div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11.5px] text-text-tertiary">
            <div>
              {t("helpdesk.settings.defaultSender")}{" "}
              {ea ? (
                <span className="font-mono text-text-secondary">{ea.email}</span>
              ) : (
                <span className="text-text-quaternary">—</span>
              )}
            </div>
            {group.note && (
              <div className="truncate">
                {t("helpdesk.settings.noteLabel")} {group.note}
              </div>
            )}
          </div>
        </div>
        {!open && (
          <button
            type="button"
            onClick={startEdit}
            className="shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary text-[11.5px]"
          >
            <Pencil size={11} /> {t("helpdesk.settings.edit")}
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
  onDelete,
}: {
  workspaceId: string;
  workspaceName: string;
  email: EmailAddressSetting;
  accent: string;
  onChange: (e: EmailAddressSetting) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [draftName, setDraftName] = useState(email.name);
  const [draftActive, setDraftActive] = useState(email.active);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  const onConfirmDelete = useCallback(async () => {
    if (
      !window.confirm(
        `Absender-Adresse "${email.email}" wirklich löschen? Tickets behalten ihre Historie, aber neue Mails können von dieser Adresse nicht mehr versendet werden.`,
      )
    )
      return;
    setDeleting(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/email-address/${email.id}?ws=${encodeURIComponent(workspaceId)}`,
        { method: "DELETE" },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onDelete();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }, [email.email, email.id, workspaceId, onDelete]);

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
          <div className="shrink-0 flex items-center gap-1">
            <button
              type="button"
              onClick={startEdit}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary text-[11.5px]"
            >
              <Pencil size={11} /> {t("helpdesk.settings.edit")}
            </button>
            <button
              type="button"
              onClick={onConfirmDelete}
              disabled={deleting}
              className="p-1 rounded-md text-text-tertiary hover:text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              title="Löschen"
            >
              {deleting ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <Trash2 size={11} />
              )}
            </button>
          </div>
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

/* ─────────────────────────────────────────────────────────────────────── */
/*                            Add-Dialogs (modal)                          */
/* ─────────────────────────────────────────────────────────────────────── */

function ModalShell({
  title,
  subtitle,
  accent,
  onClose,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  accent: string;
  onClose: () => void;
  children: React.ReactNode;
  footer: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div
        className={`bg-bg-chrome rounded-lg border border-stroke-1 shadow-2xl w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] flex flex-col`}
      >
        <header
          className="px-4 py-3 border-b border-stroke-1 flex items-center justify-between shrink-0"
          style={{ background: `${accent}10` }}
        >
          <div>
            <h3 className="text-[13px] font-semibold">{title}</h3>
            {subtitle && (
              <p className="text-[11px] text-text-tertiary mt-0.5">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary"
          >
            <X size={14} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">
          {children}
        </div>
        <footer className="px-4 py-2.5 border-t border-stroke-1 flex items-center justify-end gap-2 shrink-0 bg-bg-base/30">
          {footer}
        </footer>
      </div>
    </div>
  );
}

function EmailAddressAddDialog({
  workspaceId,
  channels,
  accent,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  channels: ChannelSetting[];
  accent: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [channelId, setChannelId] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/email-address?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
            channelId: channelId === "" ? null : Number(channelId),
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [workspaceId, name, email, channelId, onCreated]);

  const valid =
    name.trim().length > 0 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  return (
    <ModalShell
      title="Absender-Adresse hinzufügen"
      subtitle="E-Mail-Adresse, von der Tickets beantwortet werden."
      accent={accent}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay text-[11.5px]"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !valid}
            style={{ background: accent }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            Anlegen
          </button>
        </>
      }
    >
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11.5px] p-2 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      <Field label="Anzeigename">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="z.B. Medtheris Support"
          className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
        />
      </Field>
      <Field label="E-Mail-Adresse">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="support@medtheris.ch"
          className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
        />
      </Field>
      <Field label="Kanal-Bindung (optional)">
        <select
          value={channelId}
          onChange={(e) =>
            setChannelId(e.target.value ? Number(e.target.value) : "")
          }
          className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
        >
          <option value="">— ohne Kanal (nur Versand via globalem SMTP) —</option>
          {channels.map((c) => (
            <option key={c.id} value={c.id}>
              Kanal #{c.id} ({c.area})
            </option>
          ))}
        </select>
        <p className="text-[10.5px] text-text-quaternary mt-1">
          Ein Kanal definiert IMAP-Inbox + SMTP-Outbound. Ohne Kanal kann nur
          versendet werden – eingehende Mails an diese Adresse werden nicht
          zu Tickets.
        </p>
      </Field>
    </ModalShell>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

type ChannelDraft = {
  groupId: number | "";
  inbound: {
    adapter: "imap" | "pop3";
    host: string;
    port: number;
    user: string;
    password: string;
    ssl: "off" | "ssl" | "starttls";
    folder: string;
    keepOnServer: boolean;
  };
  outbound: {
    adapter: "smtp" | "sendmail";
    host: string;
    port: number;
    user: string;
    password: string;
    ssl: "off" | "ssl" | "starttls";
  };
  sender: { name: string; email: string };
};

function emptyChannelDraft(groupId: number | ""): ChannelDraft {
  return {
    groupId,
    inbound: {
      adapter: "imap",
      host: "",
      port: 993,
      user: "",
      password: "",
      ssl: "ssl",
      folder: "INBOX",
      keepOnServer: false,
    },
    outbound: {
      adapter: "smtp",
      host: "",
      port: 587,
      user: "",
      password: "",
      ssl: "starttls",
    },
    sender: { name: "", email: "" },
  };
}

function ChannelEditor({
  draft,
  setDraft,
  showSender = true,
}: {
  draft: ChannelDraft;
  setDraft: (next: ChannelDraft) => void;
  showSender?: boolean;
}) {
  const updateInbound = (patch: Partial<ChannelDraft["inbound"]>) =>
    setDraft({ ...draft, inbound: { ...draft.inbound, ...patch } });
  const updateOutbound = (patch: Partial<ChannelDraft["outbound"]>) =>
    setDraft({ ...draft, outbound: { ...draft.outbound, ...patch } });
  const updateSender = (patch: Partial<ChannelDraft["sender"]>) =>
    setDraft({ ...draft, sender: { ...draft.sender, ...patch } });

  return (
    <div className="space-y-4">
      <section className="space-y-2">
        <div className="text-[11.5px] font-semibold flex items-center gap-1.5">
          <Server size={12} className="text-info" />
          Inbound (Posteingang)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field label="Protokoll">
            <select
              value={draft.inbound.adapter}
              onChange={(e) =>
                updateInbound({
                  adapter: e.target.value as "imap" | "pop3",
                })
              }
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
            >
              <option value="imap">IMAP</option>
              <option value="pop3">POP3</option>
            </select>
          </Field>
          <Field label="Verschlüsselung">
            <select
              value={draft.inbound.ssl}
              onChange={(e) =>
                updateInbound({
                  ssl: e.target.value as ChannelDraft["inbound"]["ssl"],
                })
              }
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
            >
              <option value="ssl">SSL/TLS (993)</option>
              <option value="starttls">STARTTLS (143)</option>
              <option value="off">Keine</option>
            </select>
          </Field>
          <Field label="Host">
            <input
              type="text"
              value={draft.inbound.host}
              onChange={(e) => updateInbound({ host: e.target.value })}
              placeholder="imap.migadu.com"
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
            />
          </Field>
          <Field label="Port">
            <input
              type="number"
              value={draft.inbound.port}
              onChange={(e) =>
                updateInbound({ port: Number(e.target.value) || 0 })
              }
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
            />
          </Field>
          <Field label="Benutzer">
            <input
              type="text"
              autoComplete="off"
              value={draft.inbound.user}
              onChange={(e) => updateInbound({ user: e.target.value })}
              placeholder="support@medtheris.ch"
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
            />
          </Field>
          <Field label="Passwort">
            <input
              type="password"
              autoComplete="new-password"
              value={draft.inbound.password}
              onChange={(e) => updateInbound({ password: e.target.value })}
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
            />
          </Field>
          <Field label="Ordner">
            <input
              type="text"
              value={draft.inbound.folder}
              onChange={(e) => updateInbound({ folder: e.target.value })}
              placeholder="INBOX"
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
            />
          </Field>
          <Field label="Verhalten">
            <label className="inline-flex items-center gap-2 text-[12px] text-text-secondary">
              <input
                type="checkbox"
                checked={draft.inbound.keepOnServer}
                onChange={(e) =>
                  updateInbound({ keepOnServer: e.target.checked })
                }
                className="accent-info"
              />
              Mails auf Server behalten
            </label>
          </Field>
        </div>
      </section>

      <section className="space-y-2">
        <div className="text-[11.5px] font-semibold flex items-center gap-1.5">
          <Server size={12} className="text-info" />
          Outbound (Postausgang)
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <Field label="Protokoll">
            <select
              value={draft.outbound.adapter}
              onChange={(e) =>
                updateOutbound({
                  adapter: e.target.value as "smtp" | "sendmail",
                })
              }
              className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
            >
              <option value="smtp">SMTP (extern)</option>
              <option value="sendmail">Sendmail (lokal)</option>
            </select>
          </Field>
          {draft.outbound.adapter === "smtp" && (
            <>
              <Field label="Verschlüsselung">
                <select
                  value={draft.outbound.ssl}
                  onChange={(e) =>
                    updateOutbound({
                      ssl: e.target.value as ChannelDraft["outbound"]["ssl"],
                    })
                  }
                  className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
                >
                  <option value="starttls">STARTTLS (587)</option>
                  <option value="ssl">SSL/TLS (465)</option>
                  <option value="off">Keine</option>
                </select>
              </Field>
              <Field label="Host">
                <input
                  type="text"
                  value={draft.outbound.host}
                  onChange={(e) => updateOutbound({ host: e.target.value })}
                  placeholder="smtp.migadu.com"
                  className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
                />
              </Field>
              <Field label="Port">
                <input
                  type="number"
                  value={draft.outbound.port}
                  onChange={(e) =>
                    updateOutbound({ port: Number(e.target.value) || 0 })
                  }
                  className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
                />
              </Field>
              <Field label="Benutzer">
                <input
                  type="text"
                  autoComplete="off"
                  value={draft.outbound.user}
                  onChange={(e) => updateOutbound({ user: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
                />
              </Field>
              <Field label="Passwort">
                <input
                  type="password"
                  autoComplete="new-password"
                  value={draft.outbound.password}
                  onChange={(e) => updateOutbound({ password: e.target.value })}
                  className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
                />
              </Field>
            </>
          )}
        </div>
      </section>

      {showSender && (
        <section className="space-y-2">
          <div className="text-[11.5px] font-semibold flex items-center gap-1.5">
            <AtSign size={12} className="text-info" />
            Absender-Adresse (wird auch als Sender angelegt)
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <Field label="Anzeigename">
              <input
                type="text"
                value={draft.sender.name}
                onChange={(e) => updateSender({ name: e.target.value })}
                placeholder="Medtheris Support"
                className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
              />
            </Field>
            <Field label="E-Mail">
              <input
                type="email"
                value={draft.sender.email}
                onChange={(e) => updateSender({ email: e.target.value })}
                placeholder="support@medtheris.ch"
                className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none font-mono"
              />
            </Field>
          </div>
        </section>
      )}
    </div>
  );
}

function ChannelAddDialog({
  workspaceId,
  groups,
  accent,
  onClose,
  onCreated,
}: {
  workspaceId: string;
  groups: GroupSetting[];
  accent: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [draft, setDraft] = useState<ChannelDraft>(() =>
    emptyChannelDraft(groups[0]?.id ?? ""),
  );
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    inbound?: { ok: boolean; message?: string };
    outbound?: { ok: boolean; message?: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const valid =
    draft.groupId !== "" &&
    draft.inbound.host.trim() !== "" &&
    draft.inbound.user.trim() !== "" &&
    draft.inbound.password.length > 0 &&
    draft.inbound.port > 0 &&
    (draft.outbound.adapter === "sendmail" ||
      (draft.outbound.host.trim() !== "" &&
        draft.outbound.user.trim() !== "" &&
        draft.outbound.password.length > 0 &&
        draft.outbound.port > 0));

  const test = useCallback(async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/channel/test?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inbound: draft.inbound,
            outbound: draft.outbound,
            fromEmail: draft.sender.email || draft.inbound.user,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setTestResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }, [workspaceId, draft]);

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/channel?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            groupId: draft.groupId,
            inbound: draft.inbound,
            outbound: draft.outbound,
            sender:
              draft.sender.name.trim() && draft.sender.email.trim()
                ? draft.sender
                : undefined,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [workspaceId, draft, onCreated]);

  return (
    <ModalShell
      wide
      title="E-Mail-Kanal einrichten"
      subtitle="Inbox via IMAP/POP3 + Outbound via SMTP. Verbindung wird vor dem Speichern geprüft."
      accent={accent}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={test}
            disabled={testing || busy || !valid}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 hover:bg-bg-overlay text-text-secondary text-[11.5px] disabled:opacity-50"
          >
            {testing ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <ShieldCheck size={11} />
            )}
            Verbindung testen
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay text-[11.5px]"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || !valid}
            style={{ background: accent }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-50"
          >
            {busy ? (
              <Loader2 size={11} className="animate-spin" />
            ) : (
              <Save size={11} />
            )}
            Anlegen
          </button>
        </>
      }
    >
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11.5px] p-2 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {testResult && (
        <div className="rounded-md border border-stroke-1 bg-bg-base p-2.5 text-[11.5px] space-y-1">
          <div className="flex items-center gap-2">
            {testResult.inbound?.ok ? (
              <CheckCircle2 size={12} className="text-success" />
            ) : (
              <AlertCircle size={12} className="text-red-400" />
            )}
            <span className="font-medium">Inbound</span>
            <span
              className={
                testResult.inbound?.ok ? "text-success" : "text-red-400"
              }
            >
              {testResult.inbound?.ok ? "OK" : testResult.inbound?.message ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {testResult.outbound?.ok ? (
              <CheckCircle2 size={12} className="text-success" />
            ) : (
              <AlertCircle size={12} className="text-red-400" />
            )}
            <span className="font-medium">Outbound</span>
            <span
              className={
                testResult.outbound?.ok ? "text-success" : "text-red-400"
              }
            >
              {testResult.outbound?.ok
                ? "OK"
                : testResult.outbound?.message ?? "—"}
            </span>
          </div>
        </div>
      )}
      <Field label="Gruppe (eingehende Tickets landen hier)">
        <select
          value={draft.groupId}
          onChange={(e) =>
            setDraft({
              ...draft,
              groupId: e.target.value ? Number(e.target.value) : "",
            })
          }
          className="w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
        >
          {groups.length === 0 && (
            <option value="">— keine Gruppen verfügbar —</option>
          )}
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </Field>
      <ChannelEditor draft={draft} setDraft={setDraft} />
    </ModalShell>
  );
}

function ChannelEditPanel({
  workspaceId,
  channel,
  groups,
  accent,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  channel: ChannelSetting;
  groups: GroupSetting[];
  accent: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draft, setDraft] = useState<ChannelDraft>(() => {
    const inbound =
      ((channel.options as { inbound?: { adapter?: string; options?: Record<string, unknown> } })
        ?.inbound) ?? {};
    const outbound =
      ((channel.options as { outbound?: { adapter?: string; options?: Record<string, unknown> } })
        ?.outbound) ?? {};
    const inOpts = (inbound.options ?? {}) as Record<string, unknown>;
    const outOpts = (outbound.options ?? {}) as Record<string, unknown>;
    return {
      groupId: groups[0]?.id ?? "",
      inbound: {
        adapter: (inbound.adapter === "pop3" ? "pop3" : "imap"),
        host: String(inOpts.host ?? ""),
        port: Number(inOpts.port ?? 993),
        user: String(inOpts.user ?? ""),
        password: "",
        ssl: inOpts.ssl ? "ssl" : "starttls",
        folder: String(inOpts.folder ?? "INBOX"),
        keepOnServer: !!inOpts.keep_on_server,
      },
      outbound: {
        adapter: outbound.adapter === "sendmail" ? "sendmail" : "smtp",
        host: String(outOpts.host ?? ""),
        port: Number(outOpts.port ?? 587),
        user: String(outOpts.user ?? ""),
        password: "",
        ssl: outOpts.ssl
          ? "ssl"
          : outOpts.start_tls
            ? "starttls"
            : "off",
      },
      sender: { name: "", email: "" },
    };
  });
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    inbound?: { ok: boolean; message?: string };
    outbound?: { ok: boolean; message?: string };
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatePasswords, setUpdatePasswords] = useState(false);
  const t = useT();

  const test = useCallback(async () => {
    setTesting(true);
    setError(null);
    setTestResult(null);
    try {
      const r = await fetch(
        `/api/helpdesk/settings/channel/test?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inbound: draft.inbound,
            outbound: draft.outbound,
            fromEmail: draft.inbound.user,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      setTestResult(j);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTesting(false);
    }
  }, [workspaceId, draft]);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const inboundPatch: ChannelDraft["inbound"] = {
        ...draft.inbound,
        password: updatePasswords ? draft.inbound.password : "",
      };
      const outboundPatch: ChannelDraft["outbound"] = {
        ...draft.outbound,
        password: updatePasswords ? draft.outbound.password : "",
      };
      const r = await fetch(
        `/api/helpdesk/settings/channel/${channel.id}?ws=${encodeURIComponent(workspaceId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            inbound: inboundPatch,
            outbound: outboundPatch,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [channel.id, workspaceId, draft, updatePasswords, onSaved]);

  return (
    <div className="mt-3 border-t border-stroke-1 pt-3 space-y-3">
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11.5px] p-2 flex items-start gap-1.5">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {testResult && (
        <div className="rounded-md border border-stroke-1 bg-bg-chrome p-2 text-[11px] grid grid-cols-2 gap-2">
          <div className="flex items-center gap-1.5">
            {testResult.inbound?.ok ? (
              <CheckCircle2 size={11} className="text-success" />
            ) : (
              <AlertCircle size={11} className="text-red-400" />
            )}
            <span>
              {t("helpdesk.settings.inboundColon")}{" "}
              {testResult.inbound?.ok
                ? t("helpdesk.settings.testOk")
                : testResult.inbound?.message ?? "—"}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            {testResult.outbound?.ok ? (
              <CheckCircle2 size={11} className="text-success" />
            ) : (
              <AlertCircle size={11} className="text-red-400" />
            )}
            <span>
              {t("helpdesk.settings.outboundColon")}{" "}
              {testResult.outbound?.ok
                ? t("helpdesk.settings.testOk")
                : testResult.outbound?.message ?? "—"}
            </span>
          </div>
        </div>
      )}
      <label className="inline-flex items-center gap-2 text-[11px] text-text-secondary">
        <input
          type="checkbox"
          checked={updatePasswords}
          onChange={(e) => setUpdatePasswords(e.target.checked)}
          className="accent-info"
        />
        {t("helpdesk.settings.overridePasswords")}
      </label>
      <ChannelEditor draft={draft} setDraft={setDraft} showSender={false} />
      <div className="flex items-center gap-2 justify-end pt-1">
        <button
          type="button"
          onClick={test}
          disabled={testing || busy}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-stroke-1 hover:bg-bg-overlay text-text-secondary text-[11.5px] disabled:opacity-50"
        >
          {testing ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <ShieldCheck size={11} />
          )}
          {t("helpdesk.settings.testShort")}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay text-[11.5px]"
        >
          {t("common.cancel")}
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          style={{ background: accent }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium hover:opacity-90 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={11} className="animate-spin" />
          ) : (
            <Save size={11} />
          )}
          {t("common.save")}
        </button>
      </div>
    </div>
  );
}
