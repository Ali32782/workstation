import "server-only";
import sanitizeHtml from "sanitize-html";
import { createAppFetch, fetchJson } from "@/lib/app-clients/base";
import type {
  CycleStatus,
  CycleSummary,
  IssueComment,
  IssueLabel,
  IssuePriority,
  IssueState,
  IssueSummary,
  ProjectSummary,
  WorkspaceMember,
} from "./types";

/**
 * Native Plane domain client used by `/api/projects/*` routes.
 *
 * Auth: Plane has no SSO on Community Edition, so we authenticate every
 * request with the workspace-admin `X-API-Key`. End-user attribution is
 * carried explicitly via `created_by` / `assignees` fields (set by the
 * caller after resolving the portal session email → Plane member id with
 * `lib/projects/user-resolver.ts`).
 *
 * The wrapper hides the wire format details: Plane returns `{ results }`
 * envelopes for lists with cursor pagination, mixed casing on a few fields,
 * and uses `description_html` rather than `description` for issues. We
 * normalise everything into the camel-cased shapes from `types.ts` before
 * returning to callers.
 */

const ORIGINS = {
  internal: process.env.PLANE_INTERNAL_URL ?? "http://plane-proxy",
  public: process.env.PLANE_BASE_URL ?? "https://plane.kineo360.work",
};

const adminKey = (): string => {
  const k = process.env.PLANE_BRIDGE_API_TOKEN ?? "";
  if (!k) throw new Error("PLANE_BRIDGE_API_TOKEN is not set");
  return k;
};

const planeFetch = createAppFetch({
  app: "plane",
  origins: ORIGINS,
  authHeaders: () => ({ "X-API-Key": adminKey() }),
});

type PlanePaged<T> = { results?: T[]; count?: number; total_count?: number };

async function listAll<T>(path: string): Promise<T[]> {
  const data = await fetchJson<PlanePaged<T> | T[]>(planeFetch, "plane", path);
  if (Array.isArray(data)) return data;
  return data.results ?? [];
}

/* --------------------------------------------------------------------- */
/*                              Projects                                  */
/* --------------------------------------------------------------------- */

type RawProject = {
  id: string;
  name: string;
  identifier: string;
  description?: string;
  emoji?: string | number | null;
  total_issues?: number;
};

function normaliseProject(p: RawProject): ProjectSummary {
  return {
    id: p.id,
    name: p.name,
    identifier: p.identifier,
    description: p.description ?? "",
    emoji:
      typeof p.emoji === "number"
        ? String.fromCodePoint(p.emoji)
        : (p.emoji as string | null | undefined) ?? null,
    totalIssues: p.total_issues,
  };
}

export async function listProjects(workspaceSlug: string): Promise<ProjectSummary[]> {
  const data = await listAll<RawProject>(
    `/api/v1/workspaces/${workspaceSlug}/projects/`,
  );
  return data.map(normaliseProject);
}

export async function createProject(
  workspaceSlug: string,
  input: { name: string; identifier: string; description?: string },
): Promise<ProjectSummary> {
  const raw = await fetchJson<RawProject>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/`,
    { method: "POST", json: input },
  );
  return normaliseProject(raw);
}

export async function deleteProject(
  workspaceSlug: string,
  projectId: string,
): Promise<void> {
  await fetchJson<void>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/`,
    { method: "DELETE" },
  );
}

/* --------------------------------------------------------------------- */
/*                              Members / states / labels                 */
/* --------------------------------------------------------------------- */

type RawMember = {
  id?: string;
  member?: {
    id: string;
    email: string;
    display_name?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string;
  };
  email?: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  avatar?: string | null;
  avatar_url?: string | null;
};

function bestName(
  parts: { first_name?: string; last_name?: string; display_name?: string; email?: string },
): string {
  const full = `${parts.first_name ?? ""} ${parts.last_name ?? ""}`.trim();
  if (full) return full;
  if (parts.display_name) return parts.display_name;
  return parts.email ?? "";
}

function normaliseMember(m: RawMember): WorkspaceMember | null {
  // Plane has two shapes here depending on endpoint: the `/members/` listing
  // returns a flat object, while project memberships nest under `member`.
  if (m.member) {
    return {
      id: m.member.id,
      email: m.member.email,
      displayName: bestName(m.member),
      avatar: m.member.avatar_url ?? null,
    };
  }
  if (!m.id || !m.email) return null;
  return {
    id: m.id,
    email: m.email,
    displayName: bestName(m),
    avatar: m.avatar_url ?? m.avatar ?? null,
  };
}

export async function listWorkspaceMembers(
  workspaceSlug: string,
): Promise<WorkspaceMember[]> {
  const data = await listAll<RawMember>(
    `/api/v1/workspaces/${workspaceSlug}/members/`,
  );
  return data.map(normaliseMember).filter((m): m is WorkspaceMember => m != null);
}

type RawState = {
  id: string;
  name: string;
  group: string;
  color: string;
};

export async function listStates(
  workspaceSlug: string,
  projectId: string,
): Promise<IssueState[]> {
  const data = await listAll<RawState>(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/states/`,
  );
  return data.map((s) => ({
    id: s.id,
    name: s.name,
    group: s.group,
    color: s.color,
  }));
}

type RawLabel = {
  id: string;
  name: string;
  color: string;
};

export async function listLabels(
  workspaceSlug: string,
  projectId: string,
): Promise<IssueLabel[]> {
  const data = await listAll<RawLabel>(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/labels/`,
  );
  return data.map((l) => ({ id: l.id, name: l.name, color: l.color }));
}

export async function createLabel(
  workspaceSlug: string,
  projectId: string,
  input: { name: string; color?: string },
): Promise<IssueLabel> {
  const raw = await fetchJson<RawLabel>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/labels/`,
    {
      method: "POST",
      json: { name: input.name, color: input.color ?? "#6b7280" },
    },
  );
  return { id: raw.id, name: raw.name, color: raw.color };
}

/* --------------------------------------------------------------------- */
/*                              Issues                                    */
/* --------------------------------------------------------------------- */

type RawIssue = {
  id: string;
  sequence_id: number;
  name: string;
  description_html?: string;
  state?: string;
  priority?: IssuePriority | null;
  assignees?: string[];
  labels?: string[];
  cycle?: string | null;
  cycle_id?: string | null;
  modules?: string[];
  module_ids?: string[];
  parent?: string | null;
  parent_id?: string | null;
  estimate_point?: number | null;
  start_date?: string | null;
  target_date?: string | null;
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
};

function normaliseIssue(i: RawIssue): IssueSummary {
  return {
    id: i.id,
    sequenceId: i.sequence_id,
    name: i.name,
    descriptionHtml: i.description_html ?? "",
    state: i.state ?? "",
    priority: (i.priority ?? "none") as IssuePriority,
    assignees: i.assignees ?? [],
    labels: i.labels ?? [],
    cycle: i.cycle ?? i.cycle_id ?? null,
    modules: i.modules ?? i.module_ids ?? [],
    parent: i.parent ?? i.parent_id ?? null,
    estimatePoint:
      typeof i.estimate_point === "number" ? i.estimate_point : null,
    startDate: i.start_date ?? null,
    targetDate: i.target_date ?? null,
    createdAt: i.created_at,
    updatedAt: i.updated_at,
    completedAt: i.completed_at ?? null,
  };
}

export async function listIssues(
  workspaceSlug: string,
  projectId: string,
): Promise<IssueSummary[]> {
  // Plane's pagination defaults to 100/page; we walk the cursor until
  // exhausted. For an MVP this is fine — workspaces in the wild rarely
  // exceed a few thousand issues per project.
  let path: string | null = `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/?per_page=100`;
  const all: IssueSummary[] = [];
  while (path) {
    const page: { results?: RawIssue[]; next_cursor?: string; next_page_results?: boolean } =
      await fetchJson(planeFetch, "plane", path);
    for (const r of page.results ?? []) all.push(normaliseIssue(r));
    if (page.next_page_results && page.next_cursor) {
      path = `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/?per_page=100&cursor=${encodeURIComponent(page.next_cursor)}`;
    } else {
      path = null;
    }
  }
  return all;
}

export async function getIssue(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
): Promise<IssueSummary> {
  const raw = await fetchJson<RawIssue>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
  );
  return normaliseIssue(raw);
}

export type IssueWriteInput = {
  name?: string;
  descriptionHtml?: string;
  state?: string;
  priority?: IssuePriority;
  assignees?: string[];
  labels?: string[];
  parent?: string | null;
  estimatePoint?: number | null;
  startDate?: string | null;
  targetDate?: string | null;
};

function toRawWrite(input: IssueWriteInput): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (input.name !== undefined) out.name = input.name;
  if (input.descriptionHtml !== undefined)
    out.description_html = input.descriptionHtml;
  if (input.state !== undefined) out.state = input.state;
  if (input.priority !== undefined) out.priority = input.priority;
  if (input.assignees !== undefined) out.assignees = input.assignees;
  if (input.labels !== undefined) out.labels = input.labels;
  if (input.parent !== undefined) out.parent = input.parent;
  if (input.estimatePoint !== undefined) out.estimate_point = input.estimatePoint;
  if (input.startDate !== undefined) out.start_date = input.startDate;
  if (input.targetDate !== undefined) out.target_date = input.targetDate;
  return out;
}

export async function createIssue(
  workspaceSlug: string,
  projectId: string,
  input: IssueWriteInput & { name: string },
): Promise<IssueSummary> {
  const raw = await fetchJson<RawIssue>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/`,
    { method: "POST", json: toRawWrite(input) },
  );
  return normaliseIssue(raw);
}

export async function updateIssue(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  input: IssueWriteInput,
): Promise<IssueSummary> {
  const raw = await fetchJson<RawIssue>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    { method: "PATCH", json: toRawWrite(input) },
  );
  return normaliseIssue(raw);
}

export async function deleteIssue(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
): Promise<void> {
  await fetchJson<void>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/`,
    { method: "DELETE" },
  );
}

/* --------------------------------------------------------------------- */
/*                              Cycles (Plane sprints)                    */
/* --------------------------------------------------------------------- */

type RawCycle = {
  id: string;
  name: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  total_issues?: number | null;
  completed_issues?: number | null;
  total_estimate_points?: number | null;
  completed_estimate_points?: number | null;
};

function classifyCycle(c: RawCycle, now = new Date()): CycleStatus {
  const start = c.start_date ? new Date(c.start_date) : null;
  const end = c.end_date ? new Date(c.end_date) : null;
  if (!start || !end) return "draft";
  if (end.getTime() < now.getTime()) return "completed";
  if (start.getTime() > now.getTime()) return "upcoming";
  return "current";
}

function normaliseCycle(c: RawCycle): CycleSummary {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? "",
    startDate: c.start_date ?? null,
    endDate: c.end_date ?? null,
    status: classifyCycle(c),
    totalIssues: c.total_issues ?? null,
    completedIssues: c.completed_issues ?? null,
    totalEstimatePoints: c.total_estimate_points ?? null,
    completedEstimatePoints: c.completed_estimate_points ?? null,
  };
}

export async function listCycles(
  workspaceSlug: string,
  projectId: string,
): Promise<CycleSummary[]> {
  const data = await listAll<RawCycle>(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`,
  );
  return data.map(normaliseCycle);
}

export async function createCycle(
  workspaceSlug: string,
  projectId: string,
  input: {
    name: string;
    description?: string;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<CycleSummary> {
  const raw = await fetchJson<RawCycle>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/cycles/`,
    {
      method: "POST",
      json: {
        name: input.name,
        description: input.description ?? "",
        start_date: input.startDate ?? null,
        end_date: input.endDate ?? null,
      },
    },
  );
  return normaliseCycle(raw);
}

export async function updateCycle(
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  input: {
    name?: string;
    description?: string;
    startDate?: string | null;
    endDate?: string | null;
  },
): Promise<CycleSummary> {
  const body: Record<string, unknown> = {};
  if (input.name !== undefined) body.name = input.name;
  if (input.description !== undefined) body.description = input.description;
  if (input.startDate !== undefined) body.start_date = input.startDate;
  if (input.endDate !== undefined) body.end_date = input.endDate;
  const raw = await fetchJson<RawCycle>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`,
    { method: "PATCH", json: body },
  );
  return normaliseCycle(raw);
}

export async function deleteCycle(
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
): Promise<void> {
  await fetchJson<void>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/`,
    { method: "DELETE" },
  );
}

/**
 * Add issues to a cycle. Plane's add-to-cycle endpoint takes an array of issue
 * UUIDs in a single request, which is much cheaper than patching each issue
 * individually when bulk-moving from backlog into a sprint.
 */
export async function addIssuesToCycle(
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  issueIds: string[],
): Promise<void> {
  if (issueIds.length === 0) return;
  await fetchJson<unknown>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/`,
    { method: "POST", json: { issues: issueIds } },
  );
}

/**
 * Remove a single issue from a cycle (returns it to the backlog).
 */
export async function removeIssueFromCycle(
  workspaceSlug: string,
  projectId: string,
  cycleId: string,
  issueId: string,
): Promise<void> {
  await fetchJson<void>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/cycles/${cycleId}/cycle-issues/${issueId}/`,
    { method: "DELETE" },
  );
}

/* --------------------------------------------------------------------- */
/*                              Comments                                  */
/* --------------------------------------------------------------------- */

type RawComment = {
  id: string;
  actor?: string | null;
  actor_detail?: { id: string; display_name?: string; first_name?: string };
  comment_html: string;
  created_at: string;
  updated_at: string;
};

const COMMENT_SANITIZE: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "h1",
    "h2",
  ],
  allowedAttributes: {
    "*": ["class"],
    a: ["href", "target", "rel"],
    img: ["src", "alt", "title"],
  },
  allowedSchemes: ["http", "https", "mailto"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },
};

function normaliseComment(c: RawComment): IssueComment {
  return {
    id: c.id,
    actorId: c.actor_detail?.id ?? c.actor ?? null,
    actorDisplayName:
      c.actor_detail?.display_name ?? c.actor_detail?.first_name ?? null,
    commentHtml: sanitizeHtml(c.comment_html ?? "", COMMENT_SANITIZE),
    createdAt: c.created_at,
    updatedAt: c.updated_at,
  };
}

export async function listComments(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
): Promise<IssueComment[]> {
  const data = await listAll<RawComment>(
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
  );
  return data.map(normaliseComment);
}

export async function addComment(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  commentHtml: string,
): Promise<IssueComment> {
  const raw = await fetchJson<RawComment>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/`,
    { method: "POST", json: { comment_html: commentHtml } },
  );
  return normaliseComment(raw);
}

export async function deleteComment(
  workspaceSlug: string,
  projectId: string,
  issueId: string,
  commentId: string,
): Promise<void> {
  await fetchJson<void>(
    planeFetch,
    "plane",
    `/api/v1/workspaces/${workspaceSlug}/projects/${projectId}/issues/${issueId}/comments/${commentId}/`,
    { method: "DELETE" },
  );
}
