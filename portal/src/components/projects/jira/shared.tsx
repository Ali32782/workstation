"use client";

import { useMemo } from "react";
import {
  ArrowUpCircle,
  ArrowUp,
  Equal,
  ArrowDown,
  Minus,
  CheckCircle2,
  Circle,
  CircleDot,
  CircleDashed,
  XCircle,
  Bug,
  Bookmark,
  CheckSquare,
  Zap,
  GitBranch,
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

/* ----------------------------------------------------------------- */
/*                          Constants                                  */
/* ----------------------------------------------------------------- */

export const PRIORITY_ORDER: IssuePriority[] = [
  "urgent",
  "high",
  "medium",
  "low",
  "none",
];

export const PRIORITY_COLOR: Record<IssuePriority, string> = {
  urgent: "#dc2626",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
  none: "#64748b",
};

export const PRIORITY_LABEL: Record<IssuePriority, string> = {
  urgent: "Dringend",
  high: "Hoch",
  medium: "Mittel",
  low: "Niedrig",
  none: "Keine",
};

export const PRIORITY_ICON: Record<
  IssuePriority,
  React.ComponentType<{ size?: number; className?: string }>
> = {
  urgent: ArrowUpCircle,
  high: ArrowUp,
  medium: Equal,
  low: ArrowDown,
  none: Minus,
};

/**
 * Logical column order for the Kanban view. Plane returns groups as strings;
 * we map them to Jira's classic five-column board layout.
 */
export const STATE_GROUP_ORDER = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "cancelled",
] as const;

export const STATE_GROUP_LABEL: Record<string, string> = {
  backlog: "Backlog",
  unstarted: "To Do",
  started: "In Arbeit",
  completed: "Erledigt",
  cancelled: "Abgebrochen",
};

export const STATE_GROUP_COLOR: Record<string, string> = {
  backlog: "#94a3b8",
  unstarted: "#3b82f6",
  started: "#f97316",
  completed: "#10b981",
  cancelled: "#ef4444",
};

/* ----------------------------------------------------------------- */
/*                          Issue types                                */
/* ----------------------------------------------------------------- */

/**
 * Plane Community Edition has no native issue-type field. To get the iconic
 * Jira look-and-feel (green Story bookmark, blue Task check, red Bug, purple
 * Epic, teal Subtask) we derive a type from labels case-insensitively, with
 * a fallback to "Subtask" if the issue has a parent and "Task" otherwise.
 *
 * Recognised label substrings (German + English):
 *   bug      → bug
 *   defect   → bug
 *   story    → story
 *   user-story → story
 *   epic     → epic
 *   feature  → story
 *   task     → task
 *   chore    → task
 *   spike    → task
 */
export type IssueType = "story" | "task" | "bug" | "epic" | "subtask";

export const ISSUE_TYPE_META: Record<
  IssueType,
  {
    label: string;
    color: string;
    bg: string;
    Icon: React.ComponentType<{ size?: number; className?: string }>;
  }
> = {
  story: {
    label: "Story",
    color: "#22c55e",
    bg: "#16a34a",
    Icon: Bookmark,
  },
  task: {
    label: "Task",
    color: "#3b82f6",
    bg: "#2563eb",
    Icon: CheckSquare,
  },
  bug: {
    label: "Bug",
    color: "#ef4444",
    bg: "#dc2626",
    Icon: Bug,
  },
  epic: {
    label: "Epic",
    color: "#a855f7",
    bg: "#9333ea",
    Icon: Zap,
  },
  subtask: {
    label: "Sub-Task",
    color: "#06b6d4",
    bg: "#0891b2",
    Icon: GitBranch,
  },
};

export const ISSUE_TYPE_ORDER: IssueType[] = [
  "epic",
  "story",
  "task",
  "bug",
  "subtask",
];

/** Derive an issue type from labels + parent relationship. Pure function. */
export function deriveIssueType(
  issue: IssueSummary,
  labels: Map<string, IssueLabel>,
): IssueType {
  for (const id of issue.labels) {
    const l = labels.get(id);
    if (!l) continue;
    const n = l.name.toLowerCase();
    if (/(^|\W)(bug|defect|fehler)(\W|$)/.test(n)) return "bug";
    if (/(^|\W)epic(\W|$)/.test(n)) return "epic";
    if (/(^|\W)(story|user[- ]story|feature)(\W|$)/.test(n)) return "story";
    if (/(^|\W)(task|chore|spike|aufgabe)(\W|$)/.test(n)) return "task";
  }
  if (issue.parent) return "subtask";
  return "task";
}

/**
 * Filled square Jira-style issue type icon. The hallmark of the Jira look:
 * a small coloured square with a white glyph inside, sitting next to every
 * issue key.
 */
export function IssueTypeIcon({
  type,
  size = 14,
  title,
}: {
  type: IssueType;
  size?: number;
  title?: string;
}) {
  const meta = ISSUE_TYPE_META[type];
  const Icon = meta.Icon;
  return (
    <span
      className="inline-flex items-center justify-center rounded-[3px] shrink-0"
      style={{
        background: meta.bg,
        width: size,
        height: size,
      }}
      title={title ?? meta.label}
      aria-label={meta.label}
    >
      <Icon size={Math.round(size * 0.7)} className="text-white" />
    </span>
  );
}

/* ----------------------------------------------------------------- */
/*                          Mini visuals                               */
/* ----------------------------------------------------------------- */

export function StateGroupIcon({
  group,
  size = 13,
}: {
  group: string;
  size?: number;
}) {
  const props = { size, "aria-hidden": true } as const;
  switch (group) {
    case "completed":
      return <CheckCircle2 {...props} className="text-emerald-500" />;
    case "started":
      return <CircleDot {...props} className="text-amber-500" />;
    case "cancelled":
      return <XCircle {...props} className="text-red-500" />;
    case "backlog":
      return <CircleDashed {...props} className="text-text-quaternary" />;
    case "unstarted":
    default:
      return <Circle {...props} className="text-sky-500" />;
  }
}

export function PriorityBadge({
  priority,
  showLabel = false,
}: {
  priority: IssuePriority;
  showLabel?: boolean;
}) {
  const Icon = PRIORITY_ICON[priority];
  return (
    <span
      className="inline-flex items-center gap-1"
      style={{ color: PRIORITY_COLOR[priority] }}
      title={PRIORITY_LABEL[priority]}
    >
      <Icon size={12} />
      {showLabel && (
        <span className="text-[10.5px] font-medium">
          {PRIORITY_LABEL[priority]}
        </span>
      )}
    </span>
  );
}

export function StateBadge({ state }: { state: IssueState }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10.5px] font-medium"
      style={{ background: state.color + "26", color: state.color }}
    >
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: state.color }}
      />
      {state.name}
    </span>
  );
}

export function CycleStatusPill({ cycle }: { cycle: CycleSummary }) {
  const map: Record<
    CycleSummary["status"],
    { bg: string; fg: string; label: string }
  > = {
    current: { bg: "rgba(16,185,129,0.18)", fg: "#10b981", label: "Aktiv" },
    upcoming: { bg: "rgba(59,130,246,0.18)", fg: "#3b82f6", label: "Geplant" },
    completed: {
      bg: "rgba(100,116,139,0.18)",
      fg: "#94a3b8",
      label: "Abgeschlossen",
    },
    draft: {
      bg: "rgba(234,179,8,0.18)",
      fg: "#eab308",
      label: "Entwurf",
    },
  };
  const tone = map[cycle.status];
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold uppercase tracking-wide"
      style={{ background: tone.bg, color: tone.fg }}
    >
      {tone.label}
    </span>
  );
}

/* ----------------------------------------------------------------- */
/*                          Issue card                                 */
/* ----------------------------------------------------------------- */

/**
 * Jira-style story-points pill — the small green circle that sits in the
 * bottom-right of every Jira card. We show "—" if no estimate is set so
 * there's a consistent place for the eye to land.
 */
export function StoryPointsPill({ points }: { points: number | null }) {
  if (points == null) return null;
  return (
    <span
      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold text-white tabular-nums"
      style={{ background: "#16a34a" }}
      title={`${points} Story Points`}
    >
      {points}
    </span>
  );
}

/**
 * Status pill inspired by Jira's Atlassian-Atlas pills. Shows the literal
 * status name in a coloured chip whose tint matches the state group.
 */
export function CompactStatusPill({ state }: { state: IssueState | undefined }) {
  if (!state) return null;
  const groupColor = STATE_GROUP_COLOR[state.group] ?? state.color;
  return (
    <span
      className="inline-flex items-center px-1.5 py-[1px] rounded text-[9.5px] font-semibold uppercase tracking-wide"
      style={{
        background: groupColor + "1f",
        color: groupColor,
      }}
    >
      {state.name}
    </span>
  );
}

/**
 * Jira-faithful issue card used in board columns and backlog rows. Layout:
 *
 *   ┌───────────────────────────────────────────────┐
 *   │ Issue title that can wrap up to 3 lines      │
 *   │                                               │
 *   │ [label] [label] +2                            │
 *   │                                               │
 *   │ [TYPE] PROJ-42  [STATUS]      [↑] [pts] [👤] │
 *   └───────────────────────────────────────────────┘
 */
export function IssueCard({
  issue,
  identifier,
  state,
  members,
  labels,
  selected = false,
  onClick,
  onContextMenu,
  draggable = false,
  onDragStart,
  density = "comfortable",
  showStatus = false,
  accent,
  subIssueCount = 0,
}: {
  issue: IssueSummary;
  identifier: string;
  state?: IssueState;
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  selected?: boolean;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  density?: "comfortable" | "compact";
  /** Show the status pill on the card. Off in Board (column == status), on in Backlog/List. */
  showStatus?: boolean;
  accent?: string;
  /** Direkte Kinder (Plane parent → child). */
  subIssueCount?: number;
}) {
  const assignedMembers = issue.assignees
    .map((id) => members.get(id))
    .filter((m): m is WorkspaceMember => Boolean(m));
  const issueLabels = issue.labels
    .map((id) => labels.get(id))
    .filter((l): l is IssueLabel => Boolean(l));

  const issueType = useMemo(() => deriveIssueType(issue, labels), [issue, labels]);

  const overdue = useMemo(() => {
    if (!issue.targetDate) return false;
    if (issue.completedAt) return false;
    return new Date(issue.targetDate).getTime() < Date.now();
  }, [issue.targetDate, issue.completedAt]);

  const isCompact = density === "compact";

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={draggable}
      onDragStart={onDragStart}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick?.(e as unknown as React.MouseEvent);
      }}
      className={`group cursor-pointer select-none rounded-[3px] border-l-[3px] bg-bg-elevated text-left shadow-[0_1px_2px_rgba(0,0,0,0.18)] hover:shadow-[0_2px_6px_rgba(0,0,0,0.25)] transition-shadow ${
        selected
          ? "border-stroke-2 ring-1 ring-sky-500/40"
          : "border-stroke-1"
      } ${isCompact ? "px-2 py-1.5" : "px-3 py-2.5"}`}
      style={{
        borderLeftColor: ISSUE_TYPE_META[issueType].bg,
        borderTopColor: "transparent",
        borderRightColor: "transparent",
        borderBottomColor: "transparent",
        ...(selected && accent ? { boxShadow: `0 0 0 2px ${accent}` } : null),
      }}
    >
      <p
        className={`text-text-primary leading-snug line-clamp-3 font-medium ${
          isCompact ? "text-[12.5px]" : "text-[13px]"
        }`}
      >
        {issue.name}
      </p>

      {issueLabels.length > 0 && !isCompact && (
        <div className="mt-2 flex flex-wrap gap-1">
          {issueLabels.slice(0, 4).map((l) => (
            <span
              key={l.id}
              className="inline-block px-1.5 py-[1px] rounded text-[9.5px] font-medium"
              style={{
                background: l.color + "26",
                color: l.color,
              }}
            >
              {l.name}
            </span>
          ))}
          {issueLabels.length > 4 && (
            <span className="text-[9.5px] text-text-tertiary">
              +{issueLabels.length - 4}
            </span>
          )}
        </div>
      )}

      <div className={`flex items-center gap-1.5 ${isCompact ? "mt-1" : "mt-2.5"}`}>
        <IssueTypeIcon
          type={issueType}
          size={isCompact ? 13 : 14}
          title={`${ISSUE_TYPE_META[issueType].label} · ${identifier}-${issue.sequenceId}`}
        />
        <span className="font-mono text-[10.5px] text-text-tertiary">
          {identifier}-{issue.sequenceId}
        </span>
        {showStatus && state && <CompactStatusPill state={state} />}
        {issue.targetDate && (
          <span
            className={`inline-flex items-center gap-1 text-[10px] ${
              overdue ? "text-red-400 font-semibold" : "text-text-tertiary"
            }`}
            title={`Fällig: ${new Date(issue.targetDate).toLocaleDateString("de-DE")}`}
          >
            {new Date(issue.targetDate).toLocaleDateString("de-DE", {
              day: "2-digit",
              month: "short",
            })}
          </span>
        )}

        <span className="ml-auto inline-flex items-center gap-1.5">
          <PriorityBadge priority={issue.priority} />
          <StoryPointsPill points={issue.estimatePoint} />
          {subIssueCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold tabular-nums bg-bg-overlay border border-stroke-1 text-text-secondary"
              title={`${subIssueCount} Sub‑Issues`}
            >
              <GitBranch size={10} aria-hidden />
              {subIssueCount}
            </span>
          )}
          <span className="inline-flex items-center -space-x-1">
            {assignedMembers.slice(0, 3).map((m) => (
              <span
                key={m.id}
                className="ring-2 ring-bg-elevated rounded-full"
              >
                <Avatar name={m.displayName} email={m.email} size={18} />
              </span>
            ))}
            {assignedMembers.length === 0 && (
              <span
                className="inline-block w-[18px] h-[18px] rounded-full border border-dashed border-stroke-2"
                title="Niemand zugewiesen"
              />
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                          Filter helpers                             */
/* ----------------------------------------------------------------- */

export type IssueFilter = {
  query: string;
  priorities: IssuePriority[];
  assignees: string[];
  labels: string[];
};

export const EMPTY_FILTER: IssueFilter = {
  query: "",
  priorities: [],
  assignees: [],
  labels: [],
};

export function applyFilter(issues: IssueSummary[], f: IssueFilter): IssueSummary[] {
  return issues.filter((i) => {
    if (
      f.query.trim() &&
      !i.name.toLowerCase().includes(f.query.toLowerCase()) &&
      !String(i.sequenceId).includes(f.query)
    ) {
      return false;
    }
    if (f.priorities.length && !f.priorities.includes(i.priority)) return false;
    if (f.assignees.length && !i.assignees.some((id) => f.assignees.includes(id)))
      return false;
    if (f.labels.length && !i.labels.some((id) => f.labels.includes(id)))
      return false;
    return true;
  });
}
