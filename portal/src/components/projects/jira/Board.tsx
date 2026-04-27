"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  CheckCheck,
  ChevronDown,
  Plus,
  User as UserIcon,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type {
  CycleSummary,
  IssueLabel,
  IssuePriority,
  IssueState,
  IssueSummary,
  WorkspaceMember,
} from "@/lib/projects/types";
import {
  IssueCard,
  ISSUE_TYPE_META,
  ISSUE_TYPE_ORDER,
  IssueType,
  PRIORITY_COLOR,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  STATE_GROUP_COLOR,
  STATE_GROUP_LABEL,
  STATE_GROUP_ORDER,
  StoryPointsPill,
  deriveIssueType,
} from "./shared";

/* ----------------------------------------------------------------- */
/*                          Types                                      */
/* ----------------------------------------------------------------- */

type GroupBy =
  | "status"
  | "assignee"
  | "priority"
  | "type"
  | "epic";

const GROUP_BY_LABEL: Record<GroupBy, string> = {
  status: "Status",
  assignee: "Bearbeiter",
  priority: "Priorität",
  type: "Issue-Typ",
  epic: "Epic / Modul",
};

/* ----------------------------------------------------------------- */
/*                          Component                                  */
/* ----------------------------------------------------------------- */

/**
 * Jira-faithful Kanban board. Supports group-by Status / Assignee /
 * Priority / Type / Epic, an active-sprint context bar at the top, and a
 * quick-filter avatar strip for narrowing the board to a single user.
 */
export function JiraBoard({
  issues,
  states,
  members,
  labels,
  identifier,
  cycles,
  selectedIssueId,
  onSelectIssue,
  onMoveIssue,
  onCreateIssue,
  accent,
  quickFilterAssignees,
  onQuickFilterToggle,
}: {
  issues: IssueSummary[];
  states: IssueState[];
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  identifier: string;
  cycles: CycleSummary[];
  selectedIssueId: string | null;
  onSelectIssue: (id: string) => void;
  onMoveIssue: (issueId: string, stateId: string) => void;
  onCreateIssue?: (name: string, stateId: string | null) => void;
  accent: string;
  quickFilterAssignees: string[];
  onQuickFilterToggle: (id: string) => void;
}) {
  const stateById = useMemo(() => {
    const m = new Map<string, IssueState>();
    for (const s of states) m.set(s.id, s);
    return m;
  }, [states]);

  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [composerCol, setComposerCol] = useState<string | null>(null);
  const [composerText, setComposerText] = useState("");

  const activeCycle = useMemo(
    () => cycles.find((c) => c.status === "current") ?? null,
    [cycles],
  );

  /* Build columns by groupBy */

  type Column = {
    id: string;
    title: string;
    color: string;
    /** Drop-target state id (only for Status grouping). */
    targetStateId: string | null;
    issues: IssueSummary[];
    accent?: string;
  };

  const memberSorted = useMemo(
    () => Array.from(members.values()).sort((a, b) => a.displayName.localeCompare(b.displayName)),
    [members],
  );

  const columns: Column[] = useMemo(() => {
    const cols: Column[] = [];

    if (groupBy === "status") {
      const byGroup = new Map<string, { state: IssueState; issues: IssueSummary[] }[]>();
      for (const s of states) {
        const arr = byGroup.get(s.group) ?? [];
        arr.push({ state: s, issues: [] });
        byGroup.set(s.group, arr);
      }
      for (const i of issues) {
        const s = stateById.get(i.state);
        if (!s) continue;
        const arr = byGroup.get(s.group);
        if (!arr) continue;
        const bucket = arr.find((b) => b.state.id === i.state);
        if (bucket) bucket.issues.push(i);
      }
      for (const g of STATE_GROUP_ORDER) {
        const buckets = byGroup.get(g) ?? [];
        const allIssues = buckets.flatMap((b) => b.issues);
        const firstState = buckets[0]?.state ?? null;
        cols.push({
          id: `status:${g}`,
          title: STATE_GROUP_LABEL[g],
          color: STATE_GROUP_COLOR[g],
          targetStateId: firstState?.id ?? null,
          issues: allIssues,
        });
      }
    } else if (groupBy === "assignee") {
      const byUser = new Map<string, IssueSummary[]>();
      const unassigned: IssueSummary[] = [];
      for (const i of issues) {
        if (i.assignees.length === 0) {
          unassigned.push(i);
          continue;
        }
        for (const a of i.assignees) {
          const arr = byUser.get(a) ?? [];
          arr.push(i);
          byUser.set(a, arr);
        }
      }
      for (const m of memberSorted) {
        if (!byUser.has(m.id)) continue;
        cols.push({
          id: `assignee:${m.id}`,
          title: m.displayName,
          color: accent,
          targetStateId: null,
          issues: byUser.get(m.id) ?? [],
        });
      }
      cols.push({
        id: "assignee:none",
        title: "Niemand",
        color: "#94a3b8",
        targetStateId: null,
        issues: unassigned,
      });
    } else if (groupBy === "priority") {
      const byPri = new Map<IssuePriority, IssueSummary[]>();
      for (const i of issues) {
        const arr = byPri.get(i.priority) ?? [];
        arr.push(i);
        byPri.set(i.priority, arr);
      }
      for (const p of PRIORITY_ORDER) {
        cols.push({
          id: `priority:${p}`,
          title: PRIORITY_LABEL[p],
          color: PRIORITY_COLOR[p],
          targetStateId: null,
          issues: byPri.get(p) ?? [],
        });
      }
    } else if (groupBy === "type") {
      const byType = new Map<IssueType, IssueSummary[]>();
      for (const i of issues) {
        const t = deriveIssueType(i, labels);
        const arr = byType.get(t) ?? [];
        arr.push(i);
        byType.set(t, arr);
      }
      for (const t of ISSUE_TYPE_ORDER) {
        if (!byType.get(t)?.length) continue;
        cols.push({
          id: `type:${t}`,
          title: ISSUE_TYPE_META[t].label,
          color: ISSUE_TYPE_META[t].bg,
          targetStateId: null,
          issues: byType.get(t) ?? [],
        });
      }
    } else if (groupBy === "epic") {
      const byParent = new Map<string, IssueSummary[]>();
      const noEpic: IssueSummary[] = [];
      for (const i of issues) {
        if (i.parent) {
          const arr = byParent.get(i.parent) ?? [];
          arr.push(i);
          byParent.set(i.parent, arr);
        } else {
          noEpic.push(i);
        }
      }
      for (const [parentId, items] of byParent) {
        const parent = issues.find((i) => i.id === parentId);
        cols.push({
          id: `epic:${parentId}`,
          title: parent ? parent.name : "Unbekanntes Epic",
          color: ISSUE_TYPE_META.epic.bg,
          targetStateId: null,
          issues: items,
        });
      }
      cols.push({
        id: "epic:none",
        title: "Kein Epic",
        color: "#94a3b8",
        targetStateId: null,
        issues: noEpic,
      });
    }

    return cols;
  }, [groupBy, states, issues, stateById, memberSorted, labels, accent]);

  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

  /* ── Sprint context bar ────────────────────────────────────── */

  const sprintBar = activeCycle ? (
    <div
      className="shrink-0 px-3 py-2 border-b border-stroke-1 bg-bg-chrome flex items-center gap-3 text-[11.5px]"
      style={{
        backgroundImage: `linear-gradient(90deg, ${accent}10, transparent)`,
      }}
    >
      <Calendar size={13} style={{ color: accent }} />
      <span className="font-semibold text-text-primary">
        {activeCycle.name}
      </span>
      <span className="text-text-tertiary">
        {sprintRangeLabel(activeCycle)}
      </span>
      <span className="text-text-tertiary">·</span>
      <span
        className={
          daysRemaining(activeCycle) < 0
            ? "text-red-400 font-semibold"
            : daysRemaining(activeCycle) <= 2
              ? "text-amber-400 font-semibold"
              : "text-text-secondary"
        }
      >
        {daysRemainingLabel(activeCycle)}
      </span>
      <span className="ml-auto text-text-tertiary tabular-nums">
        {issues.filter((i) => i.cycle === activeCycle.id && stateById.get(i.state)?.group === "completed").length}
        {" / "}
        {issues.filter((i) => i.cycle === activeCycle.id).length} erledigt
      </span>
    </div>
  ) : null;

  /* ── Group-by + quick filters bar ──────────────────────────── */

  const controls = (
    <div className="shrink-0 px-3 py-2 border-b border-stroke-1 bg-bg-chrome flex items-center gap-2 text-[11.5px]">
      <span className="text-text-tertiary">Gruppieren nach:</span>
      <div className="relative">
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          className="appearance-none bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md pl-2 pr-6 py-1 text-[11.5px] outline-none cursor-pointer"
        >
          {(Object.keys(GROUP_BY_LABEL) as GroupBy[]).map((g) => (
            <option key={g} value={g}>
              {GROUP_BY_LABEL[g]}
            </option>
          ))}
        </select>
        <ChevronDown
          size={11}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-text-tertiary"
        />
      </div>

      <div className="ml-3 flex items-center gap-1.5">
        <span className="text-text-tertiary">Schnell-Filter:</span>
        {memberSorted.slice(0, 8).map((m) => {
          const active = quickFilterAssignees.includes(m.id);
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onQuickFilterToggle(m.id)}
              title={`Nur Issues von ${m.displayName}`}
              className={`rounded-full transition-all ${
                active
                  ? "ring-2"
                  : "opacity-70 hover:opacity-100"
              }`}
              style={active ? { boxShadow: `0 0 0 2px ${accent}` } : undefined}
            >
              <Avatar name={m.displayName} email={m.email} size={22} />
            </button>
          );
        })}
        {memberSorted.length > 8 && (
          <span className="text-[10.5px] text-text-tertiary">
            +{memberSorted.length - 8}
          </span>
        )}
        {quickFilterAssignees.length > 0 && (
          <button
            type="button"
            onClick={() =>
              quickFilterAssignees.forEach((id) => onQuickFilterToggle(id))
            }
            className="ml-2 text-[10.5px] text-text-tertiary hover:text-text-primary underline"
          >
            zurücksetzen
          </button>
        )}
      </div>

      <div className="ml-auto inline-flex items-center gap-2 text-text-tertiary">
        <UserIcon size={11} />
        <span>{issues.filter((i) => i.assignees.length > 0).length} zugewiesen</span>
        <span>·</span>
        <CheckCheck size={11} />
        <span className="tabular-nums">
          {issues.filter((i) => stateById.get(i.state)?.group === "completed").length}
          {" / "}
          {issues.length}
        </span>
      </div>
    </div>
  );

  /* ── Board grid ───────────────────────────────────────────── */

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {sprintBar}
      {controls}
      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden bg-bg-chrome">
        <div
          className="h-full flex gap-3 p-3 min-w-max"
          onDragEnd={() => {
            setDragId(null);
            setDragOverCol(null);
          }}
        >
          {columns.map((col) => {
            const isDragOver = dragOverCol === col.id;
            const acceptsDrop = col.targetStateId != null;
            const isCollapsed = !!collapsed[col.id];
            const totalPoints = col.issues.reduce(
              (n, i) => n + (i.estimatePoint ?? 0),
              0,
            );
            return (
              <div
                key={col.id}
                className={`flex flex-col w-[300px] shrink-0 rounded-md min-h-0 transition-colors ${
                  isCollapsed ? "h-fit" : ""
                }`}
                style={{
                  background: isDragOver
                    ? `${accent}1a`
                    : "var(--color-bg-elevated, rgba(244,245,247,0.7))",
                  boxShadow: isDragOver
                    ? `inset 0 0 0 2px ${accent}`
                    : "inset 0 0 0 1px var(--color-stroke-1, rgba(0,0,0,0.06))",
                }}
                onDragOver={(e) => {
                  if (!acceptsDrop) return;
                  e.preventDefault();
                  e.dataTransfer.dropEffect = "move";
                  if (dragOverCol !== col.id) setDragOverCol(col.id);
                }}
                onDragLeave={(e) => {
                  if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                  setDragOverCol(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!dragId || !col.targetStateId) return;
                  onMoveIssue(dragId, col.targetStateId);
                  setDragId(null);
                  setDragOverCol(null);
                }}
              >
                <header
                  className="flex items-center gap-2 px-3 pt-2.5 pb-1.5 cursor-pointer"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [col.id]: !c[col.id] }))
                  }
                >
                  <span
                    className="inline-block w-2.5 h-2.5 rounded-sm"
                    style={{ background: col.color }}
                  />
                  <h3 className="text-[11px] font-bold text-text-secondary uppercase tracking-wider">
                    {col.title}
                  </h3>
                  <span className="ml-1 text-[10.5px] font-semibold text-text-tertiary tabular-nums">
                    {col.issues.length}
                  </span>
                  {totalPoints > 0 && (
                    <span className="ml-auto">
                      <StoryPointsPill points={totalPoints} />
                    </span>
                  )}
                </header>
                {!isCollapsed && (
                  <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2 space-y-2">
                    {col.issues.length === 0 && (
                      <p className="text-[11px] text-text-quaternary text-center py-6">
                        —
                      </p>
                    )}
                    {col.issues.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        identifier={identifier}
                        state={stateById.get(issue.state)}
                        members={members}
                        labels={labels}
                        selected={selectedIssueId === issue.id}
                        showStatus={groupBy !== "status"}
                        accent={accent}
                        onClick={() => onSelectIssue(issue.id)}
                        draggable={acceptsDrop}
                        onDragStart={(e) => {
                          setDragId(issue.id);
                          e.dataTransfer.effectAllowed = "move";
                          e.dataTransfer.setData("text/plain", issue.id);
                        }}
                      />
                    ))}
                    {composerCol === col.id ? (
                      <div className="rounded-[3px] border border-stroke-2 bg-bg-elevated p-2">
                        <input
                          autoFocus
                          type="text"
                          value={composerText}
                          onChange={(e) => setComposerText(e.target.value)}
                          placeholder="Was ist zu tun?"
                          className="w-full bg-transparent outline-none text-[12px] py-1"
                          onBlur={() => {
                            if (composerText.trim() && onCreateIssue) {
                              onCreateIssue(
                                composerText.trim(),
                                col.targetStateId ?? null,
                              );
                            }
                            setComposerText("");
                            setComposerCol(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              if (composerText.trim() && onCreateIssue) {
                                onCreateIssue(
                                  composerText.trim(),
                                  col.targetStateId ?? null,
                                );
                              }
                              setComposerText("");
                              setComposerCol(null);
                            } else if (e.key === "Escape") {
                              setComposerText("");
                              setComposerCol(null);
                            }
                          }}
                        />
                      </div>
                    ) : (
                      onCreateIssue && (
                        <button
                          type="button"
                          onClick={() => {
                            setComposerCol(col.id);
                            setComposerText("");
                          }}
                          className="w-full text-left text-[11.5px] text-text-tertiary hover:text-text-primary hover:bg-bg-overlay/50 rounded px-2 py-1.5 inline-flex items-center gap-1.5"
                        >
                          <Plus size={11} />
                          Issue erstellen
                        </button>
                      )
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function sprintRangeLabel(c: CycleSummary): string {
  if (!c.startDate || !c.endDate) return "ohne Zeitfenster";
  const o: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${new Date(c.startDate).toLocaleDateString("de-DE", o)} – ${new Date(
    c.endDate,
  ).toLocaleDateString("de-DE", o)}`;
}

function daysRemaining(c: CycleSummary): number {
  if (!c.endDate) return Infinity;
  return Math.ceil((new Date(c.endDate).getTime() - Date.now()) / 86_400_000);
}

function daysRemainingLabel(c: CycleSummary): string {
  if (c.status === "completed") return "abgeschlossen";
  if (!c.endDate) return "kein Enddatum";
  const d = daysRemaining(c);
  if (d < 0) return `${Math.abs(d)} Tage überfällig`;
  if (d === 0) return "endet heute";
  if (d === 1) return "noch 1 Tag";
  return `noch ${d} Tage`;
}
