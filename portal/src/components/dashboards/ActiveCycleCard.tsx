"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Activity, ArrowUpRight, Loader2, Flag } from "lucide-react";

/**
 * Active-cycle snapshot for the Daily Home.
 *
 * Shows every project that has a currently-running cycle (Plane-speak
 * for sprint), with a tiny progress bar + days-remaining chip.  The
 * card is sorted by urgency (ending soonest first) so a sprint that's
 * ending tomorrow with 40% completion sticks out.
 *
 * Hides itself silently when:
 *   • Plane isn't reachable for the workspace (403 / 503)
 *   • There's literally no project with an active cycle
 *
 * That keeps the dashboard tidy for workspaces that don't run sprints.
 */

type ActiveCycle = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  projectIdentifier: string;
  startDate: string | null;
  endDate: string | null;
  totalIssues: number | null;
  completedIssues: number | null;
  progress: number;
  daysRemaining: number | null;
  href: string;
};

export function ActiveCycleCard({
  workspaceId,
  accent,
}: {
  workspaceId: string;
  accent: string;
}) {
  const [cycles, setCycles] = useState<ActiveCycle[] | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/projects/active-cycles?ws=${encodeURIComponent(workspaceId)}`,
          { cache: "no-store" },
        );
        if (!alive) return;
        if (r.status === 403 || r.status === 503) {
          setHidden(true);
          return;
        }
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          setError(j.error ?? r.statusText);
          return;
        }
        const j = (await r.json()) as { cycles?: ActiveCycle[] };
        const list = j.cycles ?? [];
        if (list.length === 0) {
          setHidden(true);
          return;
        }
        setCycles(list);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [workspaceId]);

  if (hidden) return null;

  return (
    <section className="rounded-xl border border-stroke-1 bg-bg-elevated px-4 py-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-8 h-8 rounded-lg flex items-center justify-center"
          style={{ background: `${accent}18`, color: accent }}
        >
          <Activity size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-text-primary font-semibold text-sm">
            Aktive Cycles
          </h2>
          <p className="text-text-tertiary text-[11px]">
            {busy
              ? "Lade Sprint-Snapshot …"
              : cycles
                ? `${cycles.length} laufende${cycles.length === 1 ? "r" : ""} Sprint${cycles.length === 1 ? "" : "s"}`
                : ""}
          </p>
        </div>
        <Link
          href={`/${workspaceId}/projects`}
          className="text-[11.5px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-0.5"
        >
          Alle <ArrowUpRight size={11} />
        </Link>
      </div>
      {busy ? (
        <div className="flex items-center gap-2 text-text-tertiary text-[12px]">
          <Loader2 size={12} className="animate-spin" />
          Lade …
        </div>
      ) : error ? (
        <p className="text-[12px] text-amber-300">{error}</p>
      ) : !cycles || cycles.length === 0 ? null : (
        <ul className="flex flex-col gap-2.5">
          {cycles.slice(0, 4).map((c) => {
            const pct = Math.round(c.progress * 100);
            const overdue = c.daysRemaining !== null && c.daysRemaining < 0;
            const ending = c.daysRemaining !== null && c.daysRemaining <= 3;
            return (
              <li key={c.id} className="flex flex-col gap-1">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="font-medium tabular-nums text-text-tertiary">
                    {c.projectIdentifier}
                  </span>
                  <a
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 truncate text-text-primary hover:text-info"
                    title={`${c.name} (${c.projectName})`}
                  >
                    {c.name}
                  </a>
                  <span
                    className={`text-[10.5px] tabular-nums ${
                      overdue
                        ? "text-red-400"
                        : ending
                          ? "text-amber-400"
                          : "text-text-tertiary"
                    }`}
                  >
                    {c.daysRemaining === null
                      ? "—"
                      : overdue
                        ? `${Math.abs(c.daysRemaining)}d über`
                        : c.daysRemaining === 0
                          ? "endet heute"
                          : `${c.daysRemaining}d übrig`}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded bg-bg-overlay relative overflow-hidden">
                    <div
                      className="absolute left-0 top-0 bottom-0 rounded transition-all"
                      style={{
                        width: `${Math.max(2, pct)}%`,
                        background: overdue
                          ? "var(--color-red-500, #ef4444)"
                          : ending
                            ? "#f59e0b"
                            : accent,
                      }}
                      aria-hidden
                    />
                  </div>
                  <span className="text-[10.5px] tabular-nums text-text-tertiary w-[68px] text-right">
                    {c.completedIssues ?? 0} / {c.totalIssues ?? 0}{" "}
                    <span className="opacity-60">({pct}%)</span>
                  </span>
                </div>
                {overdue && (
                  <p className="text-[10.5px] text-red-400 inline-flex items-center gap-1">
                    <Flag size={9} /> Sprint sollte abgeschlossen sein
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
