"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Kanban,
  ArrowUpRight,
  Loader2,
  AlertTriangle,
  Calendar,
} from "lucide-react";

/**
 * "Was steht heute an?" Plane snapshot for the Daily Home.
 *
 * Shows the user's open Plane issues across all projects in this
 * workspace, sorted by overdue → due-today → priority. We surface
 * the top 5; for the long tail there's a deep-link into Plane.
 *
 * Renders a skeleton while fetching (Plane projects+issues fan-out
 * can take 1-2 s on cold caches), and gracefully hides when the user
 * isn't a Plane member or Projects isn't configured for the
 * workspace.
 */

type MyIssue = {
  id: string;
  sequenceId: number;
  name: string;
  priority: "urgent" | "high" | "medium" | "low" | "none";
  projectId: string;
  projectIdentifier: string;
  projectName: string;
  stateName: string;
  stateGroup: string;
  targetDate: string | null;
  dueToday: boolean;
  overdue: boolean;
};

type Counts = { total: number; dueToday: number; overdue: number };

const PRIO_DOT: Record<MyIssue["priority"], string> = {
  urgent: "bg-red-500",
  high: "bg-orange-400",
  medium: "bg-amber-400",
  low: "bg-sky-400",
  none: "bg-zinc-500",
};

export function MyIssuesTodayCard({
  workspaceId,
  accent,
}: {
  workspaceId: string;
  accent: string;
}) {
  const [issues, setIssues] = useState<MyIssue[] | null>(null);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/projects/my-issues?ws=${encodeURIComponent(workspaceId)}`,
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
        const j = (await r.json()) as {
          issues?: MyIssue[];
          counts?: Counts;
          reason?: string;
        };
        if (j.reason === "no_plane_member") {
          // User isn't a Plane workspace member — quietly hide rather
          // than show a confusing "0 issues" card.
          setHidden(true);
          return;
        }
        setIssues(j.issues ?? []);
        setCounts(j.counts ?? { total: 0, dueToday: 0, overdue: 0 });
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
          <Kanban size={15} />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-text-primary font-semibold text-sm">
            Meine Issues heute
          </h2>
          <p className="text-text-tertiary text-[11px]">
            {busy
              ? "Lade Plane-Snapshot …"
              : counts
                ? counts.overdue > 0
                  ? `${counts.overdue} überfällig · ${counts.dueToday - counts.overdue} fällig heute`
                  : counts.dueToday > 0
                    ? `${counts.dueToday} fällig heute`
                    : counts.total > 0
                      ? `${counts.total} offen — nichts mit Frist heute`
                      : "Inbox-Zero. Cool."
                : ""}
          </p>
        </div>
        <Link
          href={`/${workspaceId}/projects`}
          className="text-[11.5px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-0.5"
        >
          Plane <ArrowUpRight size={11} />
        </Link>
      </div>
      {busy ? (
        <div className="flex items-center gap-2 text-text-tertiary text-[12px]">
          <Loader2 size={12} className="spin" />
          Lade …
        </div>
      ) : error ? (
        <p className="text-[12px] text-amber-300">{error}</p>
      ) : !issues || issues.length === 0 ? (
        <p className="text-[12px] text-text-tertiary leading-relaxed">
          Keine offenen Issues, die dir zugewiesen sind. Wenn das überrascht,
          sind sie evtl. einer Gruppe zugewiesen statt dir direkt.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-stroke-1">
          {issues.slice(0, 5).map((it) => (
            <li
              key={it.id}
              className="py-2 flex items-start gap-2.5 first:pt-0 last:pb-0"
            >
              <span
                className={`mt-1 shrink-0 w-1.5 h-1.5 rounded-full ${PRIO_DOT[it.priority]}`}
                aria-hidden
                title={`Priorität: ${it.priority}`}
              />
              <div className="flex-1 min-w-0">
                <Link
                  href={`/${workspaceId}/projects?project=${encodeURIComponent(it.projectId)}&issue=${encodeURIComponent(it.id)}`}
                  className="text-[12.5px] text-text-primary hover:text-[#5b5fc7] truncate block leading-tight"
                  title={it.name}
                >
                  {it.name}
                </Link>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-text-tertiary truncate">
                  <span className="font-medium tabular-nums">
                    {it.projectIdentifier}-{it.sequenceId}
                  </span>
                  <span className="opacity-60">·</span>
                  <span className="truncate">{it.stateName}</span>
                  {it.targetDate && (
                    <>
                      <span className="opacity-60">·</span>
                      <span
                        className={`inline-flex items-center gap-0.5 ${
                          it.overdue
                            ? "text-red-300"
                            : it.dueToday
                              ? "text-amber-300"
                              : ""
                        }`}
                      >
                        {it.overdue ? (
                          <AlertTriangle size={10} />
                        ) : (
                          <Calendar size={10} />
                        )}
                        {formatDue(it.targetDate)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
      {issues && issues.length > 5 && (
        <Link
          href={`/${workspaceId}/projects`}
          className="mt-2 inline-flex items-center gap-1 text-[11.5px] text-text-secondary hover:text-text-primary"
        >
          + {issues.length - 5} weitere
          <ArrowUpRight size={11} />
        </Link>
      )}
    </section>
  );
}

function formatDue(iso: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(iso + "T00:00:00");
  const days = Math.round((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (days === 0) return "heute";
  if (days === -1) return "gestern";
  if (days === 1) return "morgen";
  if (days < 0) return `vor ${-days} d`;
  if (days <= 7) return `in ${days} d`;
  return d.toLocaleDateString("de-DE", { day: "numeric", month: "short" });
}
