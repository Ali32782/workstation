import { NextRequest, NextResponse } from "next/server";
import { listCycles, listProjects } from "@/lib/projects/plane";
import { resolveProjectsSession } from "@/lib/projects/session";
import type { CycleSummary, ProjectSummary } from "@/lib/projects/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cross-project active-cycle feed for the Daily-Home dashboard.
 *
 * Iterates the workspace's projects (capped at 25) and surfaces each
 * project's currently-running cycle (Plane's term for sprint).  We pre-
 * compute progress + days-remaining in the response so the dashboard
 * card stays a thin renderer — keeps the React tree dumb and lets the
 * server cache mileage compound.
 */

type ActiveCycle = CycleSummary & {
  projectId: string;
  projectName: string;
  projectIdentifier: string;
  /** 0..1, computed from completed/total issues. */
  progress: number;
  /** Calendar days until end_date — negative when overdue. */
  daysRemaining: number | null;
  /** Plane URL convenience — keeps the client free of env wiring. */
  href: string;
};

const HARD_PROJECT_CAP = 25;
const PLANE_BASE_URL = (
  process.env.PLANE_BASE_URL ?? "https://plane.kineo360.work"
).replace(/\/$/, "");

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

  let projects: ProjectSummary[];
  try {
    projects = await listProjects(r.session.workspaceSlug);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const slug = r.session.workspaceSlug;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const collected: ActiveCycle[] = [];

  for (const p of projects.slice(0, HARD_PROJECT_CAP)) {
    let cycles: CycleSummary[] = [];
    try {
      cycles = await listCycles(slug, p.id);
    } catch (e) {
      console.warn(
        `[/api/projects/active-cycles] project ${p.identifier} failed:`,
        e instanceof Error ? e.message : e,
      );
      continue;
    }
    const active = cycles.find((c) => c.status === "current");
    if (!active) continue;

    const total = active.totalIssues ?? 0;
    const done = active.completedIssues ?? 0;
    const progress = total > 0 ? done / total : 0;

    let daysRemaining: number | null = null;
    if (active.endDate) {
      const end = new Date(active.endDate);
      end.setHours(0, 0, 0, 0);
      daysRemaining = Math.round(
        (end.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
      );
    }

    collected.push({
      ...active,
      projectId: p.id,
      projectName: p.name,
      projectIdentifier: p.identifier,
      progress,
      daysRemaining,
      href: `${PLANE_BASE_URL}/${slug}/projects/${p.id}/cycles/${active.id}`,
    });
  }

  // Sort by daysRemaining (overdue first, then ending-soonest), then
  // progress (lowest first — those need attention).
  collected.sort((a, b) => {
    const da = a.daysRemaining ?? 9999;
    const db = b.daysRemaining ?? 9999;
    if (da !== db) return da - db;
    return a.progress - b.progress;
  });

  return NextResponse.json({
    cycles: collected,
    counts: {
      total: collected.length,
      ending: collected.filter(
        (c) => c.daysRemaining !== null && c.daysRemaining <= 3,
      ).length,
    },
  });
}
