import "server-only";
import {
  PLANE_PUBLIC_BASE,
  PLANE_WORKSPACE_SLUG_BY_CORE,
  findWorkspaceMember,
} from "@/lib/plane";
import { tFor, type Locale } from "@/lib/i18n/messages";
import type { PulseModuleResult } from "./types";

const PLANE_BASE = PLANE_PUBLIC_BASE;
const ADMIN_TOKEN = process.env.PLANE_BRIDGE_API_TOKEN ?? "";

/**
 * Counts Plane issues assigned to this user that are due **on or before today**
 * across all projects of the resolved workspace. We use the admin API key to
 * impersonate-list, then filter to the user's member-id.
 */
export async function getTasksPulse(opts: {
  email: string;
  coreWorkspace: string;
  locale: Locale;
}): Promise<PulseModuleResult> {
  const { locale } = opts;
  const slug = PLANE_WORKSPACE_SLUG_BY_CORE[opts.coreWorkspace];
  if (!slug) {
    return { ok: false, error: `unknown workspace ${opts.coreWorkspace}` };
  }
  if (!ADMIN_TOKEN) {
    return { ok: false, error: "PLANE_BRIDGE_API_TOKEN not configured" };
  }

  try {
    const member = await findWorkspaceMember(slug, opts.email);
    if (!member) {
      return {
        ok: true,
        stats: [
          {
            key: "tasks-today",
            label: tFor(locale, "pulse.tasks.today"),
            value: "0",
            tone: "neutral",
            href: `/api/plane/sso?ws=${opts.coreWorkspace}`,
            hint: tFor(locale, "pulse.tasks.notInWorkspace").replace("{slug}", slug),
          },
        ],
      };
    }

    const projects = await listProjects(slug);
    if (projects.length === 0) {
      return {
        ok: true,
        stats: [
          {
            key: "tasks-today",
            label: tFor(locale, "pulse.tasks.today"),
            value: "0",
            tone: "neutral",
            href: `/api/plane/sso?ws=${opts.coreWorkspace}`,
            hint: tFor(locale, "pulse.tasks.noProjects"),
          },
        ],
      };
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    const memberId = member.id;

    let dueToday = 0;
    let assignedOpen = 0;

    await Promise.all(
      projects.map(async (project) => {
        const issues = await listProjectIssues(slug, project.id);
        for (const i of issues) {
          if (i.state_group === "completed" || i.state_group === "cancelled") continue;
          if (!i.assignee_ids?.includes(memberId)) continue;
          assignedOpen += 1;
          if (i.target_date && i.target_date <= today) dueToday += 1;
        }
      }),
    );

    return {
      ok: true,
      stats: [
        {
          key: "tasks-today",
          label: tFor(locale, "pulse.tasks.today"),
          value: String(dueToday),
          tone: dueToday > 0 ? "warning" : "success",
          href: `/api/plane/sso?ws=${opts.coreWorkspace}`,
          hint: tFor(locale, "pulse.tasks.openAssigned").replace("{n}", String(assignedOpen)),
        },
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg,
      fallbackStats: [
        {
          key: "tasks-today",
          label: tFor(locale, "pulse.tasks.today"),
          value: "—",
          tone: "neutral",
          href: `/api/plane/sso?ws=${opts.coreWorkspace}`,
          hint: tFor(locale, "pulse.tasks.apiUnreachable"),
        },
      ],
    };
  }
}

type PlaneProject = { id: string; name: string };
type PlaneIssue = {
  id: string;
  name?: string;
  target_date?: string | null;
  assignee_ids?: string[];
  state_group?: "backlog" | "unstarted" | "started" | "completed" | "cancelled";
};

async function listProjects(slug: string): Promise<PlaneProject[]> {
  const res = await fetch(`${PLANE_BASE}/api/v1/workspaces/${slug}/projects/`, {
    headers: { "X-API-Key": ADMIN_TOKEN },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`projects.list ${res.status}`);
  const data = (await res.json()) as { results?: PlaneProject[] } | PlaneProject[];
  return Array.isArray(data) ? data : (data.results ?? []);
}

async function listProjectIssues(slug: string, projectId: string): Promise<PlaneIssue[]> {
  const res = await fetch(
    `${PLANE_BASE}/api/v1/workspaces/${slug}/projects/${projectId}/issues/?per_page=100`,
    { headers: { "X-API-Key": ADMIN_TOKEN }, cache: "no-store" },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: PlaneIssue[] } | PlaneIssue[];
  return Array.isArray(data) ? data : (data.results ?? []);
}
