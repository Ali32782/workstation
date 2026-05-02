"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Columns3,
  RefreshCw,
  Loader2,
  Search,
} from "lucide-react";
import type { WorkspaceId } from "@/lib/workspaces";
import type { OpportunitySummary } from "@/lib/crm/types";
import { OpportunityKanban } from "./opportunity-kanban";
import { useT } from "@/components/LocaleProvider";

const CRM_DEAL_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function CrmPipelineClient({
  workspaceId,
  workspaceName,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
}) {
  const t = useT();
  const searchParams = useSearchParams();
  const [deals, setDeals] = useState<OpportunitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [highlightDealId, setHighlightDealId] = useState<string | null>(null);

  useEffect(() => {
    const raw = searchParams.get("deal")?.trim() ?? "";
    if (!raw || !CRM_DEAL_UUID_RE.test(raw)) return;
    setHighlightDealId(raw);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("deal");
    const qs = url.searchParams.toString();
    window.history.replaceState(
      {},
      "",
      url.pathname + (qs ? "?" + qs : ""),
    );
  }, [searchParams]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const u = new URL("/api/crm/opportunities", window.location.origin);
      u.searchParams.set("ws", workspaceId);
      u.searchParams.set("first", "500");
      if (q.trim()) u.searchParams.set("q", q.trim());
      const r = await fetch(u.toString(), { cache: "no-store" });
      const j = (await r.json()) as { items?: OpportunitySummary[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setDeals(j.items ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDeals([]);
    } finally {
      setLoading(false);
    }
  }, [workspaceId, q]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), q.trim() ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  return (
    <div className="flex h-full min-h-0 flex-col bg-bg-base text-text-primary text-[13px]">
      <header
        className="shrink-0 px-4 py-3 border-b border-stroke-1 bg-bg-chrome flex flex-wrap items-center gap-3"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <Link
          href={`/${workspaceId}/crm`}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title={t("crm.nav.backToCrm")}
        >
          <ArrowLeft size={15} />
        </Link>
        <div
          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${accent}18` }}
        >
          <Columns3 size={18} style={{ color: accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-sm font-semibold leading-tight">
            {t("crm.pipeline.title")}
          </h1>
          <p className="text-[10.5px] text-text-tertiary">
            {t("crm.pipeline.subtitle").replace("{workspace}", workspaceName)}
          </p>
        </div>
        <div className="relative w-full sm:w-56">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
          />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("crm.pipeline.searchPlaceholder")}
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1.5 text-[11.5px] outline-none focus:border-stroke-2"
          />
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-50"
          title={t("projects.reloadTooltip")}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </header>

      {error && (
        <div className="shrink-0 mx-4 mt-3 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-[12px] p-2.5">
          {error}
        </div>
      )}

      <div className="flex-1 min-h-0 flex flex-col">
        {loading && deals.length === 0 ? (
          <div className="flex-1 flex items-center justify-center gap-2 text-text-tertiary text-[13px]">
            <Loader2 className="w-5 h-5 animate-spin" style={{ color: accent }} />
            {t("crm.pipeline.loading")}
          </div>
        ) : (
          <OpportunityKanban
            deals={deals}
            accent={accent}
            workspaceId={workspaceId}
            showCompanyLinks
            highlightDealId={highlightDealId}
            onMoved={(id, stage) => {
              setDeals((prev) =>
                prev.map((o) => (o.id === id ? { ...o, stage } : o)),
              );
            }}
          />
        )}
      </div>
    </div>
  );
}
