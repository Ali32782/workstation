/**
 * Plane domain types as the portal cares about them. Plane returns many more
 * fields per record than we need — we keep the shapes minimal so the UI never
 * accidentally depends on internal Plane plumbing (workspace.id vs slug,
 * created_by, etc.).
 *
 * These types are pure data; no methods, no Plane SDK objects. Keep it that
 * way — they cross the network boundary (server → API route → client).
 */

export type ProjectSummary = {
  id: string;
  name: string;
  identifier: string;
  description: string;
  emoji?: string | null;
  /** Number of issues in the project (omitted if Plane didn't include it). */
  totalIssues?: number;
};

export type IssuePriority = "urgent" | "high" | "medium" | "low" | "none";

export type IssueState = {
  id: string;
  name: string;
  /** "backlog" | "unstarted" | "started" | "completed" | "cancelled" */
  group: string;
  color: string;
};

export type IssueLabel = {
  id: string;
  name: string;
  color: string;
};

export type WorkspaceMember = {
  id: string;
  email: string;
  displayName: string;
  /** Plane stores avatar_url; passes through unchanged. */
  avatar?: string | null;
};

export type IssueSummary = {
  id: string;
  /** Plane's user-visible "PROJ-42" identifier (sequence_id). */
  sequenceId: number;
  name: string;
  /** Plane returns description_html — keep it as-is for the editor. */
  descriptionHtml: string;
  state: string;
  priority: IssuePriority;
  assignees: string[];
  labels: string[];
  /** Plane stores the current sprint as `cycle` (UUID or null). */
  cycle: string | null;
  /** Module = Plane's lightweight Epic. UUID array because issue can be in many. */
  modules: string[];
  /** Plane's `parent` (sub-issue parent UUID). */
  parent: string | null;
  /** Estimate point in story-points or hours; project decides. Optional. */
  estimatePoint: number | null;
  startDate: string | null;
  targetDate: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

export type CycleStatus =
  | "draft"
  | "upcoming"
  | "current"
  | "completed";

export type CycleSummary = {
  id: string;
  name: string;
  description: string;
  startDate: string | null;
  endDate: string | null;
  status: CycleStatus;
  /** Optional precomputed totals provided by Plane; UI falls back to issue scan. */
  totalIssues: number | null;
  completedIssues: number | null;
  /** Plane optionally reports total estimate points. */
  totalEstimatePoints: number | null;
  completedEstimatePoints: number | null;
};

export type IssueComment = {
  id: string;
  actorId: string | null;
  actorDisplayName: string | null;
  commentHtml: string;
  createdAt: string;
  updatedAt: string;
};
