"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowRight,
  Inbox,
  Play,
  CheckCheck,
  MoreHorizontal,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type {
  CycleSummary,
  IssueLabel,
  IssueState,
  IssueSummary,
  WorkspaceMember,
} from "@/lib/projects/types";
import {
  CompactStatusPill,
  IssueTypeIcon,
  PRIORITY_ORDER,
  PriorityBadge,
  StoryPointsPill,
  deriveIssueType,
} from "./shared";
import { useLocale } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

/**
 * Jira-style backlog. Each open/upcoming sprint is a section at the top
 * with story-point counters by status (To Do / In Progress / Done) and a
 * "Sprint starten"-button when the cycle is upcoming and has items. The
 * Backlog section at the bottom holds everything not yet in a sprint or
 * still attached to a completed sprint.
 */
export function JiraBacklog({
  issues,
  cycles,
  states,
  members,
  labels,
  identifier,
  selectedIssueId,
  onSelectIssue,
  onAddIssuesToCycle,
  onCreateIssue,
  onUpdateCycle,
  accent,
}: {
  issues: IssueSummary[];
  cycles: CycleSummary[];
  states: IssueState[];
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  identifier: string;
  selectedIssueId: string | null;
  onSelectIssue: (id: string) => void;
  onAddIssuesToCycle: (cycleId: string, issueIds: string[]) => Promise<void> | void;
  onCreateIssue: (name: string) => Promise<void> | void;
  onUpdateCycle?: (
    cycleId: string,
    input: { startDate?: string | null; endDate?: string | null },
  ) => Promise<void> | void;
  accent: string;
}) {
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const stateById = useMemo(() => {
    const m = new Map<string, IssueState>();
    for (const s of states) m.set(s.id, s);
    return m;
  }, [states]);

  const cycleById = useMemo(() => {
    const m = new Map<string, CycleSummary>();
    for (const c of cycles) m.set(c.id, c);
    return m;
  }, [cycles]);

  const sections = useMemo(() => {
    const activeCycles = cycles.filter(
      (c) => c.status === "current" || c.status === "upcoming",
    );
    const sortedCycles = [...activeCycles].sort((a, b) => {
      if (a.status !== b.status) return a.status === "current" ? -1 : 1;
      const ad = a.startDate ? new Date(a.startDate).getTime() : Infinity;
      const bd = b.startDate ? new Date(b.startDate).getTime() : Infinity;
      return ad - bd;
    });

    const cycleSections = sortedCycles.map((c) => ({
      id: c.id,
      kind: "cycle" as const,
      title: c.name,
      cycle: c,
      issues: issues
        .filter((i) => i.cycle === c.id)
        .sort(byPriorityThenUpdated),
    }));

    const backlogIssues = issues
      .filter((i) => {
        if (!i.cycle) return true;
        const c = cycleById.get(i.cycle);
        return !c || c.status === "completed";
      })
      .sort(byPriorityThenUpdated);

    return [
      ...cycleSections,
      {
        id: "__backlog__",
        kind: "backlog" as const,
        title: t("projects.stateGroup.backlog"),
        cycle: null,
        issues: backlogIssues,
      },
    ];
  }, [cycles, issues, cycleById, t]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Record<string, true>>({});
  const [moveTarget, setMoveTarget] = useState<string>("");
  const [composer, setComposer] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");

  const selectedIds = useMemo(() => Object.keys(selected), [selected]);

  const targetCycles = useMemo(
    () =>
      cycles.filter(
        (c) => c.status === "current" || c.status === "upcoming",
      ),
    [cycles],
  );

  const toggleSelect = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelected((cur) => {
      const next = { ...cur };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const clearSelection = () => setSelected({});

  const moveSelected = async () => {
    if (!moveTarget || selectedIds.length === 0) return;
    await onAddIssuesToCycle(moveTarget, selectedIds);
    clearSelection();
    setMoveTarget("");
  };

  const submitComposer = async () => {
    const name = composerText.trim();
    if (!name) {
      setComposer(null);
      return;
    }
    await onCreateIssue(name);
    setComposerText("");
    setComposer(null);
  };

  const startSprint = async (c: CycleSummary) => {
    if (!onUpdateCycle) return;
    if (
      !window.confirm(
        t("projects.backlog.startSprintConfirm").replace("{name}", c.name),
      )
    ) {
      return;
    }
    await onUpdateCycle(c.id, { startDate: today() });
  };

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      {selectedIds.length > 0 && (
        <div className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 bg-bg-chrome/95 backdrop-blur border-b border-stroke-1">
          <span className="text-[11.5px] font-medium text-text-secondary">
            {t("projects.backlog.selectedCount").replace(
              "{count}",
              String(selectedIds.length),
            )}
          </span>
          <select
            value={moveTarget}
            onChange={(e) => setMoveTarget(e.target.value)}
            className="ml-2 bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[11.5px]"
          >
            <option value="">{t("projects.backlog.moveToSprint")}</option>
            {targetCycles.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{" "}
                {c.status === "current"
                  ? t("projects.issueDrawer.sprintActiveBadge")
                  : t("projects.issueDrawer.sprintPlannedBadge")}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void moveSelected()}
            disabled={!moveTarget}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11.5px] disabled:opacity-50"
            style={{ background: accent }}
          >
            <ArrowRight size={12} />
            {t("projects.backlog.move")}
          </button>
          <button
            type="button"
            onClick={clearSelection}
            className="ml-auto text-[11px] text-text-tertiary hover:text-text-primary"
          >
            {t("projects.backlog.clearSelection")}
          </button>
        </div>
      )}

      <div className="p-3 space-y-3">
        {sections.map((s) => {
          const isCollapsed = !!collapsed[s.id];
          const counts = countByStatus(s.issues, stateById);
          const totalEstimate = s.issues.reduce(
            (sum, i) => sum + (i.estimatePoint ?? 0),
            0,
          );
          const canStart =
            s.kind === "cycle" &&
            s.cycle?.status === "upcoming" &&
            s.issues.length > 0 &&
            onUpdateCycle;
          return (
            <section
              key={s.id}
              className="rounded-lg border border-stroke-1 bg-bg-chrome overflow-hidden"
            >
              <header
                className="flex items-center gap-2 px-3 py-2 border-b border-stroke-1 cursor-pointer hover:bg-bg-overlay/50"
                onClick={() =>
                  setCollapsed((c) => ({ ...c, [s.id]: !c[s.id] }))
                }
              >
                {isCollapsed ? (
                  <ChevronRight size={13} className="text-text-tertiary" />
                ) : (
                  <ChevronDown size={13} className="text-text-tertiary" />
                )}
                {s.kind === "cycle" ? (
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-full"
                    style={{
                      background:
                        s.cycle?.status === "current" ? "#10b981" : "#3b82f6",
                    }}
                  />
                ) : (
                  <Inbox size={13} className="text-text-tertiary" />
                )}
                <h3 className="text-[12.5px] font-semibold text-text-primary">
                  {s.title}
                </h3>
                {s.kind === "cycle" && s.cycle?.status === "current" && (
                  <span className="px-1.5 py-[1px] rounded-sm bg-emerald-500/20 text-emerald-400 text-[9.5px] font-bold uppercase">
                    {t("projects.backlog.badgeActive")}
                  </span>
                )}
                {s.kind === "cycle" && s.cycle?.status === "upcoming" && (
                  <span className="px-1.5 py-[1px] rounded-sm bg-sky-500/20 text-sky-400 text-[9.5px] font-bold uppercase">
                    {t("projects.backlog.badgePlanned")}
                  </span>
                )}
                {s.kind === "cycle" && s.cycle?.startDate && s.cycle?.endDate && (
                  <span className="text-[10.5px] text-text-tertiary">
                    {fmtRange(s.cycle.startDate, s.cycle.endDate, localeFmt)}
                  </span>
                )}

                <div className="ml-auto flex items-center gap-3 text-[11px] tabular-nums">
                  <CountPill
                    label={t("projects.stateGroup.unstarted")}
                    count={counts.todo}
                    color="#6b7280"
                  />
                  <CountPill
                    label={t("projects.stateGroup.started")}
                    count={counts.inProgress}
                    color="#3b82f6"
                  />
                  <CountPill
                    label={t("projects.stateGroup.completed")}
                    count={counts.done}
                    color="#16a34a"
                  />
                  {totalEstimate > 0 && (
                    <span className="ml-1">
                      <StoryPointsPill points={totalEstimate} />
                    </span>
                  )}
                  {canStart && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        void startSprint(s.cycle!);
                      }}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11px] font-semibold"
                      style={{ background: "#16a34a" }}
                      title={t("projects.backlog.startSprintTooltip")}
                    >
                      <Play size={11} />
                      {t("projects.backlog.startSprint")}
                    </button>
                  )}
                  {s.kind === "cycle" &&
                    s.cycle?.status === "current" &&
                    onUpdateCycle && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            window.confirm(
                              t("projects.backlog.completeSprintConfirm").replace(
                                "{name}",
                                s.cycle!.name,
                              ),
                            )
                          ) {
                            void onUpdateCycle(s.cycle!.id, {
                              endDate: today(),
                            });
                          }
                        }}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-secondary hover:text-text-primary text-[11px]"
                        title={t("projects.backlog.completeSprintTooltip")}
                      >
                        <CheckCheck size={11} />
                        {t("projects.backlog.complete")}
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setComposer(s.id);
                      setComposerText("");
                    }}
                    className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                    title={t("projects.backlog.newIssueTooltip")}
                  >
                    <Plus size={12} />
                  </button>
                </div>
              </header>

              {!isCollapsed && (
                <div className="divide-y divide-stroke-1/60">
                  {s.issues.length === 0 && composer !== s.id && (
                    <p className="text-center text-[11.5px] text-text-quaternary py-6">
                      {s.kind === "backlog"
                        ? t("projects.backlog.emptyBacklog")
                        : t("projects.backlog.emptySprint")}
                    </p>
                  )}
                  {s.issues.map((i) => (
                    <BacklogRow
                      key={i.id}
                      issue={i}
                      identifier={identifier}
                      state={stateById.get(i.state)}
                      members={members}
                      labels={labels}
                      selected={!!selected[i.id]}
                      isOpen={selectedIssueId === i.id}
                      onToggleSelect={(e) => toggleSelect(i.id, e)}
                      onClick={() => onSelectIssue(i.id)}
                    />
                  ))}
                  {composer === s.id && (
                    <div className="flex items-center gap-2 px-3 py-2 bg-bg-elevated">
                      <input
                        autoFocus
                        type="text"
                        value={composerText}
                        onChange={(e) => setComposerText(e.target.value)}
                        placeholder={t("projects.issueRow.placeholder")}
                        className="flex-1 bg-transparent border border-stroke-1 rounded-md px-2 py-1 text-[12px] outline-none focus:border-stroke-2"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void submitComposer();
                          else if (e.key === "Escape") {
                            setComposer(null);
                            setComposerText("");
                          }
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => void submitComposer()}
                        className="px-2 py-1 text-[11px] rounded-md text-white"
                        style={{ background: accent }}
                      >
                        {t("projects.issueDrawer.createButton")}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function CountPill({
  label,
  count,
  color,
}: {
  label: string;
  count: number;
  color: string;
}) {
  return (
    <span
      className="inline-flex items-center justify-center min-w-[22px] h-[20px] px-1.5 rounded-full text-[10.5px] font-semibold tabular-nums"
      style={{ background: color + "1f", color }}
      title={label}
    >
      {count}
    </span>
  );
}

function countByStatus(
  issues: IssueSummary[],
  stateById: Map<string, IssueState>,
): { todo: number; inProgress: number; done: number } {
  let todo = 0;
  let inProgress = 0;
  let done = 0;
  for (const i of issues) {
    const s = stateById.get(i.state);
    if (!s) continue;
    if (s.group === "completed" || s.group === "cancelled") done += 1;
    else if (s.group === "started") inProgress += 1;
    else todo += 1;
  }
  return { todo, inProgress, done };
}

function byPriorityThenUpdated(a: IssueSummary, b: IssueSummary): number {
  const pa = PRIORITY_ORDER.indexOf(a.priority);
  const pb = PRIORITY_ORDER.indexOf(b.priority);
  if (pa !== pb) return pa - pb;
  return b.updatedAt.localeCompare(a.updatedAt);
}

function fmtRange(start: string, end: string, localeFmt: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const o: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${s.toLocaleDateString(localeFmt, o)} – ${e.toLocaleDateString(
    localeFmt,
    o,
  )}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function BacklogRow({
  issue,
  identifier,
  state,
  members,
  labels,
  selected,
  isOpen,
  onClick,
  onToggleSelect,
}: {
  issue: IssueSummary;
  identifier: string;
  state?: IssueState;
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  selected: boolean;
  isOpen: boolean;
  onClick: () => void;
  onToggleSelect: (e: React.MouseEvent) => void;
}) {
  const issueType = useMemo(() => deriveIssueType(issue, labels), [issue, labels]);
  const assigned = issue.assignees
    .map((id) => members.get(id))
    .filter((m): m is WorkspaceMember => Boolean(m));

  return (
    <div
      className={`flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-bg-overlay/40 ${
        isOpen ? "bg-bg-overlay/60" : ""
      }`}
      onClick={onClick}
    >
      <input
        type="checkbox"
        checked={selected}
        onChange={() => {}}
        onClick={(e) => onToggleSelect(e)}
        className="accent-sky-500"
      />
      <IssueTypeIcon type={issueType} size={14} />
      <span className="font-mono text-[10.5px] text-text-tertiary shrink-0 min-w-[64px]">
        {identifier}-{issue.sequenceId}
      </span>
      <span className="flex-1 text-[12.5px] text-text-primary truncate">
        {issue.name}
      </span>
      {state && <CompactStatusPill state={state} />}
      <PriorityBadge priority={issue.priority} />
      <StoryPointsPill points={issue.estimatePoint} />
      {assigned.length > 0 ? (
        <span className="inline-flex items-center -space-x-1">
          {assigned.slice(0, 2).map((m) => (
            <span
              key={m.id}
              className="ring-2 ring-bg-chrome rounded-full"
              title={m.displayName}
            >
              <Avatar name={m.displayName} email={m.email} size={18} />
            </span>
          ))}
          {assigned.length > 2 && (
            <span className="text-[10px] text-text-tertiary ml-1">
              +{assigned.length - 2}
            </span>
          )}
        </span>
      ) : (
        <span className="inline-block w-[18px] h-[18px] rounded-full border border-dashed border-stroke-2" />
      )}
      <button
        type="button"
        onClick={(e) => e.stopPropagation()}
        className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary"
      >
        <MoreHorizontal size={12} />
      </button>
    </div>
  );
}
