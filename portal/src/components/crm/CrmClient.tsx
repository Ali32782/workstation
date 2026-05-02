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
  RefreshCcw,
  FileUp,
  Filter as FilterIcon,
  Check,
  Square,
  CheckSquare as CheckSquareIcon,
  CalendarClock,
  LayoutDashboard,
  Tag,
  UserCheck,
  ChevronDown,
  Send,
  Bookmark,
  BookmarkPlus,
  Flame,
  Snowflake,
  Thermometer,
  Megaphone,
  Pencil,
  Columns3,
} from "lucide-react";
import { scoreLead, scoreTier } from "@/lib/crm/scoring";
import { ImportCrmModal } from "./ImportCrmModal";
import { OpportunityKanban } from "./opportunity-kanban";
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
import { useSearchParams } from "next/navigation";
import { clickToCallUrl } from "@/lib/calls/click-to-call";
import { useLocale } from "@/components/LocaleProvider";
import { useIsNarrowScreen } from "@/lib/use-is-narrow-screen";
import type { WorkspaceId } from "@/lib/workspaces";
import type { Locale, Messages } from "@/lib/i18n/messages";
import { localeTag } from "@/lib/i18n/messages";
import type {
  CompanyDetail,
  CompanySummary,
  NoteSummary,
  OpportunitySummary,
  PersonSummary,
  TaskSummary,
} from "@/lib/crm/types";

const CRM_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Tab = "activity" | "people" | "deals" | "details";

/**
 * Client-side filter facets applied on top of the server-side `q` search.
 * Sets are used for the multi-pick facets (lead source, city) so we can
 * `.has()` in O(1) during the per-row render.
 */
type CrmFilters = {
  leadSources: Set<string>;
  cities: Set<string>;
  hasPhone: "any" | "yes" | "no";
  hasEmail: "any" | "yes" | "no";
  hasOwner: "any" | "yes" | "no";
  hasBooking: "any" | "yes" | "no";
};

function emptyFilters(): CrmFilters {
  return {
    leadSources: new Set(),
    cities: new Set(),
    hasPhone: "any",
    hasEmail: "any",
    hasOwner: "any",
    hasBooking: "any",
  };
}

/** Apply CrmFilters to a list — pure, easy to unit-test if we ever want to. */
function applyFilters(
  list: CompanySummary[],
  f: CrmFilters,
): CompanySummary[] {
  const matchTriState = (
    state: "any" | "yes" | "no",
    has: boolean,
  ): boolean => (state === "any" ? true : state === "yes" ? has : !has);
  return list.filter((c) => {
    if (f.leadSources.size && !f.leadSources.has(c.leadSource ?? "")) return false;
    if (f.cities.size && !f.cities.has(c.city ?? "")) return false;
    if (!matchTriState(f.hasPhone, !!c.phone)) return false;
    if (!matchTriState(f.hasEmail, !!c.generalEmail)) return false;
    if (!matchTriState(f.hasOwner, !!c.ownerName)) return false;
    if (!matchTriState(f.hasBooking, !!c.bookingSystem)) return false;
    return true;
  });
}

function activeFilterCount(f: CrmFilters): number {
  let n = 0;
  n += f.leadSources.size;
  n += f.cities.size;
  if (f.hasPhone !== "any") n += 1;
  if (f.hasEmail !== "any") n += 1;
  if (f.hasOwner !== "any") n += 1;
  if (f.hasBooking !== "any") n += 1;
  return n;
}

function relativeTime(
  iso: string,
  locale: Locale,
  translate: (key: keyof Messages, fallback?: string) => string,
): string {
  const tObj = new Date(iso).getTime();
  const diff = (Date.now() - tObj) / 1000;
  if (diff < 60) return translate("crm.time.justNow");
  if (diff < 3600)
    return translate("crm.time.minutesShort").replace(
      "{n}",
      String(Math.floor(diff / 60)),
    );
  if (diff < 86400)
    return translate("crm.time.hoursShort").replace(
      "{n}",
      String(Math.floor(diff / 3600)),
    );
  if (diff < 86400 * 7)
    return translate("crm.time.daysShort").replace(
      "{n}",
      String(Math.floor(diff / 86400)),
    );
  const loc = locale === "en" ? "en-US" : "de-DE";
  return new Date(iso).toLocaleDateString(loc);
}

function formatCurrency(
  amountMicros: number | null | undefined,
  currency: string | null | undefined,
  locale: Locale,
): string {
  if (amountMicros == null || !currency) return "—";
  const value = amountMicros / 1_000_000;
  const loc = locale === "en" ? "en-US" : "de-CH";
  try {
    return new Intl.NumberFormat(loc, {
      style: "currency",
      currency,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${value.toLocaleString(loc)} ${currency}`;
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
  const { locale, t } = useLocale();
  const searchParams = useSearchParams();
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

  // Multi-select state — backed by a Set to keep toggle/has cheap. The
  // bulk-action bar only mounts once anything is selected.
  const [selectedSet, setSelectedSet] = useState<Set<string>>(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  /** Cmd+K `?person=uuid` — highlights the contact card on People */
  const [highlightPersonId, setHighlightPersonId] = useState<string | null>(
    null,
  );
  /** Cmd+K `?deal=uuid` — Deals tab + card highlight */
  const [highlightOpportunityId, setHighlightOpportunityId] = useState<
    string | null
  >(null);

  const selectCompany = useCallback((id: string | null) => {
    setHighlightPersonId(null);
    setHighlightOpportunityId(null);
    setSelectedId(id);
  }, []);

  // Client-side filter facets. Server still does substring search by name; the
  // facets here are purely additive so the user can drill down without us
  // taking another GraphQL round-trip per click.
  const [filters, setFilters] = useState<CrmFilters>(() => ({
    leadSources: new Set(),
    cities: new Set(),
    hasPhone: "any",
    hasEmail: "any",
    hasOwner: "any",
    hasBooking: "any",
  }));
  const [filterOpen, setFilterOpen] = useState(false);

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

  // Deep-link: /crm?company=<uuid> opens that company in the detail pane
  useEffect(() => {
    const raw = searchParams.get("company")?.trim() ?? "";
    if (!raw || !CRM_UUID_RE.test(raw)) return;
    setHighlightPersonId(null);
    const deal = searchParams.get("deal")?.trim() ?? "";
    if (!CRM_UUID_RE.test(deal)) setHighlightOpportunityId(null);
    setSelectedId((prev) => (prev === raw ? prev : raw));
  }, [searchParams]);

  // Deep link: open contact (Cmd+K) → same company, People tab.
  useEffect(() => {
    const raw = searchParams.get("person")?.trim() ?? "";
    if (!raw || !CRM_UUID_RE.test(raw)) return;
    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(apiUrl("/api/crm/people", { id: raw }), {
          cache: "no-store",
        });
        const j = await r.json();
        if (!r.ok || cancelled) return;
        const cid = j.person?.companyId as string | null | undefined;
        if (!cid) return;
        setSelectedId(cid);
        setHighlightOpportunityId(null);
        setHighlightPersonId(raw);
        setTab("people");
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.delete("person");
        const qs = url.searchParams.toString();
        window.history.replaceState(
          {},
          "",
          url.pathname + (qs ? "?" + qs : ""),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, apiUrl]);

  // Deep link: open deal (Cmd+K) → company + Deals tab + highlight card.
  useEffect(() => {
    const raw = searchParams.get("deal")?.trim() ?? "";
    if (!raw || !CRM_UUID_RE.test(raw)) return;

    const companyFromUrl = searchParams.get("company")?.trim() ?? "";
    if (companyFromUrl && CRM_UUID_RE.test(companyFromUrl)) {
      setTab("deals");
      setHighlightOpportunityId(raw);
      if (typeof window === "undefined") return;
      const url = new URL(window.location.href);
      url.searchParams.delete("deal");
      const qs = url.searchParams.toString();
      window.history.replaceState(
        {},
        "",
        url.pathname + (qs ? "?" + qs : ""),
      );
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const r = await fetch(
          `/api/crm/opportunities/${encodeURIComponent(raw)}?ws=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        );
        const j = (await r.json()) as {
          opportunity?: { companyId?: string | null };
          error?: string;
        };
        if (!r.ok || cancelled) return;
        const cid = j.opportunity?.companyId?.trim() ?? "";
        if (!cid) {
          if (typeof window !== "undefined") {
            window.location.replace(
              `/${workspaceId}/crm/pipeline?deal=${encodeURIComponent(raw)}`,
            );
          }
          return;
        }
        setSelectedId(cid);
        setTab("deals");
        setHighlightOpportunityId(raw);
        if (typeof window === "undefined") return;
        const url = new URL(window.location.href);
        url.searchParams.delete("deal");
        url.searchParams.set("company", cid);
        const qs = url.searchParams.toString();
        window.history.replaceState(
          {},
          "",
          url.pathname + (qs ? "?" + qs : ""),
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [searchParams, workspaceId]);

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
      selectCompany(j.company.id);
    } catch (e) {
      alert(`${t("crm.alert.createFailed")} ${e instanceof Error ? e.message : e}`);
    }
  };

  const onListPatchCompany = useCallback(
    async (id: string, patch: Record<string, unknown>) => {
      try {
        const r = await fetch(apiUrl("/api/crm/companies", { id }), {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(patch),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        const co = j.company;
        setCompanies((prev) =>
          prev.map((c) =>
            c.id === id
              ? {
                  ...c,
                  name: co.name,
                  phone: co.phone ?? null,
                  generalEmail: co.generalEmail ?? null,
                  city: co.address?.addressCity ?? c.city,
                  country: co.address?.addressCountry ?? c.country,
                  updatedAt: co.updatedAt,
                }
              : c,
          ),
        );
        setDetail((d) =>
          d && d.id === id
            ? {
                ...d,
                name: co.name,
                phone: co.phone ?? null,
                generalEmail: co.generalEmail ?? null,
                address: co.address ?? d.address,
                updatedAt: co.updatedAt,
              }
            : d,
        );
      } catch (e) {
        alert(`${t("crm.alert.saveFailed")} ${e instanceof Error ? e.message : e}`);
      }
    },
    [apiUrl, t],
  );

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
        alert(`${t("crm.alert.saveFailed")} ${e instanceof Error ? e.message : e}`);
      }
    },
    [detail, apiUrl, t],
  );

  const onDeleteCompany = useCallback(async () => {
    if (!detail) return;
    if (!confirm(t("crm.delete.confirmNamed").replace("{name}", detail.name)))
      return;
    try {
      const r = await fetch(apiUrl("/api/crm/companies", { id: detail.id }), {
        method: "DELETE",
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      selectCompany(null);
      await loadCompanies(search);
    } catch (e) {
      alert(`${t("crm.alert.deleteFailed")} ${e instanceof Error ? e.message : e}`);
    }
  }, [detail, loadCompanies, search, apiUrl, selectCompany, t]);

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

  const filtered = useMemo(
    () => applyFilters(companies, filters),
    [companies, filters],
  );

  // Available facets for the dropdown — re-derived from whatever's currently
  // loaded. This keeps the UI honest: a filter chip you can pick will always
  // produce ≥1 result (vs. hard-coding the canonical 3 lead sources).
  const facets = useMemo(() => {
    const leadSources = new Set<string>();
    const cities = new Set<string>();
    for (const c of companies) {
      if (c.leadSource) leadSources.add(c.leadSource);
      if (c.city) cities.add(c.city);
    }
    return {
      leadSources: [...leadSources].sort(),
      cities: [...cities].sort(),
    };
  }, [companies]);

  // Auto-select the first visible company *once* on initial load so the
  // right pane isn't empty when the user opens CRM. We use a ref instead
  // of just checking `selectedId == null` because the user may want to
  // clear their selection later (e.g. mobile back button) without us
  // immediately re-selecting them — that would feel like the UI is
  // fighting the user. After the first hop, subsequent selection is
  // entirely user-driven.
  //
  // On phones we *skip* the auto-select: ThreePaneLayout's mobile mode
  // foregrounds the detail pane whenever `hasSelection` is true, which
  // would otherwise drop the user straight into a lead instead of the
  // company list when they open CRM on iPhone.
  const isNarrowScreen = useIsNarrowScreen();
  const autoSelectedRef = useRef(false);
  useEffect(() => {
    if (autoSelectedRef.current) return;
    if (isNarrowScreen) return;
    const pDeep = searchParams.get("person")?.trim() ?? "";
    if (CRM_UUID_RE.test(pDeep)) return;
    const dDeep = searchParams.get("deal")?.trim() ?? "";
    if (CRM_UUID_RE.test(dDeep)) return;
    if (selectedId) {
      autoSelectedRef.current = true;
      return;
    }
    if (companiesLoading) return;
    const first = filtered[0];
    if (first) {
      autoSelectedRef.current = true;
      selectCompany(first.id);
    }
  }, [
    filtered,
    companiesLoading,
    selectedId,
    searchParams,
    selectCompany,
    isNarrowScreen,
  ]);

  // Trim selection when a deletion / filter shrinks the list.
  useEffect(() => {
    if (selectedSet.size === 0) return;
    const visibleIds = new Set(filtered.map((c) => c.id));
    let changed = false;
    const next = new Set<string>();
    selectedSet.forEach((id) => {
      if (visibleIds.has(id)) next.add(id);
      else changed = true;
    });
    if (changed) setSelectedSet(next);
  }, [filtered, selectedSet]);

  /* ── Multi-select handlers ──────────────────────────────────── */

  const toggleSelected = useCallback((id: string) => {
    setSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAllVisible = useCallback(() => {
    setSelectedSet(new Set(filtered.map((c) => c.id)));
  }, [filtered]);

  const clearSelection = useCallback(() => setSelectedSet(new Set()), []);

  const bulkDelete = useCallback(async () => {
    if (selectedSet.size === 0) return;
    if (
      !confirm(
        selectedSet.size === 1
          ? t("crm.bulk.deleteConfirmOne").replace(
              "{n}",
              String(selectedSet.size),
            )
          : t("crm.bulk.deleteConfirmMany").replace(
              "{n}",
              String(selectedSet.size),
            ),
      )
    )
      return;
    setBulkBusy(true);
    try {
      const ids = [...selectedSet];
      const results = await Promise.allSettled(
        ids.map((id) =>
          fetch(apiUrl("/api/crm/companies", { id }), { method: "DELETE" }),
        ),
      );
      const failed = results.filter((r) => r.status === "rejected").length;
      if (failed > 0) {
        alert(
          t("crm.bulk.deletePartialFail")
            .replace("{failed}", String(failed))
            .replace("{total}", String(ids.length)),
        );
      }
      // Refresh and drop the selection regardless — partial successes still
      // mutated server state.
      await loadCompanies(search);
      clearSelection();
      if (selectedId && selectedSet.has(selectedId)) {
        selectCompany(null);
      }
    } finally {
      setBulkBusy(false);
    }
  }, [
    selectedSet,
    apiUrl,
    loadCompanies,
    search,
    clearSelection,
    selectedId,
    selectCompany,
    t,
  ]);

  const bulkSetLeadSource = useCallback(
    async (value: string) => {
      if (selectedSet.size === 0) return;
      const trimmed = value.trim();
      const patch = trimmed === "" ? { leadSource: null } : { leadSource: trimmed };
      setBulkBusy(true);
      try {
        const ids = [...selectedSet];
        await Promise.allSettled(
          ids.map((id) =>
            fetch(apiUrl("/api/crm/companies", { id }), {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(patch),
            }),
          ),
        );
        await loadCompanies(search);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedSet, apiUrl, loadCompanies, search],
  );

  /**
   * Bulk-set the owner-name string for the selected companies. Twenty
   * stores this as a free-text custom field (set via the scraper +
   * post-processing), so we PATCH it the same way as `leadSource`. An
   * empty string clears the field.
   */
  const bulkSetOwner = useCallback(
    async (value: string) => {
      if (selectedSet.size === 0) return;
      const trimmed = value.trim();
      const patch = trimmed === "" ? { ownerName: null } : { ownerName: trimmed };
      setBulkBusy(true);
      try {
        const ids = [...selectedSet];
        await Promise.allSettled(
          ids.map((id) =>
            fetch(apiUrl("/api/crm/companies", { id }), {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(patch),
            }),
          ),
        );
        await loadCompanies(search);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedSet, apiUrl, loadCompanies, search],
  );

  /* ── Mautic-Push (Welle 1: One-Click "in den Funnel") ─────────── */

  type MauticSegmentLite = {
    id: number;
    name: string;
    contactCount: number;
  };
  const [segments, setSegments] = useState<MauticSegmentLite[] | null>(null);
  const [segmentsError, setSegmentsError] = useState<string | null>(null);
  // Mautic-Push status banner. We surface the result inline on the
  // bulk-action bar so the operator sees the success/skip/error counts
  // without losing their selection.
  const [pushResult, setPushResult] = useState<
    | { pushed: number; skipped: number; errors: number; segmentName?: string | null }
    | null
  >(null);

  // Lazy-load segments only when needed — this hits the marketing API,
  // which the user might not have configured yet on every workspace.
  // We only show MedTheris segments anyway, since that's the only
  // workspace that pushes leads into Mautic today.
  useEffect(() => {
    if (workspaceId !== "medtheris") return;
    let alive = true;
    void (async () => {
      try {
        const r = await fetch("/api/marketing/segments?ws=medtheris", {
          cache: "no-store",
        });
        if (!alive) return;
        if (!r.ok) {
          const j = await r.json().catch(() => ({}));
          setSegmentsError(j?.error ?? `HTTP ${r.status}`);
          return;
        }
        const j = await r.json();
        const list = (j.segments ?? []) as MauticSegmentLite[];
        setSegments(list);
      } catch (e) {
        setSegmentsError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  /* ── Mautic-Status (Welle 1.10: "im Funnel"-Chip) ─────────────── */

  // {domain → contactCount} so we can show "im Funnel" on company
  // cards without N Mautic round-trips. Re-fetched whenever the user
  // refreshes the company list or successfully pushes a new batch.
  const [mauticBuckets, setMauticBuckets] = useState<Record<string, number>>(
    {},
  );
  const [mauticDomainDetails, setMauticDomainDetails] = useState<
    Record<string, { count: number; segments: string[]; stages: string[] }>
  >({});
  const refreshMauticStatus = useCallback(async () => {
    if (workspaceId !== "medtheris") return;
    try {
      const r = await fetch(apiUrl("/api/crm/companies/mautic-status"), {
        cache: "no-store",
      });
      if (!r.ok) return;
      const j = await r.json();
      setMauticBuckets(j.buckets ?? {});
      setMauticDomainDetails(j.details ?? {});
    } catch {
      // Silent — the chip is purely informational, no value in
      // surfacing failures to the operator.
    }
  }, [workspaceId, apiUrl]);
  useEffect(() => {
    void refreshMauticStatus();
  }, [refreshMauticStatus]);

  const bulkPushToMautic = useCallback(
    async (segmentId: number | null, segmentName: string | null) => {
      if (selectedSet.size === 0) return;
      setBulkBusy(true);
      setPushResult(null);
      try {
        const ids = [...selectedSet];
        const r = await fetch(
          apiUrl("/api/crm/companies/push-to-mautic"),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              companyIds: ids,
              segmentId: segmentId ?? undefined,
            }),
          },
        );
        const j = await r.json();
        if (!r.ok) {
          alert(`${t("crm.alert.pushFailed")} ${j.error ?? `HTTP ${r.status}`}`);
          return;
        }
        const summary = j.summary ?? { pushed: 0, skipped: 0, errors: 0 };
        setPushResult({
          pushed: summary.pushed,
          skipped: summary.skipped,
          errors: summary.errors,
          segmentName,
        });
        if (summary.pushed > 0) {
          // Refresh the in-funnel chip so the just-pushed company shows
          // green immediately, without forcing a manual reload.
          void refreshMauticStatus();
        }
      } catch (e) {
        alert(`${t("crm.alert.pushFailed")} ${e instanceof Error ? e.message : e}`);
      } finally {
        setBulkBusy(false);
      }
    },
    [selectedSet, apiUrl, refreshMauticStatus, t],
  );

  /* ── Saved Views (Filter-Presets) ─────────────────────────────── */

  type SavedView = {
    id: string;
    name: string;
    leadSources: string[];
    cities: string[];
    hasPhone: "any" | "yes" | "no";
    hasEmail: "any" | "yes" | "no";
    hasOwner: "any" | "yes" | "no";
    hasBooking: "any" | "yes" | "no";
    search: string;
  };
  // Per-workspace key so MedTheris views don't leak into Corehub. We
  // store as JSON in localStorage — small enough that we don't bother
  // with IndexedDB and the operator only needs it on their own browser.
  const VIEWS_LS_KEY = `crm.savedViews.${workspaceId}`;
  const [savedViews, setSavedViews] = useState<SavedView[]>([]);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VIEWS_LS_KEY);
      if (raw) setSavedViews(JSON.parse(raw) as SavedView[]);
    } catch {
      // Corrupted JSON / blocked storage → ignore, start clean.
    }
  }, [VIEWS_LS_KEY]);
  const persistViews = useCallback(
    (next: SavedView[]) => {
      setSavedViews(next);
      try {
        window.localStorage.setItem(VIEWS_LS_KEY, JSON.stringify(next));
      } catch {
        // Quota or private-mode browsing — UI still reflects the change.
      }
    },
    [VIEWS_LS_KEY],
  );

  const saveCurrentView = useCallback(() => {
    const name = prompt(t("crm.savedView.promptName"), "");
    if (!name || !name.trim()) return;
    const view: SavedView = {
      id: `view_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      leadSources: [...filters.leadSources],
      cities: [...filters.cities],
      hasPhone: filters.hasPhone,
      hasEmail: filters.hasEmail,
      hasOwner: filters.hasOwner,
      hasBooking: filters.hasBooking,
      search,
    };
    persistViews([...savedViews, view]);
  }, [filters, savedViews, persistViews, search, t]);

  const applySavedView = useCallback((v: SavedView) => {
    setFilters({
      leadSources: new Set(v.leadSources),
      cities: new Set(v.cities),
      hasPhone: v.hasPhone,
      hasEmail: v.hasEmail,
      hasOwner: v.hasOwner,
      hasBooking: v.hasBooking,
    });
    setSearch(v.search);
  }, []);

  const deleteSavedView = useCallback(
    (id: string) => {
      persistViews(savedViews.filter((v) => v.id !== id));
    },
    [savedViews, persistViews],
  );

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
              href={`/${workspaceId}/crm/pipeline`}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("crm.toolbar.pipelineAll")}
            >
              <Columns3 size={13} />
            </Link>
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
              title={t("crm.toolbar.importCsv")}
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
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11.5px] max-md:min-h-[44px] max-md:px-3 touch-manipulation"
              style={{ background: accent }}
              title={t("crm.toolbar.newCompany")}
            >
              <Plus size={12} /> {t("crm.button.company")}
            </button>
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
          <div className="relative flex-1 min-w-[120px]">
            <Search
              size={12}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
            />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("crm.placeholder.search")}
              className="w-full bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1.5 text-[11.5px] outline-none focus:border-stroke-2"
            />
          </div>
          <button
            type="button"
            onClick={() => setFilterOpen((v) => !v)}
            className={`shrink-0 inline-flex items-center gap-1 rounded-md border px-2 py-1.5 text-[11px] touch-manipulation max-md:min-h-[44px] max-md:px-3 ${
              activeFilterCount(filters) > 0 || filterOpen
                ? "border-stroke-2 bg-bg-overlay text-text-primary"
                : "border-stroke-1 text-text-tertiary hover:text-text-primary"
            }`}
            title={t("common.filter")}
            aria-expanded={filterOpen}
          >
            <FilterIcon size={11} />
            Filter
            {activeFilterCount(filters) > 0 && (
              <span
                className="ml-0.5 inline-flex items-center justify-center rounded-full bg-[var(--accent,#5b5fc7)] text-white text-[9.5px] font-semibold w-4 h-4"
                style={{ background: accent }}
              >
                {activeFilterCount(filters)}
              </span>
            )}
          </button>
        </div>
      </PaneHeader>

      {filterOpen && (
        <FilterPanel
          accent={accent}
          filters={filters}
          facets={facets}
          onChange={setFilters}
          onClose={() => setFilterOpen(false)}
          onReset={() => setFilters(emptyFilters())}
          savedViews={savedViews.map((v) => ({ id: v.id, name: v.name }))}
          onSaveView={saveCurrentView}
          onApplyView={(id) => {
            const v = savedViews.find((sv) => sv.id === id);
            if (v) applySavedView(v);
          }}
          onDeleteView={deleteSavedView}
        />
      )}

      {selectedSet.size > 0 && (
        <BulkActionBar
          accent={accent}
          count={selectedSet.size}
          totalVisible={filtered.length}
          busy={bulkBusy}
          onSelectAll={selectAllVisible}
          onClear={clearSelection}
          onDelete={bulkDelete}
          onSetLeadSource={bulkSetLeadSource}
          onSetOwner={bulkSetOwner}
          onPushToMautic={
            workspaceId === "medtheris" ? bulkPushToMautic : undefined
          }
          segments={segments}
          segmentsError={segmentsError}
          pushResult={pushResult}
          onDismissPushResult={() => setPushResult(null)}
        />
      )}

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
        onSelect={selectCompany}
        meta={companyMeta}
        emptyHint={
          search || activeFilterCount(filters) > 0
            ? t("crm.empty.filtered")
            : t("crm.empty.companies")
        }
        selectedSet={selectedSet}
        onToggleSelect={toggleSelected}
        mauticBuckets={mauticBuckets}
        mauticDomainDetails={
          workspaceId === "medtheris" ? mauticDomainDetails : undefined
        }
        onPatchRow={onListPatchCompany}
      />

      {companiesCursor && (
        <button
          type="button"
          onClick={() => void loadCompanies(search, true)}
          className="m-2 px-3 py-1.5 text-[11px] rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary"
        >
          {t("crm.loadMore")}
        </button>
      )}
    </>
  );

  /* ── Pane 2 — related lists / activity ──────────────────────── */
  const totalActivity = notes.length + tasks.length + opportunities.length;

  const tabBar = (
    <div className="flex flex-nowrap items-stretch gap-0.5 border-b border-stroke-1 bg-bg-chrome overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] min-w-0">
      {[
        {
          id: "activity" as Tab,
          label: t("crm.tab.activity"),
          icon: Activity,
          count: totalActivity,
        },
        {
          id: "people" as Tab,
          label: t("crm.tab.people"),
          icon: UsersIcon,
          count: people.length,
        },
        {
          id: "deals" as Tab,
          label: t("crm.tab.deals"),
          icon: TrendingUp,
          count: opportunities.length,
        },
        {
          id: "details" as Tab,
          label: t("crm.tab.details"),
          icon: Briefcase,
          count: 0,
        },
      ].map((tabItem) => (
        <button
          key={tabItem.id}
          type="button"
          onClick={() => setTab(tabItem.id)}
          className={`shrink-0 px-3 py-2 text-[11.5px] flex items-center gap-1.5 border-b-2 touch-manipulation max-md:min-h-[44px] ${
            tab === tabItem.id
              ? "border-current text-text-primary"
              : "border-transparent text-text-tertiary hover:text-text-secondary"
          }`}
          style={
            tab === tabItem.id ? { color: accent, borderColor: accent } : undefined
          }
        >
          <tabItem.icon size={12} />
          {tabItem.label}
          {tabItem.count > 0 && (
            <span className="text-[10px] text-text-quaternary">
              ({tabItem.count})
            </span>
          )}
        </button>
      ))}
    </div>
  );

  let secondaryBody;
  if (!detail) {
    secondaryBody = (
      <PaneEmptyState
        title={t("crm.empty.noCompanySelected")}
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
        onAddNote={async (noteTitle, noteBody) => {
          try {
            await addNote(noteTitle, noteBody);
            setShowQuickNote(false);
          } catch (e) {
            alert(`${t("crm.alert.saveFailed")} ${e instanceof Error ? e.message : e}`);
          }
        }}
        onOpenComposer={() => setShowQuickNote(true)}
      />
    );
  } else if (tab === "people") {
    secondaryBody = (
      <PeopleGrid
        people={people}
        accent={accent}
        highlightPersonId={highlightPersonId}
      />
    );
  } else if (tab === "deals") {
    secondaryBody = (
      <OpportunityKanban
        deals={opportunities}
        accent={accent}
        workspaceId={workspaceId}
        highlightDealId={highlightOpportunityId}
        onMoved={(id, stage) => {
          setOpportunities((prev) =>
            prev.map((o) => (o.id === id ? { ...o, stage } : o)),
          );
        }}
      />
    );
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
        title={detail ? detail.name : t("crm.hub.linksTitle")}
        subtitle={
          detail
            ? t("crm.hub.linksSubtitleWithCompany")
            : t("crm.hub.linksSubtitleEmpty")
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
        title={t("crm.twenty.nativeTitle")}
        hint={t("crm.twenty.hint")}
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
      className="flex-1 px-3 py-2 flex flex-wrap items-center gap-2 min-w-0 touch-manipulation"
      style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
    >
      <Building2 size={14} style={{ color: accent }} className="shrink-0" />
      <h1 className="text-[12.5px] font-semibold leading-tight min-w-0">
        CRM ·{" "}
        <span className="text-text-tertiary font-normal">{workspaceName}</span>
      </h1>
      <a
        href="https://crm.kineo360.work"
        target="_blank"
        rel="noopener noreferrer"
        className="ml-auto inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px] max-md:min-h-[44px] touch-manipulation"
      >
        <ExternalLink size={11} />
        {t("crm.openInTwenty")}
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
        onMobileBack={() => selectCompany(null)}
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
/*                       Filter dropdown + bulk-action bar             */
/* ----------------------------------------------------------------- */

/**
 * Inline filter panel that drops down between the search header and the
 * company list. Kept inside the same scrolling pane (rather than as a
 * floating popover) so it works on narrow CRM columns and on touch
 * devices without z-index gymnastics.
 */
function FilterPanel({
  accent,
  filters,
  facets,
  onChange,
  onClose,
  onReset,
  savedViews,
  onSaveView,
  onApplyView,
  onDeleteView,
}: {
  accent: string;
  filters: CrmFilters;
  facets: { leadSources: string[]; cities: string[] };
  onChange: (f: CrmFilters) => void;
  onClose: () => void;
  onReset: () => void;
  savedViews?: { id: string; name: string }[];
  onSaveView?: () => void;
  onApplyView?: (id: string) => void;
  onDeleteView?: (id: string) => void;
}) {
  const { t } = useLocale();
  const toggleSetItem = (key: "leadSources" | "cities", value: string) => {
    const next = new Set(filters[key]);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange({ ...filters, [key]: next });
  };
  const setTri = (
    key: "hasPhone" | "hasEmail" | "hasOwner" | "hasBooking",
    value: "any" | "yes" | "no",
  ) => onChange({ ...filters, [key]: value });

  return (
    <div className="border-b border-stroke-1 bg-bg-elevated px-3 py-2.5 space-y-2.5">
      <div className="flex items-center justify-between text-[11px] text-text-tertiary">
        <span className="uppercase tracking-wider font-semibold">{t("common.filter")}</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="text-text-tertiary hover:text-text-primary"
          >
            {t("crm.filter.reset")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-0.5 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title={t("crm.tooltip.closeFilter")}
          >
            <X size={11} />
          </button>
        </div>
      </div>

      <TriStateRow
        label={t("crm.filter.phone")}
        icon={<Phone size={10} />}
        value={filters.hasPhone}
        onChange={(v) => setTri("hasPhone", v)}
      />
      <TriStateRow
        label={t("crm.filter.emailField")}
        icon={<Mail size={10} />}
        value={filters.hasEmail}
        onChange={(v) => setTri("hasEmail", v)}
      />
      <TriStateRow
        label={t("crm.filter.owner")}
        icon={<UserCheck size={10} />}
        value={filters.hasOwner}
        onChange={(v) => setTri("hasOwner", v)}
      />
      <TriStateRow
        label={t("crm.filter.booking")}
        icon={<CalendarClock size={10} />}
        value={filters.hasBooking}
        onChange={(v) => setTri("hasBooking", v)}
      />

      {facets.leadSources.length > 0 && (
        <FacetChips
          label={t("crm.filter.leadSourceFacet")}
          values={facets.leadSources}
          selected={filters.leadSources}
          accent={accent}
          onToggle={(v) => toggleSetItem("leadSources", v)}
        />
      )}
      {facets.cities.length > 0 && (
        <FacetChips
          label={t("crm.filter.cityFacet")}
          values={facets.cities}
          selected={filters.cities}
          accent={accent}
          onToggle={(v) => toggleSetItem("cities", v)}
          maxVisible={12}
        />
      )}

      {(savedViews && savedViews.length > 0) || onSaveView ? (
        <div className="pt-2 border-t border-stroke-1 space-y-1.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="uppercase tracking-wider font-semibold text-text-tertiary inline-flex items-center gap-1">
              <Bookmark size={10} />
              {t("crm.savedViews.heading")}
            </span>
            {onSaveView && (
              <button
                type="button"
                onClick={onSaveView}
                className="inline-flex items-center gap-1 text-text-tertiary hover:text-text-primary"
                title={t("crm.savedView.saveAsNewTitle")}
              >
                <BookmarkPlus size={10} />
                {t("common.save")}
              </button>
            )}
          </div>
          {savedViews && savedViews.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {savedViews.map((v) => (
                <span
                  key={v.id}
                  className="inline-flex items-center gap-1 rounded-full border border-stroke-1 bg-bg-overlay text-[10.5px] text-text-secondary"
                >
                  <button
                    type="button"
                    onClick={() => onApplyView?.(v.id)}
                    className="pl-2 pr-1 py-0.5 hover:text-text-primary"
                    title={t("crm.savedView.applyTitle")}
                  >
                    {v.name}
                  </button>
                  {onDeleteView && (
                    <button
                      type="button"
                      onClick={() => {
                        if (
                          confirm(
                            t("crm.savedView.deleteConfirm").replace(
                              "{name}",
                              v.name,
                            ),
                          )
                        )
                          onDeleteView(v.id);
                      }}
                      className="px-1 py-0.5 text-text-quaternary hover:text-red-300"
                      title={t("crm.tooltip.deleteView")}
                    >
                      <X size={9} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Three-way segmented toggle (Beliebig / Ja / Nein). We use this for the
 * "feature presence" filters because a plain checkbox can't express
 * "explicitly missing" — and "missing phone" is the most common operator
 * query for lead triage.
 */
function TriStateRow({
  label,
  icon,
  value,
  onChange,
}: {
  label: string;
  icon: React.ReactNode;
  value: "any" | "yes" | "no";
  onChange: (v: "any" | "yes" | "no") => void;
}) {
  const { t } = useLocale();
  const opts: { id: "any" | "yes" | "no"; labelKey: keyof Messages }[] = [
    { id: "any", labelKey: "crm.triState.any" },
    { id: "yes", labelKey: "crm.triState.yes" },
    { id: "no", labelKey: "crm.triState.no" },
  ];
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="inline-flex items-center gap-1.5 w-20 text-text-tertiary">
        {icon}
        {label}
      </span>
      <div className="inline-flex rounded-md border border-stroke-1 overflow-hidden">
        {opts.map((o, i) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onChange(o.id)}
            className={`px-2 py-1 ${
              i > 0 ? "border-l border-stroke-1" : ""
            } ${
              value === o.id
                ? "bg-bg-overlay text-text-primary"
                : "text-text-tertiary hover:text-text-primary"
            }`}
          >
            {t(o.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * Wrapping chip cloud for facets like lead source / city. Shows up to
 * `maxVisible` chips and exposes a "+N mehr" expander only if the user
 * really needs the long tail. Selected chips get the workspace accent
 * border so the active filter set is glanceable.
 */
function FacetChips({
  label,
  values,
  selected,
  accent,
  onToggle,
  maxVisible = 6,
}: {
  label: string;
  values: string[];
  selected: Set<string>;
  accent: string;
  onToggle: (v: string) => void;
  maxVisible?: number;
}) {
  const { t } = useLocale();
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? values : values.slice(0, maxVisible);
  const hasMore = values.length > maxVisible;
  return (
    <div className="space-y-1">
      <p className="text-[10.5px] uppercase tracking-wider font-semibold text-text-tertiary">
        {label}
      </p>
      <div className="flex flex-wrap gap-1">
        {visible.map((v) => {
          const on = selected.has(v);
          return (
            <button
              key={v}
              type="button"
              onClick={() => onToggle(v)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10.5px] ${
                on
                  ? "text-text-primary"
                  : "border-stroke-1 text-text-tertiary hover:text-text-primary"
              }`}
              style={
                on
                  ? { borderColor: accent, background: `${accent}22` }
                  : undefined
              }
            >
              {on && <Check size={9} />}
              {v}
            </button>
          );
        })}
        {hasMore && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[10.5px] text-text-tertiary hover:text-text-primary px-1.5"
          >
            {expanded
              ? t("crm.facet.less")
              : t("crm.facet.more").replace(
                  "{count}",
                  String(values.length - maxVisible),
                )}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Sticky-feeling bar that takes over the top of the list while a multi-
 * select is active. Provides bulk Lead-source set + bulk delete; we keep
 * the surface intentionally minimal so single-select day-to-day usage
 * stays uncluttered.
 */
function BulkActionBar({
  accent,
  count,
  totalVisible,
  busy,
  onSelectAll,
  onClear,
  onDelete,
  onSetLeadSource,
  onSetOwner,
  onPushToMautic,
  segments,
  segmentsError,
  pushResult,
  onDismissPushResult,
}: {
  accent: string;
  count: number;
  totalVisible: number;
  busy: boolean;
  onSelectAll: () => void;
  onClear: () => void;
  onDelete: () => void;
  onSetLeadSource: (v: string) => Promise<void> | void;
  onSetOwner: (v: string) => Promise<void> | void;
  onPushToMautic?: (
    segmentId: number | null,
    segmentName: string | null,
  ) => Promise<void> | void;
  segments?: { id: number; name: string; contactCount: number }[] | null;
  segmentsError?: string | null;
  pushResult?: {
    pushed: number;
    skipped: number;
    errors: number;
    segmentName?: string | null;
  } | null;
  onDismissPushResult?: () => void;
}) {
  // `editing` can be "leadSource" | "owner" — single state because the
  // two bulk-edit fields share the inline form pattern and we only ever
  // edit one at a time.
  const [editing, setEditing] = useState<"leadSource" | "owner" | null>(null);
  const [draft, setDraft] = useState("");
  // Push-to-Mautic dropdown state.
  const [pushOpen, setPushOpen] = useState(false);

  const { t } = useLocale();

  const allSelected = count >= totalVisible && totalVisible > 0;
  const showPushButton = Boolean(onPushToMautic);

  return (
    <div
      className="border-b border-stroke-1 touch-manipulation"
      style={{ background: `${accent}12` }}
    >
      <div className="px-3 py-2 flex items-center gap-1.5 flex-wrap touch-manipulation max-md:[&_select]:min-h-[40px]">
        <button
          type="button"
          onClick={allSelected ? onClear : onSelectAll}
          className="inline-flex items-center gap-1 text-[11px] text-text-secondary hover:text-text-primary"
          title={
            allSelected
              ? t("crm.selection.clear")
              : t("crm.selection.selectAllVisible")
          }
        >
          {allSelected ? (
            <CheckSquareIcon size={12} className="text-[#5b5fc7]" />
          ) : (
            <Square size={12} />
          )}
          {t("crm.selection.count").replace("{count}", String(count))}
        </button>
        <span className="text-text-quaternary text-[11px]">
          /{" "}
          {t("crm.selection.visibleTotal").replace(
            "{n}",
            String(totalVisible),
          )}
        </span>
        <div className="ml-auto flex items-center gap-1 flex-wrap">
          {editing ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (editing === "leadSource") await onSetLeadSource(draft);
                else await onSetOwner(draft);
                setEditing(null);
                setDraft("");
              }}
              className="inline-flex items-center gap-1"
            >
              <input
                autoFocus
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  editing === "leadSource"
                    ? t("crm.bulk.placeholderLeadSource")
                    : t("crm.bulk.placeholderOwner")
                }
                className="bg-bg-elevated border border-stroke-1 rounded px-2 py-1 text-[11px] outline-none focus:border-stroke-2 w-32"
              />
              <button
                type="submit"
                disabled={busy}
                className="p-1 rounded text-text-secondary hover:text-text-primary disabled:opacity-40"
                title={t("common.save")}
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditing(null);
                  setDraft("");
                }}
                className="p-1 rounded text-text-tertiary hover:text-text-primary"
                title={t("common.cancel")}
              >
                <X size={12} />
              </button>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setEditing("leadSource")}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-stroke-1 text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-40"
                title={t("crm.bulk.setLeadSource")}
              >
                <Tag size={11} />
                {t("crm.bulk.leadSourceShort")}
              </button>
              <button
                type="button"
                onClick={() => setEditing("owner")}
                disabled={busy}
                className="inline-flex items-center gap-1 px-2 py-1 rounded border border-stroke-1 text-[11px] text-text-secondary hover:text-text-primary disabled:opacity-40"
                title={t("crm.bulk.setOwner")}
              >
                <UserCheck size={11} />
                {t("crm.bulk.ownerShort")}
              </button>
            </>
          )}
          {showPushButton && (
            <PushToMauticButton
              busy={busy}
              segments={segments ?? null}
              segmentsError={segmentsError ?? null}
              onPush={async (segId, segName) => {
                setPushOpen(false);
                if (onPushToMautic) await onPushToMautic(segId, segName);
              }}
              open={pushOpen}
              setOpen={setPushOpen}
              accent={accent}
            />
          )}
          <button
            type="button"
            onClick={onDelete}
            disabled={busy}
            className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-500/40 text-[11px] text-red-300 hover:bg-red-500/10 disabled:opacity-40"
            title={t("crm.bulk.deleteSelection")}
          >
            {busy ? <Loader2 size={11} className="spin" /> : <Trash2 size={11} />}
            {t("crm.button.delete")}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={busy}
            className="p-1 rounded text-text-tertiary hover:text-text-primary disabled:opacity-40"
            title={t("crm.selection.clear")}
          >
            <X size={12} />
          </button>
        </div>
      </div>
      {pushResult && (
        <div className="px-3 pb-2 -mt-1 flex items-center gap-2 text-[11px]">
          <CheckCircle2 size={12} className="text-emerald-400 shrink-0" />
          <span className="text-text-secondary">
            {t("crm.push.resultPushed").replace(
              "{pushed}",
              String(pushResult.pushed),
            )}
            {pushResult.segmentName
              ? t("crm.push.resultToSegment").replace(
                  "{name}",
                  pushResult.segmentName,
                )
              : ""}
            {pushResult.skipped > 0 && (
              <>
                {", "}
                <span className="text-amber-300">
                  {t("crm.push.skippedNoEmail").replace(
                    "{count}",
                    String(pushResult.skipped),
                  )}
                </span>
              </>
            )}
            {pushResult.errors > 0 && (
              <>
                {", "}
                <span className="text-red-300">
                  {t("crm.push.resultErrors").replace(
                    "{errors}",
                    String(pushResult.errors),
                  )}
                </span>
              </>
            )}
          </span>
          {onDismissPushResult && (
            <button
              type="button"
              onClick={onDismissPushResult}
              className="ml-auto p-0.5 rounded text-text-tertiary hover:text-text-primary"
              title={t("crm.modal.close")}
            >
              <X size={11} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Push-to-Mautic split-button: the main click triggers the default push
 * (no segment), the chevron opens a popover where the operator can pick
 * a target segment. Designed so the common case ("just upsert these
 * contacts") is one click, while the segment-targeted case is two.
 */
function PushToMauticButton({
  busy,
  segments,
  segmentsError,
  onPush,
  open,
  setOpen,
  accent,
}: {
  busy: boolean;
  segments: { id: number; name: string; contactCount: number }[] | null;
  segmentsError: string | null;
  onPush: (segId: number | null, segName: string | null) => Promise<void> | void;
  open: boolean;
  setOpen: (v: boolean) => void;
  accent: string;
}) {
  const { t } = useLocale();
  return (
    <span className="relative inline-flex items-center">
      <button
        type="button"
        disabled={busy}
        onClick={() => onPush(null, null)}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-l border border-stroke-1 text-[11px] font-medium text-text-primary hover:bg-bg-overlay disabled:opacity-40"
        title={t("crm.push.titleUpsertNoSegment")}
        style={{
          background: `${accent}22`,
        }}
      >
        {busy ? <Loader2 size={11} className="spin" /> : <Send size={11} />}
        {t("crm.push.buttonInFunnel")}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => setOpen(!open)}
        className="inline-flex items-center px-1 py-1 rounded-r border border-stroke-1 border-l-0 text-text-secondary hover:text-text-primary hover:bg-bg-overlay disabled:opacity-40"
        title={t("crm.segment.pickTitle")}
        style={{
          background: `${accent}22`,
        }}
      >
        <ChevronDown size={11} />
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-72 max-h-80 overflow-auto bg-bg-elevated border border-stroke-1 rounded-md shadow-xl z-50">
          <div className="px-3 py-2 border-b border-stroke-1 text-[10px] uppercase tracking-wide text-text-tertiary">
            {t("crm.segment.select")}
          </div>
          {segmentsError && (
            <div className="px-3 py-2 text-[11px] text-red-300">
              {segmentsError}
            </div>
          )}
          {segments == null ? (
            <div className="px-3 py-2 text-[11px] text-text-tertiary">
              {t("crm.segment.loading")}
            </div>
          ) : segments.length === 0 ? (
            <div className="px-3 py-2 text-[11px] text-text-tertiary">
              {t("crm.mautic.noSegments")}
            </div>
          ) : (
            <ul className="py-1">
              {segments.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPush(s.id, s.name)}
                    className="w-full text-left px-3 py-1.5 text-[11.5px] hover:bg-bg-overlay flex items-center justify-between gap-2"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="text-[10px] text-text-quaternary shrink-0">
                      {s.contactCount}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t border-stroke-1 px-3 py-1.5 text-[10px] text-text-quaternary">
            {t("crm.segment.clickOutsideHint")}
          </div>
        </div>
      )}
    </span>
  );
}

/* ----------------------------------------------------------------- */
/*                          Lead-Score chip                            */
/* ----------------------------------------------------------------- */

/**
 * Compact triage signal in the company card. Three tiers (cold / warm /
 * hot) are colour-coded so the operator can scan a long list and
 * immediately spot which leads are ready for the funnel.
 *
 * The score itself is computed client-side from the loaded summary —
 * see `scoreLead()` for the heuristic. We deliberately surface it in
 * every render path (list + bulk-bar) rather than caching, because the
 * heuristic is cheap (≪1µs) and a stale score after an inline-edit
 * would mislead Triage decisions.
 */
function LeadScoreChip({ company }: { company: CompanySummary }) {
  const { t } = useLocale();
  const score = scoreLead(company);
  const tier = scoreTier(score);
  const Icon = tier === "hot" ? Flame : tier === "warm" ? Thermometer : Snowflake;
  const palette =
    tier === "hot"
      ? { bg: "bg-emerald-500/15", text: "text-emerald-300", iconColor: "text-emerald-400" }
      : tier === "warm"
        ? { bg: "bg-amber-500/15", text: "text-amber-300", iconColor: "text-amber-400" }
        : { bg: "bg-slate-500/15", text: "text-slate-300", iconColor: "text-slate-400" };
  const descKey =
    tier === "hot"
      ? "crm.leadScore.desc.hot"
      : tier === "warm"
        ? "crm.leadScore.desc.warm"
        : "crm.leadScore.desc.cold";
  return (
    <span
      className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9.5px] font-semibold shrink-0 ${palette.bg} ${palette.text}`}
      title={t("crm.leadScore.title")
        .replace("{score}", String(score))
        .replace("{desc}", t(descKey))}
    >
      <Icon size={9} className={palette.iconColor} />
      {score}
    </span>
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
  selectedSet,
  onToggleSelect,
  mauticBuckets,
  mauticDomainDetails,
  onPatchRow,
}: {
  companies: CompanySummary[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  meta: Map<string, { tone: "fresh" | "warm" | "stale" }>;
  emptyHint: string;
  selectedSet: Set<string>;
  onToggleSelect: (id: string) => void;
  mauticBuckets?: Record<string, number>;
  mauticDomainDetails?: Record<
    string,
    { count: number; segments: string[]; stages: string[] }
  >;
  onPatchRow?: (id: string, patch: Record<string, unknown>) => void;
}) {
  const { locale, t } = useLocale();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "" });
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        {t("common.loading")}
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
  const anyChecked = selectedSet.size > 0;

  function saveRowEdit(c: CompanySummary) {
    if (!onPatchRow) return;
    const patch: Record<string, unknown> = {};
    const n = draft.name.trim();
    const p = draft.phone.trim();
    const em = draft.email.trim();
    if (n && n !== c.name) patch.name = n;
    if (p !== (c.phone ?? "")) patch.phone = p || null;
    if (em !== (c.generalEmail ?? "")) patch.generalEmail = em || null;
    if (Object.keys(patch).length) onPatchRow(c.id, patch);
    setEditingId(null);
  }

  return (
    <ul className="flex-1 min-h-0 overflow-auto">
      {companies.map((c) => {
        const isSel = c.id === selectedId;
        const isChecked = selectedSet.has(c.id);
        const tone = meta.get(c.id)?.tone ?? "warm";
        const dot =
          tone === "fresh"
            ? "#10b981"
            : tone === "warm"
              ? "#eab308"
              : "#64748b";
        return (
          <li key={c.id}>
            <div
              className={`group w-full text-left border-b border-stroke-1/60 px-3 py-2.5 flex items-start gap-2.5 ${
                isSel ? "bg-bg-overlay" : "hover:bg-bg-elevated"
              }`}
            >
              {/* Selection toggle. Visible when any row is checked, or on
                  hover/focus; otherwise stays out of the way to keep the
                  default rest-state visually clean. */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleSelect(c.id);
                }}
                aria-pressed={isChecked}
                title={isChecked ? t("crm.selection.removeRow") : t("crm.selection.addRow")}
                className={`relative z-[1] mt-0.5 shrink-0 p-0.5 rounded text-text-tertiary hover:text-text-primary transition-opacity ${
                  isChecked || anyChecked
                    ? "opacity-100"
                    : "opacity-[0.52] group-hover:opacity-100 focus-visible:opacity-100"
                }`}
              >
                {isChecked ? (
                  <CheckSquareIcon size={14} className="text-[#5b5fc7]" />
                ) : (
                  <Square size={14} />
                )}
              </button>
              <div className="flex-1 min-w-0 flex items-start gap-0.5">
              <button
                type="button"
                onClick={() => {
                  if (editingId === c.id) return;
                  onSelect(c.id);
                }}
                className="min-w-0 flex-1 flex items-start gap-2.5 text-left"
              >
                <Avatar name={c.name} size={32} />
                <div className="min-w-0 flex-1">
                  {editingId === c.id ? (
                    <div
                      className="space-y-1.5"
                      onClick={(ev) => ev.stopPropagation()}
                    >
                      <input
                        value={draft.name}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, name: e.target.value }))
                        }
                        className="w-full bg-bg-base border border-stroke-1 rounded px-2 py-1 text-[12px] text-text-primary"
                        placeholder={t("crm.person.placeholder.name")}
                      />
                      <input
                        value={draft.phone}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, phone: e.target.value }))
                        }
                        className="w-full bg-bg-base border border-stroke-1 rounded px-2 py-1 text-[11px] text-text-primary"
                        placeholder={t("crm.person.placeholder.phone")}
                      />
                      <input
                        value={draft.email}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, email: e.target.value }))
                        }
                        className="w-full bg-bg-base border border-stroke-1 rounded px-2 py-1 text-[11px] text-text-primary"
                        placeholder={t("crm.person.placeholder.emailGeneral")}
                      />
                      <div className="flex gap-2 pt-0.5">
                        <button
                          type="button"
                          onClick={() => saveRowEdit(c)}
                          className="text-[10px] px-2 py-0.5 rounded bg-accent text-white"
                        >
                          {t("common.save")}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingId(null)}
                          className="text-[10px] px-2 py-0.5 rounded border border-stroke-1 text-text-tertiary"
                        >
                          {t("common.cancel")}
                        </button>
                      </div>
                    </div>
                  ) : (
                  <>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <p className="text-[12.5px] font-semibold text-text-primary truncate flex-1">
                      {c.name || t("crm.company.unnamed")}
                    </p>
                    <LeadScoreChip company={c} />
                    {(() => {
                      const dom = (c.domain ?? "")
                        .toLowerCase()
                        .replace(/^https?:\/\//, "")
                        .replace(/^www\./, "")
                        .replace(/\/.*$/, "");
                      const hits =
                        dom && mauticBuckets ? mauticBuckets[dom] : undefined;
                      if (!hits || hits <= 0) return null;
                      const det =
                        dom && mauticDomainDetails
                          ? mauticDomainDetails[dom]
                          : undefined;
                      const segHint = det?.segments?.length
                        ? det.segments.slice(0, 3).join(", ") +
                          (det.segments.length > 3 ? "…" : "")
                        : "";
                      const stageHint = det?.stages?.length
                        ? det.stages.join(", ")
                        : "";
                      return (
                        <span
                          className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9.5px] font-semibold shrink-0 bg-fuchsia-500/15 text-fuchsia-300"
                          title={
                            det
                              ? t("crm.mautic.badgeDetailed")
                                  .replace("{domain}", dom)
                                  .replace("{count}", String(det.count))
                                  .replace("{segments}", segHint || "—")
                                  .replace("{stage}", stageHint || "—")
                              : hits === 1
                                ? t("crm.mautic.badgeSimpleOne").replace(
                                    "{domain}",
                                    dom,
                                  )
                                : t("crm.mautic.badgeSimpleMany")
                                    .replace("{hits}", String(hits))
                                    .replace("{domain}", dom)
                          }
                        >
                          <Megaphone size={9} className="text-fuchsia-400" />
                          {hits}
                        </span>
                      );
                    })()}
                    <span
                      aria-hidden
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: dot }}
                      title={
                        tone === "fresh"
                          ? t("crm.activityTone.fresh")
                          : tone === "warm"
                            ? t("crm.activityTone.warm")
                            : t("crm.activityTone.stale")
                      }
                    />
                    <span className="text-[10px] text-text-quaternary shrink-0">
                      {relativeTime(c.updatedAt, locale, t)}
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
                  {/* Scraper-derived stamps: keeps the list cards informative
                      so the user can scan for "where's the data missing?" */}
                  {(c.ownerName ||
                    c.bookingSystem ||
                    c.leadSource ||
                    c.employeeCountPhysio != null) && (
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap text-[10px]">
                      {c.ownerName && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bg-overlay text-text-secondary"
                          title={`Inhaber: ${c.ownerName}`}
                        >
                          <UserCheck size={9} className="text-emerald-400" />
                          {c.ownerName}
                        </span>
                      )}
                      {c.employeeCountPhysio != null && c.employeeCountPhysio > 0 && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bg-overlay text-text-secondary"
                          title={t("crm.people.keyStaffTitle")}
                        >
                          <UsersIcon size={9} />
                          {c.employeeCountPhysio}
                        </span>
                      )}
                      {c.bookingSystem && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300"
                          title={`Booking: ${c.bookingSystem}`}
                        >
                          <CalendarClock size={9} />
                          {c.bookingSystem}
                        </span>
                      )}
                      {c.leadSource && (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-bg-overlay text-text-tertiary"
                          title={`Lead-Quelle: ${c.leadSource}`}
                        >
                          <Tag size={9} />
                          {c.leadSource}
                        </span>
                      )}
                    </div>
                  )}
                </>
                )}
                </div>
              </button>
              {onPatchRow ? (
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    if (editingId === c.id) saveRowEdit(c);
                    else {
                      setEditingId(c.id);
                      setDraft({
                        name: c.name,
                        phone: c.phone ?? "",
                        email: c.generalEmail ?? "",
                      });
                    }
                  }}
                  className="shrink-0 mt-0.5 p-1 rounded text-text-quaternary hover:text-text-primary hover:bg-bg-overlay"
                  title={
                    editingId === c.id
                      ? t("crm.inlineEdit.saveTooltip")
                      : t("crm.inlineEdit.editFieldsTooltip")
                  }
                >
                  {editingId === c.id ? (
                    <Check size={13} className="text-emerald-400" />
                  ) : (
                    <Pencil size={13} />
                  )}
                </button>
              ) : null}
            </div>
            </div>
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
  const { locale, t } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
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
                  <StatusPill label={t("crm.icp.label")} tone="success" />
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onDelete()}
              className="p-1.5 max-md:min-h-[44px] max-md:min-w-[44px] max-md:inline-flex max-md:items-center max-md:justify-center rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-500 shrink-0 touch-manipulation"
              title={t("common.delete")}
            >
              <Trash2 size={14} />
            </button>
          </div>

          {/* Quick actions — horizontal scroll on narrow screens (many chips) */}
          <div className="mt-3 flex gap-2 overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] pb-1 -mx-1 px-1 md:flex-wrap md:overflow-visible">
            <QuickAction
              icon={<PhoneCall size={11} />}
              label={t("crm.quick.call")}
              accent={accent}
              disabled={!company.phone}
              href={company.phone ? `tel:${company.phone}` : undefined}
            />
            <QuickAction
              icon={<Video size={11} />}
              label={t("crm.quick.videoCall")}
              accent={accent}
              href={clickToCallUrl({
                workspaceId,
                subject: t("crm.call.subjectWithCompany").replace(
                  "{name}",
                  company.name,
                ),
                context: {
                  kind: "crm",
                  companyId: company.id,
                  label: company.name,
                },
              })}
            />
            <QuickAction
              icon={<Mail size={11} />}
              label={t("crm.quick.mail")}
              accent={accent}
              disabled={!company.generalEmail}
              href={
                company.generalEmail
                  ? `/${workspaceId}/mail?compose=1&to=${encodeURIComponent(company.generalEmail)}`
                  : undefined
              }
              title={
                company.generalEmail
                  ? t("crm.quick.mailToPortal").replace(
                      "{email}",
                      company.generalEmail,
                    )
                  : t("crm.person.noEmail")
              }
            />
            <QuickAction
              icon={<StickyNote size={11} />}
              label={t("crm.quick.note")}
              accent={accent}
              onClick={onAddNote}
            />
            <AiClassifyQuickAction
              accent={accent}
              workspaceId={workspaceId}
              companyId={company.id}
            />
            <AiPitchTailorAction
              accent={accent}
              workspaceId={workspaceId}
              companyId={company.id}
              companyDomain={company.domain ?? null}
            />
            <AiSalesBriefAction
              accent={accent}
              workspaceId={workspaceId}
              companyId={company.id}
              companyDomain={company.domain ?? null}
            />
            <QuickAction
              icon={<LayoutDashboard size={11} />}
              label={t("crm.quick.companyHub")}
              accent={accent}
              href={`/${workspaceId}/crm/company/${company.id}`}
              title={t("crm.hub.crossAppTitle")}
            />
            <QuickAction
              icon={<CheckSquare size={11} />}
              label={t("crm.quick.task")}
              accent={accent}
              disabled
              title={t("crm.twenty.createSoonTooltip")}
            />
          </div>

          {/* Stat strip */}
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat
              label={t("crm.stat.openDeals")}
              value={String(openDeals.length)}
              hint={openDealValue > 0
                ? formatCurrency(openDealValue, dealCurrency, locale)
                : undefined}
              accent={accent}
            />
            <Stat
              label={t("crm.stat.contacts")}
              value={String(people.length)}
              hint={people[0] ? `${people[0].firstName} ${people[0].lastName}` : undefined}
              accent={accent}
            />
            <Stat
              label={t("crm.stat.lastContact")}
              value={lastContact ? relativeTime(lastContact, locale, t) : "—"}
              hint={lastContact
                ? new Date(lastContact).toLocaleDateString(
                    locale === "en" ? "en-US" : "de-DE",
                  )
                : t("crm.activity.empty")}
              accent={accent}
            />
            <Stat
              label={t("crm.stat.openTasks")}
              value={String(openTaskCount)}
              hint={openTaskCount > 0 ? t("crm.stat.tasksFromTotal").replace("{total}", String(tasks.length)) : t("crm.stat.tasksAllDone")}
              accent={accent}
            />
          </div>
        </div>
      }
      main={
        <div className="px-4 py-3 space-y-6">
          {opportunities.length > 0 && (
            <section>
              <SectionHeader>{t("crm.section.activeDeals")}</SectionHeader>
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
                            ` · ${new Date(o.closeDate).toLocaleDateString(locale === "en" ? "en-US" : "de-DE")}`}
                        </p>
                      </div>
                      <span className="text-[11.5px] font-semibold text-text-primary shrink-0">
                        {formatCurrency(
                          o.amount?.amountMicros,
                          o.amount?.currencyCode,
                          locale,
                        )}
                      </span>
                    </article>
                  </li>
                ))}
              </ul>
              {openDeals.length === 0 && (
                <p className="text-[11.5px] text-text-tertiary">
                  {t("crm.deals.noOpen")}
                </p>
              )}
            </section>
          )}

          {people.length > 0 && (
            <section>
              <SectionHeader>{t("crm.section.keyContacts")}</SectionHeader>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                            title={t("crm.quick.mailTo").replace(
                              "{email}",
                              p.email,
                            )}
                          >
                            <Mail size={11} />
                          </a>
                        )}
                        {p.phone && (
                          <a
                            href={`tel:${p.phone}`}
                            className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                            title={t("crm.quick.callNumber").replace(
                              "{phone}",
                              p.phone,
                            )}
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
          <SidebarSection title={t("crm.section.contact")}>
            <PropertyList
              rows={[
                {
                  label: t("crm.filter.phone"),
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
                  label: t("crm.filter.emailField"),
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
                  label: t("crm.filter.owner"),
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
                  label: t("crm.field.ownerMail"),
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
          <SidebarSection title={t("crm.section.classification")}>
            <PropertyList
              rows={[
                {
                  label: t("crm.field.icp"),
                  value: company.idealCustomerProfile ? (
                    <StatusPill label={t("crm.icp.label")} tone="success" />
                  ) : (
                    <span className="text-text-tertiary">—</span>
                  ),
                },
                {
                  label: t("crm.filter.booking"),
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
                  label: t("crm.filter.leadSourceFacet"),
                  value: (
                    <EditableText
                      value={company.leadSource ?? ""}
                      onSave={(v) => onPatch({ leadSource: v || null })}
                      placeholder="—"
                      className="text-[12px]"
                    />
                  ),
                },
                { label: t("crm.field.tenant"), value: company.tenant ?? "—" },
              ]}
            />
          </SidebarSection>
          <MarketingSidebarSection
            workspaceId={workspaceId}
            companyId={company.id}
            companyName={company.name}
            accent={accent}
          />
          <SidebarSection title={t("crm.section.timeline")}>
            <p className="text-[11px] text-text-tertiary leading-relaxed">
              {t("crm.timeline.created").replace(
                "{datetime}",
                new Date(company.createdAt).toLocaleString(localeTag),
              )}
              <br />
              {t("crm.timeline.updated").replace(
                "{datetime}",
                new Date(company.updatedAt).toLocaleString(localeTag),
              )}
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
  const { locale, t } = useLocale();
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
            t("crm.sync.summary")
              .replace("{synced}", String(j.synced ?? 0))
              .replace("{skipped}", String(j.skipped ?? 0)) +
              (errCount > 0
                ? t("crm.sync.errorsSuffix").replace(
                    "{errors}",
                    String(errCount),
                  )
                : ""),
        );
        await load();
      }
    } catch (e) {
      setSyncMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncing(false);
    }
  }, [companyId, workspaceId, load, t]);

  return (
    <SidebarSection
      title={
        <span className="inline-flex items-center gap-1.5">
          <Megaphone size={11} style={{ color: accent }} />
          {t("crm.sidebar.marketing")}
        </span>
      }
    >
      {loading && !data && (
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <Loader2 size={11} className="animate-spin" />{" "}
          {t("crm.marketing.loadingData")}
        </div>
      )}
      {data && !data.configured && (
        <p className="text-[11px] text-text-tertiary leading-relaxed">
          {t("crm.marketing.apiNotConfigured")}{" "}
          <span className="text-text-quaternary">
            {t("crm.marketing.credentialsMissing")}
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
              {t("crm.marketing.contactsLine").replace(
                "{suffix}",
                data.domain ? ` @${data.domain}` : "",
              )}
            </p>
          </div>
          {data.stats.totalPoints > 0 && (
            <p className="text-[10.5px] text-text-tertiary">
              Σ {data.stats.totalPoints} Punkte ·{" "}
              {data.stats.lastActivity
                ? t("crm.stats.lastActivity").replace(
                    "{time}",
                    relativeTime(data.stats.lastActivity, locale, t),
                  )
                : t("crm.stats.noActivityShort")}
            </p>
          )}
          {data.stats.segments.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.stats.segments.slice(0, 6).map((s) => (
                <span
                  key={s.name}
                  className="px-1.5 py-0.5 rounded text-[10.5px] border border-stroke-1 text-text-secondary"
                  title={t("crm.marketing.segmentTooltip")
                    .replace("{count}", String(s.count))
                    .replace("{name}", s.name)}
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
                    {t("crm.marketing.pointsAbbrev").replace(
                      "{n}",
                      String(c.points),
                    )}
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
              title={t("crm.mautic.syncPeopleTitle").replace(
                "{company}",
                companyName,
              )}
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
                title={t("crm.openInMautic")}
              >
                <ExternalLink size={11} /> Mautic
              </a>
            )}
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="ml-auto p-1 rounded hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-40"
              title={t("common.refresh")}
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

/**
 * "AI-Klassifizieren" QuickAction. Calls /api/ai/lead-classify for the
 * current company, opens a small popover with the model's verdict
 * (hot/warm/cold + reasoning + suggested next step). Designed as a
 * single-click triage helper — the operator gets a 3-second sanity
 * check on whether this lead is worth pushing into the funnel right now.
 *
 * Result is held purely in local state (we don't persist it back to
 * Twenty yet — that would require a custom field). When the company
 * selection changes, the result is cleared.
 */
function AiClassifyQuickAction({
  accent,
  workspaceId,
  companyId,
}: {
  accent: string;
  workspaceId: WorkspaceId;
  companyId: string;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    tier: "hot" | "warm" | "cold";
    reasoning: string;
    nextStep: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  // Reset when the user selects a different company.
  useEffect(() => {
    setResult(null);
    setError(null);
    setOpen(false);
  }, [companyId]);

  const onClick = async () => {
    if (busy) return;
    if (result) {
      setOpen((v) => !v);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/ai/lead-classify?ws=${workspaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ companyId }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        setOpen(true);
        return;
      }
      setResult(j);
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const tierPalette = {
    hot: { bg: "bg-emerald-500/15", text: "text-emerald-300", border: "border-emerald-500/40" },
    warm: { bg: "bg-amber-500/15", text: "text-amber-300", border: "border-amber-500/40" },
    cold: { bg: "bg-slate-500/15", text: "text-slate-300", border: "border-slate-500/40" },
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={t("crm.ai.classifyTooltip")}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary disabled:opacity-40"
        style={{ borderColor: accent + "30" }}
      >
        {busy ? (
          <Loader2 size={11} className="spin text-fuchsia-400" />
        ) : (
          <Sparkles size={11} className="text-fuchsia-400" />
        )}
        {t("crm.ai.leadButton")}
        {result && (
          <span
            className={`ml-1 px-1 py-0.5 rounded text-[9px] font-bold uppercase ${tierPalette[result.tier].bg} ${tierPalette[result.tier].text}`}
          >
            {result.tier}
          </span>
        )}
      </button>
      {open && (result || error) && (
        <div
          className={`absolute top-full left-0 mt-1 w-80 bg-bg-elevated border rounded-md shadow-xl z-50 p-3 text-[11.5px] ${
            error
              ? "border-red-500/40"
              : tierPalette[result!.tier].border
          }`}
        >
          {error ? (
            <div className="text-red-300">
              <div className="font-semibold mb-1">
                {t("crm.ai.classifyFailedHeading")}
              </div>
              <div className="text-text-tertiary">{error}</div>
            </div>
          ) : result ? (
            <>
              <div className="flex items-center gap-1.5 mb-1.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${tierPalette[result.tier].bg} ${tierPalette[result.tier].text}`}
                >
                  {result.tier}
                </span>
                <span className="text-text-tertiary text-[10px]">
                  {t("crm.claude.heading")}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="ml-auto text-text-quaternary hover:text-text-primary"
                  title={t("crm.modal.close")}
                >
                  <X size={11} />
                </button>
              </div>
              <p className="text-text-secondary leading-relaxed mb-2">
                {result.reasoning}
              </p>
              {result.nextStep && (
                <div
                  className="rounded px-2 py-1.5 text-[11px]"
                  style={{ background: `${accent}15` }}
                >
                  <span className="text-text-tertiary text-[9.5px] uppercase tracking-wide">
                    {t("crm.ai.nextStepLabel")}
                  </span>
                  <p className="mt-0.5 text-text-primary">{result.nextStep}</p>
                </div>
              )}
            </>
          ) : null}
        </div>
      )}
    </span>
  );
}

/**
 * "AI-Sales-Brief" QuickAction.
 *
 * Generates a 1-pager Lead-Recherche-Brief by combining CRM facts with
 * a fresh website scrape and Workspace-Knowledge from the AI knowledge
 * editor.  Output is rendered inline as Markdown (basic formatting via
 * minimal regex; we deliberately don't pull in a full md-to-html
 * library here — the LLM output is well-formed and the brief is short).
 *
 * The brief lives in component-state only — copy-to-clipboard offers a
 * fast persistence path until we wire it back into Twenty as a note.
 */
function AiSalesBriefAction({
  accent,
  workspaceId,
  companyId,
  companyDomain,
}: {
  accent: string;
  workspaceId: WorkspaceId;
  companyId: string;
  companyDomain: string | null;
}) {
  const { t } = useLocale();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    brief: string;
    websiteFetched: boolean;
    websiteUrl: string | null;
    usedKnowledge: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setResult(null);
    setError(null);
    setOpen(false);
  }, [companyId]);

  const onClick = async () => {
    if (busy) return;
    if (result || error) {
      setOpen((v) => !v);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/ai/lead-brief?ws=${workspaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId,
          websiteOverride: companyDomain ?? undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        setOpen(true);
        return;
      }
      setResult(j);
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.brief);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={onClick}
        disabled={busy}
        title={t("crm.ai.salesBriefTooltip")}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary disabled:opacity-40"
        style={{ borderColor: accent + "30" }}
      >
        {busy ? (
          <Loader2 size={11} className="spin text-cyan-300" />
        ) : (
          <Sparkles size={11} className="text-cyan-300" />
        )}
        {t("crm.ai.salesBriefButton")}
      </button>
      {open && (result || error) && (
        <div
          className="absolute top-full right-0 mt-1 w-[420px] max-h-[560px] bg-bg-elevated border border-stroke-1 rounded-md shadow-xl z-50 p-3 text-[11.5px] flex flex-col"
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={12} className="text-cyan-300" />
            <span className="text-text-primary font-medium text-[12px]">
              {t("crm.ai.salesBriefModalHeading")}
            </span>
            {result?.websiteFetched && (
              <span
                className="text-[9.5px] uppercase tracking-wide px-1 py-0.5 rounded"
                style={{ background: `${accent}20`, color: accent }}
                title={result.websiteUrl ?? undefined}
              >
                {t("crm.ai.websiteOkBadge")}
              </span>
            )}
            {result?.usedKnowledge && (
              <span className="text-[9.5px] uppercase tracking-wide px-1 py-0.5 rounded bg-info/15 text-info">
                {t("crm.ai.knowledgeBadge")}
              </span>
            )}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-text-quaternary hover:text-text-primary"
            >
              <X size={11} />
            </button>
          </div>
          {error ? (
            <div className="text-red-300">
              <div className="font-semibold mb-1">
                {t("crm.ai.briefFailedHeading")}
              </div>
              <div className="text-text-tertiary">{error}</div>
            </div>
          ) : result ? (
            <>
              <div className="overflow-y-auto flex-1 prose prose-invert prose-sm max-w-none">
                <div
                  className="text-text-secondary leading-relaxed"
                  dangerouslySetInnerHTML={{
                    __html: renderMinimalMarkdown(result.brief),
                  }}
                />
              </div>
              <div className="mt-2 pt-2 border-t border-stroke-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="text-[11px] text-text-tertiary hover:text-text-primary"
                >
                  {copied ? t("crm.ai.copied") : t("crm.ai.copyToClipboard")}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setResult(null);
                    void onClick();
                  }}
                  className="ml-auto text-[11px] text-text-tertiary hover:text-text-primary"
                >
                  {t("crm.ai.regenerate")}
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}
    </span>
  );
}

type PitchChannel = "cold_email" | "linkedin" | "followup" | "call_opener";

/**
 * Channel-specific outreach copy — shorter than the full sales brief,
 * ready to paste (email, LinkedIn, follow-up, call opener).
 */
function AiPitchTailorAction({
  accent,
  workspaceId,
  companyId,
  companyDomain,
}: {
  accent: string;
  workspaceId: WorkspaceId;
  companyId: string;
  companyDomain: string | null;
}) {
  const { t } = useLocale();
  const pitchLabels = useMemo(
    () =>
      ({
        cold_email: t("crm.pitch.cold_email"),
        linkedin: t("crm.pitch.linkedin"),
        followup: t("crm.pitch.followup"),
        call_opener: t("crm.pitch.call_opener"),
      }) satisfies Record<PitchChannel, string>,
    [t],
  );
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<PitchChannel>("cold_email");
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setError(null);
    setText(null);
    setOpen(false);
  }, [companyId]);

  const run = async () => {
    setOpen(true);
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(`/api/ai/pitch-tailor?ws=${workspaceId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyId,
          channel,
          websiteOverride: companyDomain ?? undefined,
        }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? `HTTP ${r.status}`);
        setOpen(true);
        return;
      }
      setText((j.text as string) ?? "");
      setOpen(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setOpen(true);
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => void run()}
        disabled={busy}
        title={t("crm.ai.pitchTooltip")}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary disabled:opacity-40"
        style={{ borderColor: accent + "30" }}
      >
        {busy ? (
          <Loader2 size={11} className="spin text-violet-300" />
        ) : (
          <Megaphone size={11} className="text-violet-300" />
        )}
        {t("crm.ai.pitchButton")}
      </button>
      {open && (
        <div className="absolute top-full right-0 mt-1 w-[380px] max-h-[480px] bg-bg-elevated border border-stroke-1 rounded-md shadow-xl z-50 p-3 text-[11.5px] flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Megaphone size={12} className="text-violet-300" />
            <span className="text-text-primary font-medium text-[12px]">
              {t("crm.ai.channelLabel")}
            </span>
            {(Object.keys(pitchLabels) as PitchChannel[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setChannel(c)}
                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                  channel === c
                    ? "border-violet-500/50 bg-violet-500/10 text-text-primary"
                    : "border-stroke-1 text-text-tertiary hover:border-stroke-2"
                }`}
              >
                {pitchLabels[c]}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="ml-auto text-text-quaternary hover:text-text-primary p-0.5"
            >
              <X size={11} />
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void run()}
            className="text-[11px] self-start px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary"
            style={{ borderColor: accent + "35" }}
          >
            {t("crm.ai.regenerate")}
          </button>
          {error ? (
            <div className="text-red-300 text-[11px]">{error}</div>
          ) : text ? (
            <>
              <div
                className="overflow-y-auto flex-1 text-text-secondary leading-relaxed max-h-[320px]"
                dangerouslySetInnerHTML={{
                  __html: renderMinimalMarkdown(text),
                }}
              />
              <div className="pt-2 border-t border-stroke-1 flex">
                <button
                  type="button"
                  onClick={() => void copy()}
                  className="text-[11px] text-text-tertiary hover:text-text-primary"
                >
                  {copied ? t("crm.ai.copied") : t("crm.ai.copyToClipboard")}
                </button>
              </div>
            </>
          ) : busy ? (
            <div className="text-text-tertiary text-[11px] py-4 text-center">
              <Loader2 className="inline spin w-5 h-5" />
            </div>
          ) : (
            <div className="text-text-tertiary text-[11px]">
              {t("crm.ai.pitchEmptyHint")}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/**
 * Tiny Markdown-to-HTML for AI-generated briefs. Handles the subset
 * Claude actually emits in this prompt: H2-H4, bold, bullet lists,
 * paragraphs.  No third-party dep needed.
 */
function renderMinimalMarkdown(md: string): string {
  const escape = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      closeList();
      continue;
    }
    const h = /^(#{2,4})\s+(.+)$/.exec(line);
    if (h) {
      closeList();
      const level = h[1].length;
      const text = inlineMd(escape(h[2]));
      out.push(`<h${level}>${text}</h${level}>`);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      const text = inlineMd(escape(line.replace(/^[-*]\s+/, "")));
      out.push(`<li>${text}</li>`);
      continue;
    }
    closeList();
    out.push(`<p>${inlineMd(escape(line))}</p>`);
  }
  closeList();
  return out.join("");
}

function inlineMd(s: string): string {
  return s
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
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
  const cls = `inline-flex items-center justify-center gap-1 px-2 py-1 rounded-md text-[11px] border shrink-0 touch-manipulation max-md:min-h-[40px] ${
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
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const dateGroupLabels = useMemo(
    () => ({
      unknown: t("common.dateUnknown"),
      today: t("common.today"),
      yesterday: t("common.yesterday"),
    }),
    [t],
  );
  const items = useMemo<FeedItem[]>(() => {
    const all: FeedItem[] = [
      ...notes.map<FeedItem>((n) => ({ kind: "note", ts: n.createdAt, data: n })),
      ...tasks.map<FeedItem>((task) => ({
        kind: "task",
        ts: task.createdAt,
        data: task,
      })),
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

  const grouped = useMemo(
    () => groupByDate(items, (i) => i.ts, localeFmt, dateGroupLabels),
    [items, localeFmt, dateGroupLabels],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <div className="shrink-0 border-b border-stroke-1 bg-bg-elevated px-3 py-1.5 flex items-center gap-1.5">
        <span className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mr-2">
          {t("crm.label.add")}
        </span>
        <button
          type="button"
          onClick={onOpenComposer}
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary text-[10.5px]"
        >
          <StickyNote size={11} /> {t("crm.quick.note")}
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 text-text-quaternary text-[10.5px] cursor-not-allowed"
          title={t("crm.twenty.createSoonTooltip")}
        >
          <CheckSquare size={11} /> {t("crm.quick.task")}
        </button>
        <button
          type="button"
          disabled
          className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 text-text-quaternary text-[10.5px] cursor-not-allowed"
          title={t("crm.calls.linkedTitle")}
        >
          <PhoneCall size={11} /> {t("crm.quick.call")}
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
  const { locale, t } = useLocale();
  if (item.kind === "note") {
    return (
      <li className="relative pl-7">
        <FeedDot icon={<StickyNote size={11} />} color="#a855f7" />
        <article className="rounded-md border border-stroke-1 bg-bg-elevated p-2.5">
          <header className="flex items-baseline justify-between gap-2 mb-1">
            <h5 className="text-[12px] font-semibold text-text-primary truncate">
              {item.data.title || t("crm.feed.noTitle")}
            </h5>
            <time className="text-[10px] text-text-quaternary shrink-0">
              {shortTime(item.data.createdAt, localeTag(locale))}
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
              {item.data.title || t("crm.feed.noTitle")}
            </h5>
            <time className="text-[10px] text-text-quaternary shrink-0">
              {shortTime(item.data.createdAt, localeTag(locale))}
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
                {new Date(item.data.dueAt).toLocaleDateString(localeTag(locale))}
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
            {item.data.name || t("crm.feed.noName")}
          </h5>
          <time className="text-[10px] text-text-quaternary shrink-0">
            {shortTime(item.data.updatedAt, localeTag(locale))}
          </time>
        </header>
        <div className="mt-1 flex items-center gap-2 text-[10.5px] text-text-tertiary">
          <StatusPill label={item.data.stage} tone={toneForState(item.data.stage)} />
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-text-primary">
            {formatCurrency(
              item.data.amount?.amountMicros,
              item.data.amount?.currencyCode,
              locale,
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
  highlightPersonId,
}: {
  people: PersonSummary[];
  accent: string;
  highlightPersonId?: string | null;
}) {
  const { t } = useLocale();
  if (people.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11.5px] text-text-tertiary px-6 text-center">
        {t("crm.empty.people")}
      </div>
    );
  }
  return (
    <ul className="flex-1 min-h-0 overflow-auto p-3 grid grid-cols-1 gap-2">
      {people.map((p) => {
        const hilite = !!highlightPersonId && p.id === highlightPersonId;
        return (
          <li key={p.id}>
            <article
              className={`flex items-start gap-2.5 rounded-md border p-2.5 hover:border-stroke-2 ${hilite ? "ring-2 ring-offset-2 ring-offset-bg-chrome ring-sky-500/60 border-sky-500/40" : "border-stroke-1 bg-bg-elevated"}`}
            >
            <Avatar
              name={`${p.firstName} ${p.lastName}`}
              email={p.email}
              size={32}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-text-primary truncate">
                {`${p.firstName} ${p.lastName}`.trim() || t("crm.company.unnamed")}
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
        );
      })}
    </ul>
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
  const { t } = useLocale();
  return (
    <div className="flex-1 min-h-0 overflow-auto px-3 py-3 space-y-5">
      <section>
        <SectionHeader>{t("crm.details.practiceSection")}</SectionHeader>
        <PropertyList
          rows={[
            {
              label: t("crm.filter.booking"),
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
              label: t("crm.filter.leadSourceFacet"),
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
              label: t("crm.field.specialization"),
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
              label: t("crm.field.languages"),
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
              label: t("crm.people.therapistsColumn"),
              value: company.employeeCountPhysio ?? "—",
            },
          ]}
        />
      </section>

      <section>
        <SectionHeader>{t("crm.details.addressSection")}</SectionHeader>
        <PropertyList
          rows={[
            {
              label: t("crm.field.street"),
              value: company.address?.addressStreet1 ?? "—",
            },
            {
              label: t("crm.field.zipCity"),
              value:
                [
                  company.address?.addressPostcode,
                  company.address?.addressCity,
                ]
                  .filter(Boolean)
                  .join(" ") || "—",
            },
            {
              label: t("crm.field.country"),
              value: company.address?.addressCountry ?? "—",
            },
          ]}
        />
      </section>

      <section>
        <SectionHeader>{t("crm.people.leadTherapistSection")}</SectionHeader>
        <PropertyList
          rows={[
            {
              label: t("crm.field.leadName"),
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
              label: t("crm.filter.emailField"),
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
  const { t } = useLocale();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);

  return (
    <div className="rounded-md border border-stroke-2 bg-bg-elevated p-2 space-y-1.5">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={t("crm.notes.titlePlaceholder")}
        className="w-full bg-transparent border border-stroke-1 rounded px-2 py-1 text-[12px] outline-none focus:border-stroke-2"
        autoFocus
      />
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("crm.notes.placeholder")}
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
            {t("common.cancel")}
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
          {t("common.save")}
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
  const { locale, t } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-CH";
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
            {t("crm.scraper.launcherHeading")}
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
          title={t("crm.modal.close")}
        >
          <X size={13} />
        </button>
      </div>

      <div className="px-3 pb-2.5 grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-text-quaternary">
            {t("crm.filter.cityFacet")}
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
            {t("crm.scraper.cantonOptionalLabel")}
          </span>
          <input
            type="text"
            value={canton}
            onChange={(e) => setCanton(e.target.value.toUpperCase())}
            disabled={isRunning}
            placeholder={t("crm.scraper.cantonPlaceholder")}
            className="bg-bg-base border border-stroke-1 rounded-md px-2 py-1 text-[12px] outline-none focus:border-stroke-2 disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wide text-text-quaternary">
            {t("crm.scraper.limitLabel")}
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
          {t("crm.scraper.dryRunCheckbox")}
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
              {t("crm.scraper.runningSince")}{" "}
              {status.started_at
                ? new Date(status.started_at).toLocaleTimeString(localeTag)
                : "–"}{" "}
              · {humanScraperParams(status.params)}
            </span>
          ) : status?.state === "done" ? (
            <span className="text-[11px] text-text-tertiary">
              {t("crm.scraper.lastRunOkPrefix")}
              {humanScraperParams(status.params)}
            </span>
          ) : status?.state === "error" ? (
            <span className="text-[11px] text-warning">
              {t("crm.scraper.lastRunExitPrefix")}
              {status.exit_code ?? "?"}
            </span>
          ) : (
            <span className="text-[11px] text-text-quaternary">
              {t("crm.scraper.triggerIntro")}
            </span>
          )}
        </div>
        <a
          href="/admin/onboarding/scraper"
          className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
          title={t("crm.scraper.fullPanelTitle")}
        >
          <ExternalLink size={11} /> {t("crm.scraper.advancedShort")}
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
              <Loader2 size={11} className="spin" /> {t("crm.scraper.running")}
            </>
          ) : submitting ? (
            <>
              <Loader2 size={11} className="spin" />{" "}
              {t("crm.scraper.startingButton")}
            </>
          ) : (
            <>
              <Sparkles size={11} /> {t("crm.scraper.triggerRun")}
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
  const { t } = useLocale();
  if (reachable === false) {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-warning/30 bg-warning/5 text-warning">
        <AlertCircle size={9} /> {t("crm.scraper.offlineBadge")}
      </span>
    );
  }
  switch (state) {
    case "running":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-info/30 bg-info/5 text-info">
          <Loader2 size={9} className="spin" /> {t("crm.scraper.runningShort")}
        </span>
      );
    case "done":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-success/30 bg-success/5 text-success">
          <CheckCircle2 size={9} /> {t("crm.scraper.okBadge")}
        </span>
      );
    case "error":
      return (
        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md border border-warning/30 bg-warning/5 text-warning">
          <AlertCircle size={9} /> {t("crm.scraper.errorBadge")}
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
