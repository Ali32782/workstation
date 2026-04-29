import { NextRequest, NextResponse } from "next/server";
import { listIssues, listProjects, listStates } from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";
import { resolvePlaneMember } from "@/lib/projects/user-resolver";
import type { IssueState, IssueSummary, ProjectSummary } from "@/lib/projects/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * "What do I owe today?" cross-project assignee feed.
 *
 * Plane's REST API has no `/issues?assignee=me` endpoint that spans
 * projects, so we fan out: list projects → for each, list issues →
 * filter to the caller's member id + open state + due ≤ today.
 *
 * Caching: relies on the in-memory state-list cache via Plane's normal
 * fetch path. For a workspace with <10 projects + <200 issues each
 * this returns in well under 2 seconds; the dashboard caller treats
 * this as a slow fetch and hides the card behind a spinner.
 *
 * Done states are dropped via Plane's `state.group`: `completed` and
 * `cancelled` are excluded. Items with no due date are kept (as
 * "next-up" — surface them so they don't silently rot).
 */

type MyIssue = IssueSummary & {
  projectId: string;
  projectIdentifier: string;
  projectName: string;
  stateName: string;
  stateGroup: string;
  /** True when the targetDate is today or earlier (or in the past). */
  dueToday: boolean;
  overdue: boolean;
};

const HARD_PROJECT_CAP = 25;

export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveProjectsSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json(
      { error: r.message, code: "forbidden" },
      { status: 403 },
    );
  }

  const me = await resolvePlaneMember(r.session.workspaceSlug, r.session.email);
  if (!me) {
    return NextResponse.json({
      issues: [],
      counts: { total: 0, dueToday: 0, overdue: 0 },
      reason: "no_plane_member",
    });
  }

  let projects: ProjectSummary[];
  try {
    projects = await listProjects(r.session.workspaceSlug);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  const collected: MyIssue[] = [];

  // Cap project iteration so a misconfigured workspace can't tie up the
  // event loop. Real workspaces stay well under this.
  for (const p of projects.slice(0, HARD_PROJECT_CAP)) {
    let issues: IssueSummary[] = [];
    let states: IssueState[] = [];
    try {
      [issues, states] = await Promise.all([
        listIssues(r.session.workspaceSlug, p.id),
        listStates(r.session.workspaceSlug, p.id),
      ]);
    } catch (e) {
      // Skip the project on per-project error — partial result is more
      // useful than a hard failure that hides everything else.
      console.warn(
        `[/api/projects/my-issues] project ${p.identifier} failed:`,
        e instanceof Error ? e.message : e,
      );
      continue;
    }
    const stateById = new Map(states.map((s) => [s.id, s]));

    for (const it of issues) {
      if (!it.assignees.includes(me.id)) continue;
      const st = stateById.get(it.state);
      const group = st?.group ?? "";
      if (group === "completed" || group === "cancelled") continue;

      const dueToday = it.targetDate ? it.targetDate <= todayISO : false;
      const overdue = it.targetDate ? it.targetDate < todayISO : false;

      collected.push({
        ...it,
        projectId: p.id,
        projectIdentifier: p.identifier,
        projectName: p.name,
        stateName: st?.name ?? "—",
        stateGroup: group,
        dueToday,
        overdue,
      });
    }
  }

  // Sort: overdue first (oldest target_date wins), then due-today, then
  // priority (urgent > high > …), then newest first.
  const PRIO_ORDER: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
    none: 4,
  };
  collected.sort((a, b) => {
    if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
    if (a.dueToday !== b.dueToday) return a.dueToday ? -1 : 1;
    const pa = PRIO_ORDER[a.priority] ?? 4;
    const pb = PRIO_ORDER[b.priority] ?? 4;
    if (pa !== pb) return pa - pb;
    return (
      (a.targetDate ?? "9999-12-31").localeCompare(
        b.targetDate ?? "9999-12-31",
      ) || a.updatedAt.localeCompare(b.updatedAt) * -1
    );
  });

  return NextResponse.json({
    issues: collected,
    counts: {
      total: collected.length,
      dueToday: collected.filter((x) => x.dueToday).length,
      overdue: collected.filter((x) => x.overdue).length,
    },
    me: { id: me.id, displayName: me.displayName, email: me.email },
  });
}
