"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  Building2,
  Plus,
  Search,
  RefreshCw,
  ExternalLink,
  Loader2,
  Star,
  Settings as SettingsIcon,
  MapPin,
  Phone,
  Mail,
  Globe,
  Trash2,
  Save,
  StickyNote,
  CheckSquare,
  TrendingUp,
  Users as UsersIcon,
  Activity,
  Calendar,
  PhoneCall,
  Video,
  Briefcase,
  ArrowRight,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  X,
  Megaphone,
  RefreshCcw,
  FileUp,
} from "lucide-react";
import { ImportCrmModal } from "./ImportCrmModal";
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
import { StatusPill, toneForState } from "@/components/ui/Pills";
import { groupByDate, shortTime } from "@/components/ui/datetime";
import { clickToCallUrl } from "@/lib/calls/click-to-call";
import { useT } from "@/components/LocaleProvider";
import type { WorkspaceId } from "@/lib/workspaces";
import type {
  CompanyDetail,
  CompanySummary,
  NoteSummary,
  OpportunitySummary,
  PersonSummary,
  TaskSummary,
} from "@/lib/crm/types";

type Tab = "activity" | "people" | "deals" | "details";

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = (Date.now() - t) / 1000;
  if (diff < 60) return "gerade";
  if (diff < 3600) return `${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)} d`;
  return new Date(iso).toLocaleDateString("de-DE");
}

function formatCurrency(
  amountMicros: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (amountMicros == null || !currency) return "—";
  const value = amountMicros / 1_000_000;
  try {
    return new Intl.NumberFormat("de-CH", {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString("de-CH")} ${currency}`;
  }
}

function isOpenStage(stage: string): boolean {
  const s = stage.toLowerCase();
  return !/won|lost|customer|cancel|abgeschlossen|verloren/.test(s);
}

export function CrmClient({
  workspaceId,
  workspaceName,
  accent,
  scraperAvailable = false,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
  /** When true, render the inline Lead-Scraper trigger in the sidebar header. */
  scraperAvailable?: boolean;
}) {
  const t = useT();
  const [companies, setCompanies] = useState<CompanySummary[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [companiesCursor, setCompaniesCursor] = useState<string | null>(null);
  const [companiesError, setCompaniesError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const newRef = useRef<HTMLInputElement>(null);

  const [showScraper, setShowScraper] = useState(false);
  const [showImport, setShowImport] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CompanyDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [people, setPeople] = useState<PersonSummary[]>([]);
  const [notes, setNotes] = useState<NoteSummary[]>([]);
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunitySummary[]>([]);
  const [tab, setTab] = useState<Tab>("activity");
  const [tabLoading, setTabLoading] = useState(false);

  const [showQuickNote, setShowQuickNote] = useState(false);

  /* ── Data loaders ───────────────────────────────────────────── */

  /**
   * Every CRM API call must carry the workspace selector so the server can
   * pick the right Twenty tenant. We thread `ws=<workspaceId>` through here.
   */
  const apiUrl = useCallback(
    (path: string, params?: Record<string, string | undefined | null>) => {
      const u = new URL(path, window.location.origin);
      u.searchParams.set("ws", workspaceId);
      if (params) {
        for (const [k, v] of Object.entries(params)) {
          if (v != null && v !== "") u.searchParams.set(k, v);
        }
      }
      return u.toString();
    },
    [workspaceId],
  );

  const loadCompanies = useCallback(
    async (q?: string, append = false) => {
      setCompaniesLoading(true);
      setCompaniesError(null);
      try {
        const url = new URL("/api/crm/companies", window.location.origin);
        url.searchParams.set("ws", workspaceId);
        if (q?.trim()) url.searchParams.set("q", q.trim());
        if (append && companiesCursor) url.searchParams.set("cursor", companiesCursor);
        const r = await fetch(url, { cache: "no-store" });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setCompanies((prev) => (append ? [...prev, ...j.items] : j.items));
        setCompaniesCursor(j.nextCursor ?? null);
      } catch (e) {
        setCompaniesError(e instanceof Error ? e.message : String(e));
      } finally {
        setCompaniesLoading(false);
      }
    },
    [companiesCursor, workspaceId],
  );

  const loadDetail = useCallback(
    async (id: string) => {
      setDetailLoading(true);
      setDetailError(null);
      try {
        const r = await fetch(apiUrl("/api/crm/companies", { id }), {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail(j.company);
      } catch (e) {
        setDetailError(e instanceof Error ? e.message : String(e));
      } finally {
        setDetailLoading(false);
      }
    },
    [apiUrl],
  );

  const loadAll = useCallback(
    async (id: string) => {
      setTabLoading(true);
      try {
        const [pp, tl] = await Promise.all([
          fetch(apiUrl("/api/crm/people", { companyId: id }), {
            cache: "no-store",
          }).then((r) => r.json()),
          fetch(apiUrl("/api/crm/timeline", { companyId: id }), {
            cache: "no-store",
          }).then((r) => r.json()),
        ]);
        setPeople(pp.items ?? []);
        setNotes(tl.notes ?? []);
        setTasks(tl.tasks ?? []);
        setOpportunities(tl.opportunities ?? []);
      } finally {
        setTabLoading(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    void loadCompanies();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      setCompaniesCursor(null);
      void loadCompanies(search);
    }, 300);
    return () => clearTimeout(t);
  }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setPeople([]);
      setNotes([]);
      setTasks([]);
      setOpportunities([]);
      return;
    }
    void loadDetail(selectedId);
    void loadAll(selectedId);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Mutations ──────────────────────────────────────────────── */

  const onCreateCompany = async (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    setShowNew(false);
    try {
      const r = await fetch(apiUrl("/api/crm/companies"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      await loadCompanies(search);
      setSelectedId(j.company.id);
    } catch (e) {
      alert(`Anlegen fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
  };

  const onPatchCompany = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!detail) return;
      try {
        const r = await fetch(apiUrl("/api/crm/companies", { id: detail.id }), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setDetail(j.company);
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === detail.id
              ? {
                  ...c,
                  name: j.company.name,
                  phone: j.company.phone,
                  generalEmail: j.company.generalEmail,
                  city: j.company.city,
                  country: j.company.country,
                  updatedAt: j.company.updatedAt,
                }
              : c,
          ),
        );
      } catch (e) {
        alert(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
      }
    },
    [detail, apiUrl],
  );

  const onDeleteCompany = useCallback(async () => {
    if (!detail) return;
    if (!confirm(`„${detail.name}“ wirklich löschen?`)) return;
    try {
      const r = await fetch(apiUrl("/api/crm/companies", { id: detail.id }), {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      setSelectedId(null);
      setDetail(null);
      await loadCompanies(search);
    } catch (e) {
      alert(`Löschen fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    }
  }, [detail, loadCompanies, search, apiUrl]);

  const addNote = useCallback(
    async (title: string, body: string) => {
      if (!detail) return;
      const r = await fetch(apiUrl("/api/crm/timeline", { companyId: detail.id }), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setNotes((prev) => [j.note, ...prev]);
    },
    [detail, apiUrl],
  );

  const filtered = companies;

  /* ── Derived: company-list activity score ───────────────────── */

  const companyMeta = useMemo(() => {
    // Cheap per-row indicator: red dot if updated > 30d ago, green if < 7d.
    return new Map(
      companies.map((c) => {
        const days =
          (Date.now() - new Date(c.updatedAt).getTime()) / 86_400_000;
        const tone: "fresh" | "warm" | "stale" =
          days < 7 ? "fresh" : days < 30 ? "warm" : "stale";
        return [c.id, { tone }] as const;
      }),
    );
  }, [companies]);

  /* ── Pane 1 ─────────────────────────────────────────────────── */
  const primary = (
    <>
      <PaneHeader
        title={t("crm.companies")}
        subtitle={workspaceName}
        accent={accent}
        icon={<Building2 size={14} style={{ color: accent }} />}
        right={
          <>
            <button
              type="button"
              onClick={() => void loadCompanies(search)}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("common.refresh")}
            >
              <RefreshCw size={13} />
            </button>
            <Link
              href={`/${workspaceId}/crm/settings`}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("crm.settings")}
            >
              <SettingsIcon size={13} />
            </Link>
            <button
              type="button"
              onClick={() => setShowImport(true)}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title="CSV-Import (Firmen / Personen)"
            >
              <FileUp size={13} />
            </button>
            {scraperAvailable && (
              <button
                type="button"
                onClick={() => setShowScraper((v) => !v)}
                className={`p-1.5 rounded-md hover:bg-bg-overlay ${
                  showScraper
                    ? "text-text-primary bg-bg-overlay"
                    : "text-text-tertiary hover:text-text-primary"
                }`}
                title={t("crm.scraper")}
              >
                <Sparkles size={13} />
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setShowNew(true);
                setTimeout(() => newRef.current?.focus(), 30);
              }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11.5px]"
              style={{ background: accent }}
              title="Neue Firma"
            >
              <Plus size={12} /> Firma
            </button>
          </>
        }
      >
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Firma suchen…"
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1.5 text-[11.5px] outline-none focus:border-stroke-2"
          />
        </div>
      </PaneHeader>

      {showNew && (
        <div className="px-3 py-2 border-b border-stroke-1 bg-bg-elevated flex items-center gap-2">
          <input
            ref={newRef}
            type="text"
            placeholder={t("crm.placeholder.companyName")}
            className="flex-1 bg-transparent border border-stroke-1 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-stroke-2"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void onCreateCompany((e.target as HTMLInputElement).value);
              } else if (e.key === "Escape") {
                setShowNew(false);
              }
            }}
          />
          <button
            type="button"
            className="text-[11px] text-text-tertiary px-2 py-1 hover:text-text-primary"
            onClick={() => setShowNew(false)}
          >
            ✕
          </button>
        </div>
      )}

      {scraperAvailable && showScraper && (
        <ScraperLauncher
          accent={accent}
          onClose={() => setShowScraper(false)}
          onFinished={() => void loadCompanies(search)}
        />
      )}

      {companiesError && (
        <div className="p-3">
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] p-2 whitespace-pre-wrap">
            {companiesError}
          </div>
        </div>
      )}

      <CompanyList
        companies={filtered}
        loading={companiesLoading && filtered.length === 0}
        selectedId={selectedId}
        onSelect={setSelectedId}
        meta={companyMeta}
        emptyHint={search ? t("common.noResults") : t("crm.empty.companies")}
      />

      {companiesCursor && (
        <button
          type="button"
          onClick={() => void loadCompanies(search, true)}
          className="m-2 px-3 py-1.5 text-[11px] rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary"
        >
          Mehr laden…
        </button>
      )}
    </>
  );

  /* ── Pane 2 — related lists / activity ──────────────────────── */
  const totalActivity = notes.length + tasks.length + opportunities.length;

  const tabBar = (
    <div className="flex items-center gap-0.5 border-b border-stroke-1 bg-bg-chrome">
      {[
        {
          id: "activity" as Tab,
          label: "Activity",
          icon: Activity,
          count: totalActivity,
        },
        {
          id: "people" as Tab,
          label: "Personen",
          icon: UsersIcon,
          count: people.length,
        },
        {
          id: "deals" as Tab,
          label: "Deals",
          icon: TrendingUp,
          count: opportunities.length,
        },
        {
          id: "details" as Tab,
          label: "Details",
          icon: Briefcase,
          count: 0,
        },
      ].map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setTab(t.id)}
          className={`px-3 py-2 text-[11.5px] flex items-center gap-1.5 border-b-2 ${
            tab === t.id
              ? "border-current text-text-primary"
              : "border-transparent text-text-tertiary hover:text-text-secondary"
          }`}
          style={tab === t.id ? { color: accent, borderColor: accent } : undefined}
        >
          <t.icon size={12} />
          {t.label}
          {t.count > 0 && (
            <span className="text-[10px] text-text-quaternary">({t.count})</span>
          )}
        </button>
      ))}
    </div>
  );

  let secondaryBody;
  if (!detail) {
    secondaryBody = (
      <PaneEmptyState
        title="Keine Firma gewählt"
        hint={t("crm.empty.selection")}
        icon={<Building2 size={32} />}
      />
    );
  } else if (tabLoading && totalActivity === 0 && people.length === 0) {
    secondaryBody = (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 spin" style={{ color: accent }} />
      </div>
    );
  } else if (tab === "activity") {
    secondaryBody = (
      <ActivityFeed
        accent={accent}
        notes={notes}
        tasks={tasks}
        opportunities={opportunities}
        showComposer={showQuickNote}
        onComposerClose={() => setShowQuickNote(false)}
        onAddNote={async (t, b) => {
          try {
            await addNote(t, b);
            setShowQuickNote(false);
          } catch (e) {
            alert(`Speichern fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
          }
        }}
        onOpenComposer={() => setShowQuickNote(true)}
      />
    );
  } else if (tab === "people") {
    secondaryBody = <PeopleGrid people={people} accent={accent} />;
  } else if (tab === "deals") {
    secondaryBody = <DealList deals={opportunities} accent={accent} />;
  } else {
    secondaryBody = (
      <CompanyDetailsTab
        company={detail}
        accent={accent}
        onPatch={onPatchCompany}
      />
    );
  }

  const secondary = (
    <>
      <PaneHeader
        title={detail ? detail.name : "Verknüpfungen"}
        subtitle={
          detail
            ? "Activity · Personen · Deals · Details"
            : "Wähle eine Firma"
        }
        accent={accent}
      />
      {detail && tabBar}
      {secondaryBody}
    </>
  );

  /* ── Pane 3 (company detail) ────────────────────────────────── */
  let detailNode;
  if (!selectedId) {
    detailNode = (
      <PaneEmptyState
        title="Native Twenty-Integration"
        hint="Für Pipelines, Custom Views und Bulk-Edit öffne den vollen Twenty-Workspace im neuen Tab."
        icon={<Building2 size={32} />}
      />
    );
  } else if (detailLoading && !detail) {
    detailNode = (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-6 h-6 spin" style={{ color: accent }} />
      </div>
    );
  } else if (detailError) {
    detailNode = (
      <div className="p-4">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12px] p-3 whitespace-pre-wrap">
          {detailError}
        </div>
      </div>
    );
  } else if (detail) {
    detailNode = (
      <CompanyDetailHero
        workspaceId={workspaceId}
        company={detail}
        accent={accent}
        people={people}
        opportunities={opportunities}
        tasks={tasks}
        notes={notes}
        onPatch={onPatchCompany}
        onDelete={onDeleteCompany}
        onAddNote={() => {
          setTab("activity");
          setShowQuickNote(true);
        }}
      />
    );
  }

  const detailHeader = (
    <header
      className="flex-1 px-3 py-2 flex items-center gap-2"
      style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
    >
      <Building2 size={14} style={{ color: accent }} />
      <h1 className="text-[12.5px] font-semibold leading-tight">
        CRM ·{" "}
        <span className="text-text-tertiary font-normal">{workspaceName}</span>
      </h1>
      <a
        href="https://crm.kineo360.work"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px]"
      >
        <ExternalLink size={11} />
        In Twenty öffnen
      </a>
    </header>
  );

  const detailWithHeader = (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-stroke-1 bg-bg-chrome flex">
        {detailHeader}
      </div>
      <div className="flex-1 min-h-0 flex">{detailNode}</div>
    </div>
  );

  return (
    <>
      <ThreePaneLayout
        primary={primary}
        secondary={secondary}
        detail={detailWithHeader}
        storageKey={`crm:${workspaceId}`}
        hasSelection={!!selectedId}
        onMobileBack={() => setSelectedId(null)}
      />
      {showImport && (
        <ImportCrmModal
          workspaceId={workspaceId}
          accent={accent}
          onClose={() => setShowImport(false)}
          onImported={() => void loadCompanies(search)}
        />
      )}
    </>
  );
}

/* ----------------------------------------------------------------- */
/*                       Company list (rich cards)                     */
/* ----------------------------------------------------------------- */

function CompanyList({
  companies,
  loading,
  selectedId,
  onSelect,
  meta,
  emptyHint,
}: {
  companies: CompanySummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  meta: Map<string, { tone: "fresh" | "warm" | "stale" }>;
  emptyHint: string;
}) {
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        Lade…
      </div>
    );
  }
  if (companies.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center text-[12px] text-text-tertiary">
        {emptyHint}
      </div>
    );
  }
  return (
    <ul className="flex-1 min-h-0 overflow-auto">
      {companies.map((c) => {
        const isSel = c.id === selectedId;
        const tone = meta.get(c.id)?.tone ?? "warm";
        const dot =
          tone === "fresh"
            ? "#10b981"
            : tone === "warm"
              ? "#eab308"
              : "#64748b";
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={`group w-full text-left border-b border-stroke-1/60 px-3 py-2.5 flex items-start gap-2.5 ${
                isSel ? "bg-bg-overlay" : "hover:bg-bg-elevated"
              }`}
            >
              <Avatar name={c.name} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-[12.5px] font-semibold text-text-primary truncate flex-1">
                    {c.name || "(ohne Name)"}
                  </p>
                  <span
                    aria-hidden
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: dot }}
                    title={
                      tone === "fresh"
                        ? "Aktiv (< 7 Tage)"
                        : tone === "warm"
                          ? "Warm (< 30 Tage)"
                          : "Kalt (> 30 Tage)"
                    }
                  />
                  <span className="text-[10px] text-text-quaternary shrink-0">
                    {relativeTime(c.updatedAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-text-tertiary min-w-0">
                  {c.city || c.country ? (
                    <span className="inline-flex items-center gap-1 truncate">
                      <MapPin size={10} />
                      {[c.city, c.country].filter(Boolean).join(", ")}
                    </span>
                  ) : (
                    <span className="text-text-quaternary">—</span>
                  )}
                  {c.googleRating && (
                    <span className="inline-flex items-center gap-1 ml-auto">
                      <Star
                        size={10}
                        className="text-amber-400"
                        fill="currentColor"
                      />
                      {c.googleRating.toFixed(1)}
                    </span>
                  )}
                </div>
                {(c.phone || c.generalEmail) && (
                  <div className="mt-1 flex items-center gap-2 text-[10.5px] text-text-quaternary">
                    {c.phone && (
                      <span className="inline-flex items-center gap-1">
                        <Phone size={10} />
                        {c.phone}
                      </span>
                    )}
                    {c.generalEmail && (
                      <span className="inline-flex items-center gap-1 truncate">
                        <Mail size={10} />
                        <span className="truncate">{c.generalEmail}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/* ----------------------------------------------------------------- */
/*                       Detail Hero (Pane 3)                          */
/* ----------------------------------------------------------------- */

function CompanyDetailHero({
  workspaceId,
  company,
  accent,
  people,
  opportunities,
  tasks,
  notes,
  onPatch,
  onDelete,
  onAddNote,
}: {
  workspaceId: WorkspaceId;
  company: CompanyDetail;
  accent: string;
  people: PersonSummary[];
  opportunities: OpportunitySummary[];
  tasks: TaskSummary[];
  notes: NoteSummary[];
  onPatch: (patch: Record<string, unknown>) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onAddNote: () => void;
}) {
  const openDeals = opportunities.filter((o) => isOpenStage(o.stage));
  const openDealValue = openDeals.reduce(
    (sum, o) => sum + (o.amount?.amountMicros ?? 0),
    0,
  );
  const dealCurrency =
    openDeals[0]?.amount?.currencyCode ??
    company.annualRecurringRevenue?.currencyCode ??
    "CHF";

  const lastContact = useMemo(() => {
    const candidates: number[] = [];
    if (notes[0]) candidates.push(new Date(notes[0].createdAt).getTime());
    if (tasks[0]) candidates.push(new Date(tasks[0].createdAt).getTime());
    if (opportunities[0])
      candidates.push(new Date(opportunities[0].updatedAt).getTime());
    if (!candidates.length) return null;
    const max = Math.max(...candidates);
    return new Date(max).toISOString();
  }, [notes, tasks, opportunities]);

  const openTaskCount = tasks.filter(
    (t) => !/done|completed|closed/i.test(t.status),
  ).length;

  return (
    <DetailPane
      header={
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <Avatar name={company.name} size={48} />
            <div className="flex-1 min-w-0">
              <EditableText
                value={company.name}
                onSave={(v) => onPatch({ name: v })}
                className="text-[18px] font-semibold text-text-primary"
                placeholder="Firmenname"
              />
              <div className="flex flex-wrap items-center gap-3 text-[11px] text-text-tertiary mt-1">
                {company.domain && (
                  <a
                    href={
                      company.domain.startsWith("http")
                        ? company.domain
                        : `https://${company.domain}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 hover:text-text-primary"
                  >
                    <Globe size={11} />
                    {company.domain.replace(/^https?:\/\//, "")}
                  </a>
                )}
                {company.googleRating != null && (
                  <span className="inline-flex items-center gap-1">
                    <Star
                      size={11}
                      className="text-amber-500"
                      fill="currentColor"
                    />
                    {company.googleRating.toFixed(1)}
                    {company.googleReviewCount != null && (
                      <span className="text-text-quaternary">
                        ({company.googleReviewCount})
                      </span>
                    )}
                  </span>
                )}
                {(company.address?.addressCity ||
                  company.address?.addressCountry) && (
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} />
                    {[
                      company.address.addressCity,
                      company.address.addressCountry,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )}
                {company.idealCustomerProfile && (
                  <StatusPill label="Ideal Customer" tone="success" />
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onDelete()}
              className="p-1.5 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-500"
              title="Löschen"
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Quick actions */}
          <div className="mt-3 flex items-center gap-1.5">
            <QuickAction
              icon={<PhoneCall size={11} />}
              label="Anrufen"
              accent={accent}
              disabled={!company.phone}
              href={company.phone ? `tel:${company.phone}` : undefined}
            />
            <QuickAction
              icon={<Video size={11} />}
              label="Video-Call"
              accent={accent}
              href={clickToCallUrl({
                workspaceId,
                subject: `Call mit ${company.name}`,
                context: {
                  kind: "crm",
                  companyId: company.id,
                  label: company.name,
                },
              })}
            />
            <QuickAction
              icon={<Mail size={11} />}
              label="Mail"
              accent={accent}
              disabled={!company.generalEmail}
              href={
                company.generalEmail ? `mailto:${company.generalEmail}` : undefined
              }
            />
            <QuickAction
              icon={<StickyNote size={11} />}
              label="Notiz"
              accent={accent}
              onClick={onAddNote}
            />
            <QuickAction
              icon={<CheckSquare size={11} />}
              label="Aufgabe"
              accent={accent}
              disabled
              title="In Twenty anlegen (bald im Portal)"
            />
          </div>

          {/* Stat strip */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            <Stat
              label="Offene Deals"
              value={String(openDeals.length)}
              hint={openDealValue > 0
                ? formatCurrency(openDealValue, dealCurrency)
                : undefined}
              accent={accent}
            />
            <Stat
              label="Kontakte"
              value={String(people.length)}
              hint={people[0] ? `${people[0].firstName} ${people[0].lastName}` : undefined}
              accent={accent}
            />
            <Stat
              label="Letzter Kontakt"
              value={lastContact ? relativeTime(lastContact) : "—"}
              hint={lastContact
                ? new Date(lastContact).toLocaleDateString("de-DE")
                : "Keine Aktivität"}
              accent={accent}
            />
            <Stat
              label="Offene Tasks"
              value={String(openTaskCount)}
              hint={openTaskCount > 0 ? `von ${tasks.length}` : "Alles erledigt"}
              accent={accent}
            />
          </div>
        </div>
      }
      main={
        <div className="px-4 py-3 space-y-6">
          {opportunities.length > 0 && (
            <section>
              <SectionHeader>Aktive Deals</SectionHeader>
              <ul className="space-y-1.5">
                {openDeals.slice(0, 5).map((o) => (
                  <li key={o.id}>
                    <article className="flex items-center gap-2 rounded-md border border-stroke-1 bg-bg-elevated px-2.5 py-2">
                      <TrendingUp
                        size={14}
                        className="text-text-tertiary shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-text-primary truncate">
                          {o.name}
                        </p>
                        <p className="text-[10.5px] text-text-tertiary">
                          {o.stage}
                          {o.closeDate &&
                            ` · ${new Date(o.closeDate).toLocaleDateString("de-DE")}`}
                        </p>
                      </div>
                      <span className="text-[11.5px] font-semibold text-text-primary shrink-0">
                        {formatCurrency(
                          o.amount?.amountMicros,
                          o.amount?.currencyCode,
                        )}
                      </span>
                    </article>
                  </li>
                ))}
              </ul>
              {openDeals.length === 0 && (
                <p className="text-[11.5px] text-text-tertiary">
                  Keine offenen Deals.
                </p>
              )}
            </section>
          )}

          {people.length > 0 && (
            <section>
              <SectionHeader>Schlüsselkontakte</SectionHeader>
              <ul className="grid grid-cols-2 gap-2">
                {people.slice(0, 6).map((p) => (
                  <li key={p.id}>
                    <article className="flex items-center gap-2 rounded-md border border-stroke-1 bg-bg-elevated px-2.5 py-2">
                      <Avatar
                        name={`${p.firstName} ${p.lastName}`}
                        email={p.email}
                        size={28}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[12px] font-medium text-text-primary truncate">
                          {`${p.firstName} ${p.lastName}`.trim() || "—"}
                        </p>
                        <p className="text-[10.5px] text-text-tertiary truncate">
                          {p.jobTitle || p.email || "—"}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {p.email && (
                          <a
                            href={`mailto:${p.email}`}
                            className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                            title={`Mail an ${p.email}`}
                          >
                            <Mail size={11} />
                          </a>
                        )}
                        {p.phone && (
                          <a
                            href={`tel:${p.phone}`}
                            className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                            title={`Anrufen ${p.phone}`}
                          >
                            <Phone size={11} />
                          </a>
                        )}
                      </div>
                    </article>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      }
      rightSidebar={
        <>
          <SidebarSection title="Kontakt">
            <PropertyList
              rows={[
                {
                  label: "Telefon",
                  value: (
                    <EditableText
                      value={company.phone ?? ""}
                      onSave={(v) => onPatch({ phone: v || null })}
                      placeholder="+41 …"
                      className="text-[12px]"
                      icon={<Phone size={11} />}
                    />
                  ),
                },
                {
                  label: "Email",
                  value: (
                    <EditableText
                      value={company.generalEmail ?? ""}
                      onSave={(v) => onPatch({ generalEmail: v || null })}
                      placeholder="info@…"
                      className="text-[12px]"
                      icon={<Mail size={11} />}
                    />
                  ),
                },
                {
                  label: "Inhaber",
                  value: (
                    <EditableText
                      value={company.ownerName ?? ""}
                      onSave={(v) => onPatch({ ownerName: v || null })}
                      placeholder="—"
                      className="text-[12px]"
                    />
                  ),
                },
                {
                  label: "Inhaber-Mail",
                  value: (
                    <EditableText
                      value={company.ownerEmail ?? ""}
                      onSave={(v) => onPatch({ ownerEmail: v || null })}
                      placeholder="—"
                      className="text-[12px]"
                    />
                  ),
                },
              ]}
            />
          </SidebarSection>
          <SidebarSection title="Klassifizierung">
            <PropertyList
              rows={[
                {
                  label: "ICP",
                  value: company.idealCustomerProfile ? (
                    <StatusPill label="Ideal Customer" tone="success" />
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  ),
                },
                {
                  label: "Booking",
                  value: (
                    <EditableText
                      value={company.bookingSystem ?? ""}
                      onSave={(v) => onPatch({ bookingSystem: v || null })}
                      placeholder="—"
                      className="text-[12px]"
                    />
                  ),
                },
                {
                  label: "Lead-Quelle",
                  value: (
                    <EditableText
                      value={company.leadSource ?? ""}
                      onSave={(v) => onPatch({ leadSource: v || null })}
                      placeholder="—"
                      className="text-[12px]"
                    />
                  ),
                },
                { label: "Tenant", value: company.tenant ?? "—" },
              ]}
            />
          </SidebarSection>
          <MarketingSidebarSection
            workspaceId={workspaceId}
            companyId={company.id}
            companyName={company.name}
            accent={accent}
          />
          <SidebarSection title="Zeitleiste">
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              Erstellt {new Date(company.createdAt).toLocaleString("de-DE")}
              <br />
              Geändert {new Date(company.updatedAt).toLocaleString("de-DE")}
            </p>
          </SidebarSection>
        </>
      }
    />
  );
}

/* ----------------------------------------------------------------- */
/*                Marketing (Mautic) sidebar section                  */
/* ----------------------------------------------------------------- */

type MauticContactLite = {
  id: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  points: number;
  segments: string[];
  lastActive: string | null;
};

type CompanyMarketing = {
  configured: boolean;
  domain: string | null;
  contacts: MauticContactLite[];
  stats: {
    total: number;
    totalPoints: number;
    lastActivity: string | null;
    segments: { name: string; count: number }[];
  };
  deepLink?: string;
  message?: string;
  error?: string;
};

function MarketingSidebarSection({
  workspaceId,
  companyId,
  companyName,
  accent,
}: {
  workspaceId: WorkspaceId;
  companyId: string;
  companyName: string;
  accent: string;
}) {
  const [data, setData] = useState<CompanyMarketing | null>(null);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(
        `/api/crm/companies/${encodeURIComponent(companyId)}/marketing?ws=${workspaceId}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as CompanyMarketing & { error?: string };
      setData(j);
    } catch (e) {
      setData({
        configured: false,
        domain: null,
        contacts: [],
        stats: { total: 0, totalPoints: 0, lastActivity: null, segments: [] },
        error: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setLoading(false);
    }
  }, [companyId, workspaceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const syncPeople = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const r = await fetch(
        `/api/crm/companies/${encodeURIComponent(companyId)}/marketing?ws=${workspaceId}`,
        { method: "POST" },
      );
      const j = (await r.json()) as {
        synced?: number;
        skipped?: number;
        message?: string;
        error?: string;
        errors?: { email: string; message: string }[];
      };
      if (!r.ok) {
        setSyncMsg(j.error ?? `HTTP ${r.status}`);
      } else {
        const errCount = j.errors?.length ?? 0;
        setSyncMsg(
          j.message ??
            `${j.synced ?? 0} synchronisiert, ${j.skipped ?? 0} übersprungen` +
              (errCount > 0 ? `, ${errCount} Fehler` : ""),
        );
        await load();
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [companyId, workspaceId, load]);

  return (
    <SidebarSection
      title={
        <span className="inline-flex items-center gap-1.5">
          <Megaphone size={11} style={{ color: accent }} />
          Marketing
        </span>
      }
    >
      {loading && !data && (
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <Loader2 size={11} className="animate-spin" /> Lade Mautic-Daten…
        </div>
      )}
      {data && !data.configured && (
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          Mautic ist nicht konfiguriert.{" "}
          <span className="text-text-quaternary">
            (MAUTIC_API_USERNAME/_TOKEN fehlen)
          </span>
        </p>
      )}
      {data?.configured && data.error && (
        <p className="text-[11px] text-red-400">{data.error}</p>
      )}
      {data?.configured && !data.error && (
        <div className="space-y-2.5">
          <div className="flex items-baseline gap-2">
            <p className="text-[20px] font-semibold leading-none tabular-nums">
              {data.stats.total}
            </p>
            <p className="text-[10.5px] text-text-tertiary">
              Mautic-Kontakte{data.domain ? ` @${data.domain}` : ""}
            </p>
          </div>
          {data.stats.totalPoints > 0 && (
            <p className="text-[10.5px] text-text-tertiary">
              Σ {data.stats.totalPoints} Punkte ·{" "}
              {data.stats.lastActivity
                ? `letzte Aktivität ${relativeTime(data.stats.lastActivity)}`
                : "keine Aktivität"}
            </p>
          )}
          {data.stats.segments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.stats.segments.slice(0, 6).map((s) => (
                <span
                  key={s.name}
                  className="px-1.5 py-0.5 rounded text-[10.5px] border border-stroke-1 text-text-secondary"
                  title={`${s.count} Kontakt(e) in „${s.name}"`}
                >
                  {s.name}
                  <span className="ml-1 text-text-quaternary">{s.count}</span>
                </span>
              ))}
            </div>
          )}
          {data.contacts.length > 0 && (
            <ul className="space-y-1">
              {data.contacts.slice(0, 4).map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="truncate text-text-secondary">
                    {(c.firstName || c.lastName)
                      ? `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim()
                      : c.email ?? `#${c.id}`}
                  </span>
                  <span className="text-text-quaternary tabular-nums shrink-0">
                    {c.points} pts
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => void syncPeople()}
              disabled={syncing}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-stroke-1 hover:bg-bg-overlay text-text-secondary hover:text-text-primary disabled:opacity-50"
              title={`Personen von „${companyName}" in Mautic anlegen / aktualisieren`}
            >
              {syncing ? (
                <Loader2 size={11} className="animate-spin" />
              ) : (
                <RefreshCcw size={11} />
              )}
              Sync
            </button>
            {data.deepLink && (
              <a
                href={data.deepLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-stroke-1 hover:bg-bg-overlay text-text-secondary hover:text-text-primary"
                title="In Mautic öffnen"
              >
                <ExternalLink size={11} /> Mautic
              </a>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="ml-auto p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-40"
              title="Aktualisieren"
            >
              <RefreshCw size={11} />
            </button>
          </div>
          {syncMsg && (
            <p className="text-[10.5px] text-text-tertiary">{syncMsg}</p>
          )}
        </div>
      )}
    </SidebarSection>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-md border border-stroke-1 bg-bg-elevated px-2.5 py-2"
      style={{ boxShadow: `inset 3px 0 0 0 ${accent}40` }}
    >
      <p className="text-[10px] uppercase tracking-wide font-semibold text-text-quaternary">
        {label}
      </p>
      <p className="text-[15px] font-semibold text-text-primary mt-0.5 leading-tight">
        {value}
      </p>
      {hint && (
        <p className="text-[10.5px] text-text-tertiary truncate mt-0.5">
          {hint}
        </p>
      )}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  href,
  onClick,
  accent,
  disabled,
  title,
}: {
  icon: ReactNode;
  label: string;
  href?: string;
  onClick?: () => void;
  accent: string;
  disabled?: boolean;
  title?: string;
}) {
  const cls = `inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border ${
    disabled
      ? "border-stroke-1 text-text-quaternary cursor-not-allowed"
      : "border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary"
  }`;
  if (href && !disabled) {
    return (
      <a href={href} className={cls} title={title} style={{ borderColor: accent + "30" }}>
        {icon}
        {label}
      </a>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cls}
      title={title}
      style={{ borderColor: accent + "30" }}
    >
      {icon}
      {label}
    </button>
  );
}

/* ----------------------------------------------------------------- */
/*                          Activity Feed                              */
/* ----------------------------------------------------------------- */

type FeedItem =
  | { kind: "note"; ts: string; data: NoteSummary }
  | { kind: "task"; ts: string; data: TaskSummary }
  | { kind: "deal"; ts: string; data: OpportunitySummary };

function ActivityFeed({
  accent,
  notes,
  tasks,
  opportunities,
  showComposer,
  onComposerClose,
  onAddNote,
  onOpenComposer,
}: {
  accent: string;
  notes: NoteSummary[];
  tasks: TaskSummary[];
  opportunities: OpportunitySummary[];
  showComposer: boolean;
  onComposerClose: () => void;
  onAddNote: (title: string, body: string) => Promise<void>;
  onOpenComposer: () => void;
}) {
  const t = useT();
  const items = useMemo<FeedItem[]>(() => {
    const all: FeedItem[] = [
      ...notes.map<FeedItem>((n) => ({ kind: "note", ts: n.createdAt, data: n })),
      ...tasks.map<FeedItem>((t) => ({ kind: "task", ts: t.createdAt, data: t })),
      ...opportunities.map<FeedItem>((o) => ({
        kind: "deal",
        ts: o.updatedAt,
        data: o,
      })),
    ];
    return all.sort(
      (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
    );
  }, [notes, tasks, opportunities]);

  const grouped = useMemo(() => groupByDate(items, (i) => i.ts), [items]);

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-stroke-1 bg-bg-elevated px-3 py-1.5 flex items-center gap-1.5">
        <span className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mr-2">
          Hinzufügen:
        </span>
        <button
          type="button"
          onClick={onOpenComposer}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary text-[10.5px]"
        >
          <StickyNote size={11} /> Notiz
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 text-text-quaternary text-[10.5px] cursor-not-allowed"
          title="In Twenty anlegen (bald im Portal)"
        >
          <CheckSquare size={11} /> Aufgabe
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 text-text-quaternary text-[10.5px] cursor-not-allowed"
          title="Wird mit Calls-UI verknüpft"
        >
          <PhoneCall size={11} /> Anruf
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-4">
        {showComposer && (
          <NoteComposer
            accent={accent}
            onCancel={onComposerClose}
            onSave={onAddNote}
          />
        )}
        {grouped.length === 0 && !showComposer && (
          <div className="text-center py-12 text-[11.5px] text-text-tertiary">
            {t("crm.empty.activity")}
          </div>
        )}
        {grouped.map((g) => (
          <section key={g.label}>
            <h4 className="text-[10.5px] uppercase tracking-wider font-semibold text-text-quaternary mb-1.5">
              {g.label}
            </h4>
            <ol className="space-y-2 relative">
              <span
                aria-hidden
                className="absolute left-[11px] top-2 bottom-2 w-px bg-stroke-1"
              />
              {g.items.map((it) => (
                <FeedRow key={`${it.kind}-${getId(it)}`} item={it} accent={accent} />
              ))}
            </ol>
          </section>
        ))}
      </div>
    </div>
  );
}

function getId(it: FeedItem): string {
  return it.data.id;
}

function FeedRow({ item, accent }: { item: FeedItem; accent: string }) {
  if (item.kind === "note") {
    return (
      <li className="relative pl-7">
        <FeedDot icon={<StickyNote size={11} />} color="#a855f7" />
        <article className="rounded-md border border-stroke-1 bg-bg-elevated p-2.5">
          <header className="flex items-baseline justify-between gap-2 mb-1">
            <h5 className="text-[12px] font-semibold text-text-primary truncate">
              {item.data.title || "(ohne Titel)"}
            </h5>
            <time className="text-[10px] text-text-quaternary shrink-0">
              {shortTime(item.data.createdAt)}
            </time>
          </header>
          {item.data.bodyV2Markdown && (
            <p className="text-[11.5px] text-text-secondary whitespace-pre-wrap line-clamp-6">
              {item.data.bodyV2Markdown}
            </p>
          )}
        </article>
      </li>
    );
  }
  if (item.kind === "task") {
    const done = /done|completed|closed/i.test(item.data.status);
    return (
      <li className="relative pl-7">
        <FeedDot
          icon={<CheckSquare size={11} />}
          color={done ? "#10b981" : accent}
        />
        <article className="rounded-md border border-stroke-1 bg-bg-elevated p-2.5">
          <header className="flex items-baseline justify-between gap-2">
            <h5
              className={`text-[12px] font-medium truncate ${
                done
                  ? "text-text-tertiary line-through"
                  : "text-text-primary"
              }`}
            >
              {item.data.title || "(ohne Titel)"}
            </h5>
            <time className="text-[10px] text-text-quaternary shrink-0">
              {shortTime(item.data.createdAt)}
            </time>
          </header>
          <div className="mt-1 flex items-center gap-2 text-[10.5px] text-text-tertiary">
            <StatusPill
              label={item.data.status}
              tone={toneForState(item.data.status)}
            />
            {item.data.dueAt && (
              <span className="inline-flex items-center gap-1">
                <Calendar size={10} />
                {new Date(item.data.dueAt).toLocaleDateString("de-DE")}
              </span>
            )}
            {item.data.assigneeName && (
              <span className="inline-flex items-center gap-1">
                <Avatar name={item.data.assigneeName} size={14} />
                {item.data.assigneeName}
              </span>
            )}
          </div>
        </article>
      </li>
    );
  }
  // deal
  return (
    <li className="relative pl-7">
      <FeedDot icon={<TrendingUp size={11} />} color="#3b82f6" />
      <article className="rounded-md border border-stroke-1 bg-bg-elevated p-2.5">
        <header className="flex items-baseline justify-between gap-2">
          <h5 className="text-[12px] font-medium text-text-primary truncate">
            {item.data.name || "(ohne Name)"}
          </h5>
          <time className="text-[10px] text-text-quaternary shrink-0">
            {shortTime(item.data.updatedAt)}
          </time>
        </header>
        <div className="mt-1 flex items-center gap-2 text-[10.5px] text-text-tertiary">
          <StatusPill label={item.data.stage} tone={toneForState(item.data.stage)} />
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-text-primary">
            {formatCurrency(
              item.data.amount?.amountMicros,
              item.data.amount?.currencyCode,
            )}
          </span>
        </div>
      </article>
    </li>
  );
}

function FeedDot({ icon, color }: { icon: ReactNode; color: string }) {
  return (
    <span
      className="absolute left-0 top-2 inline-flex items-center justify-center w-[22px] h-[22px] rounded-full ring-2 ring-bg-base"
      style={{ background: `${color}20`, color }}
    >
      {icon}
    </span>
  );
}

/* ----------------------------------------------------------------- */
/*                        People + Deals tabs                          */
/* ----------------------------------------------------------------- */

function PeopleGrid({
  people,
  accent: _accent,
}: {
  people: PersonSummary[];
  accent: string;
}) {
  const t = useT();
  if (people.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11.5px] text-text-tertiary px-6 text-center">
        {t("crm.empty.people")}
      </div>
    );
  }
  return (
    <ul className="flex-1 min-h-0 overflow-auto p-3 grid grid-cols-1 gap-2">
      {people.map((p) => (
        <li key={p.id}>
          <article className="flex items-start gap-2.5 rounded-md border border-stroke-1 bg-bg-elevated p-2.5 hover:border-stroke-2">
            <Avatar
              name={`${p.firstName} ${p.lastName}`}
              email={p.email}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-text-primary truncate">
                {`${p.firstName} ${p.lastName}`.trim() || "(ohne Name)"}
              </p>
              {p.jobTitle && (
                <p className="text-[11px] text-text-tertiary truncate">
                  {p.jobTitle}
                </p>
              )}
              <div className="mt-1 flex items-center flex-wrap gap-2 text-[10.5px] text-text-quaternary">
                {p.email && (
                  <a
                    href={`mailto:${p.email}`}
                    className="inline-flex items-center gap-1 hover:text-text-primary truncate"
                  >
                    <Mail size={10} />
                    {p.email}
                  </a>
                )}
                {p.phone && (
                  <a
                    href={`tel:${p.phone}`}
                    className="inline-flex items-center gap-1 hover:text-text-primary"
                  >
                    <Phone size={10} />
                    {p.phone}
                  </a>
                )}
              </div>
            </div>
          </article>
        </li>
      ))}
    </ul>
  );
}

function DealList({
  deals,
  accent: _accent,
}: {
  deals: OpportunitySummary[];
  accent: string;
}) {
  if (deals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11.5px] text-text-tertiary px-6 text-center">
        Keine Deals.
      </div>
    );
  }
  // Group by stage so users see a mini pipeline.
  const byStage = new Map<string, OpportunitySummary[]>();
  for (const d of deals) {
    const list = byStage.get(d.stage) ?? [];
    list.push(d);
    byStage.set(d.stage, list);
  }
  return (
    <div className="flex-1 min-h-0 overflow-auto p-3 space-y-4">
      {[...byStage.entries()].map(([stage, list]) => (
        <section key={stage}>
          <header className="flex items-center gap-2 mb-1.5">
            <StatusPill label={stage} tone={toneForState(stage)} />
            <span className="text-[10.5px] text-text-tertiary">{list.length}</span>
            <span className="ml-auto text-[11px] font-semibold text-text-primary">
              {formatCurrency(
                list.reduce(
                  (sum, d) => sum + (d.amount?.amountMicros ?? 0),
                  0,
                ),
                list[0]?.amount?.currencyCode,
              )}
            </span>
          </header>
          <ul className="space-y-1.5">
            {list.map((d) => (
              <li key={d.id}>
                <article className="flex items-center gap-2 rounded-md border border-stroke-1 bg-bg-elevated px-2.5 py-2">
                  <TrendingUp size={13} className="text-text-tertiary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-text-primary truncate">
                      {d.name || "(ohne Name)"}
                    </p>
                    {d.closeDate && (
                      <p className="text-[10.5px] text-text-tertiary">
                        Abschluss{" "}
                        {new Date(d.closeDate).toLocaleDateString("de-DE")}
                      </p>
                    )}
                  </div>
                  <span className="text-[11.5px] font-semibold text-text-primary shrink-0">
                    {formatCurrency(
                      d.amount?.amountMicros,
                      d.amount?.currencyCode,
                    )}
                  </span>
                </article>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                       Details (CRM tab)                             */
/* ----------------------------------------------------------------- */

function CompanyDetailsTab({
  company,
  accent: _accent,
  onPatch,
}: {
  company: CompanyDetail;
  accent: string;
  onPatch: (patch: Record<string, unknown>) => Promise<void> | void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-5">
      <section>
        <SectionHeader>Praxis-Stammdaten</SectionHeader>
        <PropertyList
          rows={[
            {
              label: "Booking",
              value: (
                <EditableText
                  value={company.bookingSystem ?? ""}
                  onSave={(v) => onPatch({ bookingSystem: v || null })}
                  placeholder="—"
                  className="text-[12px]"
                />
              ),
            },
            {
              label: "Lead-Quelle",
              value: (
                <EditableText
                  value={company.leadSource ?? ""}
                  onSave={(v) => onPatch({ leadSource: v || null })}
                  placeholder="—"
                  className="text-[12px]"
                />
              ),
            },
            {
              label: "Spezialisierung",
              value: (
                <EditableText
                  value={company.specializations ?? ""}
                  onSave={(v) => onPatch({ specializations: v || null })}
                  placeholder="—"
                  className="text-[12px]"
                  multiline
                />
              ),
            },
            {
              label: "Sprachen",
              value: (
                <EditableText
                  value={company.languages ?? ""}
                  onSave={(v) => onPatch({ languages: v || null })}
                  placeholder="—"
                  className="text-[12px]"
                />
              ),
            },
            {
              label: "Therapeut:innen",
              value: company.employeeCountPhysio ?? "—",
            },
          ]}
        />
      </section>

      <section>
        <SectionHeader>Adresse</SectionHeader>
        <PropertyList
          rows={[
            {
              label: "Strasse",
              value: company.address?.addressStreet1 ?? "—",
            },
            {
              label: "PLZ / Ort",
              value:
                [
                  company.address?.addressPostcode,
                  company.address?.addressCity,
                ]
                  .filter(Boolean)
                  .join(" ") || "—",
            },
            {
              label: "Land",
              value: company.address?.addressCountry ?? "—",
            },
          ]}
        />
      </section>

      <section>
        <SectionHeader>Lead-Therapeut</SectionHeader>
        <PropertyList
          rows={[
            {
              label: "Name",
              value: (
                <EditableText
                  value={company.leadTherapistName ?? ""}
                  onSave={(v) => onPatch({ leadTherapistName: v || null })}
                  placeholder="—"
                  className="text-[12px]"
                />
              ),
            },
            {
              label: "Email",
              value: (
                <EditableText
                  value={company.leadTherapistEmail ?? ""}
                  onSave={(v) => onPatch({ leadTherapistEmail: v || null })}
                  placeholder="—"
                  className="text-[12px]"
                />
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                            Helpers                                  */
/* ----------------------------------------------------------------- */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1.5 flex items-center gap-1.5">
      {children}
      <ArrowRight size={9} className="text-text-quaternary opacity-0" />
    </h3>
  );
}

function EditableText({
  value,
  onSave,
  placeholder,
  className = "",
  multiline = false,
  icon,
}: {
  value: string;
  onSave: (v: string) => Promise<void> | void;
  placeholder?: string;
  className?: string;
  multiline?: boolean;
  icon?: React.ReactNode;
}) {
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(value), [value]);

  const commit = async () => {
    if (draft === value) return;
    setSaving(true);
    try {
      await onSave(draft);
    } finally {
      setSaving(false);
    }
  };

  const Tag = multiline ? "textarea" : "input";
  return (
    <span className="flex items-center gap-1.5 group">
      {icon && <span className="text-text-quaternary shrink-0">{icon}</span>}
      <Tag
        type={multiline ? undefined : "text"}
        value={draft}
        onChange={(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
          setDraft(e.target.value)
        }
        onBlur={commit}
        onKeyDown={(e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
          if (e.key === "Enter" && !multiline) {
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLInputElement).blur();
          }
        }}
        placeholder={placeholder}
        rows={multiline ? 2 : undefined}
        className={`flex-1 min-w-0 bg-transparent border border-transparent group-hover:border-stroke-1 focus:border-stroke-2 rounded px-1 py-0.5 outline-none ${className}`}
      />
      {saving && (
        <Loader2 size={10} className="spin text-text-quaternary shrink-0" />
      )}
    </span>
  );
}

function NoteComposer({
  accent,
  onSave,
  onCancel,
}: {
  accent: string;
  onSave: (title: string, body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-md border border-stroke-2 bg-bg-elevated p-2 space-y-1.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Titel der Notiz"
        className="w-full bg-transparent border border-stroke-1 rounded px-2 py-1 text-[12px] outline-none focus:border-stroke-2"
        autoFocus
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Inhalt (Markdown unterstützt)"
        rows={4}
        className="w-full bg-transparent border border-stroke-1 rounded px-2 py-1 text-[11.5px] outline-none focus:border-stroke-2 resize-y"
      />
      <div className="flex items-center justify-end gap-1.5">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 text-[11px] text-text-tertiary hover:text-text-primary"
          >
            Abbrechen
          </button>
        )}
        <button
          type="button"
          disabled={saving || !title.trim()}
          onClick={async () => {
            setSaving(true);
            try {
              await onSave(title.trim(), body);
              setTitle("");
              setBody("");
            } finally {
              setSaving(false);
            }
          }}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11px] disabled:opacity-50"
          style={{ background: accent }}
        >
          {saving ? <Loader2 size={10} className="spin" /> : <Save size={10} />}
          Speichern
        </button>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Inline Lead-Scraper Launcher
 *
 * Compact form rendered in the CRM sidebar header (admin-only). Posts to
 * `/api/admin/scraper/trigger` and polls `/api/admin/scraper/status`.
 * Designed for the common case "schedule a quick run for one city" — for
 * the full parameter set use /admin/onboarding/scraper.
 * ────────────────────────────────────────────────────────────────────── */
type ScraperState = {
  state: "idle" | "running" | "done" | "error";
  started_at?: string;
  finished_at?: string;
  exit_code?: number;
  params?: Record<string, unknown>;
  log_tail?: string;
  reachable?: boolean;
  error?: string;
};

function ScraperLauncher({
  accent,
  onClose,
  onFinished,
}: {
  accent: string;
  onClose: () => void;
  onFinished?: () => void;
}) {
  const [city, setCity] = useState("Basel");
  const [canton, setCanton] = useState("");
  const [limit, setLimit] = useState("10");
  const [dryRun, setDryRun] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [status, setStatus] = useState<ScraperState | null>(null);
  const lastWasRunning = useRef(false);
  const pollRef = useRef<number | null>(null);

  const fetchStatus = useCallback(async () => {
    try {
      const r = await fetch("/api/admin/scraper/status", { cache: "no-store" });
      const j = (await r.json()) as ScraperState;
      setStatus(j);
      if (lastWasRunning.current && j.state !== "running") {
        lastWasRunning.current = false;
        onFinished?.();
      }
      if (j.state === "running") lastWasRunning.current = true;
    } catch (e) {
      setStatus({
        state: "error",
        reachable: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }, [onFinished]);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (status?.state !== "running") {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
      return;
    }
    if (!pollRef.current) {
      pollRef.current = window.setInterval(fetchStatus, 4000);
    }
    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [status?.state, fetchStatus]);

  const isRunning = status?.state === "running";

  async function handleTrigger() {
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        country: "ch",
        canton: canton.trim() || undefined,
        city: city.trim() || undefined,
        limit: limit ? Number(limit) : undefined,
        dry_run: dryRun,
      };
      const r = await fetch("/api/admin/scraper/trigger", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        throw new Error(j?.error ?? `HTTP ${r.status}`);
      }
      void fetchStatus();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="border-b border-stroke-1 bg-bg-elevated">
      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles size={13} style={{ color: accent }} />
          <span className="text-[12px] font-medium text-text-primary">
            Lead-Scraper
          </span>
          {status && (
            <ScraperStatusChip
              state={status.state}
              reachable={status.reachable}
            />
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary"
          title="Schließen"
        >
          <X size={13} />
        </button>
      </div>

      <div className="px-3 pb-2.5 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-text-quaternary">
            Stadt
          </span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={isRunning}
            placeholder="Basel"
            className="bg-bg-base border border-stroke-1 rounded-md px-2 py-1 text-[12px] outline-none focus:border-stroke-2 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-text-quaternary">
            Kanton (optional)
          </span>
          <input
            type="text"
            value={canton}
            onChange={(e) => setCanton(e.target.value.toUpperCase())}
            disabled={isRunning}
            placeholder="z.B. BS"
            className="bg-bg-base border border-stroke-1 rounded-md px-2 py-1 text-[12px] outline-none focus:border-stroke-2 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-text-quaternary">
            Limit
          </span>
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            disabled={isRunning}
            className="bg-bg-base border border-stroke-1 rounded-md px-2 py-1 text-[12px] outline-none focus:border-stroke-2 disabled:opacity-50"
          />
        </label>
        <label className="flex items-end gap-1.5 text-[11.5px] text-text-secondary pb-0.5">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(e) => setDryRun(e.target.checked)}
            disabled={isRunning}
          />
          Dry-Run (kein CRM-Push)
        </label>
      </div>

      <div className="px-3 pb-3 flex items-center justify-between gap-2">
        <div className="flex-1 min-w-0">
          {submitError ? (
            <span className="text-[11px] text-warning inline-flex items-center gap-1">
              <AlertCircle size={11} />
              <span className="truncate">{submitError}</span>
            </span>
          ) : status?.state === "running" ? (
            <span className="text-[11px] text-info">
              Läuft seit{" "}
              {status.started_at
                ? new Date(status.started_at).toLocaleTimeString("de-CH")
                : "–"}{" "}
              · {humanScraperParams(status.params)}
            </span>
          ) : status?.state === "done" ? (
            <span className="text-[11px] text-text-tertiary">
              Letzter Lauf ok · {humanScraperParams(status.params)}
            </span>
          ) : status?.state === "error" ? (
            <span className="text-[11px] text-warning">
              Letzter Lauf: exit {status.exit_code ?? "?"}
            </span>
          ) : (
            <span className="text-[11px] text-text-quaternary">
              Trigger startet einen einzelnen Scraper-Lauf für die angegebene
              Stadt.
            </span>
          )}
        </div>
        <a
          href="/admin/onboarding/scraper"
          className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
          title="Vollständiges Scraper-Panel"
        >
          <ExternalLink size={11} /> Erweitert
        </a>
        <button
          type="button"
          onClick={handleTrigger}
          disabled={isRunning || submitting || !city.trim()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-white text-[11.5px] disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: accent }}
        >
          {isRunning ? (
            <>
              <Loader2 size={11} className="spin" /> Läuft…
            </>
          ) : submitting ? (
            <>
              <Loader2 size={11} className="spin" /> Startet…
            </>
          ) : (
            <>
              <Sparkles size={11} /> Lauf starten
            </>
          )}
        </button>
      </div>
    </div>
  );
}

function ScraperStatusChip({
  state,
  reachable,
}: {
  state: ScraperState["state"];
  reachable?: boolean;
}) {
  if (reachable === false) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-warning/30 bg-warning/5 text-warning">
        <AlertCircle size={9} /> offline
      </span>
    );
  }
  switch (state) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-info/30 bg-info/5 text-info">
          <Loader2 size={9} className="spin" /> läuft
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-success/30 bg-success/5 text-success">
          <CheckCircle2 size={9} /> ok
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-warning/30 bg-warning/5 text-warning">
          <AlertCircle size={9} /> Fehler
        </span>
      );
    default:
      return null;
  }
}

function humanScraperParams(p?: Record<string, unknown>): string {
  if (!p) return "—";
  const parts: string[] = [];
  if (p.city) parts.push(String(p.city));
  if (p.canton) parts.push(String(p.canton));
  if (p.limit) parts.push(`limit ${p.limit}`);
  if (p.dry_run) parts.push("dry-run");
  return parts.length ? parts.join(" · ") : "—";
}
