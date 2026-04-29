"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { TrendingUp } from "lucide-react";
import { StatusPill, toneForState } from "@/components/ui/Pills";
import type { WorkspaceId } from "@/lib/workspaces";
import type { OpportunitySummary } from "@/lib/crm/types";
import { DEFAULT_OPPORTUNITY_KANBAN_STAGES } from "@/lib/crm/opportunity-stages";

export { DEFAULT_OPPORTUNITY_KANBAN_STAGES };

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

export function OpportunityKanban({
  deals,
  accent,
  workspaceId,
  onMoved,
  showCompanyLinks = false,
  highlightDealId = null,
}: {
  deals: OpportunitySummary[];
  accent: string;
  workspaceId: WorkspaceId;
  onMoved: (id: string, stage: string) => void;
  /** When true, show a link to CRM for the deal’s company (workspace pipeline). */
  showCompanyLinks?: boolean;
  /** Scrolls this card into view and outlines it (Cmd+K / `?deal=` deep-links). */
  highlightDealId?: string | null;
}) {
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!highlightDealId || deals.length === 0) return;
    const root = boardScrollRef.current;
    if (!root) return;
    const el = root.querySelector(`[data-deal-id="${highlightDealId}"]`);
    if (!el || !(el instanceof HTMLElement)) return;
    el.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }, [highlightDealId, deals]);

  if (deals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-[11.5px] text-text-tertiary px-6 text-center">
        Keine Deals.
      </div>
    );
  }

  const stageMap = new Map<string, { id: string; label: string }>();
  DEFAULT_OPPORTUNITY_KANBAN_STAGES.forEach((s) => stageMap.set(s.id, s));
  for (const d of deals) {
    const key = d.stage || "(unset)";
    if (!stageMap.has(key)) {
      stageMap.set(key, {
        id: key,
        label: key === "(unset)" ? "Ohne Stage" : key,
      });
    }
  }
  const columns = [...stageMap.values()];

  const byStage = new Map<string, OpportunitySummary[]>();
  for (const d of deals) {
    const key = d.stage || "(unset)";
    const list = byStage.get(key) ?? [];
    list.push(d);
    byStage.set(key, list);
  }

  const moveDeal = async (dealId: string, toStage: string) => {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal) return;
    const fromStage = deal.stage || "(unset)";
    if (fromStage === toStage) return;
    if (toStage === "(unset)") {
      setError(
        "In »Ohne Stage« kann nichts gezogen werden — wähle eine echte Stage.",
      );
      return;
    }
    setError(null);
    onMoved(dealId, toStage);
    try {
      const r = await fetch(
        `/api/crm/opportunities/${dealId}?ws=${workspaceId}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ stage: toStage }),
        },
      );
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
    } catch (e) {
      onMoved(dealId, fromStage);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {error && (
        <div className="mx-3 mt-2 rounded-md border border-red-500/30 bg-red-500/10 text-red-300 text-[11px] p-2">
          {error}
        </div>
      )}
      <div ref={boardScrollRef} className="flex-1 min-h-0 overflow-auto p-3">
        <div className="flex gap-3 min-w-max">
          {columns.map((col) => {
            const list = byStage.get(col.id) ?? [];
            const total = list.reduce(
              (sum, d) => sum + (d.amount?.amountMicros ?? 0),
              0,
            );
            const isHover = dropTarget === col.id;
            return (
              <section
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dropTarget !== col.id) setDropTarget(col.id);
                }}
                onDragLeave={(e) => {
                  if (
                    e.currentTarget.contains(e.relatedTarget as Node) === false
                  ) {
                    setDropTarget((cur) => (cur === col.id ? null : cur));
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const id = e.dataTransfer.getData("text/plain");
                  setDropTarget(null);
                  setDraggingId(null);
                  if (id) void moveDeal(id, col.id);
                }}
                className={`w-[240px] shrink-0 rounded-md border ${
                  isHover
                    ? "border-current bg-bg-elevated"
                    : "border-stroke-1 bg-bg-base"
                } flex flex-col`}
                style={isHover ? { color: accent } : undefined}
              >
                <header className="flex items-center gap-2 px-2.5 py-2 border-b border-stroke-1 sticky top-0 bg-inherit">
                  <StatusPill label={col.label} tone={toneForState(col.id)} />
                  <span className="text-[10.5px] text-text-tertiary">
                    {list.length}
                  </span>
                  {total > 0 && (
                    <span className="ml-auto text-[10.5px] font-semibold text-text-primary">
                      {formatCurrency(total, list[0]?.amount?.currencyCode)}
                    </span>
                  )}
                </header>
                <ul className="flex-1 min-h-[60px] p-1.5 space-y-1.5">
                  {list.map((d) => {
                    const isDrag = draggingId === d.id;
                    return (
                      <li key={d.id}>
                        <article
                          data-deal-id={d.id}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", d.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDraggingId(d.id);
                          }}
                          onDragEnd={() => {
                            setDraggingId(null);
                            setDropTarget(null);
                          }}
                          className={`group rounded-md border bg-bg-elevated px-2.5 py-2 cursor-grab active:cursor-grabbing transition-opacity ${
                            highlightDealId === d.id
                              ? "border-current z-[1]"
                              : "border-stroke-1"
                          } ${isDrag ? "opacity-40" : "opacity-100"}`}
                          style={
                            highlightDealId === d.id
                              ? {
                                  borderColor: accent,
                                  boxShadow: `0 0 0 2px ${accent}55`,
                                }
                              : undefined
                          }
                          title="Ziehen, um die Stage zu ändern."
                        >
                          <div className="flex items-start gap-2">
                            <TrendingUp
                              size={12}
                              className="text-text-tertiary shrink-0 mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-[12px] font-medium text-text-primary leading-snug break-words">
                                {d.name || "(ohne Name)"}
                              </p>
                              {d.companyName && (
                                <p className="text-[10.5px] text-text-tertiary truncate">
                                  {d.companyName}
                                </p>
                              )}
                              {showCompanyLinks && d.companyId && (
                                <p className="mt-0.5">
                                  <Link
                                    href={`/${workspaceId}/crm?company=${encodeURIComponent(d.companyId)}&deal=${encodeURIComponent(d.id)}`}
                                    className="text-[10px] text-info hover:underline"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Im CRM öffnen
                                  </Link>
                                </p>
                              )}
                              <div className="flex items-center justify-between mt-1 text-[10.5px]">
                                <span className="text-text-tertiary">
                                  {d.closeDate
                                    ? new Date(d.closeDate).toLocaleDateString(
                                        "de-DE",
                                      )
                                    : "—"}
                                </span>
                                <span className="font-semibold text-text-primary">
                                  {formatCurrency(
                                    d.amount?.amountMicros,
                                    d.amount?.currencyCode,
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </article>
                      </li>
                    );
                  })}
                  {list.length === 0 && (
                    <li className="text-[10.5px] text-text-quaternary text-center py-4">
                      hier reinziehen
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
