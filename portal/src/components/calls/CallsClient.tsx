"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ExternalLink,
  Loader2,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Users,
  Video,
  X,
  Maximize2,
  CheckCircle2,
  ArrowRight,
  Headphones,
  PhoneIncoming,
  Briefcase,
  Ticket as TicketIcon,
  LifeBuoy,
  MessageSquare,
  Folder,
} from "lucide-react";
import { Avatar, AvatarStack } from "@/components/ui/Avatar";
import { ThreePaneLayout } from "@/components/ui/ThreePaneLayout";
import { groupByDate, shortTime } from "@/components/ui/datetime";
import type { WorkspaceId } from "@/lib/workspaces";
import type { CallContext, CallSummary } from "@/lib/calls/types";
import { useT } from "@/components/LocaleProvider";

/**
 * Native Calls client. Three-pane layout:
 *   1. Pane 1 (240px): scope tabs (Aktiv/Heute/Diese Woche/Alle) + new-call buttons
 *   2. Pane 2 (340px): call list, grouped by date, with status pills + participants
 *   3. Pane 3 (flex-1): selected call detail with metadata + Jitsi embed
 *
 * Includes click-to-call deep links: visiting `/calls?start=1&subject=…&context=…`
 * automatically opens the new-call composer with prefilled values.
 */
export function CallsClient({
  workspaceId,
  workspaceName,
  accent,
  initial,
  meEmail,
  meName,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  initial: { calls: CallSummary[] };
  meEmail: string;
  meName: string;
}) {
  const t = useT();
  const [calls, setCalls] = useState<CallSummary[]>(initial.calls);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [scope, setScope] = useState<"active" | "today" | "week" | "all">(
    initial.calls.some((c) => !c.endedAt) ? "active" : "today",
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(
    initial.calls[0]?.id ?? null,
  );

  const [showComposer, setShowComposer] = useState(false);
  const [creating, setCreating] = useState(false);
  const [composerSubject, setComposerSubject] = useState("");
  const [composerContext, setComposerContext] = useState<CallContext>({
    kind: "adhoc",
  });

  const apiUrl = useCallback(
    (path: string) => {
      const sep = path.includes("?") ? "&" : "?";
      return `${path}${sep}ws=${workspaceId}`;
    },
    [workspaceId],
  );

  const refresh = useCallback(
    async (preserveSelection = true) => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(apiUrl("/api/calls/rooms"), { cache: "no-store" });
        const j = (await r.json()) as { calls?: CallSummary[]; error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setCalls(j.calls ?? []);
        if (preserveSelection) {
          setSelectedId((cur) =>
            cur && (j.calls ?? []).some((c) => c.id === cur)
              ? cur
              : (j.calls?.[0]?.id ?? null),
          );
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [apiUrl],
  );

  // Re-fetch every 60s while there's at least one active call so participants
  // stay roughly in sync without a full websocket layer. We only watch the
  // count of active calls (not the array reference) to avoid tearing down
  // the interval on every refresh and to keep the Jitsi embed stable.
  const activeCallCount = useMemo(
    () => calls.filter((c) => !c.endedAt).length,
    [calls],
  );
  useEffect(() => {
    if (activeCallCount === 0) return;
    const t = window.setInterval(() => void refresh(true), 60_000);
    return () => clearInterval(t);
  }, [activeCallCount, refresh]);

  // Honour ?start=1 deep-link from click-to-call
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("start") === "1") {
      setShowComposer(true);
      const subject = url.searchParams.get("subject") ?? "";
      setComposerSubject(subject);
      const kind = url.searchParams.get("kind");
      const label = url.searchParams.get("label") ?? undefined;
      if (kind === "crm") {
        setComposerContext({
          kind: "crm",
          companyId: url.searchParams.get("companyId") ?? undefined,
          personId: url.searchParams.get("personId") ?? undefined,
          label,
        });
      } else if (kind === "helpdesk") {
        const tid = url.searchParams.get("ticketId") ?? "";
        setComposerContext({ kind: "helpdesk", ticketId: tid, label });
      } else if (kind === "chat") {
        setComposerContext({
          kind: "chat",
          roomId: url.searchParams.get("roomId") ?? "",
          label,
        });
      } else if (kind === "projects") {
        setComposerContext({
          kind: "projects",
          projectId: url.searchParams.get("projectId") ?? undefined,
          issueId: url.searchParams.get("issueId") ?? undefined,
          label,
        });
      }
      // Clean URL so refresh doesn't re-trigger
      url.searchParams.delete("start");
      url.searchParams.delete("subject");
      url.searchParams.delete("kind");
      url.searchParams.delete("companyId");
      url.searchParams.delete("personId");
      url.searchParams.delete("ticketId");
      url.searchParams.delete("roomId");
      url.searchParams.delete("projectId");
      url.searchParams.delete("issueId");
      url.searchParams.delete("label");
      window.history.replaceState({}, "", url.toString());
    }
  }, []);

  /* ── Filtered/grouped lists ────────────────────────────────── */

  const counts = useMemo(() => {
    const now = Date.now();
    const dayMs = 86_400_000;
    return {
      active: calls.filter((c) => !c.endedAt).length,
      today: calls.filter((c) => now - new Date(c.startedAt).getTime() < dayMs)
        .length,
      week: calls.filter(
        (c) => now - new Date(c.startedAt).getTime() < 7 * dayMs,
      ).length,
      all: calls.length,
    };
  }, [calls]);

  const filteredCalls = useMemo(() => {
    let xs = calls;
    const now = Date.now();
    const dayMs = 86_400_000;
    if (scope === "active") xs = xs.filter((c) => !c.endedAt);
    else if (scope === "today")
      xs = xs.filter((c) => now - new Date(c.startedAt).getTime() < dayMs);
    else if (scope === "week")
      xs = xs.filter((c) => now - new Date(c.startedAt).getTime() < 7 * dayMs);
    if (search.trim()) {
      const q = search.toLowerCase();
      xs = xs.filter(
        (c) =>
          c.subject.toLowerCase().includes(q) ||
          c.createdByName.toLowerCase().includes(q) ||
          c.participants.some((p) =>
            p.displayName.toLowerCase().includes(q),
          ),
      );
    }
    return xs;
  }, [calls, scope, search]);

  const grouped = useMemo(
    () => groupByDate(filteredCalls, (c) => c.startedAt),
    [filteredCalls],
  );

  const selected = useMemo(
    () => calls.find((c) => c.id === selectedId) ?? null,
    [calls, selectedId],
  );

  // Stable selection handler — passing this to every CallRow lets the
  // memoised row skip re-renders even when the parent re-runs (which
  // happens every 60s due to the active-calls poll).
  const onSelectCall = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

  /* ── Mutations ────────────────────────────────────────────── */

  const startCall = useCallback(async () => {
    setCreating(true);
    try {
      const r = await fetch(apiUrl("/api/calls/rooms"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          subject: composerSubject || "Spontan-Call",
          context: composerContext,
        }),
      });
      const j = (await r.json()) as { call?: CallSummary; error?: string };
      if (!r.ok || !j.call) throw new Error(j.error ?? `HTTP ${r.status}`);
      setCalls((cur) => [j.call!, ...cur]);
      setSelectedId(j.call.id);
      setShowComposer(false);
      setComposerSubject("");
      setComposerContext({ kind: "adhoc" });
      setScope("active");
    } catch (e) {
      alert("Call konnte nicht gestartet werden: " + (e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  }, [apiUrl, composerSubject, composerContext]);

  const endCall = useCallback(
    async (id: string, everyone: boolean) => {
      try {
        const r = await fetch(apiUrl(`/api/calls/${id}`), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "end", everyone }),
        });
        const j = (await r.json()) as { call?: CallSummary; error?: string };
        if (!r.ok || !j.call) throw new Error(j.error ?? `HTTP ${r.status}`);
        setCalls((cur) => cur.map((c) => (c.id === id ? j.call! : c)));
      } catch (e) {
        alert("Beenden fehlgeschlagen: " + (e instanceof Error ? e.message : e));
      }
    },
    [apiUrl],
  );

  const joinCall = useCallback(
    async (id: string) => {
      try {
        const r = await fetch(apiUrl(`/api/calls/${id}`), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "join" }),
        });
        const j = (await r.json()) as { call?: CallSummary; error?: string };
        if (!r.ok || !j.call) throw new Error(j.error ?? `HTTP ${r.status}`);
        setCalls((cur) => cur.map((c) => (c.id === id ? j.call! : c)));
      } catch {
        // non-fatal
      }
    },
    [apiUrl],
  );

  /* ── Render ───────────────────────────────────────────────── */

  const primary = (
    <>
      <header
        className="shrink-0 px-3 py-2 border-b border-stroke-1"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded flex items-center justify-center"
            style={{ background: `${accent}18` }}
          >
            <Video size={14} style={{ color: accent }} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-[12.5px] font-semibold leading-tight truncate">
              {t("calls.title")}
            </h1>
            <p className="text-[10.5px] text-text-tertiary truncate">
              {workspaceName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title={t("common.refresh")}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setShowComposer(true);
            setComposerSubject("");
            setComposerContext({ kind: "adhoc" });
          }}
          className="mt-2 w-full inline-flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md text-white text-[12px] font-medium"
          style={{ background: accent }}
        >
          <PhoneCall size={13} />
          {t("calls.newCall")}
        </button>
      </header>
      <nav className="flex-1 min-h-0 overflow-y-auto py-2">
        <ScopeButton
          label={t("calls.active")}
          count={counts.active}
          icon={<Headphones size={13} />}
          active={scope === "active"}
          tone={counts.active > 0 ? "success" : undefined}
          onClick={() => setScope("active")}
        />
        <ScopeButton
          label={t("common.today")}
          count={counts.today}
          icon={<PhoneIncoming size={13} />}
          active={scope === "today"}
          onClick={() => setScope("today")}
        />
        <ScopeButton
          label={t("common.thisWeek")}
          count={counts.week}
          icon={<Users size={13} />}
          active={scope === "week"}
          onClick={() => setScope("week")}
        />
        <ScopeButton
          label={t("common.all")}
          count={counts.all}
          icon={<Folder size={13} />}
          active={scope === "all"}
          onClick={() => setScope("all")}
        />
      </nav>
    </>
  );

  const railItems = useMemo(
    () => [
      { id: "active" as const, label: t("calls.active"), icon: <Headphones size={14} />, count: counts.active },
      { id: "today" as const, label: t("common.today"), icon: <PhoneIncoming size={14} />, count: counts.today },
      { id: "week" as const, label: t("common.thisWeek"), icon: <Users size={14} />, count: counts.week },
      { id: "all" as const, label: t("common.all"), icon: <Folder size={14} />, count: counts.all },
    ],
    [t, counts.active, counts.today, counts.week, counts.all],
  );

  const primaryRail = (
    <nav className="flex-1 min-h-0 overflow-y-auto py-2 flex flex-col items-center gap-1 pt-12">
      {railItems.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => setScope(it.id)}
          title={`${it.label} (${it.count})`}
          className={`relative w-9 h-9 rounded flex items-center justify-center ${
            scope === it.id
              ? "bg-bg-overlay text-text-primary"
              : "text-text-tertiary hover:text-text-primary hover:bg-bg-elevated"
          }`}
        >
          {it.icon}
          {it.count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full bg-[#5b5fc7] text-white text-[9px] font-semibold flex items-center justify-center px-1">
              {it.count > 99 ? "99+" : it.count}
            </span>
          )}
        </button>
      ))}
    </nav>
  );

  const secondary = (
    <>
      <header
        className="shrink-0 px-3 py-2 border-b border-stroke-1 bg-bg-chrome"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-[12.5px] font-semibold">
            {scope === "active"
              ? "Aktive Calls"
              : scope === "today"
                ? "Heute"
                : scope === "week"
                  ? "Diese Woche"
                  : "Alle Calls"}
          </h2>
          {loading && (
            <Loader2 size={12} className="spin text-text-tertiary" />
          )}
          <span className="ml-auto text-[10.5px] text-text-tertiary tabular-nums">
            {filteredCalls.length}
          </span>
        </div>
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Suche Subject, Teilnehmer…"
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1.5 text-[11.5px] outline-none focus:border-stroke-2"
          />
        </div>
      </header>
      {error && (
        <div className="p-3">
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] p-2 whitespace-pre-wrap">
            {error}
          </div>
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {filteredCalls.length === 0 && !loading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-2 text-text-tertiary">
            <PhoneCall size={28} className="text-text-quaternary" />
            <p className="text-[12.5px] font-medium text-text-secondary">
              Keine Calls in diesem Filter.
            </p>
            <p className="text-[11px] text-text-tertiary max-w-xs">
              Starte einen neuen Call oder ändere den Filter.
            </p>
          </div>
        ) : (
          grouped.map((g) => (
            <div key={g.label}>
              <div className="sticky top-0 bg-bg-base/95 backdrop-blur px-3 py-1 text-[10px] uppercase tracking-wide font-semibold text-text-quaternary border-b border-stroke-1">
                {g.label}
              </div>
              <ul>
                {g.items.map((c) => (
                  <CallRow
                    key={c.id}
                    call={c}
                    selected={selectedId === c.id}
                    onSelect={onSelectCall}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </>
  );

  const detail = selected ? (
    <CallDetail
      call={selected}
      onJoin={() => void joinCall(selected.id)}
      onEnd={(everyone) => void endCall(selected.id, everyone)}
      meEmail={meEmail}
      meName={meName}
      accent={accent}
    />
  ) : (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-2 text-text-tertiary">
      <Video size={32} className="text-text-quaternary" />
      <p className="text-[12.5px] font-medium text-text-secondary">
        Wähle einen Call
      </p>
      <p className="text-[11px] text-text-tertiary max-w-sm">
        Aus der Liste, oder klicke „Neuer Call" um einen Raum zu starten.
      </p>
    </div>
  );

  return (
    <>
      <ThreePaneLayout
        primary={primary}
        primaryRail={primaryRail}
        secondary={secondary}
        detail={detail}
        storageKey="calls"
        hasSelection={selectedId != null}
        onMobileBack={() => setSelectedId(null)}
      />

      {showComposer && (
        <ComposerModal
          subject={composerSubject}
          onSubjectChange={setComposerSubject}
          context={composerContext}
          onContextChange={setComposerContext}
          onCancel={() => setShowComposer(false)}
          onStart={() => void startCall()}
          submitting={creating}
          accent={accent}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------------- */

function ScopeButton({
  label,
  count,
  icon,
  active,
  onClick,
  tone,
}: {
  label: string;
  count: number;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
  tone?: "success";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-[12px] border-l-2 ${
        active
          ? "bg-bg-overlay border-l-sky-500 text-text-primary"
          : "border-l-transparent text-text-secondary hover:bg-bg-overlay/50"
      }`}
    >
      <span className="text-text-tertiary">{icon}</span>
      <span>{label}</span>
      <span
        className={`ml-auto inline-flex items-center justify-center min-w-[18px] h-[16px] px-1 rounded-full text-[10px] font-semibold tabular-nums ${
          tone === "success"
            ? "bg-emerald-500/20 text-emerald-400"
            : "bg-bg-elevated text-text-tertiary"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * `CallRow` re-renders only when its own `call` reference, its
 * `selected` flag, or the stable `onSelect` callback change — keyed by
 * `call.id` from the parent. This prevents the entire list from
 * thrashing when the 60s poll mutates an unrelated row.
 */
const CallRow = memo(function CallRow({
  call,
  selected,
  onSelect,
}: {
  call: CallSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const active = !call.endedAt;
  const activeParticipants = call.participants.filter((p) => !p.leftAt);
  const ctxIcon = contextIcon(call.context);
  const handleClick = useCallback(() => onSelect(call.id), [onSelect, call.id]);
  return (
    <li>
      <button
        type="button"
        onClick={handleClick}
        className={`w-full text-left px-3 py-2 border-b border-stroke-1/60 ${
          selected
            ? "bg-bg-overlay"
            : "hover:bg-bg-overlay/40"
        }`}
      >
        <div className="flex items-center gap-2">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              active ? "bg-emerald-400 animate-pulse" : "bg-text-quaternary"
            }`}
            title={active ? "Aktiv" : "Beendet"}
          />
          <span className="text-text-tertiary">{ctxIcon}</span>
          <span className="flex-1 text-[12.5px] font-medium truncate">
            {call.subject}
          </span>
          <span className="text-[10.5px] text-text-tertiary tabular-nums">
            {shortTime(call.startedAt)}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-1 text-[10.5px] text-text-tertiary">
          <span className="truncate">
            {call.createdByName}
            {call.context.kind !== "adhoc" &&
              call.context.label &&
              ` · ${call.context.label}`}
          </span>
          <span className="ml-auto inline-flex items-center gap-1">
            {activeParticipants.length > 0 && active && (
              <AvatarStack
                members={activeParticipants.map((p) => ({
                  name: p.displayName,
                  email: p.email,
                }))}
                size={16}
                max={3}
              />
            )}
            {!active && call.durationSeconds != null && (
              <span className="font-mono">{fmtDuration(call.durationSeconds)}</span>
            )}
          </span>
        </div>
      </button>
    </li>
  );
});

function CallDetail({
  call,
  onJoin,
  onEnd,
  meEmail,
  meName,
  accent,
}: {
  call: CallSummary;
  onJoin: () => void;
  onEnd: (everyone: boolean) => void;
  meEmail: string;
  meName: string;
  accent: string;
}) {
  const active = !call.endedAt;
  const [embedded, setEmbedded] = useState(false);

  // Reset embedded state when switching calls
  useEffect(() => {
    setEmbedded(false);
  }, [call.id]);

  return (
    <>
      <header
        className="shrink-0 px-4 py-3 border-b border-stroke-1 bg-bg-chrome"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-[10.5px] text-text-tertiary mb-1">
              <span className="text-text-tertiary">{contextIcon(call.context)}</span>
              <span>{contextLabel(call.context)}</span>
              <span>· {new Date(call.startedAt).toLocaleString("de-DE")}</span>
              {!active && call.durationSeconds != null && (
                <span className="font-mono">
                  · Dauer {fmtDuration(call.durationSeconds)}
                </span>
              )}
            </div>
            <h2 className="text-[16px] font-semibold text-text-primary truncate">
              {call.subject}
            </h2>
            <p className="text-[11px] text-text-tertiary mt-0.5">
              gestartet von {call.createdByName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {active ? (
              <>
                {!embedded && (
                  <button
                    type="button"
                    onClick={() => {
                      setEmbedded(true);
                      onJoin();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[12px] font-medium"
                    style={{ background: accent }}
                  >
                    <PhoneCall size={13} />
                    Beitreten
                  </button>
                )}
                <a
                  href={call.joinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11.5px]"
                  title="In neuem Tab"
                >
                  <Maximize2 size={12} />
                </a>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm("Call für alle beenden?")) onEnd(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[11.5px]"
                  title="Call beenden"
                >
                  <X size={12} />
                </button>
              </>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-bg-elevated border border-stroke-1 text-[10.5px] text-text-tertiary">
                <CheckCircle2 size={11} className="text-emerald-500" />
                Beendet
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 flex flex-col bg-[#11151a]">
          {active && embedded ? (
            <JitsiEmbed
              joinUrl={call.joinUrl}
              roomName={call.roomName}
              displayName={meName}
              email={meEmail}
              subject={call.subject}
            />
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 text-text-tertiary">
              {active ? (
                <>
                  <Video size={48} className="text-text-quaternary" />
                  <p className="text-[13px] font-medium text-text-secondary">
                    Bereit für den Call
                  </p>
                  <p className="text-[11.5px] text-text-tertiary max-w-sm">
                    Klick „Beitreten", um Kamera und Mikro zu aktivieren.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setEmbedded(true);
                      onJoin();
                    }}
                    className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-md text-white text-[12.5px] font-medium"
                    style={{ background: accent }}
                  >
                    <PhoneCall size={14} />
                    Jetzt beitreten
                  </button>
                </>
              ) : (
                <>
                  <CheckCircle2 size={48} className="text-emerald-500/60" />
                  <p className="text-[13px] font-medium text-text-secondary">
                    Call beendet
                  </p>
                  <p className="text-[11.5px] text-text-tertiary">
                    Dauer:{" "}
                    {call.durationSeconds
                      ? fmtDuration(call.durationSeconds)
                      : "—"}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <aside className="w-[260px] shrink-0 border-l border-stroke-1 bg-bg-chrome overflow-y-auto p-3 space-y-4">
          <Section title="Teilnehmer">
            <ul className="space-y-2">
              {call.participants.map((p) => (
                <li key={p.email + p.joinedAt} className="flex items-center gap-2">
                  <Avatar name={p.displayName} email={p.email} size={28} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium truncate">
                      {p.displayName}
                    </p>
                    <p className="text-[10.5px] text-text-tertiary truncate">
                      {p.email}
                    </p>
                  </div>
                  {!p.leftAt && active ? (
                    <span
                      className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"
                      title="online"
                    />
                  ) : (
                    <span className="text-[9.5px] text-text-tertiary tabular-nums">
                      {p.leftAt
                        ? `${shortTime(p.joinedAt)}–${shortTime(p.leftAt)}`
                        : shortTime(p.joinedAt)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Kontext">
            <ContextDisplay context={call.context} />
          </Section>

          <Section title="Raum">
            <p className="text-[10.5px] font-mono text-text-tertiary break-all">
              {call.roomName}
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(call.joinUrl);
                alert("Einladungslink kopiert");
              }}
              className="mt-2 w-full inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px]"
            >
              <ExternalLink size={11} />
              Einladungslink kopieren
            </button>
          </Section>
        </aside>
      </div>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1.5">
        {title}
      </p>
      {children}
    </div>
  );
}

function ContextDisplay({ context }: { context: CallContext }) {
  if (context.kind === "adhoc") {
    return (
      <p className="text-[11.5px] text-text-tertiary">Spontan-Call ohne Verknüpfung.</p>
    );
  }
  return (
    <div className="text-[11.5px] text-text-secondary inline-flex items-center gap-1.5">
      {contextIcon(context)}
      <span>{contextLabel(context)}</span>
    </div>
  );
}

function contextIcon(context: CallContext): React.ReactNode {
  switch (context.kind) {
    case "crm":
      return <Briefcase size={12} />;
    case "helpdesk":
      return <LifeBuoy size={12} />;
    case "chat":
      return <MessageSquare size={12} />;
    case "projects":
      return <TicketIcon size={12} />;
    case "adhoc":
    default:
      return <PhoneCall size={12} />;
  }
}

function contextLabel(context: CallContext): string {
  switch (context.kind) {
    case "crm":
      return context.label ?? "CRM-Kontakt";
    case "helpdesk":
      return context.label ?? `Ticket #${context.ticketId}`;
    case "chat":
      return context.label ?? "Chat-Raum";
    case "projects":
      return context.label ?? "Projekt-Issue";
    case "adhoc":
    default:
      return "Spontan-Call";
  }
}

/* ----------------------------------------------------------------- */
/*                          Composer modal                             */
/* ----------------------------------------------------------------- */

function ComposerModal({
  subject,
  onSubjectChange,
  context,
  onContextChange,
  onCancel,
  onStart,
  submitting,
  accent,
}: {
  subject: string;
  onSubjectChange: (s: string) => void;
  context: CallContext;
  onContextChange: (c: CallContext) => void;
  onCancel: () => void;
  onStart: () => void;
  submitting: boolean;
  accent: string;
}) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center pt-24"
      onClick={onCancel}
    >
      <div
        className="w-[440px] bg-bg-base border border-stroke-1 rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <PhoneCall size={14} style={{ color: accent }} />
          <h3 className="text-[13px] font-semibold flex-1">Neuen Call starten</h3>
          <button
            type="button"
            onClick={onCancel}
            className="text-text-tertiary hover:text-text-primary"
          >
            <X size={14} />
          </button>
        </header>
        <div className="p-4 space-y-3">
          <div>
            <label className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1 block">
              Betreff
            </label>
            <input
              autoFocus
              type="text"
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="z. B. Sales-Demo Praxis Müller"
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md px-3 py-2 text-[12.5px] outline-none focus:border-stroke-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") onStart();
              }}
            />
          </div>
          <div>
            <label className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1 block">
              Kontext
            </label>
            <div className="rounded-md bg-bg-elevated border border-stroke-1 px-3 py-2 text-[11.5px] text-text-secondary inline-flex items-center gap-2">
              {contextIcon(context)}
              <span>{contextLabel(context)}</span>
              {context.kind !== "adhoc" && (
                <button
                  type="button"
                  onClick={() => onContextChange({ kind: "adhoc" })}
                  className="ml-2 text-text-tertiary hover:text-text-primary"
                  title="Verknüpfung entfernen"
                >
                  <X size={10} />
                </button>
              )}
            </div>
            <p className="mt-1 text-[10px] text-text-quaternary">
              Tipp: Aus CRM/Helpdesk/Chat öffnet ein Click-to-Call den Composer mit
              vorbelegtem Kontext.
            </p>
          </div>
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-md border border-stroke-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
            >
              Abbrechen
            </button>
            <button
              type="button"
              onClick={onStart}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-white text-[11.5px] font-medium disabled:opacity-50"
              style={{ background: accent }}
            >
              {submitting ? (
                <Loader2 size={11} className="spin" />
              ) : (
                <ArrowRight size={11} />
              )}
              Call starten
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                          Jitsi embed                                */
/* ----------------------------------------------------------------- */

const jitsiScriptByOrigin = new Map<string, Promise<void>>();

function loadJitsiExternalApi(origin: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if ((window as unknown as { JitsiMeetExternalAPI?: unknown }).JitsiMeetExternalAPI) {
    return Promise.resolve();
  }
  const cached = jitsiScriptByOrigin.get(origin);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = `${origin}/external_api.js`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      jitsiScriptByOrigin.delete(origin);
      reject(new Error("Jitsi external_api.js konnte nicht geladen werden"));
    };
    document.head.appendChild(s);
  });
  jitsiScriptByOrigin.set(origin, p);
  return p;
}

type JitsiApi = { dispose: () => void };

type JitsiApiWithCommands = JitsiApi & {
  executeCommand?: (cmd: string, ...args: unknown[]) => void;
};

/**
 * Memoised so the embed never tears down on parent re-renders. The
 * inner effect already guards the hard re-init to actual room/url
 * changes; the `memo` here just stops the JSX tree from re-rendering
 * when only sibling state (e.g. participant list) updates.
 */
const JitsiEmbed = memo(function JitsiEmbed({
  joinUrl,
  roomName,
  displayName,
  email,
  subject,
}: {
  joinUrl: string;
  roomName: string;
  displayName: string;
  email: string;
  subject: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<JitsiApiWithCommands | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "iframe" | "error">("loading");
  const [errMsg, setErrMsg] = useState<string | null>(null);

  // Stash the latest "soft" props (display name, email, subject) in a ref so
  // we can re-apply them via Jitsi commands when they change without tearing
  // down the embed and re-prompting the user for camera/mic permissions.
  const softRef = useRef({ displayName, email, subject });
  useEffect(() => {
    softRef.current = { displayName, email, subject };
    const api = apiRef.current;
    if (!api?.executeCommand) return;
    try {
      if (subject) api.executeCommand("subject", subject);
      if (displayName) api.executeCommand("displayName", displayName);
      if (email) api.executeCommand("email", email);
    } catch {
      // ignore — non-critical update
    }
  }, [displayName, email, subject]);

  // Hard re-init only when we actually need to change rooms.
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;
    setStatus("loading");
    setErrMsg(null);
    let url: URL;
    try {
      url = new URL(joinUrl);
    } catch {
      setStatus("error");
      setErrMsg("Ungültige Call-URL");
      return;
    }
    const origin = url.origin;
    const domain = url.hostname;

    const run = async () => {
      try {
        await loadJitsiExternalApi(origin);
        if (cancelled) return;
        const ctor = (
          window as unknown as {
            JitsiMeetExternalAPI?: new (
              d: string,
              o: Record<string, unknown>,
            ) => JitsiApiWithCommands;
          }
        ).JitsiMeetExternalAPI;
        if (!ctor) throw new Error("JitsiMeetExternalAPI nicht verfügbar");
        apiRef.current?.dispose();
        el.innerHTML = "";
        if (cancelled || !hostRef.current) return;
        const soft = softRef.current;
        const api = new ctor(domain, {
          roomName,
          parentNode: hostRef.current,
          width: "100%",
          height: "100%",
          lang: "de",
          userInfo: {
            displayName: soft.displayName,
            email: soft.email,
          },
          configOverwrite: {
            subject: soft.subject,
            disableDeepLinking: true,
            prejoinConfig: { enabled: false },
          },
          interfaceConfigOverwrite: {
            APP_NAME: "Portal Calls",
            NATIVE_APP_NAME: "Portal",
            PROVIDER_NAME: "Portal",
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_POWERED_BY: false,
            MOBILE_APP_PROMO: false,
            DEFAULT_BACKGROUND: "#11151a",
          },
        });
        apiRef.current = api;
        if (!cancelled) setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setStatus("iframe");
        el.innerHTML = "";
        const ifr = document.createElement("iframe");
        ifr.src = joinUrl;
        ifr.className = "w-full h-full min-h-[280px] border-0";
        ifr.title = "Video-Call";
        ifr.allow =
          "camera *; microphone *; display-capture *; clipboard-write *; autoplay; fullscreen; web-share";
        ifr.setAttribute("allowFullScreen", "");
        el.appendChild(ifr);
        setErrMsg(
          e instanceof Error
            ? `External-API: ${e.message} — Fallback Iframe.`
            : "External-API fehlgeschlagen — Iframe-Fallback.",
        );
      }
    };
    void run();
    return () => {
      cancelled = true;
      try {
        apiRef.current?.dispose();
      } catch {
        // ignore
      }
      apiRef.current = null;
      if (el) el.innerHTML = "";
    };
    // joinUrl + roomName are the *only* identity-changing inputs. Display
    // name, email and subject are applied via the live API in the effect
    // above, so we deliberately exclude them from the deps here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [joinUrl, roomName]);

  return (
    <div className="flex-1 min-h-0 relative">
      {status === "loading" && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-chrome/90 z-10">
          <Loader2 className="w-6 h-6 spin text-text-tertiary" />
        </div>
      )}
      {errMsg && status !== "loading" && (
        <p className="absolute top-2 left-2 right-2 z-10 text-[10px] text-text-tertiary bg-bg-base/80 rounded px-2 py-1">
          {errMsg}
        </p>
      )}
      <div
        ref={hostRef}
        className="w-full h-full min-h-[320px] [&>iframe]:w-full [&>iframe]:h-full [&>iframe]:border-0"
      />
    </div>
  );
});

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m < 60) return `${m}m ${s.toString().padStart(2, "0")}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${(m % 60).toString().padStart(2, "0")}m`;
}
