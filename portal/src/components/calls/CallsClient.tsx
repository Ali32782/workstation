"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Folder,
  Headphones,
  Loader2,
  PhoneCall,
  PhoneIncoming,
  RefreshCw,
  Search,
  Users,
  Video,
} from "lucide-react";
import { ThreePaneLayout } from "@/components/ui/ThreePaneLayout";
import { groupByDate } from "@/components/ui/datetime";
import { useLocale, useT } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";
import type { CallContext, CallSummary } from "@/lib/calls/types";
import type { WorkspaceId } from "@/lib/workspaces";
import { CallDetail } from "./CallDetail";
import { ActiveCallStage, type CallStageLayout } from "./ActiveCallStage";
import { CallRow } from "./CallRow";
import { ComposerModal } from "./ComposerModal";
import { PreflightDeniedModal } from "./PreflightDeniedModal";
import { usePreflight } from "./usePreflight";

/**
 * Native Calls client.
 *
 * Two layout modes:
 *   1. **Browse** (default) — three-pane layout (scope rail · call list ·
 *      detail with metadata + participants). The user picks a call from
 *      the list and gets context before joining.
 *   2. **Call** — {@link ActiveCallStage} als Vollbild oder PiP; „Liste“
 *      minimiert ohne Jitsi neu zu laden.
 *
 * Click-to-call deep links (`/calls?start=1&subject=…&kind=…`) still work
 * the same way: they open the composer with prefilled values regardless
 * of which mode the page boots into.
 *
 * Pre-flight: before flipping into call mode we probe `getUserMedia` so
 * we can show a friendly modal instead of letting Jitsi silently fall
 * back to chat-only when permissions are blocked.
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
  const { locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const dateGroupLabels = useMemo(
    () => ({
      unknown: t("common.dateUnknown"),
      today: t("common.today"),
      yesterday: t("common.yesterday"),
    }),
    [t],
  );
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

  // Lifted out of CallDetail: eingebetteter Call → {@link ActiveCallStage}.
  // `embeddedCallId` null = keine Jitsi-Session in PiP/Vollbild.
  const [embeddedCallId, setEmbeddedCallId] = useState<string | null>(null);
  const [callStageLayout, setCallStageLayout] =
    useState<CallStageLayout>("fullscreen");

  const preflight = usePreflight();

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
    () =>
      groupByDate(filteredCalls, (c) => c.startedAt, localeFmt, dateGroupLabels),
    [filteredCalls, localeFmt, dateGroupLabels],
  );

  const selected = useMemo(
    () => calls.find((c) => c.id === selectedId) ?? null,
    [calls, selectedId],
  );

  const embeddedCall = useMemo(
    () => calls.find((c) => c.id === embeddedCallId) ?? null,
    [calls, embeddedCallId],
  );

  // If the embedded call ends (e.g. someone hits "End for everyone"), drop
  // back to browse mode automatically.
  useEffect(() => {
    if (embeddedCallId && embeddedCall && embeddedCall.endedAt) {
      setEmbeddedCallId(null);
    }
  }, [embeddedCallId, embeddedCall]);

  // Stable selection handler — passing this to every CallRow lets the
  // memoised row skip re-renders even when the parent re-runs.
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
          subject: composerSubject || t("calls.defaultSubject"),
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
      alert(
        t("calls.alert.startFailed") +
          (e instanceof Error ? e.message : e),
      );
    } finally {
      setCreating(false);
    }
  }, [apiUrl, composerSubject, composerContext, t]);

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
        if (embeddedCallId === id) {
          setEmbeddedCallId(null);
          setCallStageLayout("fullscreen");
        }
      } catch (e) {
        alert(t("calls.alert.endFailed") + (e instanceof Error ? e.message : e));
      }
    },
    [apiUrl, embeddedCallId, t],
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

  const startEmbed = useCallback(
    async (id: string) => {
      const probe = await preflight.run();
      if (!probe.ok) return; // modal will surface via preflight.failure
      setCallStageLayout("fullscreen");
      setEmbeddedCallId(id);
      void joinCall(id);
    },
    [preflight, joinCall],
  );

  /** Deep link: /calls?join=<callId> — z. B. von portalweitem „Eingehender Call“. */
  const joinFromUrlDone = useRef<string | null>(null);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const joinId = url.searchParams.get("join")?.trim();
    if (!joinId) return;
    if (joinFromUrlDone.current === joinId) return;
    joinFromUrlDone.current = joinId;
    url.searchParams.delete("join");
    window.history.replaceState({}, "", url.toString());

    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl(`/api/calls/${joinId}`), {
          cache: "no-store",
        });
        const j = (await r.json()) as {
          call?: CallSummary;
          error?: string;
        };
        if (cancelled || !r.ok || !j.call || j.call.endedAt) {
          return;
        }
        setCalls((cur) => {
          if (cur.some((c) => c.id === joinId)) return cur;
          return [j.call!, ...cur];
        });
        setSelectedId(joinId);
        setScope("active");
        await startEmbed(joinId);
      } catch {
        /* noop */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiUrl, startEmbed]);

  // Note: railItems is memoised here so hook order stays stable.
  const railItems = useMemo(
    () => [
      {
        id: "active" as const,
        label: t("calls.active"),
        icon: <Headphones size={14} />,
        count: counts.active,
      },
      {
        id: "today" as const,
        label: t("common.today"),
        icon: <PhoneIncoming size={14} />,
        count: counts.today,
      },
      {
        id: "week" as const,
        label: t("common.thisWeek"),
        icon: <Users size={14} />,
        count: counts.week,
      },
      {
        id: "all" as const,
        label: t("common.all"),
        icon: <Folder size={14} />,
        count: counts.all,
      },
    ],
    [t, counts.active, counts.today, counts.week, counts.all],
  );

  /* ── Render: call stage (über der Browse-Ansicht, persistentes Jitsi) ─ */

  /* ── Render: browse mode (three-pane) ────────────────────── */

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
              ? t("calls.list.header.active")
              : scope === "today"
                ? t("common.today")
                : scope === "week"
                  ? t("common.thisWeek")
                  : t("calls.list.header.all")}
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
            placeholder={t("calls.search.placeholder")}
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
              {t("calls.empty.filtered.title")}
            </p>
            <p className="text-[11px] text-text-tertiary max-w-xs">
              {t("calls.empty.filtered.hint")}
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
      onStartEmbed={() => void startEmbed(selected.id)}
      onEnd={(everyone) => void endCall(selected.id, everyone)}
      accent={accent}
      preflightProbing={preflight.probing}
    />
  ) : (
    <div className="flex-1 flex flex-col items-center justify-center text-center px-6 py-12 gap-2 text-text-tertiary">
      <Video size={32} className="text-text-quaternary" />
      <p className="text-[12.5px] font-medium text-text-secondary">
        {t("calls.selection.title")}
      </p>
      <p className="text-[11px] text-text-tertiary max-w-sm">
        {t("calls.selection.hint")}
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

      {embeddedCallId && embeddedCall && (
        <ActiveCallStage
          call={embeddedCall}
          meName={meName}
          meEmail={meEmail}
          accent={accent}
          layout={callStageLayout}
          onLayoutChange={setCallStageLayout}
          onEndForEveryone={() => void endCall(embeddedCall.id, true)}
        />
      )}

      {preflight.failure && (
        <PreflightDeniedModal
          reason={preflight.failure}
          probing={preflight.probing}
          accent={accent}
          onRetry={() => void preflight.run()}
          onClose={preflight.reset}
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
