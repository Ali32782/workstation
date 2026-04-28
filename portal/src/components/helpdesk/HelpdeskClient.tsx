"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  Headphones,
  Plus,
  Search,
  RefreshCw,
  ExternalLink,
  Loader2,
  Send,
  StickyNote,
  Mail,
  Phone,
  Video,
  AtSign,
  Inbox,
  UserCircle2,
  Globe,
  Paperclip,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  ChevronDown,
  Tag as TagIcon,
  X as XIcon,
  Zap,
  Clock,
  Timer,
  Users,
  Eye,
  ChevronUp,
  Filter,
  Keyboard,
  ArrowRight,
  Trash2,
  Settings as SettingsIcon,
  FileUp,
  Link2,
  MessageSquare,
} from "lucide-react";
import { ImportTicketsModal } from "./ImportTicketsModal";
import Link from "next/link";
import {
  ThreePaneLayout,
  PaneHeader,
  PaneEmptyState,
} from "@/components/ui/ThreePaneLayout";
import {
  DetailPane,
  PropertyList,
  SidebarSection,
} from "@/components/ui/DetailPane";
import { Avatar } from "@/components/ui/Avatar";
import {
  PriorityChip,
  PriorityBar,
  StatusPill,
  toneForState,
} from "@/components/ui/Pills";
import { groupByDate, shortTime } from "@/components/ui/datetime";
import { clickToCallUrl } from "@/lib/calls/click-to-call";
import { useLocale, useT } from "@/components/LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";
import type { WorkspaceId } from "@/lib/workspaces";
import type {
  MacroSummary,
  OverviewSummary,
  TicketArticle,
  TicketDetail,
  TicketMeta,
  TicketSummary,
  TicketUser,
} from "@/lib/helpdesk/types";

type StateFilter = "open" | "closed" | "all";
type ScopeFilter = "all" | "mine" | "unassigned" | `overview:${number}`;

type CannedResponse = { id: string; name: string; body: string };

const CANNED_KEY = (workspaceId: string) =>
  `helpdesk:canned-responses:${workspaceId}`;

function loadCanned(workspaceId: string): CannedResponse[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CANNED_KEY(workspaceId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is CannedResponse =>
        x && typeof x.id === "string" && typeof x.name === "string" && typeof x.body === "string",
    );
  } catch {
    return [];
  }
}

function saveCanned(workspaceId: string, list: CannedResponse[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CANNED_KEY(workspaceId), JSON.stringify(list));
  } catch {
    /* full quota → silent */
  }
}

function relativeTime(
  iso: string | null,
  tr: (key: keyof Messages) => string,
): string {
  if (!iso) return "";
  const t0 = new Date(iso).getTime();
  const diff = (Date.now() - t0) / 1000;
  if (diff < 60) return tr("helpdesk.time.justNow");
  if (diff < 3600) return `${Math.floor(diff / 60)} ${tr("helpdesk.time.mins")}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ${tr("helpdesk.time.hours")}`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} ${tr("helpdesk.time.days")}`;
  return new Date(iso).toLocaleDateString();
}

function channelIcon(type: string | null | undefined, size = 11) {
  switch ((type ?? "").toLowerCase()) {
    case "email":
      return <Mail size={size} className="text-text-quaternary" />;
    case "phone":
      return <Phone size={size} className="text-text-quaternary" />;
    case "web":
      return <Globe size={size} className="text-text-quaternary" />;
    case "note":
      return <StickyNote size={size} className="text-text-quaternary" />;
    case "sms":
    case "text":
      return <MessageSquare size={size} className="text-text-quaternary" />;
    default:
      return <Inbox size={size} className="text-text-quaternary" />;
  }
}

const CHANNEL_LABEL_KEYS: Partial<Record<string, keyof Messages>> = {
  email: "helpdesk.channel.email",
  phone: "helpdesk.channel.phone",
  web: "helpdesk.channel.web",
  note: "helpdesk.channel.note",
  sms: "helpdesk.channel.sms",
  text: "helpdesk.channel.sms",
  chat: "helpdesk.channel.chat",
  twitter: "helpdesk.channel.twitter",
  facebook: "helpdesk.channel.facebook",
};

/** Localised channel label for Zammad article types. */
function channelLabel(
  type: string | null | undefined,
  tr: (key: keyof Messages) => string,
): string | null {
  const raw = (type ?? "").toLowerCase();
  if (!raw) return null;
  const key = CHANNEL_LABEL_KEYS[raw];
  if (key) return tr(key);
  return `${tr("helpdesk.channel.other")} (${raw})`;
}

/** True when any SLA deadline is under 60 minutes or already overdue. */
function ticketHasSlaRisk(t: TicketSummary, now = Date.now()): boolean {
  const check = (iso: string | null) => {
    if (!iso) return false;
    return (new Date(iso).getTime() - now) / 60_000 < 60;
  };
  return (
    check(t.firstResponseEscalationAt) ||
    check(t.closeEscalationAt) ||
    check(t.escalationAt)
  );
}

function attachmentIcon(filename: string, size = 11) {
  if (/\.(png|jpe?g|gif|webp|svg)$/i.test(filename))
    return <ImageIcon size={size} />;
  return <FileText size={size} />;
}

export function HelpdeskClient({
  workspaceId,
  workspaceName,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
}) {
  const t = useT();
  /** Threads `ws=<workspaceId>` through every helpdesk call so the server
   * resolves the right Zammad tenant and never leaks tickets across portals. */
  const apiUrl = useCallback(
    (path: string, params?: Record<string, string | number | undefined | null>) => {
      const u = new URL(path, window.location.origin);
      u.searchParams.set("ws", workspaceId);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v != null && v !== "") u.searchParams.set(k, String(v));
        }
      }
      return u.toString();
    },
    [workspaceId],
  );

  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  const [meta, setMeta] = useState<TicketMeta | null>(null);
  const [me, setMe] = useState<{ id: number | null; email: string | null }>({
    id: null,
    email: null,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [stateFilter, setStateFilter] = useState<StateFilter>("open");
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [slaRiskOnly, setSlaRiskOnly] = useState(false);
  const [queueStats, setQueueStats] = useState<{
    openCount: number;
    openCapped: boolean;
    slaAtRiskCount: number;
    slaAtRiskCapped?: boolean;
    closedToday: number;
    closedCapped?: boolean;
  } | null>(null);
  const [crmPersonLink, setCrmPersonLink] = useState<{
    url: string;
    label: string;
  } | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const [showNew, setShowNew] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const newTitleRef = useRef<HTMLInputElement>(null);

  // Bulk selection: per-id checkbox state. Cleared whenever filters change.
  const [bulkIds, setBulkIds] = useState<Set<number>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // Customer-360 drawer
  const [customerDrawerId, setCustomerDrawerId] = useState<number | null>(null);

  // Canned responses (localStorage). Loaded lazily from the workspace key.
  const [canned, setCanned] = useState<CannedResponse[]>([]);
  useEffect(() => {
    setCanned(loadCanned(workspaceId));
  }, [workspaceId]);
  const persistCanned = useCallback(
    (next: CannedResponse[]) => {
      setCanned(next);
      saveCanned(workspaceId, next);
    },
    [workspaceId],
  );

  // Shortcut overlay
  const [showShortcuts, setShowShortcuts] = useState(false);
  // Composer ref so shortcuts (R/N) can focus it
  const composerRef = useRef<HTMLTextAreaElement>(null);
  // Search input ref for the "/" shortcut
  const searchInputRef = useRef<HTMLInputElement>(null);

  /* ── Loaders ────────────────────────────────────────────────── */

  const loadList = useCallback(
    async (q: string, st: StateFilter, scope: ScopeFilter) => {
      setLoading(true);
      setError(null);
      try {
        const overviewMatch = scope.startsWith("overview:")
          ? scope.split(":")[1]
          : undefined;
        const r = await fetch(
          apiUrl("/api/helpdesk/tickets", {
            q: q.trim() || undefined,
            state: overviewMatch ? undefined : st,
            overview: overviewMatch,
          }),
          { cache: "no-store" },
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setTickets(j.tickets ?? []);
        setMeta(j.meta ?? null);
        if (j.me) setMe(j.me);
        try {
          const rs = await fetch(apiUrl("/api/helpdesk/stats"), { cache: "no-store" });
          const js = await rs.json();
          if (rs.ok) setQueueStats(js);
        } catch {
          /* stats optional */
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [apiUrl],
  );

  const loadDetail = useCallback(
    async (id: number) => {
      setDetailLoading(true);
      try {
        const r = await fetch(apiUrl(`/api/helpdesk/ticket/${id}`), { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail(j.ticket);
      } catch (e) {
        alert(`${t("helpdesk.error.loadTicket")}: ${e instanceof Error ? e.message : e}`);
      } finally {
        setDetailLoading(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    void loadList(search, stateFilter, scopeFilter);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search / filter changes
  useEffect(() => {
    const t = setTimeout(() => void loadList(search, stateFilter, scopeFilter), 300);
    return () => clearTimeout(t);
  }, [search, stateFilter, scopeFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId) void loadDetail(selectedId);
    else setDetail(null);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const email = detail?.customerEmail?.trim();
    if (!email || email.endsWith("@import.kineo360.work")) {
      setCrmPersonLink(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl("/api/helpdesk/crm-person", { email }), {
          cache: "no-store",
        });
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok || !j.personUrl) {
          setCrmPersonLink(null);
          return;
        }
        const person = j.person as { firstName?: string; lastName?: string } | null;
        const label = person
          ? `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim() ||
            t("helpdesk.crm.twentyLabel")
          : t("helpdesk.crm.twentyLabel");
        setCrmPersonLink({ url: j.personUrl as string, label });
      } catch {
        if (!cancelled) setCrmPersonLink(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [detail?.customerEmail, apiUrl, t]);

  /* ── Derived ────────────────────────────────────────────────── */

  const scopedTickets = useMemo(() => {
    let list = tickets;
    if (scopeFilter === "mine" && me.id) {
      list = list.filter((t) => t.ownerId === me.id);
    } else if (scopeFilter === "unassigned") {
      // Zammad's "system" owner has id 1 — treat as unassigned.
      list = list.filter((t) => !t.ownerId || t.ownerId === 1);
    }
    if (slaRiskOnly) {
      list = list.filter((t) => ticketHasSlaRisk(t));
    }
    return list;
  }, [tickets, scopeFilter, me.id, slaRiskOnly]);

  const counts = useMemo(() => {
    const open = tickets.filter((t) =>
      /new|open|pending/i.test(t.stateName),
    ).length;
    const closed = tickets.filter((t) => /closed|merged/i.test(t.stateName))
      .length;
    return { open, closed, all: tickets.length };
  }, [tickets]);

  const scopeCounts = useMemo(() => {
    const mine = me.id ? tickets.filter((t) => t.ownerId === me.id).length : 0;
    const unassigned = tickets.filter((t) => !t.ownerId || t.ownerId === 1)
      .length;
    return { all: tickets.length, mine, unassigned };
  }, [tickets, me.id]);

  /* ── Mutations ──────────────────────────────────────────────── */

  const onCreateTicket = async (titleEl: HTMLInputElement, bodyEl: HTMLTextAreaElement) => {
    const title = titleEl.value.trim();
    const body = bodyEl.value.trim();
    if (!title) return;
    try {
      const r = await fetch(apiUrl("/api/helpdesk/tickets"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setShowNew(false);
      titleEl.value = "";
      bodyEl.value = "";
      await loadList(search, stateFilter, scopeFilter);
      setSelectedId(j.ticket.id);
    } catch (e) {
      alert(`${t("helpdesk.error.createTicket")}: ${e instanceof Error ? e.message : e}`);
    }
  };

  const onPatchTicket = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!detail) return;
      try {
        const r = await fetch(apiUrl(`/api/helpdesk/ticket/${detail.id}`), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail(j.ticket);
        setTickets((prev) =>
          prev.map((t) =>
            t.id === detail.id
              ? {
                  ...t,
                  stateId: j.ticket.stateId,
                  stateName: j.ticket.stateName,
                  priorityId: j.ticket.priorityId,
                  priorityName: j.ticket.priorityName,
                  groupId: j.ticket.groupId,
                  groupName: j.ticket.groupName,
                  ownerId: j.ticket.ownerId,
                  ownerName: j.ticket.ownerName,
                  updatedAt: j.ticket.updatedAt,
                }
              : t,
          ),
        );
      } catch (e) {
        alert(`${t("helpdesk.error.save")}: ${e instanceof Error ? e.message : e}`);
      }
    },
    [detail, apiUrl],
  );

  const onSend = useCallback(
    async (opts: {
      body: string;
      internal: boolean;
      type: "note" | "email" | "phone";
      nextStateId?: number;
      /** Optional internal note recorded when closing (customer reply tab). */
      internalSolution?: string;
    }) => {
      if (!detail || !opts.body.trim()) return;
      try {
        const r = await fetch(apiUrl(`/api/helpdesk/ticket/${detail.id}`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            body: opts.body,
            type: opts.type,
            internal: opts.internal,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        if (opts.internalSolution?.trim()) {
          const esc = opts.internalSolution
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;");
          const r2 = await fetch(apiUrl(`/api/helpdesk/ticket/${detail.id}`), {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              body: `<p><strong>Lösung / Abschluss (intern)</strong></p><p>${esc.replace(/\n/g, "<br/>")}</p>`,
              type: "note",
              internal: true,
            }),
          });
          const j2 = await r2.json();
          if (!r2.ok) throw new Error(j2.error ?? `HTTP ${r2.status}`);
        }
        if (opts.nextStateId && opts.nextStateId !== detail.stateId) {
          await onPatchTicket({ state_id: opts.nextStateId });
        } else {
          void loadDetail(detail.id);
        }
      } catch (e) {
        alert(`${t("helpdesk.error.send")}: ${e instanceof Error ? e.message : e}`);
      }
    },
    [detail, apiUrl, loadDetail, onPatchTicket],
  );

  /* ── Tags ─────────────────────────────────────────────────────── */

  const onAddTag = useCallback(
    async (tag: string) => {
      if (!detail) return;
      try {
        const r = await fetch(apiUrl(`/api/helpdesk/ticket/${detail.id}/tags`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ tag }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail((d) => (d ? { ...d, tags: j.tags ?? [] } : d));
      } catch (e) {
        alert(`${t("helpdesk.error.tagAdd")}: ${e instanceof Error ? e.message : e}`);
      }
    },
    [detail, apiUrl],
  );

  const onRemoveTag = useCallback(
    async (tag: string) => {
      if (!detail) return;
      try {
        const r = await fetch(
          apiUrl(`/api/helpdesk/ticket/${detail.id}/tags`, { tag }),
          { method: "DELETE" },
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail((d) => (d ? { ...d, tags: j.tags ?? [] } : d));
      } catch (e) {
        alert(`${t("helpdesk.error.tagRemove")}: ${e instanceof Error ? e.message : e}`);
      }
    },
    [detail, apiUrl],
  );

  /* ── Customer portal magic link ───────────────────────────────── */

  /**
   * Mint a signed magic-link the customer can use to view & reply to
   * the ticket without a portal account. We then copy the URL to the
   * clipboard and pop a small confirmation toast in the UI.
   */
  const [portalLinkBusy, setPortalLinkBusy] = useState(false);
  const [portalLinkInfo, setPortalLinkInfo] = useState<string | null>(null);

  const onMintPortalLink = useCallback(async () => {
    if (!detail) return;
    setPortalLinkBusy(true);
    setPortalLinkInfo(null);
    try {
      const r = await fetch(
        apiUrl(`/api/helpdesk/ticket/${detail.id}/portal-link`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ttlDays: 30 }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const url = j.url as string;
      try {
        await navigator.clipboard.writeText(url);
        setPortalLinkInfo(t("helpdesk.portalLink.copiedToast"));
      } catch {
        // Some browsers refuse clipboard writes outside user gestures
        // — fall back to a plain prompt so the agent can still copy.
        window.prompt(t("helpdesk.portalLink.prompt"), url);
        setPortalLinkInfo(t("helpdesk.portalLink.manualCopied"));
      }
      setTimeout(() => setPortalLinkInfo(null), 4000);
    } catch (e) {
      alert(`${t("helpdesk.error.portalLink")}: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPortalLinkBusy(false);
    }
  }, [detail, apiUrl]);

  /* ── Macros ───────────────────────────────────────────────────── */

  const onApplyMacro = useCallback(
    async (macroId: number) => {
      if (!detail) return;
      try {
        const r = await fetch(
          apiUrl(`/api/helpdesk/ticket/${detail.id}/macro`),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ macroId }),
          },
        );
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail(j.ticket);
        // Refresh list so summary fields stay in sync
        void loadList(search, stateFilter, scopeFilter);
      } catch (e) {
        alert(`${t("helpdesk.error.macro")}: ${e instanceof Error ? e.message : e}`);
      }
    },
    [detail, apiUrl, loadList, search, stateFilter, scopeFilter],
  );

  /* ── Bulk operations ──────────────────────────────────────────── */

  const onBulkPatch = useCallback(
    async (patch: Record<string, number>) => {
      if (!bulkIds.size) return;
      setBulkBusy(true);
      try {
        const r = await fetch(apiUrl(`/api/helpdesk/tickets/bulk`), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids: Array.from(bulkIds), patch }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        const failed = (j.results as { id: number; ok: boolean; error?: string }[]).filter(
          (x) => !x.ok,
        );
        if (failed.length) {
          alert(
            `${failed.length} / ${bulkIds.size} — ${t("helpdesk.bulk.partialFail")}\n` +
              failed.map((f) => `#${f.id}: ${f.error ?? "?"}`).join("\n"),
          );
        }
        setBulkIds(new Set());
        await loadList(search, stateFilter, scopeFilter);
        if (selectedId && bulkIds.has(selectedId)) {
          void loadDetail(selectedId);
        }
      } catch (e) {
        alert(`${t("helpdesk.error.bulk")}: ${e instanceof Error ? e.message : e}`);
      } finally {
        setBulkBusy(false);
      }
    },
    [bulkIds, apiUrl, loadList, loadDetail, search, stateFilter, scopeFilter, selectedId, t],
  );

  const toggleBulk = useCallback((id: number) => {
    setBulkIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  /* ── Reset bulk on filter change ──────────────────────────────── */
  useEffect(() => {
    setBulkIds(new Set());
  }, [search, stateFilter, scopeFilter]);

  /* ── Pane 1 — list ──────────────────────────────────────────── */
  const primary = (
    <>
      <PaneHeader
        title={t("helpdesk.tickets")}
        subtitle={workspaceName}
        accent={accent}
        icon={<Headphones size={14} style={{ color: accent }} />}
        right={
          <>
            <button
              type="button"
              onClick={() => void loadList(search, stateFilter, scopeFilter)}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("common.refresh")}
            >
              <RefreshCw size={13} />
            </button>
            <Link
              href={`/${workspaceId}/helpdesk/settings`}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("helpdesk.settings")}
            >
              <SettingsIcon size={13} />
            </Link>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("helpdesk.import.csvTitle")}
            >
              <FileUp size={13} />
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNew(true);
                setTimeout(() => newTitleRef.current?.focus(), 30);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11.5px]"
              style={{ background: accent }}
              title={t("helpdesk.newTicket")}
            >
              <Plus size={12} /> Ticket
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="relative">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
            />
            <input
              ref={searchInputRef}
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("common.search")}
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1.5 text-[11.5px] outline-none focus:border-stroke-2"
            />
          </div>
          <div className="flex items-center gap-1">
            <ScopeButton
              label={t("helpdesk.scope.all")}
              count={scopeCounts.all}
              active={scopeFilter === "all"}
              onClick={() => setScopeFilter("all")}
              accent={accent}
            />
            <ScopeButton
              label={t("helpdesk.scope.mine")}
              count={scopeCounts.mine}
              active={scopeFilter === "mine"}
              onClick={() => setScopeFilter("mine")}
              accent={accent}
              disabled={!me.id}
            />
            <ScopeButton
              label={t("helpdesk.scope.unassigned")}
              count={scopeCounts.unassigned}
              active={scopeFilter === "unassigned"}
              onClick={() => setScopeFilter("unassigned")}
              accent={accent}
            />
            <button
              type="button"
              title={t("helpdesk.slaRisk.title")}
              onClick={() => setSlaRiskOnly((v) => !v)}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10.5px] font-medium transition-colors ${
                slaRiskOnly
                  ? "border-amber-500/50 bg-amber-500/10 text-amber-200"
                  : "border-stroke-1 text-text-tertiary hover:border-stroke-2 hover:text-text-secondary"
              }`}
            >
              <Timer size={11} />
              {t("helpdesk.slaRisk")}
              {queueStats != null && queueStats.slaAtRiskCount > 0 ? (
                <span className="font-mono text-[9.5px] opacity-90">
                  {queueStats.slaAtRiskCount}
                </span>
              ) : null}
            </button>
          </div>
          {meta?.overviews?.length ? (
            <OverviewsBar
              overviews={meta.overviews}
              activeId={
                scopeFilter.startsWith("overview:")
                  ? Number(scopeFilter.split(":")[1])
                  : null
              }
              onPick={(id) =>
                setScopeFilter(id ? (`overview:${id}` as ScopeFilter) : "all")
              }
              accent={accent}
            />
          ) : null}
          <div className="flex items-center gap-2 border-b border-stroke-1 -mx-3 px-3">
            <StateTab
              label={t("helpdesk.filter.open")}
              count={counts.open}
              active={stateFilter === "open"}
              onClick={() => setStateFilter("open")}
              accent={accent}
            />
            <StateTab
              label={t("helpdesk.filter.closed")}
              count={counts.closed}
              active={stateFilter === "closed"}
              onClick={() => setStateFilter("closed")}
              accent={accent}
            />
            <StateTab
              label={t("helpdesk.filter.all")}
              count={counts.all}
              active={stateFilter === "all"}
              onClick={() => setStateFilter("all")}
              accent={accent}
            />
          </div>
          {queueStats ? (
            <div className="mt-2 pt-2 border-t border-stroke-1 space-y-1">
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-text-quaternary">
                <span>
                  {t("helpdesk.stats.open")}:{" "}
                  <strong className="text-text-secondary font-mono">
                    {queueStats.openCount}
                    {queueStats.openCapped ? "+" : ""}
                  </strong>
                </span>
                <span>
                  {t("helpdesk.stats.slaAtRisk")}:{" "}
                  <strong className="text-text-secondary font-mono">
                    {queueStats.slaAtRiskCount}
                  </strong>
                </span>
                <span>
                  {t("helpdesk.stats.closedToday")}:{" "}
                  <strong className="text-text-secondary font-mono">
                    {queueStats.closedToday}
                    {queueStats.closedCapped ? "+" : ""}
                  </strong>
                </span>
              </div>
              {(queueStats.openCapped ||
                queueStats.closedCapped ||
                queueStats.slaAtRiskCapped) && (
                <p className="text-[9px] text-text-quaternary/90">
                  {t("helpdesk.stats.capped")}
                </p>
              )}
            </div>
          ) : null}
        </div>
      </PaneHeader>

      {showNew && (
        <NewTicketForm
          accent={accent}
          inputRef={newTitleRef}
          onSubmit={onCreateTicket}
          onCancel={() => setShowNew(false)}
        />
      )}

      {error && (
        <div className="p-3">
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] p-2 whitespace-pre-wrap">
            {error}
          </div>
        </div>
      )}

      {bulkIds.size > 0 && meta && (
        <BulkActionsBar
          accent={accent}
          count={bulkIds.size}
          totalVisible={scopedTickets.length}
          busy={bulkBusy}
          meta={meta}
          onClear={() => setBulkIds(new Set())}
          onSelectAll={() =>
            setBulkIds(new Set(scopedTickets.map((t) => t.id)))
          }
          onPatch={onBulkPatch}
        />
      )}

      <TicketCardList
        tickets={scopedTickets}
        loading={loading && tickets.length === 0}
        selectedId={selectedId}
        onSelect={setSelectedId}
        meId={me.id}
        bulkIds={bulkIds}
        onToggleBulk={toggleBulk}
        emptyHint={
          search
            ? t("common.noResults")
            : scopeFilter === "mine"
              ? t("helpdesk.empty.mine")
              : scopeFilter === "unassigned"
                ? t("helpdesk.empty.allAssigned")
                : stateFilter === "open"
                  ? t("helpdesk.empty.open")
                  : t("helpdesk.empty.generic")
        }
      />
    </>
  );

  /* ── Pane 2 — conversation ──────────────────────────────────── */

  const grouped = useMemo(
    () =>
      detail ? groupByDate(detail.articles, (a) => a.createdAt) : [],
    [detail],
  );

  const secondary = (
    <>
      <PaneHeader
        title={detail ? detail.title : t("helpdesk.conversation.title")}
        subtitle={
          detail
            ? `#${detail.number} · ${detail.articles.length} Beiträge`
            : t("helpdesk.conversation.pickTicket")
        }
        accent={accent}
        right={
          detail && meta ? (
            <div className="flex items-center gap-1">
              <SlaIndicator ticket={detail} />
              <button
                type="button"
                onClick={() => void onMintPortalLink()}
                disabled={portalLinkBusy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px] disabled:opacity-60"
                title={t("helpdesk.portalLink.mintTitle")}
              >
                {portalLinkBusy ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : portalLinkInfo ? (
                  <CheckCircle2 size={11} className="text-emerald-400" />
                ) : (
                  <Link2 size={11} />
                )}
                {portalLinkInfo ? t("helpdesk.portalLink.copied") : t("helpdesk.portalLink.button")}
              </button>
              <MacrosMenu
                macros={meta.macros}
                onApply={onApplyMacro}
                accent={accent}
              />
            </div>
          ) : null
        }
      >
        {detail && (
          <TagsRow
            tags={detail.tags ?? []}
            onAdd={onAddTag}
            onRemove={onRemoveTag}
            accent={accent}
            apiUrl={apiUrl}
            ticketId={detail.id}
          />
        )}
      </PaneHeader>
      {!detail && !detailLoading ? (
        <PaneEmptyState
          title={t("helpdesk.empty.noTicket")}
          hint={t("helpdesk.empty.noTicketHint")}
          icon={<Inbox size={32} />}
        />
      ) : detailLoading && !detail ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 spin" style={{ color: accent }} />
        </div>
      ) : detail ? (
        <div className="flex-1 min-h-0 flex flex-col">
          <div className="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-4">
            {grouped.map((g) => (
              <section key={g.label}>
                <DateDivider label={g.label} />
                <div className="space-y-3 mt-2">
                  {g.items.map((a) => (
                    <ArticleBubble
                      key={a.id}
                      article={a}
                      accent={accent}
                    />
                  ))}
                </div>
              </section>
            ))}
            {grouped.length === 0 && (
              <p className="text-[11.5px] text-text-tertiary text-center py-4">
                {t("helpdesk.empty.noMessages")}
              </p>
            )}
          </div>
          <Composer
            accent={accent}
            states={meta?.states ?? []}
            currentStateId={detail.stateId}
            onSend={onSend}
            canned={canned}
            onSaveCanned={persistCanned}
            textareaRef={composerRef}
          />
        </div>
      ) : null}
    </>
  );

  /* ── Pane 3 — properties ───────────────────────────────────── */

  let detailPane;
  if (!detail) {
    detailPane = (
      <PaneEmptyState
        title={t("helpdesk.empty.zammadTitle")}
        hint={t("helpdesk.empty.zammadHint")}
        icon={<Headphones size={32} />}
      />
    );
  } else {
    const stateOptions = meta?.states.filter((s) => s.active) ?? [];
    const priorityOptions = meta?.priorities ?? [];
    const groupOptions = meta?.groups.filter((g) => g.active) ?? [];

    const customerTickets = tickets.filter(
      (t) => t.customerId === detail.customerId,
    );

    detailPane = (
      <DetailPane
        header={
          <div className="px-4 py-3">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary">
                Ticket #{detail.number}
              </span>
              <span className="text-text-quaternary">·</span>
              <StatusPill label={detail.stateName} />
              <PriorityChip name={detail.priorityName} />
              <SlaIndicator ticket={detail} compact={false} />
            </div>
            <h2 className="text-[14px] font-semibold text-text-primary leading-snug">
              {detail.title}
            </h2>
          </div>
        }
        main={
          <div className="px-4 py-3 space-y-5">
            <CustomerCard
              name={detail.customerName}
              email={detail.customerEmail}
              ticketCount={customerTickets.length}
              workspaceId={workspaceId}
              ticketId={String(detail.id)}
              ticketTitle={detail.title}
              ticketNumber={detail.number}
              onOpenProfile={() => setCustomerDrawerId(detail.customerId)}
              crmPersonUrl={crmPersonLink?.url}
              crmPersonLabel={crmPersonLink?.label}
            />
            {detail.note && (
              <section>
                <h3 className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1.5">
                  Interne Notiz zur Kundenkarte
                </h3>
                <p className="text-[11.5px] text-text-secondary whitespace-pre-wrap rounded-md bg-amber-500/5 border border-amber-500/30 p-2">
                  {detail.note}
                </p>
              </section>
            )}
            {customerTickets.length > 1 && (
              <section>
                <h3 className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1.5">
                  Verlauf · {customerTickets.length} Tickets
                </h3>
                <ul className="space-y-1">
                  {customerTickets.slice(0, 8).map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(t.id)}
                        className={`w-full text-left flex items-center gap-2 rounded-md border px-2 py-1.5 text-[11.5px] ${
                          t.id === detail.id
                            ? "border-stroke-2 bg-bg-overlay"
                            : "border-stroke-1 hover:border-stroke-2"
                        }`}
                      >
                        <span className="font-mono text-[10.5px] text-text-tertiary">
                          #{t.number}
                        </span>
                        <span className="flex-1 truncate text-text-secondary">
                          {t.title}
                        </span>
                        <StatusPill label={t.stateName} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        }
        rightSidebar={
          <>
            <SidebarSection title="Status & Zuordnung">
              <PropertyList
                rows={[
                  {
                    label: "Status",
                    value: (
                      <ColoredSelect
                        value={detail.stateId}
                        onChange={(v) => void onPatchTicket({ state_id: v })}
                        options={stateOptions.map((s) => ({
                          value: s.id,
                          label: s.name,
                          tone: toneForState(s.name),
                        }))}
                      />
                    ),
                  },
                  {
                    label: "Priorität",
                    value: (
                      <select
                        value={detail.priorityId}
                        onChange={(e) =>
                          void onPatchTicket({
                            priority_id: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none focus:border-stroke-2"
                      >
                        {priorityOptions.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    ),
                  },
                  {
                    label: "Gruppe",
                    value: (
                      <select
                        value={detail.groupId}
                        onChange={(e) =>
                          void onPatchTicket({
                            group_id: parseInt(e.target.value, 10),
                          })
                        }
                        className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none focus:border-stroke-2"
                      >
                        {groupOptions.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    ),
                  },
                  {
                    label: "Bearbeiter",
                    value: (
                      <OwnerPicker
                        agents={meta?.agents ?? []}
                        currentId={detail.ownerId}
                        currentName={detail.ownerName}
                        meId={me.id}
                        onChange={(id) =>
                          void onPatchTicket({ owner_id: id })
                        }
                      />
                    ),
                  },
                ]}
              />
            </SidebarSection>
            <SidebarSection title="Tags">
              <TagsEditor
                tags={detail.tags ?? []}
                onAdd={onAddTag}
                onRemove={onRemoveTag}
                accent={accent}
                apiUrl={apiUrl}
                ticketId={detail.id}
              />
            </SidebarSection>
            {hasSla(detail) && (
              <SidebarSection title="SLA">
                <SlaPanel ticket={detail} />
              </SidebarSection>
            )}
            <SidebarSection title="Aktivität">
              <ul className="space-y-1.5 text-[11px] text-text-tertiary">
                <li className="flex items-start gap-1.5">
                  <Plus size={11} className="mt-[1px] text-text-quaternary shrink-0" />
                  Erstellt {new Date(detail.createdAt).toLocaleString("de-DE")}
                </li>
                <li className="flex items-start gap-1.5">
                  <RefreshCw size={11} className="mt-[1px] text-text-quaternary shrink-0" />
                  Geändert {new Date(detail.updatedAt).toLocaleString("de-DE")}
                </li>
                {detail.lastContactAt && (
                  <li className="flex items-start gap-1.5">
                    <Mail size={11} className="mt-[1px] text-text-quaternary shrink-0" />
                    Letzter Kontakt{" "}
                    {new Date(detail.lastContactAt).toLocaleString("de-DE")}
                  </li>
                )}
              </ul>
            </SidebarSection>
          </>
        }
      />
    );
  }

  const detailHeader = (
    <header
      className="flex-1 px-3 py-2 flex items-center gap-2"
      style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
    >
      <Headphones size={14} style={{ color: accent }} />
      <h1 className="text-[12.5px] font-semibold leading-tight">
        Helpdesk ·{" "}
        <span className="text-text-tertiary font-normal">{workspaceName}</span>
      </h1>
      <button
        type="button"
        onClick={() => setShowShortcuts(true)}
        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px]"
        title="Tastenkürzel anzeigen (?)"
      >
        <Keyboard size={11} />
        Shortcuts
      </button>
      <a
        href={
          process.env.NEXT_PUBLIC_ZAMMAD_URL ??
          "https://support.medtheris.kineo360.work"
        }
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px]"
      >
        <ExternalLink size={11} />
        In Zammad öffnen
      </a>
    </header>
  );

  const detailWithHeader = (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-stroke-1 bg-bg-chrome flex">
        {detailHeader}
      </div>
      <div className="flex-1 min-h-0 flex">{detailPane}</div>
    </div>
  );

  /* ── Keyboard shortcuts ───────────────────────────────────────── */
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      // Ignore typing inside form fields except for global Escape.
      const target = e.target as HTMLElement | null;
      const inField =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (e.key === "Escape") {
        if (showShortcuts) setShowShortcuts(false);
        else if (customerDrawerId != null) setCustomerDrawerId(null);
        else if (showNew) setShowNew(false);
        return;
      }
      if (inField) return;
      // "?" or Shift+/
      if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        setShowShortcuts((v) => !v);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
        return;
      }
      if (e.key === "j" || e.key === "k") {
        if (!scopedTickets.length) return;
        e.preventDefault();
        const idx = selectedId
          ? scopedTickets.findIndex((t) => t.id === selectedId)
          : -1;
        const next =
          e.key === "j"
            ? Math.min(scopedTickets.length - 1, idx + 1)
            : Math.max(0, idx - 1);
        setSelectedId(scopedTickets[next]?.id ?? null);
        return;
      }
      if (e.key === "n") {
        e.preventDefault();
        setShowNew(true);
        setTimeout(() => newTitleRef.current?.focus(), 30);
        return;
      }
      if (e.key === "r" && selectedId) {
        e.preventDefault();
        composerRef.current?.focus();
        return;
      }
      if (e.key === "x" && selectedId) {
        e.preventDefault();
        toggleBulk(selectedId);
        return;
      }
      if (e.key === "u" && me.id && detail) {
        // assign to me
        e.preventDefault();
        void onPatchTicket({ owner_id: me.id });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    scopedTickets,
    selectedId,
    showNew,
    showShortcuts,
    customerDrawerId,
    me.id,
    detail,
    toggleBulk,
    onPatchTicket,
  ]);

  return (
    <>
      <ThreePaneLayout
        primary={primary}
        secondary={secondary}
        detail={detailWithHeader}
        storageKey={`helpdesk:${workspaceId}`}
        hasSelection={selectedId != null}
        onMobileBack={() => setSelectedId(null)}
      />
      {customerDrawerId != null && (
        <CustomerDrawer
          customerId={customerDrawerId}
          apiUrl={apiUrl}
          accent={accent}
          onClose={() => setCustomerDrawerId(null)}
          onPickTicket={(id) => {
            setSelectedId(id);
            setCustomerDrawerId(null);
          }}
        />
      )}
      {showShortcuts && (
        <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
      )}
      {showImport && (
        <ImportTicketsModal
          workspaceId={workspaceId}
          accent={accent}
          onClose={() => setShowImport(false)}
          onImported={() => void loadList(search, stateFilter, scopeFilter)}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------------- */
/*                       List + filter chrome                          */
/* ----------------------------------------------------------------- */

function ScopeButton({
  label,
  count,
  active,
  onClick,
  accent,
  disabled,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md border text-[10.5px] disabled:opacity-50 ${
        active
          ? "border-transparent text-white"
          : "border-stroke-1 text-text-tertiary hover:border-stroke-2"
      }`}
      style={active ? { background: accent } : undefined}
    >
      {label}
      <span
        className={`text-[10px] font-mono ${
          active ? "text-white/80" : "text-text-quaternary"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

function StateTab({
  label,
  count,
  active,
  onClick,
  accent,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative px-1 py-2 text-[11px] inline-flex items-center gap-1.5 transition-colors ${
        active
          ? "text-text-primary font-semibold"
          : "text-text-tertiary hover:text-text-secondary"
      }`}
      style={active ? { color: accent } : undefined}
    >
      {label}
      <span className="text-[10px] font-mono text-text-quaternary">{count}</span>
      {active && (
        <span
          aria-hidden
          className="absolute left-0 right-0 -bottom-px h-[2px]"
          style={{ background: accent }}
        />
      )}
    </button>
  );
}

function TicketCardList({
  tickets,
  loading,
  selectedId,
  onSelect,
  meId,
  bulkIds,
  onToggleBulk,
  emptyHint,
}: {
  tickets: TicketSummary[];
  loading: boolean;
  selectedId: number | null;
  onSelect: (id: number) => void;
  meId: number | null;
  bulkIds: Set<number>;
  onToggleBulk: (id: number) => void;
  emptyHint: string;
}) {
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        Lade…
      </div>
    );
  }
  if (tickets.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center text-[12px] text-text-tertiary">
        {emptyHint}
      </div>
    );
  }
  return (
    <ul className="flex-1 min-h-0 overflow-auto">
      {tickets.map((t) => (
        <TicketCard
          key={t.id}
          ticket={t}
          selected={t.id === selectedId}
          onClick={() => onSelect(t.id)}
          mine={meId != null && t.ownerId === meId}
          bulkChecked={bulkIds.has(t.id)}
          onToggleBulk={onToggleBulk}
          bulkActive={bulkIds.size > 0}
        />
      ))}
    </ul>
  );
}

function TicketCard({
  ticket: t,
  selected,
  onClick,
  mine,
  bulkChecked,
  onToggleBulk,
  bulkActive,
}: {
  ticket: TicketSummary;
  selected: boolean;
  onClick: () => void;
  mine: boolean;
  bulkChecked: boolean;
  onToggleBulk: (id: number) => void;
  bulkActive: boolean;
}) {
  const tr = useT();
  // Heuristic "unread": last contact is from a customer (the article count
  // grew since you last touched it). Zammad doesn't expose per-user read state
  // via REST, so we approximate with `articleCount > 1` AND state === "new".
  const unread = /^new$/i.test(t.stateName) || /pending reminder/i.test(t.stateName);

  return (
    <li>
      <div
        className={`group w-full text-left border-b border-stroke-1/60 flex items-stretch gap-0 cursor-pointer ${
          selected ? "bg-bg-overlay" : "hover:bg-bg-elevated"
        }`}
        onClick={onClick}
      >
        <PriorityBar name={t.priorityName} />
        {/* Multi-select checkbox: visible on hover, always visible when bulk-mode active */}
        <label
          onClick={(e) => e.stopPropagation()}
          className={`flex items-center justify-center w-7 shrink-0 cursor-pointer ${
            bulkActive || bulkChecked ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          } transition-opacity`}
          title={tr("helpdesk.card.selectBulk")}
        >
          <input
            type="checkbox"
            checked={bulkChecked}
            onChange={() => onToggleBulk(t.id)}
            className="w-3.5 h-3.5 rounded border-stroke-2 bg-bg-base accent-current"
          />
        </label>
        <div className="flex-1 min-w-0 pr-3 py-2.5 pl-1 flex items-start gap-2.5">
          <Avatar name={t.customerName} size={28} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 min-w-0">
              {unread && (
                <span
                  aria-label={tr("helpdesk.card.unread")}
                  className="inline-block w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"
                />
              )}
              <p className="text-[12.5px] font-semibold text-text-primary truncate flex-1">
                {t.title || tr("helpdesk.card.noTitle")}
              </p>
              <span className="text-[10px] text-text-quaternary shrink-0">
                {relativeTime(t.lastContactAt ?? t.updatedAt, tr)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 min-w-0">
              <span className="font-mono text-[10.5px] text-text-quaternary shrink-0">
                #{t.number}
              </span>
              <span className="text-[11.5px] text-text-tertiary truncate flex-1">
                {t.customerName}
              </span>
              {mine && (
                <span
                  className="text-[9.5px] uppercase font-semibold text-text-tertiary shrink-0"
                  title={tr("helpdesk.card.mine")}
                >
                  {tr("helpdesk.card.mine")}
                </span>
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              <StatusPill label={t.stateName} />
              <PriorityChip name={t.priorityName} />
              {t.groupName && (
                <span className="text-[10px] text-text-quaternary">
                  · {t.groupName}
                </span>
              )}
              <SlaIndicator ticket={t} compact />
            </div>
          </div>
        </div>
      </div>
    </li>
  );
}

/* ----------------------------------------------------------------- */
/*                   Conversation + composer                           */
/* ----------------------------------------------------------------- */

function DateDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-text-quaternary font-semibold">
      <span className="flex-1 h-px bg-stroke-1" />
      {label}
      <span className="flex-1 h-px bg-stroke-1" />
    </div>
  );
}

function ArticleBubble({
  article,
  accent,
}: {
  article: TicketArticle;
  accent: string;
}) {
  const tr = useT();
  const isCustomer = /customer/i.test(article.senderName);
  const isInternal = article.internal;
  const chLabel = channelLabel(article.type, tr);

  // Internal notes always full width, marked with amber stripe.
  if (isInternal) {
    return (
      <article className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3">
        <header className="flex items-baseline justify-between gap-2 mb-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <Avatar name={article.fromName || article.senderName} size={20} />
            <span className="text-[11px] font-semibold text-text-primary truncate">
              {article.fromName || article.senderName || tr("helpdesk.article.agent")}
            </span>
            <span className="inline-flex items-center gap-1 text-[9.5px] uppercase font-semibold text-amber-500">
              <StickyNote size={10} /> {tr("helpdesk.internalNote")}
            </span>
          </div>
          <time
            className="text-[10px] text-text-quaternary shrink-0"
            title={new Date(article.createdAt).toLocaleString("de-DE")}
          >
            {shortTime(article.createdAt)}
          </time>
        </header>
        <ArticleBody html={article.bodyHtml} accent={accent} />
        <Attachments attachments={article.attachments} />
      </article>
    );
  }

  // Customer = left-aligned. Agent = right-aligned. Both with avatar.
  return (
    <div
      className={`flex items-end gap-2 ${
        isCustomer ? "" : "flex-row-reverse"
      }`}
    >
      <Avatar
        name={article.fromName || article.senderName}
        size={28}
      />
      <div className={`max-w-[85%] min-w-0 ${isCustomer ? "" : "items-end"}`}>
        <header
          className={`flex items-baseline gap-1.5 text-[10px] text-text-quaternary mb-0.5 ${
            isCustomer ? "" : "justify-end"
          }`}
        >
          {!isCustomer && (
            <span
              className="inline-flex items-center gap-0.5"
              title={chLabel ?? undefined}
            >
              {channelIcon(article.type, 10)}
              {chLabel ? (
                <span className="uppercase tracking-wide text-[9px]">
                  {chLabel}
                </span>
              ) : null}
            </span>
          )}
          <span className="font-semibold text-text-tertiary">
            {article.fromName || article.senderName || tr("helpdesk.customer.unknown")}
          </span>
          <time title={new Date(article.createdAt).toLocaleString("de-DE")}>
            {shortTime(article.createdAt)}
          </time>
          {isCustomer && (
            <span
              className="inline-flex items-center gap-0.5"
              title={chLabel ?? undefined}
            >
              {chLabel ? (
                <span className="uppercase tracking-wide text-[9px]">
                  {chLabel}
                </span>
              ) : null}
              {channelIcon(article.type, 10)}
            </span>
          )}
        </header>
        <div
          className={`rounded-2xl px-3 py-2 border ${
            isCustomer
              ? "rounded-bl-sm border-stroke-1 bg-bg-elevated"
              : "rounded-br-sm border-transparent text-white"
          }`}
          style={
            !isCustomer
              ? { background: `${accent}` }
              : undefined
          }
        >
          {article.subject && article.type === "email" && (
            <p
              className={`text-[11.5px] font-semibold mb-1 ${
                isCustomer ? "text-text-secondary" : "text-white/90"
              }`}
            >
              {article.subject}
            </p>
          )}
          <ArticleBody
            html={article.bodyHtml}
            accent={accent}
            invert={!isCustomer}
          />
          <Attachments attachments={article.attachments} invert={!isCustomer} />
        </div>
      </div>
    </div>
  );
}

function ArticleBody({
  html,
  accent,
  invert,
}: {
  html: string;
  accent: string;
  invert?: boolean;
}) {
  return (
    <div
      className={`text-[12px] leading-relaxed [&_p]:my-1 [&_a]:underline break-words ${
        invert ? "text-white [&_a]:text-white" : "text-text-primary [&_a]:text-blue-400"
      }`}
      style={{ "--accent": accent } as React.CSSProperties}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function Attachments({
  attachments,
  invert,
}: {
  attachments: TicketArticle["attachments"];
  invert?: boolean;
}) {
  if (!attachments.length) return null;
  return (
    <ul className="mt-2 flex flex-wrap gap-1.5">
      {attachments.map((att) => (
        <li
          key={att.id}
          className={`inline-flex items-center gap-1 text-[10.5px] px-1.5 py-0.5 rounded border ${
            invert
              ? "border-white/30 bg-white/10 text-white/90"
              : "border-stroke-1 bg-bg-base text-text-tertiary"
          }`}
          title={`${att.filename} (${Math.round(att.size / 1024)} KB)`}
        >
          {attachmentIcon(att.filename)}
          <span className="truncate max-w-[160px]">{att.filename}</span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- */
/*                         Composer (rich)                             */
/* ----------------------------------------------------------------- */

function isLikelyClosedState(stateName: string | undefined): boolean {
  if (!stateName) return false;
  return /geschlossen|closed|abgeschlossen|gelöst|solved|resolved|merged/i.test(
    stateName,
  );
}

function Composer({
  accent,
  states,
  currentStateId,
  onSend,
  canned,
  onSaveCanned,
  textareaRef,
}: {
  accent: string;
  states: { id: number; name: string; active: boolean }[];
  currentStateId: number;
  onSend: (opts: {
    body: string;
    internal: boolean;
    type: "note" | "email" | "phone";
    nextStateId?: number;
    internalSolution?: string;
  }) => Promise<void> | void;
  canned: CannedResponse[];
  onSaveCanned: (next: CannedResponse[]) => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
}) {
  const tr = useT();
  const [tab, setTab] = useState<"reply" | "note">("reply");
  const [body, setBody] = useState("");
  const [internalSolution, setInternalSolution] = useState("");
  const [nextStateId, setNextStateId] = useState<number>(currentStateId);
  const fallbackRef = useRef<HTMLTextAreaElement>(null);
  const taRef = textareaRef ?? fallbackRef;
  const [showCanned, setShowCanned] = useState(false);
  const [showCannedEditor, setShowCannedEditor] = useState(false);

  useEffect(() => setNextStateId(currentStateId), [currentStateId]);

  const selectedStateName = states.find((s) => s.id === nextStateId)?.name;
  const showCloseSolution =
    tab === "reply" && isLikelyClosedState(selectedStateName);

  const submit = useCallback(async () => {
    if (!body.trim()) return;
    await onSend({
      body,
      internal: tab === "note",
      type: tab === "note" ? "note" : "email",
      nextStateId: tab === "reply" ? nextStateId : undefined,
      internalSolution: showCloseSolution ? internalSolution : undefined,
    });
    setBody("");
    setInternalSolution("");
  }, [body, tab, nextStateId, onSend, internalSolution, showCloseSolution]);

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  };

  const isNote = tab === "note";

  const insertCanned = (text: string) => {
    const ta = taRef.current;
    if (!ta) {
      setBody((b) => (b ? `${b}\n${text}` : text));
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + text + body.slice(end));
    setShowCanned(false);
    setTimeout(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    }, 0);
  };

  return (
    <div className="shrink-0 border-t border-stroke-1 bg-bg-elevated">
      <div className="px-3 pt-2 flex items-center gap-1">
        <ComposerTab
          label={tr("helpdesk.composer.answerTab")}
          icon={<Mail size={11} />}
          active={!isNote}
          onClick={() => setTab("reply")}
          accent={accent}
        />
        <ComposerTab
          label={tr("helpdesk.composer.internalTab")}
          icon={<StickyNote size={11} />}
          active={isNote}
          onClick={() => setTab("note")}
          accent={"#f59e0b"}
        />
        <span className="ml-auto text-[10px] text-text-quaternary">
          {tr("helpdesk.composer.sendShortcut")}
        </span>
      </div>
      <div
        className={`mx-3 mb-2 mt-1 rounded-md border ${
          isNote ? "border-amber-500/40 bg-amber-500/5" : "border-stroke-1"
        }`}
      >
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={onKey}
          placeholder={
            isNote
              ? tr("helpdesk.composer.placeholderNote")
              : tr("helpdesk.composer.placeholderReply")
          }
          rows={3}
          className="w-full bg-transparent px-2.5 py-2 text-[12px] outline-none resize-y"
        />
        {showCloseSolution && (
          <div className="px-2.5 pb-2 border-t border-stroke-1 pt-2 space-y-1">
            <label className="block text-[10px] font-medium text-text-tertiary">
              {tr("helpdesk.composer.solutionLabel")}
            </label>
            <textarea
              value={internalSolution}
              onChange={(e) => setInternalSolution(e.target.value)}
              placeholder={tr("helpdesk.composer.solutionPlaceholder")}
              rows={2}
              className="w-full bg-bg-base border border-amber-500/30 rounded-md px-2 py-1.5 text-[11px] outline-none focus:border-amber-500/50 resize-y"
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2 px-2 py-1.5 border-t border-stroke-1">
          <div className="flex items-center gap-1 relative">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10.5px] text-text-tertiary hover:text-text-primary"
              title={tr("helpdesk.composer.attachmentSoon")}
              disabled
            >
              <Paperclip size={11} /> {tr("helpdesk.composer.attachment")}
            </button>
            <button
              type="button"
              onClick={() => setShowCanned((v) => !v)}
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] hover:bg-bg-overlay ${
                showCanned ? "text-text-primary bg-bg-overlay" : "text-text-tertiary"
              }`}
              title={tr("helpdesk.composer.templatesTitle")}
            >
              <FileText size={11} /> {tr("helpdesk.composer.templates")}
              {canned.length > 0 && (
                <span className="text-[9px] font-mono">({canned.length})</span>
              )}
            </button>
            {showCanned && (
              <CannedResponsesPopover
                canned={canned}
                onPick={insertCanned}
                onClose={() => setShowCanned(false)}
                onManage={() => {
                  setShowCanned(false);
                  setShowCannedEditor(true);
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNote && (
              <label className="inline-flex items-center gap-1.5 text-[10.5px] text-text-tertiary">
                {tr("helpdesk.composer.statusAfterSend")}
                <select
                  value={nextStateId}
                  onChange={(e) => setNextStateId(parseInt(e.target.value, 10))}
                  className="bg-bg-base border border-stroke-1 rounded px-1.5 py-0.5 text-[11px] outline-none focus:border-stroke-2"
                >
                  {states
                    .filter((s) => s.active)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!body.trim()}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-white text-[11.5px] disabled:opacity-50"
              style={{ background: isNote ? "#f59e0b" : accent }}
            >
              <Send size={11} />
              {isNote ? tr("helpdesk.composer.saveNote") : tr("common.send")}
            </button>
          </div>
        </div>
      </div>
      {showCannedEditor && (
        <CannedResponsesEditor
          canned={canned}
          onSave={(list) => {
            onSaveCanned(list);
            setShowCannedEditor(false);
          }}
          onClose={() => setShowCannedEditor(false)}
          accent={accent}
        />
      )}
    </div>
  );
}

function ComposerTab({
  label,
  icon,
  active,
  onClick,
  accent,
}: {
  label: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
  accent: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative inline-flex items-center gap-1 px-2 py-1 text-[11px] rounded-t-md border-x border-t ${
        active
          ? "border-stroke-1 bg-bg-base font-semibold text-text-primary -mb-px"
          : "border-transparent text-text-tertiary hover:text-text-secondary"
      }`}
      style={active ? { color: accent } : undefined}
    >
      {icon}
      {label}
    </button>
  );
}

/* ----------------------------------------------------------------- */
/*                       Sidebar bits                                  */
/* ----------------------------------------------------------------- */

function CustomerCard({
  name,
  email,
  ticketCount,
  workspaceId,
  ticketId,
  ticketTitle,
  ticketNumber,
  onOpenProfile,
  crmPersonUrl,
  crmPersonLabel,
}: {
  name: string;
  email: string | null;
  ticketCount: number;
  workspaceId: WorkspaceId;
  ticketId: string;
  ticketTitle: string;
  ticketNumber: string;
  onOpenProfile?: () => void;
  crmPersonUrl?: string;
  crmPersonLabel?: string;
}) {
  const tr = useT();
  const callHref = clickToCallUrl({
    workspaceId,
    subject: `Ticket #${ticketNumber} · ${ticketTitle}`,
    context: {
      kind: "helpdesk",
      ticketId,
      label: name || `#${ticketNumber}`,
    },
  });
  return (
    <section className="rounded-md border border-stroke-1 bg-bg-elevated p-3">
      <div className="flex items-start gap-3">
        <Avatar name={name} email={email} size={36} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onOpenProfile}
            className="text-left text-[13px] font-semibold text-text-primary truncate hover:text-blue-400 inline-flex items-center gap-1.5"
            title={tr("helpdesk.customer.profileTitle")}
          >
            <UserCircle2 size={12} className="text-text-quaternary" />
            {name || tr("helpdesk.customer.unknown")}
            <ArrowRight size={11} className="text-text-quaternary" />
          </button>
          {email && (
            <a
              href={`mailto:${email}`}
              className="mt-0.5 block text-[11.5px] text-text-tertiary hover:text-text-primary truncate"
            >
              <AtSign size={11} className="inline mr-1" />
              {email}
            </a>
          )}
          <div className="mt-1.5 flex items-center gap-2 text-[10.5px] text-text-tertiary">
            <span className="inline-flex items-center gap-1">
              <Inbox size={10} />
              {ticketCount} {ticketCount === 1 ? "Ticket" : "Tickets"}
            </span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        <a
          href={callHref}
          className="inline-flex items-center gap-1 rounded-md border border-stroke-1 bg-bg-base hover:bg-bg-overlay px-2 py-1 text-[11px] text-text-secondary"
          title={tr("helpdesk.customer.videoCall")}
        >
          <Video size={11} />
          {tr("helpdesk.customer.videoCall")}
        </a>
        {email && (
          <a
            href={`mailto:${email}`}
            className="inline-flex items-center gap-1 rounded-md border border-stroke-1 bg-bg-base hover:bg-bg-overlay px-2 py-1 text-[11px] text-text-secondary"
          >
            <Mail size={11} />
            {tr("helpdesk.customer.mailAction")}
          </a>
        )}
        {crmPersonUrl && (
          <a
            href={crmPersonUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-md border border-stroke-1 bg-bg-base hover:bg-bg-overlay px-2 py-1 text-[11px] text-text-secondary"
            title={tr("helpdesk.customer.crmTitle")}
          >
            <ExternalLink size={11} />
            {crmPersonLabel ?? tr("helpdesk.customer.crm")}
          </a>
        )}
        {onOpenProfile && (
          <button
            type="button"
            onClick={onOpenProfile}
            className="inline-flex items-center gap-1 rounded-md border border-stroke-1 bg-bg-base hover:bg-bg-overlay px-2 py-1 text-[11px] text-text-secondary ml-auto"
            title={tr("helpdesk.customer.profile360")}
          >
            <Users size={11} />
            {tr("helpdesk.customer.profile360")}
          </button>
        )}
      </div>
    </section>
  );
}

/**
 * Status select rendered as a coloured pill button. Native <select> is hidden
 * but kept for accessibility — clicking the pill triggers the underlying
 * dropdown so we keep the OS-native picker UX while the visual stays branded.
 */
function ColoredSelect({
  value,
  onChange,
  options,
}: {
  value: number;
  onChange: (v: number) => void;
  options: { value: number; label: string; tone: ReturnType<typeof toneForState> }[];
}) {
  const current = options.find((o) => o.value === value);
  return (
    <span className="relative inline-flex items-center w-full">
      <span className="pointer-events-none w-full">
        <span className="inline-flex items-center justify-between w-full gap-1 rounded-md border border-stroke-1 bg-bg-elevated px-1.5 py-1">
          {current ? (
            <StatusPill label={current.label} tone={current.tone} />
          ) : (
            <span className="text-[11px] text-text-tertiary">—</span>
          )}
          {current?.tone === "success" ? (
            <CheckCircle2 size={12} className="text-text-quaternary" />
          ) : current?.tone === "warn" ? (
            <AlertCircle size={12} className="text-text-quaternary" />
          ) : (
            <ChevronDown size={12} className="text-text-quaternary" />
          )}
        </span>
      </span>
      <select
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/* ----------------------------------------------------------------- */
/*                          New ticket                                  */
/* ----------------------------------------------------------------- */

function NewTicketForm({
  accent,
  inputRef,
  onSubmit,
  onCancel,
}: {
  accent: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onSubmit: (titleEl: HTMLInputElement, bodyEl: HTMLTextAreaElement) => Promise<void>;
  onCancel: () => void;
}) {
  const tr = useT();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  return (
    <div className="px-3 py-2 border-b border-stroke-1 bg-bg-elevated space-y-1.5">
      <input
        ref={inputRef}
        type="text"
        placeholder={tr("helpdesk.newTicket.subjectPh")}
        className="w-full bg-transparent border border-stroke-1 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-stroke-2"
      />
      <textarea
        ref={bodyRef}
        placeholder={tr("helpdesk.newTicket.bodyPh")}
        rows={3}
        className="w-full bg-transparent border border-stroke-1 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-stroke-2 resize-y"
      />
      <div className="flex items-center justify-end gap-1.5">
        <button
          type="button"
          onClick={onCancel}
          className="px-2 py-1 text-[11px] text-text-tertiary hover:text-text-primary"
        >
          {tr("helpdesk.newTicket.cancel")}
        </button>
        <button
          type="button"
          onClick={() => {
            if (inputRef.current && bodyRef.current) {
              void onSubmit(inputRef.current, bodyRef.current);
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11px]"
          style={{ background: accent }}
        >
          <Plus size={10} /> {tr("helpdesk.newTicket.submit")}
        </button>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                       SLA indicator (pill + panel)                  */
/* ----------------------------------------------------------------- */

/**
 * Returns whether the ticket has any SLA timestamps set. Used to hide the
 * SLA sidebar section when the workspace doesn't use SLAs at all.
 */
function hasSla(t: TicketSummary): boolean {
  return !!(
    t.firstResponseEscalationAt ||
    t.closeEscalationAt ||
    t.escalationAt
  );
}

type SlaState = "ok" | "warn" | "breached" | "fulfilled";

function slaState(deadlineIso: string | null, now = Date.now()): SlaState {
  if (!deadlineIso) return "fulfilled";
  const d = new Date(deadlineIso).getTime();
  const minsLeft = (d - now) / 60_000;
  if (minsLeft < 0) return "breached";
  if (minsLeft < 60) return "warn";
  return "ok";
}

function formatRemaining(iso: string | null): string {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  const sign = ms < 0 ? "-" : "";
  const abs = Math.abs(ms);
  const h = Math.floor(abs / 3_600_000);
  const m = Math.floor((abs % 3_600_000) / 60_000);
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `${sign}${d}d ${h % 24}h`;
  }
  if (h > 0) return `${sign}${h}h ${m}m`;
  return `${sign}${m}m`;
}

function SlaIndicator({
  ticket,
  compact,
}: {
  ticket: TicketSummary;
  compact?: boolean;
}) {
  const tr = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-US" : "de-DE";
  // The "next" relevant deadline is whichever escalates first.
  const candidates: { label: string; iso: string | null }[] = [
    { label: tr("helpdesk.sla.firstResponse"), iso: ticket.firstResponseEscalationAt },
    { label: tr("helpdesk.sla.closeDeadline"), iso: ticket.closeEscalationAt },
  ].filter((c) => !!c.iso);
  if (!candidates.length) return null;
  const next = candidates.sort(
    (a, b) =>
      new Date(a.iso!).getTime() - new Date(b.iso!).getTime(),
  )[0];
  const state = slaState(next.iso);
  const tone =
    state === "breached"
      ? { bg: "rgba(239,68,68,0.18)", fg: "#f87171", bd: "rgba(239,68,68,0.35)" }
      : state === "warn"
        ? { bg: "rgba(234,179,8,0.18)", fg: "#facc15", bd: "rgba(234,179,8,0.35)" }
        : { bg: "rgba(16,185,129,0.18)", fg: "#34d399", bd: "rgba(16,185,129,0.3)" };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border font-medium ${
        compact ? "px-1.5 py-[1px] text-[9.5px]" : "px-2 py-0.5 text-[10.5px]"
      }`}
      style={{ background: tone.bg, color: tone.fg, borderColor: tone.bd }}
      title={`${next.label} ${tr("helpdesk.sla.due")} ${new Date(next.iso!).toLocaleString(locStr)}`}
    >
      {state === "breached" ? (
        <AlertCircle size={compact ? 9 : 11} />
      ) : (
        <Timer size={compact ? 9 : 11} />
      )}
      {state === "breached" ? tr("helpdesk.sla.breached") : tr("helpdesk.sla.pill")}{" "}
      {formatRemaining(next.iso)}
    </span>
  );
}

function SlaPanel({ ticket }: { ticket: TicketSummary }) {
  const tr = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-US" : "de-DE";
  const rows: { label: string; iso: string | null; state: SlaState }[] = [];
  if (ticket.firstResponseEscalationAt)
    rows.push({
      label: tr("helpdesk.sla.panel.first"),
      iso: ticket.firstResponseEscalationAt,
      state: slaState(ticket.firstResponseEscalationAt),
    });
  if (ticket.closeEscalationAt)
    rows.push({
      label: tr("helpdesk.sla.panel.close"),
      iso: ticket.closeEscalationAt,
      state: slaState(ticket.closeEscalationAt),
    });
  if (!rows.length) {
    return (
      <p className="text-[11px] text-text-tertiary">{tr("helpdesk.sla.panel.none")}</p>
    );
  }
  return (
    <ul className="space-y-1.5 text-[11px]">
      {rows.map((r) => (
        <li
          key={r.label}
          className="flex items-center justify-between gap-2"
        >
          <span className="text-text-tertiary inline-flex items-center gap-1">
            <Clock size={11} className="text-text-quaternary" />
            {r.label}
          </span>
          <span
            className={`font-mono text-[10.5px] ${
              r.state === "breached"
                ? "text-red-400"
                : r.state === "warn"
                  ? "text-amber-400"
                  : "text-emerald-400"
            }`}
            title={r.iso ? new Date(r.iso).toLocaleString(locStr) : ""}
          >
            {formatRemaining(r.iso)}
          </span>
        </li>
      ))}
    </ul>
  );
}

/* ----------------------------------------------------------------- */
/*                         Tags row + editor                           */
/* ----------------------------------------------------------------- */

type ApiUrlFn = (
  path: string,
  params?: Record<string, string | number | undefined | null>,
) => string;

function TagsRow({
  tags,
  onAdd,
  onRemove,
  accent,
  apiUrl,
  ticketId,
}: {
  tags: string[];
  onAdd: (tag: string) => Promise<void> | void;
  onRemove: (tag: string) => Promise<void> | void;
  accent: string;
  apiUrl: ApiUrlFn;
  ticketId: number;
}) {
  // Compact horizontal row — only renders when tags exist or user wants to add.
  const [adding, setAdding] = useState(false);
  if (!tags.length && !adding) {
    return (
      <button
        type="button"
        onClick={() => setAdding(true)}
        className="inline-flex items-center gap-1 mt-1 text-[10.5px] text-text-tertiary hover:text-text-primary"
      >
        <TagIcon size={11} />
        Tag hinzufügen
      </button>
    );
  }
  return (
    <div className="mt-1 flex items-center gap-1 flex-wrap">
      {tags.map((t) => (
        <TagPill key={t} tag={t} onRemove={() => void onRemove(t)} accent={accent} />
      ))}
      <TagAdder
        onAdd={async (tag) => {
          await onAdd(tag);
          setAdding(false);
        }}
        onCancel={() => setAdding(false)}
        accent={accent}
        apiUrl={apiUrl}
        ticketId={ticketId}
        autoFocus={adding}
      />
    </div>
  );
}

function TagsEditor({
  tags,
  onAdd,
  onRemove,
  accent,
  apiUrl,
  ticketId,
}: {
  tags: string[];
  onAdd: (tag: string) => Promise<void> | void;
  onRemove: (tag: string) => Promise<void> | void;
  accent: string;
  apiUrl: ApiUrlFn;
  ticketId: number;
}) {
  return (
    <div className="space-y-2">
      {tags.length > 0 ? (
        <div className="flex items-center gap-1 flex-wrap">
          {tags.map((t) => (
            <TagPill key={t} tag={t} onRemove={() => void onRemove(t)} accent={accent} />
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-text-tertiary">Keine Tags.</p>
      )}
      <TagAdder
        onAdd={(tag) => onAdd(tag)}
        accent={accent}
        apiUrl={apiUrl}
        ticketId={ticketId}
      />
    </div>
  );
}

function TagPill({
  tag,
  onRemove,
  accent,
}: {
  tag: string;
  onRemove: () => void;
  accent: string;
}) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10px]"
      style={{
        borderColor: `${accent}40`,
        background: `${accent}14`,
        color: accent,
      }}
    >
      <TagIcon size={9} />
      {tag}
      <button
        type="button"
        onClick={onRemove}
        className="opacity-60 hover:opacity-100"
        title="Tag entfernen"
      >
        <XIcon size={10} />
      </button>
    </span>
  );
}

function TagAdder({
  onAdd,
  onCancel,
  accent,
  apiUrl,
  ticketId,
  autoFocus,
}: {
  onAdd: (tag: string) => Promise<void> | void;
  onCancel?: () => void;
  accent: string;
  apiUrl: ApiUrlFn;
  ticketId: number;
  autoFocus?: boolean;
}) {
  const [v, setV] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const q = v.trim();
    if (!q) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const r = await fetch(
          apiUrl(`/api/helpdesk/ticket/${ticketId}/tags`, { suggest: q }),
          { signal: ctrl.signal },
        );
        if (!r.ok) return;
        const j = await r.json();
        const list = (j.suggestions ?? []) as { name: string }[];
        setSuggestions(list.slice(0, 6).map((x) => x.name));
      } catch {
        /* aborted */
      }
    }, 200);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [v, apiUrl, ticketId]);

  const commit = async (tag: string) => {
    if (!tag.trim()) return;
    setBusy(true);
    try {
      await onAdd(tag.trim());
      setV("");
      setSuggestions([]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative inline-flex items-center gap-1">
      <input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(v);
          } else if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="Tag…"
        disabled={busy}
        className="bg-bg-elevated border border-stroke-1 rounded px-1.5 py-[2px] text-[10.5px] outline-none focus:border-stroke-2 w-24"
      />
      <button
        type="button"
        onClick={() => void commit(v)}
        disabled={!v.trim() || busy}
        className="text-[10px] px-1.5 py-[2px] rounded text-white disabled:opacity-50"
        style={{ background: accent }}
      >
        +
      </button>
      {suggestions.length > 0 && (
        <ul className="absolute top-full left-0 mt-1 z-30 min-w-[140px] rounded-md border border-stroke-1 bg-bg-elevated shadow-lg overflow-hidden">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  void commit(s);
                }}
                className="w-full text-left px-2 py-1 text-[11px] hover:bg-bg-overlay"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                          Macros menu                                */
/* ----------------------------------------------------------------- */

function MacrosMenu({
  macros,
  onApply,
  accent,
}: {
  macros: MacroSummary[];
  onApply: (id: number) => Promise<void> | void;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [open]);

  if (!macros.length) return null;
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary text-[11px]"
        title="Macro anwenden"
      >
        <Zap size={11} style={{ color: accent }} />
        Macros
        <ChevronDown size={11} className="text-text-quaternary" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 min-w-[220px] max-h-[280px] overflow-auto rounded-md border border-stroke-1 bg-bg-elevated shadow-xl">
          <ul className="py-1">
            {macros.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void onApply(m.id);
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-[11.5px] hover:bg-bg-overlay flex items-start gap-1.5"
                >
                  <Zap size={11} style={{ color: accent }} className="mt-[1px] shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-text-primary truncate">{m.name}</span>
                    {m.affects.length > 0 && (
                      <span className="block text-[9.5px] text-text-tertiary">
                        Setzt: {m.affects.join(", ")}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                       Bulk actions toolbar                          */
/* ----------------------------------------------------------------- */

function BulkActionsBar({
  count,
  totalVisible,
  busy,
  meta,
  onClear,
  onSelectAll,
  onPatch,
  accent,
}: {
  count: number;
  totalVisible: number;
  busy: boolean;
  meta: TicketMeta;
  onClear: () => void;
  onSelectAll: () => void;
  onPatch: (patch: Record<string, number>) => Promise<void> | void;
  accent: string;
}) {
  const [stateId, setStateId] = useState<number | "">("");
  const [priorityId, setPriorityId] = useState<number | "">("");
  const [groupId, setGroupId] = useState<number | "">("");
  const [ownerId, setOwnerId] = useState<number | "">("");

  const buildPatch = (): Record<string, number> => {
    const p: Record<string, number> = {};
    if (stateId !== "") p.state_id = Number(stateId);
    if (priorityId !== "") p.priority_id = Number(priorityId);
    if (groupId !== "") p.group_id = Number(groupId);
    if (ownerId !== "") p.owner_id = Number(ownerId);
    return p;
  };

  const apply = () => {
    const p = buildPatch();
    if (!Object.keys(p).length) return;
    void onPatch(p);
    setStateId("");
    setPriorityId("");
    setGroupId("");
    setOwnerId("");
  };

  return (
    <div
      className="border-b border-stroke-1 bg-bg-overlay/80 backdrop-blur px-3 py-2 flex items-center gap-2 flex-wrap"
      style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
    >
      <span className="text-[11.5px] font-semibold text-text-primary">
        {count} ausgewählt
      </span>
      {count < totalVisible && (
        <button
          type="button"
          onClick={onSelectAll}
          className="text-[10.5px] text-text-tertiary hover:text-text-primary underline"
        >
          Alle ({totalVisible}) auswählen
        </button>
      )}
      <button
        type="button"
        onClick={onClear}
        className="text-[10.5px] text-text-tertiary hover:text-text-primary"
      >
        Auswahl löschen
      </button>
      <span className="flex-1" />
      <select
        value={stateId}
        onChange={(e) =>
          setStateId(e.target.value === "" ? "" : parseInt(e.target.value, 10))
        }
        disabled={busy}
        className="bg-bg-base border border-stroke-1 rounded px-1.5 py-0.5 text-[11px]"
      >
        <option value="">Status…</option>
        {meta.states.filter((s) => s.active).map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
      <select
        value={priorityId}
        onChange={(e) =>
          setPriorityId(e.target.value === "" ? "" : parseInt(e.target.value, 10))
        }
        disabled={busy}
        className="bg-bg-base border border-stroke-1 rounded px-1.5 py-0.5 text-[11px]"
      >
        <option value="">Priorität…</option>
        {meta.priorities.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <select
        value={groupId}
        onChange={(e) =>
          setGroupId(e.target.value === "" ? "" : parseInt(e.target.value, 10))
        }
        disabled={busy}
        className="bg-bg-base border border-stroke-1 rounded px-1.5 py-0.5 text-[11px]"
      >
        <option value="">Gruppe…</option>
        {meta.groups.filter((g) => g.active).map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      <select
        value={ownerId}
        onChange={(e) =>
          setOwnerId(e.target.value === "" ? "" : parseInt(e.target.value, 10))
        }
        disabled={busy}
        className="bg-bg-base border border-stroke-1 rounded px-1.5 py-0.5 text-[11px]"
      >
        <option value="">Bearbeiter…</option>
        <option value={1}>— unzuweisen —</option>
        {meta.agents.map((a) => (
          <option key={a.id} value={a.id}>
            {a.fullName}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={apply}
        disabled={
          busy ||
          (stateId === "" &&
            priorityId === "" &&
            groupId === "" &&
            ownerId === "")
        }
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-white text-[11.5px] disabled:opacity-50"
        style={{ background: accent }}
      >
        {busy ? <Loader2 size={11} className="spin" /> : <CheckCircle2 size={11} />}
        Anwenden
      </button>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                          Owner picker                               */
/* ----------------------------------------------------------------- */

function OwnerPicker({
  agents,
  currentId,
  currentName,
  meId,
  onChange,
}: {
  agents: TicketUser[];
  currentId: number;
  currentName: string;
  meId: number | null;
  onChange: (id: number) => void;
}) {
  // Sort: me first, then alphabetical. Unassigned (id 1) is its own option.
  const sorted = useMemo(() => {
    const list = [...agents];
    list.sort((a, b) => {
      if (meId && a.id === meId) return -1;
      if (meId && b.id === meId) return 1;
      return a.fullName.localeCompare(b.fullName);
    });
    return list;
  }, [agents, meId]);

  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    const click = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [open]);

  const filtered = filter.trim()
    ? sorted.filter((a) =>
        a.fullName.toLowerCase().includes(filter.toLowerCase()),
      )
    : sorted;

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full inline-flex items-center justify-between gap-1.5 rounded-md border border-stroke-1 hover:border-stroke-2 bg-bg-elevated px-1.5 py-1 text-[11.5px] text-left"
      >
        {currentId && currentId !== 1 ? (
          <span className="inline-flex items-center gap-1.5 min-w-0">
            <Avatar name={currentName} size={16} />
            <span className="truncate">{currentName}</span>
          </span>
        ) : (
          <span className="text-text-tertiary">— unzugewiesen —</span>
        )}
        <ChevronDown size={11} className="text-text-quaternary" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-30 min-w-[220px] max-h-[280px] flex flex-col rounded-md border border-stroke-1 bg-bg-elevated shadow-xl">
          <div className="p-1.5 border-b border-stroke-1">
            <input
              autoFocus
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Agent suchen…"
              className="w-full bg-bg-base border border-stroke-1 rounded px-1.5 py-1 text-[11px] outline-none"
            />
          </div>
          <ul className="overflow-auto py-1">
            <li>
              <button
                type="button"
                onClick={() => {
                  onChange(1);
                  setOpen(false);
                }}
                className="w-full text-left px-2 py-1 text-[11px] hover:bg-bg-overlay text-text-tertiary"
              >
                — Unzuweisen —
              </button>
            </li>
            {meId && agents.find((a) => a.id === meId) && (
              <li>
                <button
                  type="button"
                  onClick={() => {
                    onChange(meId);
                    setOpen(false);
                  }}
                  className="w-full text-left px-2 py-1 text-[11px] hover:bg-bg-overlay font-semibold inline-flex items-center gap-1.5"
                >
                  <Avatar
                    name={agents.find((a) => a.id === meId)?.fullName ?? ""}
                    size={16}
                  />
                  Mir zuweisen
                </button>
              </li>
            )}
            {filtered.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(a.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-2 py-1 text-[11px] hover:bg-bg-overlay inline-flex items-center gap-1.5 ${
                    a.id === currentId ? "bg-bg-overlay" : ""
                  }`}
                >
                  <Avatar name={a.fullName} email={a.email} size={16} />
                  <span className="truncate flex-1">{a.fullName}</span>
                  {a.id === currentId && (
                    <CheckCircle2 size={11} className="text-emerald-400" />
                  )}
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-2 text-[11px] text-text-tertiary text-center">
                Keine Treffer.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                       Overviews quick-bar                           */
/* ----------------------------------------------------------------- */

function OverviewsBar({
  overviews,
  activeId,
  onPick,
  accent,
}: {
  overviews: OverviewSummary[];
  activeId: number | null;
  onPick: (id: number | null) => void;
  accent: string;
}) {
  // Show top 4 inline; collapse the rest into a "+N" menu.
  const [showAll, setShowAll] = useState(false);
  const top = showAll ? overviews : overviews.slice(0, 4);
  const more = overviews.slice(4);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="inline-flex items-center gap-1 text-[10px] text-text-quaternary mr-0.5">
        <Filter size={10} /> Ansichten:
      </span>
      {top.map((o) => (
        <button
          key={o.id}
          type="button"
          onClick={() => onPick(activeId === o.id ? null : o.id)}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-[2px] text-[10px] ${
            activeId === o.id
              ? "border-transparent text-white"
              : "border-stroke-1 text-text-tertiary hover:border-stroke-2"
          }`}
          style={activeId === o.id ? { background: accent } : undefined}
          title={`Zammad-Ansicht: ${o.name}`}
        >
          <Eye size={10} />
          {o.name}
        </button>
      ))}
      {more.length > 0 && !showAll && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-[10px] text-text-tertiary hover:text-text-primary"
        >
          +{more.length} weitere
        </button>
      )}
      {showAll && more.length > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-[10px] text-text-tertiary hover:text-text-primary"
        >
          weniger
        </button>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                       Customer 360 drawer                           */
/* ----------------------------------------------------------------- */

type CustomerProfile = {
  user: TicketUser & {
    organization: string | null;
    phone: string | null;
    createdAt: string | null;
  };
  tickets: TicketSummary[];
  openCount: number;
  closedCount: number;
};

function CustomerDrawer({
  customerId,
  apiUrl,
  accent,
  onClose,
  onPickTicket,
}: {
  customerId: number;
  apiUrl: ApiUrlFn;
  accent: string;
  onClose: () => void;
  onPickTicket: (id: number) => void;
}) {
  const t = useT();
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(apiUrl(`/api/helpdesk/customer/${customerId}`), { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (cancelled) return;
        if (!r.ok) {
          setError(j.error ?? `HTTP ${r.status}`);
          return;
        }
        setProfile(j);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [customerId, apiUrl]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-stretch justify-end"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-bg-base border-l border-stroke-1 shadow-2xl flex flex-col"
        style={{ boxShadow: `inset 3px 0 0 0 ${accent}` }}
      >
        <header className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <UserCircle2 size={16} style={{ color: accent }} />
          <h2 className="text-[13px] font-semibold">{t("helpdesk.drawer.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded hover:bg-bg-overlay text-text-tertiary"
            title={t("helpdesk.drawer.close")}
          >
            <XIcon size={14} />
          </button>
        </header>
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 size={18} className="spin text-text-tertiary" />
            </div>
          ) : error ? (
            <div className="p-4">
              <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11.5px] p-2">
                {error}
              </div>
            </div>
          ) : profile ? (
            <CustomerProfileBody
              profile={profile}
              onPickTicket={onPickTicket}
              accent={accent}
            />
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function CustomerProfileBody({
  profile,
  onPickTicket,
  accent,
}: {
  profile: CustomerProfile;
  onPickTicket: (id: number) => void;
  accent: string;
}) {
  const tr = useT();
  const { locale } = useLocale();
  const locStr = locale === "en" ? "en-US" : "de-DE";
  const { user, tickets, openCount, closedCount } = profile;
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-start gap-3">
        <Avatar name={user.fullName} email={user.email} size={48} />
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold text-text-primary truncate">
            {user.fullName}
          </p>
          {user.email && (
            <a
              href={`mailto:${user.email}`}
              className="block text-[11.5px] text-text-tertiary hover:text-text-primary truncate"
            >
              {user.email}
            </a>
          )}
          {user.phone && (
            <p className="text-[11.5px] text-text-tertiary inline-flex items-center gap-1 mt-0.5">
              <Phone size={10} />
              {user.phone}
            </p>
          )}
          {user.organization && (
            <p className="text-[11px] text-text-tertiary mt-0.5">
              {user.organization}
            </p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Kpi label={tr("helpdesk.drawer.ticketsTotal")} value={tickets.length} />
        <Kpi label={tr("helpdesk.stats.open")} value={openCount} tone="warn" />
        <Kpi label={tr("helpdesk.filter.closed")} value={closedCount} tone="success" />
      </div>
      {user.createdAt && (
        <p className="text-[10.5px] text-text-quaternary">
          {tr("helpdesk.drawer.customerSince")}{" "}
          {new Date(user.createdAt).toLocaleDateString(locStr)}
        </p>
      )}
      <section>
        <h3 className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1.5">
          {tr("helpdesk.drawer.history")}
        </h3>
        {tickets.length ? (
          <ul className="space-y-1">
            {tickets.map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => onPickTicket(t.id)}
                  className="w-full text-left flex items-start gap-2 rounded-md border border-stroke-1 hover:border-stroke-2 hover:bg-bg-elevated p-2"
                >
                  <span className="font-mono text-[10.5px] text-text-tertiary mt-0.5 shrink-0">
                    #{t.number}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-[12px] text-text-primary truncate">
                      {t.title}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <StatusPill label={t.stateName} />
                      <PriorityChip name={t.priorityName} />
                      <span className="text-[10px] text-text-quaternary">
                        {relativeTime(t.updatedAt, tr)}
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[11px] text-text-tertiary">{tr("helpdesk.drawer.noTickets")}</p>
        )}
      </section>
      <div className="pt-2 border-t border-stroke-1">
        {user.email && (
          <a
            href={`mailto:${user.email}`}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11px]"
            style={{ background: accent }}
          >
            <Mail size={11} />
            {tr("helpdesk.drawer.writeEmail")}
          </a>
        )}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: "warn" | "success";
}) {
  const color =
    tone === "warn"
      ? "text-amber-400"
      : tone === "success"
        ? "text-emerald-400"
        : "text-text-primary";
  return (
    <div className="rounded-md border border-stroke-1 bg-bg-elevated p-2 text-center">
      <p className={`text-[18px] font-semibold leading-none ${color}`}>
        {value}
      </p>
      <p className="mt-1 text-[9.5px] uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                      Canned responses                               */
/* ----------------------------------------------------------------- */

function CannedResponsesPopover({
  canned,
  onPick,
  onClose,
  onManage,
}: {
  canned: CannedResponse[];
  onPick: (text: string) => void;
  onClose: () => void;
  onManage: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const click = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", click);
    return () => document.removeEventListener("mousedown", click);
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute bottom-full left-0 mb-1 z-30 min-w-[240px] max-h-[260px] flex flex-col rounded-md border border-stroke-1 bg-bg-elevated shadow-xl"
    >
      <ul className="overflow-auto py-1">
        {canned.length === 0 ? (
          <li className="px-3 py-3 text-[11px] text-text-tertiary text-center">
            Noch keine Vorlagen.
          </li>
        ) : (
          canned.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onPick(c.body)}
                className="w-full text-left px-2.5 py-1.5 text-[11.5px] hover:bg-bg-overlay"
                title={c.body}
              >
                <span className="block text-text-primary truncate">{c.name}</span>
                <span className="block text-[10px] text-text-tertiary truncate">
                  {c.body.slice(0, 80)}
                </span>
              </button>
            </li>
          ))
        )}
      </ul>
      <div className="border-t border-stroke-1 px-2 py-1.5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={onManage}
          className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
        >
          <Plus size={10} /> Vorlagen verwalten
        </button>
      </div>
    </div>
  );
}

function CannedResponsesEditor({
  canned,
  onSave,
  onClose,
  accent,
}: {
  canned: CannedResponse[];
  onSave: (next: CannedResponse[]) => void;
  onClose: () => void;
  accent: string;
}) {
  const [list, setList] = useState<CannedResponse[]>(canned);
  const [editing, setEditing] = useState<CannedResponse | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  const startNew = () => {
    setEditing({ id: `tmp-${Date.now()}`, name: "", body: "" });
    setName("");
    setBody("");
  };

  const startEdit = (c: CannedResponse) => {
    setEditing(c);
    setName(c.name);
    setBody(c.body);
  };

  const commit = () => {
    if (!editing || !name.trim() || !body.trim()) return;
    const next = list.some((x) => x.id === editing.id)
      ? list.map((x) =>
          x.id === editing.id ? { ...editing, name, body } : x,
        )
      : [...list, { ...editing, name, body }];
    setList(next);
    setEditing(null);
    setName("");
    setBody("");
  };

  const remove = (id: string) => {
    setList((prev) => prev.filter((x) => x.id !== id));
    if (editing?.id === id) {
      setEditing(null);
      setName("");
      setBody("");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-2xl max-h-[90vh] flex flex-col rounded-lg border border-stroke-1 bg-bg-base shadow-2xl"
      >
        <header className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <FileText size={14} style={{ color: accent }} />
          <h2 className="text-[13px] font-semibold">Antwort-Vorlagen</h2>
          <span className="text-[10.5px] text-text-tertiary">
            (lokal, nur in diesem Browser)
          </span>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded hover:bg-bg-overlay text-text-tertiary"
          >
            <XIcon size={14} />
          </button>
        </header>
        <div className="flex-1 min-h-0 grid grid-cols-2 gap-0">
          <aside className="border-r border-stroke-1 overflow-auto">
            <div className="p-2 border-b border-stroke-1">
              <button
                type="button"
                onClick={startNew}
                className="w-full inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md text-white text-[11.5px]"
                style={{ background: accent }}
              >
                <Plus size={12} /> Neue Vorlage
              </button>
            </div>
            <ul>
              {list.length === 0 ? (
                <li className="px-3 py-4 text-center text-[11px] text-text-tertiary">
                  Keine Vorlagen.
                </li>
              ) : (
                list.map((c) => (
                  <li key={c.id} className="border-b border-stroke-1/60">
                    <div
                      className={`flex items-start gap-1 px-2 py-1.5 ${
                        editing?.id === c.id ? "bg-bg-overlay" : "hover:bg-bg-elevated"
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => startEdit(c)}
                        className="flex-1 min-w-0 text-left"
                      >
                        <span className="block text-[11.5px] font-semibold text-text-primary truncate">
                          {c.name}
                        </span>
                        <span className="block text-[10px] text-text-tertiary truncate">
                          {c.body.slice(0, 60)}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(c.id)}
                        className="p-1 text-text-quaternary hover:text-red-400"
                        title="Löschen"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </li>
                ))
              )}
            </ul>
          </aside>
          <section className="flex flex-col p-3 overflow-hidden">
            {editing ? (
              <div className="flex-1 flex flex-col gap-2 min-h-0">
                <label className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary">
                  Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[12px] outline-none focus:border-stroke-2"
                  placeholder="z.B. „Begrüßung Standard"
                />
                <label className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mt-1">
                  Text
                </label>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  className="flex-1 min-h-0 bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[12px] outline-none focus:border-stroke-2 resize-none"
                  placeholder="Hallo {{customer.firstname}}, …"
                />
                <p className="text-[10px] text-text-quaternary">
                  Tipp: Platzhalter wie <code>{"{{customer.firstname}}"}</code> werden später vom Trigger ersetzt — aktuell statisch eingefügt.
                </p>
                <div className="flex items-center justify-end gap-2 pt-1 border-t border-stroke-1">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="px-2 py-1 text-[11px] text-text-tertiary hover:text-text-primary"
                  >
                    Abbrechen
                  </button>
                  <button
                    type="button"
                    onClick={commit}
                    disabled={!name.trim() || !body.trim()}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-white text-[11.5px] disabled:opacity-50"
                    style={{ background: accent }}
                  >
                    <CheckCircle2 size={11} />
                    Speichern
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center text-[11.5px] text-text-tertiary text-center px-4">
                Wähle links eine Vorlage zum Bearbeiten oder lege eine neue an.
              </div>
            )}
          </section>
        </div>
        <footer className="px-4 py-2 border-t border-stroke-1 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-[11.5px] text-text-tertiary hover:text-text-primary"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={() => onSave(list)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-white text-[11.5px]"
            style={{ background: accent }}
          >
            <CheckCircle2 size={11} /> Übernehmen
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                       Shortcuts overlay                             */
/* ----------------------------------------------------------------- */

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const items: { keys: string; label: string }[] = [
    { keys: "/", label: "Suche fokussieren" },
    { keys: "j / k", label: "Nächstes / vorheriges Ticket" },
    { keys: "n", label: "Neues Ticket" },
    { keys: "r", label: "Auf Ticket antworten (Composer)" },
    { keys: "u", label: "Mir zuweisen" },
    { keys: "x", label: "Aktuelles Ticket für Bulk markieren" },
    { keys: "?", label: "Diese Übersicht ein-/ausblenden" },
    { keys: "Esc", label: "Drawer / Overlay schließen" },
    { keys: "⌘/Ctrl + Enter", label: "Antwort senden" },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-lg border border-stroke-1 bg-bg-base shadow-2xl"
      >
        <header className="px-4 py-3 border-b border-stroke-1 flex items-center gap-2">
          <Keyboard size={14} className="text-text-tertiary" />
          <h2 className="text-[13px] font-semibold">Tastenkürzel</h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto p-1 rounded hover:bg-bg-overlay text-text-tertiary"
          >
            <XIcon size={14} />
          </button>
        </header>
        <ul className="p-3 space-y-1.5">
          {items.map((it) => (
            <li
              key={it.keys}
              className="flex items-center justify-between gap-2 text-[12px]"
            >
              <span className="text-text-secondary">{it.label}</span>
              <kbd className="font-mono text-[11px] px-1.5 py-0.5 rounded border border-stroke-1 bg-bg-elevated text-text-primary">
                {it.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
