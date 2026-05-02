"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import {
  ChevronRight,
  ExternalLink,
  Filter,
  Kanban,
  LayoutGrid,
  List,
  ListChecks,
  Loader2,
  FileUp,
  Plus,
  RefreshCw,
  Calendar,
  Map as MapIcon,
  PanelLeft,
  PanelLeftClose,
  Search,
  Star,
  Trash2,
  X,
  Settings as SettingsIcon,
} from "lucide-react";
import { PaneHeader } from "@/components/ui/ThreePaneLayout";
import { useIsNarrowScreen } from "@/lib/use-is-narrow-screen";
import { RecordList } from "@/components/ui/RecordList";
import { useT } from "@/components/LocaleProvider";
import type { Messages } from "@/lib/i18n/messages";
import type { WorkspaceId } from "@/lib/workspaces";
import type {
  CycleSummary,
  IssueLabel,
  IssuePriority,
  IssueState,
  IssueSummary,
  ProjectSummary,
  WorkspaceMember,
} from "@/lib/projects/types";
import { ImportIssuesModal } from "./ImportIssuesModal";
import { JiraBoard } from "./jira/Board";
import { JiraBacklog } from "./jira/Backlog";
import { JiraSprints } from "./jira/Sprints";
import { JiraRoadmap } from "./jira/Roadmap";
import { IssueDrawer } from "./jira/IssueDrawer";
import {
  EMPTY_FILTER,
  IssueCard,
  PRIORITY_I18N,
  PRIORITY_ORDER,
  applyFilter,
  type IssueFilter,
} from "./jira/shared";

type ProjectMeta = {
  states: IssueState[];
  labels: IssueLabel[];
  members: WorkspaceMember[];
};

type ViewMode = "board" | "backlog" | "sprints" | "roadmap" | "list";

const VIEW_TABS: {
  id: ViewMode;
  labelKey: keyof Messages;
  fallback: string;
  icon: React.ElementType;
}[] = [
  { id: "board", labelKey: "projects.view.board", fallback: "Board", icon: LayoutGrid },
  { id: "backlog", labelKey: "projects.view.backlog", fallback: "Backlog", icon: ListChecks },
  { id: "sprints", labelKey: "projects.view.sprints", fallback: "Sprints", icon: Calendar },
  { id: "roadmap", labelKey: "projects.view.roadmap", fallback: "Roadmap", icon: MapIcon },
  { id: "list", labelKey: "projects.view.list", fallback: "List", icon: List },
];

/**
 * Jira-like ProjectsClient. The shell hosts a project list on the left, a
 * tabbed view area in the middle (Board/Backlog/Sprints/Roadmap/List) and a
 * right-side issue drawer that opens when an issue is selected.
 *
 * All data is fetched per-project on demand. Cycles are loaded eagerly with
 * issues so the Backlog/Sprints/Roadmap views always have what they need.
 */
export function ProjectsClient({
  workspaceId,
  workspaceName,
  accent,
}: {
  workspaceId: WorkspaceId;
  workspaceName: string;
  accent: string;
}) {
  const t = useT();
  const isNarrow = useIsNarrowScreen();
  const apiUrl = useCallback(
    (path: string): string => {
      const sep = path.includes("?") ? "&" : "?";
      // Already has ws? respect it.
      if (/[?&]ws=/.test(path)) return path;
      return `${path}${sep}ws=${workspaceId}`;
    },
    [workspaceId],
  );

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState("");

  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [cycles, setCycles] = useState<CycleSummary[]>([]);
  const [issuesLoading, setIssuesLoading] = useState(false);
  const [issuesError, setIssuesError] = useState<string | null>(null);

  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [metaLoading, setMetaLoading] = useState(false);

  const [view, setView] = useState<ViewMode>("board");
  const [filter, setFilter] = useState<IssueFilter>(EMPTY_FILTER);
  const [showFilter, setShowFilter] = useState(false);

  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [showNewIssue, setShowNewIssue] = useState(false);
  const newIssueRef = useRef<HTMLInputElement>(null);

  const [showImport, setShowImport] = useState(false);

  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(`projects:${workspaceId}:sidebar-collapsed`) === "1";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(
        `projects:${workspaceId}:sidebar-collapsed`,
        sidebarCollapsed ? "1" : "0",
      );
    } catch {
      // ignore
    }
  }, [sidebarCollapsed, workspaceId]);

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    setProjectsError(null);
    try {
      const r = await fetch(apiUrl(`/api/projects/projects`), {
        cache: "no-store",
      });
      const j = (await r.json()) as { projects?: ProjectSummary[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      const list = j.projects ?? [];
      setProjects(list);

      const params =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search)
          : null;
      const wantP = params?.get("project")?.trim() ?? "";
      const wantI = params?.get("issue")?.trim() ?? "";

      if (wantP && list.some((p) => p.id === wantP)) {
        setSelectedProjectId(wantP);
        if (wantI) setSelectedIssueId(wantI);
        const url = new URL(window.location.href);
        url.searchParams.delete("project");
        url.searchParams.delete("issue");
        const qs = url.searchParams.toString();
        window.history.replaceState({}, "", url.pathname + (qs ? `?${qs}` : ""));
      } else if (list.length > 0) {
        setSelectedProjectId((cur) =>
          cur && list.some((p) => p.id === cur) ? cur : list[0].id,
        );
      } else {
        setSelectedProjectId(null);
      }
    } catch (e) {
      setProjectsError(e instanceof Error ? e.message : String(e));
    } finally {
      setProjectsLoading(false);
    }
  }, [apiUrl]);

  const loadProjectData = useCallback(
    async (projectId: string) => {
      setIssuesLoading(true);
      setIssuesError(null);
      setMetaLoading(true);
      try {
        const [issuesRes, metaRes, cyclesRes] = await Promise.all([
          fetch(apiUrl(`/api/projects/issues?project=${projectId}`), {
            cache: "no-store",
          }),
          fetch(apiUrl(`/api/projects/states?project=${projectId}`), {
            cache: "no-store",
          }),
          fetch(apiUrl(`/api/projects/cycles?project=${projectId}`), {
            cache: "no-store",
          }),
        ]);
        const issuesJson = (await issuesRes.json()) as {
          issues?: IssueSummary[];
          error?: string;
        };
        const metaJson = (await metaRes.json()) as ProjectMeta & {
          error?: string;
        };
        const cyclesJson = (await cyclesRes.json()) as {
          cycles?: CycleSummary[];
          error?: string;
        };
        if (!issuesRes.ok) throw new Error(issuesJson.error ?? `HTTP ${issuesRes.status}`);
        if (!metaRes.ok) throw new Error(metaJson.error ?? `HTTP ${metaRes.status}`);
        if (!cyclesRes.ok) {
          // Cycles can be missing on older Plane installs; degrade gracefully.
          console.warn("[ProjectsClient] cycles fetch failed:", cyclesJson.error);
        }
        setIssues(issuesJson.issues ?? []);
        setCycles(cyclesJson.cycles ?? []);
        setMeta({
          states: metaJson.states ?? [],
          labels: metaJson.labels ?? [],
          members: metaJson.members ?? [],
        });
        setSelectedIssueId(null);
      } catch (e) {
        setIssuesError(e instanceof Error ? e.message : String(e));
        setIssues([]);
        setCycles([]);
        setMeta(null);
      } finally {
        setIssuesLoading(false);
        setMetaLoading(false);
      }
    },
    [apiUrl],
  );

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (selectedProjectId) void loadProjectData(selectedProjectId);
    else {
      setIssues([]);
      setCycles([]);
      setMeta(null);
      setSelectedIssueId(null);
    }
  }, [selectedProjectId, loadProjectData]);

  /* ── Memos ─────────────────────────────────────────────────── */

  const stateById = useMemo(() => {
    const map = new Map<string, IssueState>();
    if (meta?.states) for (const s of meta.states) map.set(s.id, s);
    return map;
  }, [meta]);

  const memberById = useMemo(() => {
    const map = new Map<string, WorkspaceMember>();
    if (meta?.members) for (const m of meta.members) map.set(m.id, m);
    return map;
  }, [meta]);

  const labelById = useMemo(() => {
    const map = new Map<string, IssueLabel>();
    if (meta?.labels) for (const l of meta.labels) map.set(l.id, l);
    return map;
  }, [meta]);

  const filteredProjects = useMemo(() => {
    if (!projectFilter.trim()) return projects;
    const q = projectFilter.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.identifier.toLowerCase().includes(q),
    );
  }, [projects, projectFilter]);

  const filteredIssues = useMemo(
    () =>
      [...applyFilter(issues, filter)].sort((a, b) => {
        const pa = PRIORITY_ORDER.indexOf(a.priority);
        const pb = PRIORITY_ORDER.indexOf(b.priority);
        if (pa !== pb) return pa - pb;
        return b.updatedAt.localeCompare(a.updatedAt);
      }),
    [issues, filter],
  );

  /** Direkte Kinder pro Parent (Plane) — aus dem vollen Issue-Set, auch wenn die Filterliste schmaler ist. */
  const subCountByParent = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of issues) {
      if (i.parent) m.set(i.parent, (m.get(i.parent) ?? 0) + 1);
    }
    return m;
  }, [issues]);

  /** Board / Sprint-Spalten: nur Top-Level wie in Jira kein Doppel mit Subtasks in der Spalte. */
  const boardIssues = useMemo(
    () => filteredIssues.filter((i) => !i.parent),
    [filteredIssues],
  );

  const selectedProject = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectedIssue = useMemo(
    () => issues.find((i) => i.id === selectedIssueId) ?? null,
    [issues, selectedIssueId],
  );

  /* ── Mutations ─────────────────────────────────────────────── */

  const onCreateProject = useCallback(async () => {
    const name = window.prompt(t("projects.prompt.newProjectName"))?.trim();
    if (!name) return;
    const identifier =
      window
        .prompt(
          t("projects.prompt.projectKey"),
          name.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5),
        )
        ?.trim()
        .toUpperCase() ?? "";
    setBusy(true);
    try {
      const r = await fetch(apiUrl(`/api/projects/projects`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, identifier: identifier || undefined }),
      });
      const j = (await r.json()) as { project?: ProjectSummary; error?: string };
      if (!r.ok || !j.project) throw new Error(j.error ?? `HTTP ${r.status}`);
      await loadProjects();
      setSelectedProjectId(j.project.id);
    } catch (e) {
      alert(t("projects.alert.createProject") + (e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [loadProjects, apiUrl, t]);

  const onDeleteProject = useCallback(
    async (project: ProjectSummary) => {
      if (!window.confirm(t("projects.delete.confirm"))) return;
      setBusy(true);
      try {
        const r = await fetch(
          apiUrl(
            `/api/projects/projects?project=${encodeURIComponent(project.id)}`,
          ),
          { method: "DELETE" },
        );
        const j = (await r.json().catch(() => ({}))) as { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        setProjects((cur) => {
          const next = cur.filter((p) => p.id !== project.id);
          setSelectedProjectId((sel) =>
            sel === project.id ? next[0]?.id ?? null : sel,
          );
          return next;
        });
      } catch (e) {
        alert(
          t("projects.delete.failed") +
            (e instanceof Error ? e.message : String(e)),
        );
      } finally {
        setBusy(false);
      }
    },
    [apiUrl, t],
  );

  const onCreateIssue = useCallback(
    async (name: string) => {
      if (!selectedProjectId) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      setBusy(true);
      try {
        const r = await fetch(
          apiUrl(`/api/projects/issues?project=${selectedProjectId}`),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          },
        );
        const j = (await r.json()) as { issue?: IssueSummary; error?: string };
        if (!r.ok || !j.issue) throw new Error(j.error ?? `HTTP ${r.status}`);
        setIssues((cur) => [j.issue!, ...cur]);
        setSelectedIssueId(j.issue.id);
        setShowNewIssue(false);
      } catch (e) {
        alert(t("projects.alert.createIssue") + (e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    },
    [selectedProjectId, apiUrl, t],
  );

  /**
   * Variant of `onCreateIssue` used by the Board's per-column composer.
   * Creates the issue and immediately PATCHes it onto the column's state so
   * it lands in the correct Kanban column without a manual drag.
   */
  const onCreateIssueWithState = useCallback(
    async (name: string, stateId: string | null) => {
      if (!selectedProjectId) return;
      const trimmed = name.trim();
      if (!trimmed) return;
      try {
        const r = await fetch(
          apiUrl(`/api/projects/issues?project=${selectedProjectId}`),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ name: trimmed }),
          },
        );
        const j = (await r.json()) as { issue?: IssueSummary; error?: string };
        if (!r.ok || !j.issue) throw new Error(j.error ?? `HTTP ${r.status}`);
        let created = j.issue;
        if (stateId && created.state !== stateId) {
          const r2 = await fetch(
            apiUrl(
              `/api/projects/issue/${created.id}?project=${selectedProjectId}`,
            ),
            {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ state: stateId }),
            },
          );
          const j2 = (await r2.json()) as { issue?: IssueSummary };
          if (j2.issue) created = j2.issue;
        }
        setIssues((cur) => [created, ...cur]);
      } catch (e) {
        alert(t("projects.alert.createIssue") + (e instanceof Error ? e.message : e));
      }
    },
    [selectedProjectId, apiUrl, t],
  );

  const onUpdateIssue = useCallback(
    async (issueId: string, patch: Partial<IssueSummary>) => {
      if (!selectedProjectId) return;
      setIssues((cur) => cur.map((i) => (i.id === issueId ? { ...i, ...patch } : i)));
      try {
        const r = await fetch(
          apiUrl(
            `/api/projects/issue/${issueId}?project=${selectedProjectId}`,
          ),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              name: patch.name,
              descriptionHtml: patch.descriptionHtml,
              state: patch.state,
              priority: patch.priority,
              assignees: patch.assignees,
              labels: patch.labels,
              parent: patch.parent,
              estimatePoint: patch.estimatePoint,
              startDate: patch.startDate,
              targetDate: patch.targetDate,
            }),
          },
        );
        const j = (await r.json()) as { issue?: IssueSummary; error?: string };
        if (!r.ok || !j.issue) throw new Error(j.error ?? `HTTP ${r.status}`);
        setIssues((cur) => cur.map((i) => (i.id === issueId ? j.issue! : i)));
      } catch (e) {
        alert(t("projects.alert.saveIssue") + (e instanceof Error ? e.message : e));
        if (selectedProjectId) void loadProjectData(selectedProjectId);
      }
    },
    [selectedProjectId, apiUrl, loadProjectData, t],
  );

  const onDeleteIssue = useCallback(
    async (issueId: string) => {
      if (!selectedProjectId) return;
      if (!window.confirm(t("projects.alert.deleteIssueConfirm"))) return;
      setBusy(true);
      try {
        const r = await fetch(
          apiUrl(
            `/api/projects/issue/${issueId}?project=${selectedProjectId}`,
          ),
          { method: "DELETE" },
        );
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        setIssues((cur) => cur.filter((i) => i.id !== issueId));
        setSelectedIssueId(null);
      } catch (e) {
        alert(t("projects.alert.deleteIssue") + (e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    },
    [selectedProjectId, apiUrl, t],
  );

  /* ── Cycle mutations ──────────────────────────────────────── */

  const onAddIssuesToCycle = useCallback(
    async (cycleId: string, issueIds: string[]) => {
      if (!selectedProjectId) return;
      try {
        const r = await fetch(
          apiUrl(
            `/api/projects/cycle/${cycleId}/issues?project=${selectedProjectId}`,
          ),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ issueIds }),
          },
        );
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        setIssues((cur) =>
          cur.map((i) =>
            issueIds.includes(i.id) ? { ...i, cycle: cycleId } : i,
          ),
        );
      } catch (e) {
        alert(
          t("projects.alert.cycleAssign") +
            (e instanceof Error ? e.message : e),
        );
      }
    },
    [selectedProjectId, apiUrl, t],
  );

  const onCreateCycle = useCallback(
    async (input: { name: string; startDate: string; endDate: string }) => {
      if (!selectedProjectId) return;
      try {
        const r = await fetch(
          apiUrl(`/api/projects/cycles?project=${selectedProjectId}`),
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const j = (await r.json()) as { cycle?: CycleSummary; error?: string };
        if (!r.ok || !j.cycle) throw new Error(j.error ?? `HTTP ${r.status}`);
        setCycles((cur) => [...cur, j.cycle!]);
      } catch (e) {
        alert(
          t("projects.alert.createCycle") +
            (e instanceof Error ? e.message : e),
        );
      }
    },
    [selectedProjectId, apiUrl, t],
  );

  const onUpdateCycle = useCallback(
    async (
      cycleId: string,
      input: {
        name?: string;
        startDate?: string | null;
        endDate?: string | null;
      },
    ) => {
      if (!selectedProjectId) return;
      // optimistic
      setCycles((cur) =>
        cur.map((c) =>
          c.id === cycleId
            ? {
                ...c,
                name: input.name ?? c.name,
                startDate:
                  input.startDate === undefined ? c.startDate : input.startDate,
                endDate:
                  input.endDate === undefined ? c.endDate : input.endDate,
              }
            : c,
        ),
      );
      try {
        const r = await fetch(
          apiUrl(
            `/api/projects/cycle/${cycleId}?project=${selectedProjectId}`,
          ),
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(input),
          },
        );
        const j = (await r.json()) as { cycle?: CycleSummary; error?: string };
        if (!r.ok || !j.cycle) throw new Error(j.error ?? `HTTP ${r.status}`);
        setCycles((cur) => cur.map((c) => (c.id === cycleId ? j.cycle! : c)));
      } catch (e) {
        alert(
          t("projects.alert.saveCycle") +
            (e instanceof Error ? e.message : e),
        );
        if (selectedProjectId) void loadProjectData(selectedProjectId);
      }
    },
    [selectedProjectId, apiUrl, loadProjectData, t],
  );

  const onDeleteCycle = useCallback(
    async (cycleId: string) => {
      if (!selectedProjectId) return;
      try {
        const r = await fetch(
          apiUrl(
            `/api/projects/cycle/${cycleId}?project=${selectedProjectId}`,
          ),
          { method: "DELETE" },
        );
        if (!r.ok) {
          const j = (await r.json().catch(() => ({}))) as { error?: string };
          throw new Error(j.error ?? `HTTP ${r.status}`);
        }
        setCycles((cur) => cur.filter((c) => c.id !== cycleId));
        setIssues((cur) =>
          cur.map((i) => (i.cycle === cycleId ? { ...i, cycle: null } : i)),
        );
      } catch (e) {
        alert(
          t("projects.alert.deleteCycle") +
            (e instanceof Error ? e.message : e),
        );
      }
    },
    [selectedProjectId, apiUrl, t],
  );

  /* ── Render ───────────────────────────────────────────────── */

  const projectListPane = sidebarCollapsed ? (
    <aside className="shrink-0 w-[44px] max-md:w-full max-md:flex-row max-md:flex-wrap max-md:justify-start max-md:items-center max-md:gap-1 max-md:py-1.5 max-md:px-2 max-md:min-h-[44px] max-md:overflow-x-auto border-r border-stroke-1 max-md:border-r-0 max-md:border-b bg-bg-chrome flex flex-col md:flex-col min-h-0 md:items-center md:py-2 md:gap-1 touch-manipulation">
      <button
        type="button"
        onClick={() => setSidebarCollapsed(false)}
        title={t("projects.sidebar.expand")}
        className="w-8 h-8 shrink-0 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-elevated min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
      >
        <PanelLeft size={14} />
      </button>
      <div className="hidden md:block w-7 border-t border-stroke-1 my-1" />
      {filteredProjects.slice(0, 12).map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setSelectedProjectId(p.id)}
          title={p.name}
          className={`w-8 h-8 shrink-0 rounded flex items-center justify-center text-[10.5px] font-semibold min-h-[44px] min-w-[44px] md:min-h-[32px] md:min-w-[32px] ${
            selectedProjectId === p.id ? "ring-2" : ""
          }`}
          style={{
            background: accent,
            color: "white",
            ...(selectedProjectId === p.id ? { boxShadow: `0 0 0 2px ${accent}` } : {}),
          }}
        >
          {(p.emoji || p.identifier.slice(0, 2) || "P").toString().slice(0, 2)}
        </button>
      ))}
    </aside>
  ) : (
    <aside className="shrink-0 w-[240px] max-md:w-full max-md:max-h-[min(40vh,320px)] max-md:min-h-0 max-md:border-r-0 max-md:border-b border-stroke-1 bg-bg-chrome flex flex-col min-h-0 touch-manipulation">
      <PaneHeader
        title={t("nav.projects")}
        subtitle={workspaceName}
        accent={accent}
        icon={<Kanban size={14} style={{ color: accent }} />}
        right={
          <>
            <button
              type="button"
              onClick={() => void loadProjects()}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("common.refresh")}
            >
              <RefreshCw size={13} />
            </button>
            <button
              type="button"
              onClick={onCreateProject}
              disabled={busy}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary disabled:opacity-50"
              title={t("projects.newProject")}
            >
              <Plus size={13} />
            </button>
            <a
              href={`/${workspaceId}/projects/plane`}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("projects.link.planeHubTitle")}
            >
              <ExternalLink size={13} />
            </a>
            <Link
              href={`/${workspaceId}/projects/settings`}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("common.settings")}
            >
              <SettingsIcon size={13} />
            </Link>
            <button
              type="button"
              onClick={() => setSidebarCollapsed(true)}
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("common.close")}
            >
              <PanelLeftClose size={13} />
            </button>
          </>
        }
      >
        <div className="relative">
          <Search
            size={12}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
          />
          <input
            type="search"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
            placeholder={t("common.search")}
            className="w-full bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1.5 text-[11.5px] outline-none focus:border-stroke-2"
          />
        </div>
      </PaneHeader>
      {projectsError && (
        <div className="p-3">
          <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] p-2">
            {projectsError}
          </div>
        </div>
      )}
      <RecordList
        accent={accent}
        loading={projectsLoading}
        items={filteredProjects.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: p.description || `${p.identifier}`,
          meta: p.totalIssues != null ? String(p.totalIssues) : undefined,
          leading: (
            <span
              className="inline-flex items-center justify-center w-6 h-6 rounded text-[10.5px] font-semibold text-white"
              style={{ background: accent }}
            >
              {(p.emoji || p.identifier.slice(0, 2) || "P").toString().slice(0, 2)}
            </span>
          ),
          trailing: (
            <button
              type="button"
              disabled={busy}
              onClick={() => void onDeleteProject(p)}
              className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-rose-400 disabled:opacity-40"
              title={t("projects.delete.action")}
            >
              <Trash2 size={13} aria-hidden />
            </button>
          ),
        }))}
        selectedId={selectedProjectId}
        onSelect={setSelectedProjectId}
        emptyHint={t("projects.empty.list")}
      />
    </aside>
  );

  const currentViewTab = VIEW_TABS.find((tab) => tab.id === view);
  const currentViewLabel = currentViewTab
    ? t(currentViewTab.labelKey, currentViewTab.fallback)
    : t("projects.view.board");

  const viewToolbar = (
    <header className="shrink-0 flex flex-col gap-2 px-3 py-2 border-b border-stroke-1 bg-bg-chrome touch-manipulation min-w-0">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-text-tertiary min-w-0">
        <span className="hover:text-text-primary cursor-default shrink-0">
          {t("projects.crumb.projects")}
        </span>
        {selectedProject && (
          <>
            <ChevronRight size={11} className="opacity-60 shrink-0" />
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded text-[8.5px] font-bold text-white shrink-0"
              style={{ background: accent }}
            >
              {(selectedProject.emoji || selectedProject.identifier.slice(0, 1) || "P")
                .toString()
                .slice(0, 1)}
            </span>
            <span className="text-text-secondary font-medium truncate max-w-[min(100%,14rem)] md:max-w-none">
              {selectedProject.name}
            </span>
            <ChevronRight size={11} className="opacity-60 shrink-0" />
            <span className="text-text-primary shrink-0">{currentViewLabel}</span>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <h1 className="text-[15px] font-semibold leading-tight text-text-primary min-w-0 flex-1 basis-[min(100%,12rem)] truncate">
          {selectedProject
            ? `${selectedProject.identifier} ${currentViewLabel}`
            : t("projects.crumb.projects")}
        </h1>
        {selectedProject && (
          <button
            type="button"
            className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-amber-400 shrink-0 max-md:min-h-[44px] max-md:min-w-[44px] max-md:inline-flex max-md:items-center max-md:justify-center touch-manipulation"
            title={t("projects.starTooltip")}
          >
            <Star size={13} />
          </button>
        )}
        {selectedProject && (
          <span className="text-[10.5px] text-text-tertiary tabular-nums shrink-0">
            {t("projects.count.issuesShown")
              .replace("{filtered}", String(filteredIssues.length))
              .replace("{total}", String(issues.length))}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-1 justify-end w-full md:w-auto md:ml-auto">
          {selectedProject && (
            <button
              type="button"
              onClick={() => {
                setShowNewIssue(true);
                setTimeout(() => newIssueRef.current?.focus(), 30);
              }}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11.5px] disabled:opacity-50 max-md:min-h-[44px] touch-manipulation"
              style={{ background: accent }}
              title="Neues Issue"
            >
              <Plus size={12} /> Issue
            </button>
          )}
          {selectedProject && (
            <button
              type="button"
              onClick={() => setShowImport(true)}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px] disabled:opacity-50 max-md:min-h-[44px] touch-manipulation"
              title={t("projects.import.title")}
            >
              <FileUp size={11} />
              {t("projects.import")}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              selectedProjectId && void loadProjectData(selectedProjectId)
            }
            className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary max-md:min-h-[44px] max-md:min-w-[44px] max-md:inline-flex max-md:items-center max-md:justify-center touch-manipulation"
            title={t("projects.reloadTooltip")}
          >
            <RefreshCw size={13} />
          </button>
          <a
            href={`/api/plane/sso?ws=${workspaceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px] max-md:min-h-[44px] touch-manipulation"
            title={t("projects.openPlaneTooltip")}
          >
            <ExternalLink size={11} />
            Plane
          </a>
        </div>
      </div>
      {selectedProject && (
        <>
          <div className="flex flex-col gap-2 min-w-0 md:flex-row md:items-center md:gap-1">
            <div className="flex gap-1 overflow-x-auto overscroll-x-contain touch-pan-x [-webkit-overflow-scrolling:touch] py-0.5 -mx-1 px-1 min-w-0 md:flex-1 md:overflow-visible md:flex-wrap">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = view === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-md touch-manipulation max-md:min-h-[40px] ${
                    isActive
                      ? "text-white"
                      : "text-text-tertiary hover:text-text-primary hover:bg-bg-overlay"
                  }`}
                  style={isActive ? { background: accent } : undefined}
                >
                  <Icon size={12} />
                  {t(tab.labelKey, tab.fallback)}
                </button>
              );
            })}
            </div>

            <div className="flex flex-wrap items-center gap-1 shrink-0 justify-end md:ml-auto">
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-text-quaternary"
                />
                <input
                  type="search"
                  value={filter.query}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, query: e.target.value }))
                  }
                  placeholder={t("projects.searchIssues")}
                  className="bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1 text-[11.5px] outline-none focus:border-stroke-2 w-full min-w-[10rem] max-md:min-h-[40px] sm:w-48"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilter((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] touch-manipulation max-md:min-h-[40px] ${
                  showFilter ||
                  filter.priorities.length > 0 ||
                  filter.assignees.length > 0 ||
                  filter.labels.length > 0
                    ? "border-stroke-2 text-text-primary"
                    : "border-stroke-1 text-text-tertiary hover:text-text-primary"
                }`}
              >
                <Filter size={11} />
                {t("common.filter")}
                {(filter.priorities.length +
                  filter.assignees.length +
                  filter.labels.length) > 0 && (
                  <span
                    className="ml-1 px-1 rounded-full text-[9.5px] text-white"
                    style={{ background: accent }}
                  >
                    {filter.priorities.length +
                      filter.assignees.length +
                      filter.labels.length}
                  </span>
                )}
              </button>
            </div>
          </div>
          {showFilter && (
            <FilterBar
              filter={filter}
              onChange={setFilter}
              members={meta?.members ?? []}
              labels={meta?.labels ?? []}
            />
          )}
        </>
      )}
    </header>
  );

  let viewContent: React.ReactNode = null;
  if (!selectedProject && !projectsLoading) {
    viewContent = (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-[12.5px]">
        {t("projects.empty.pickSidebar")}
      </div>
    );
  } else if (issuesError) {
    viewContent = (
      <div className="p-3">
        <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[12px] p-3 whitespace-pre-wrap">
          {issuesError}
        </div>
      </div>
    );
  } else if (issuesLoading || metaLoading || !meta) {
    viewContent = (
      <div className="flex-1 flex items-center justify-center text-text-tertiary text-[12.5px]">
        <Loader2 size={16} className="spin mr-2" /> {t("projects.loadingInline")}
      </div>
    );
  } else if (view === "board") {
    viewContent = (
      <JiraBoard
        issues={boardIssues}
        subCountByParent={subCountByParent}
        states={meta.states}
        members={memberById}
        labels={labelById}
        identifier={selectedProject?.identifier ?? ""}
        cycles={cycles}
        selectedIssueId={selectedIssueId}
        onSelectIssue={setSelectedIssueId}
        onMoveIssue={(id, stateId) => onUpdateIssue(id, { state: stateId })}
        onCreateIssue={(name, stateId) =>
          void onCreateIssueWithState(name, stateId)
        }
        accent={accent}
        quickFilterAssignees={filter.assignees}
        onQuickFilterToggle={(id) =>
          setFilter((f) => ({
            ...f,
            assignees: f.assignees.includes(id)
              ? f.assignees.filter((x) => x !== id)
              : [...f.assignees, id],
          }))
        }
      />
    );
  } else if (view === "backlog") {
    viewContent = (
      <JiraBacklog
        issues={filteredIssues}
        cycles={cycles}
        states={meta.states}
        members={memberById}
        labels={labelById}
        identifier={selectedProject?.identifier ?? ""}
        selectedIssueId={selectedIssueId}
        onSelectIssue={setSelectedIssueId}
        onAddIssuesToCycle={onAddIssuesToCycle}
        onCreateIssue={onCreateIssue}
        onUpdateCycle={onUpdateCycle}
        accent={accent}
      />
    );
  } else if (view === "sprints") {
    viewContent = (
      <JiraSprints
        cycles={cycles}
        issues={issues}
        subCountByParent={subCountByParent}
        states={meta.states}
        members={memberById}
        labels={labelById}
        identifier={selectedProject?.identifier ?? ""}
        selectedIssueId={selectedIssueId}
        onSelectIssue={setSelectedIssueId}
        onMoveIssue={(id, stateId) => onUpdateIssue(id, { state: stateId })}
        onCreateCycle={onCreateCycle}
        onUpdateCycle={onUpdateCycle}
        onDeleteCycle={onDeleteCycle}
        accent={accent}
      />
    );
  } else if (view === "roadmap") {
    viewContent = (
      <JiraRoadmap
        cycles={cycles}
        issues={issues}
        states={meta.states}
        onUpdateCycle={onUpdateCycle}
        accent={accent}
      />
    );
  } else if (view === "list") {
    viewContent = (
      <ListView
        issues={filteredIssues}
        subCountByParent={subCountByParent}
        identifier={selectedProject?.identifier ?? ""}
        states={stateById}
        members={memberById}
        labels={labelById}
        selectedIssueId={selectedIssueId}
        onSelectIssue={setSelectedIssueId}
      />
    );
  }

  return (
    <div className="flex flex-col md:flex-row h-full min-h-0 bg-bg-base text-text-primary text-[13px] overflow-hidden touch-manipulation">
      {projectListPane}
      <section className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden">
        {viewToolbar}
        {showNewIssue && selectedProject && (
          <div className="px-3 py-2 border-b border-stroke-1 bg-bg-elevated flex items-center gap-2">
            <input
              ref={newIssueRef}
              type="text"
              placeholder={t("projects.issueRow.placeholder")}
              className="flex-1 bg-transparent border border-stroke-1 rounded-md px-2 py-1.5 text-[12px] outline-none focus:border-stroke-2"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void onCreateIssue((e.target as HTMLInputElement).value);
                } else if (e.key === "Escape") {
                  setShowNewIssue(false);
                }
              }}
            />
            <button
              type="button"
              className="text-[11px] text-text-tertiary px-2 py-1 hover:text-text-primary"
              onClick={() => setShowNewIssue(false)}
            >
              <X size={12} />
            </button>
          </div>
        )}
        {viewContent}
      </section>
      {selectedIssue && meta && (
        <div
          className={
            isNarrow
              ? "fixed inset-0 z-[55] flex flex-col min-h-0 bg-bg-base pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
              : "hidden md:flex w-[min(640px,46vw)] shrink-0 min-h-0 flex-col max-w-[640px]"
          }
        >
          <IssueDrawer
            issue={selectedIssue}
            states={meta.states}
            labels={meta.labels}
            members={meta.members}
            cycles={cycles}
            allIssues={issues}
            memberById={memberById}
            labelById={labelById}
            stateById={stateById}
            identifier={selectedProject?.identifier ?? ""}
            workspaceId={workspaceId}
            projectId={selectedProjectId!}
            accent={accent}
            apiUrl={apiUrl}
            onUpdate={(patch) => onUpdateIssue(selectedIssue.id, patch)}
            onDelete={() => onDeleteIssue(selectedIssue.id)}
            onClose={() => setSelectedIssueId(null)}
            onSelectIssue={setSelectedIssueId}
            onIssuesRefresh={() => {
              if (selectedProjectId) void loadProjectData(selectedProjectId);
            }}
          />
        </div>
      )}
      {showImport && selectedProjectId && (
        <ImportIssuesModal
          workspaceId={workspaceId}
          projectId={selectedProjectId}
          accent={accent}
          onClose={() => setShowImport(false)}
          onImported={() => {
            void loadProjectData(selectedProjectId);
          }}
        />
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                          Helpers                                    */
/* ----------------------------------------------------------------- */

function FilterBar({
  filter,
  onChange,
  members,
  labels,
}: {
  filter: IssueFilter;
  onChange: (f: IssueFilter) => void;
  members: WorkspaceMember[];
  labels: IssueLabel[];
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <FilterChips
        label={t("projects.filter.priorityLabel")}
        options={PRIORITY_ORDER.map((p) => ({ id: p, label: t(PRIORITY_I18N[p]) }))}
        selected={filter.priorities as string[]}
        onChange={(next) =>
          onChange({ ...filter, priorities: next as IssuePriority[] })
        }
      />
      <FilterChips
        label={t("projects.filter.assigneeLabel")}
        options={members.map((m) => ({ id: m.id, label: m.displayName }))}
        selected={filter.assignees}
        onChange={(next) => onChange({ ...filter, assignees: next })}
      />
      <FilterChips
        label={t("projects.filter.labelsHeading")}
        options={labels.map((l) => ({ id: l.id, label: l.name, color: l.color }))}
        selected={filter.labels}
        onChange={(next) => onChange({ ...filter, labels: next })}
      />
      {(filter.priorities.length ||
        filter.assignees.length ||
        filter.labels.length) > 0 && (
        <button
          type="button"
          onClick={() =>
            onChange({ ...EMPTY_FILTER, query: filter.query })
          }
          className="text-[10.5px] text-text-tertiary hover:text-text-primary underline"
        >
          {t("projects.filter.reset")}
        </button>
      )}
    </div>
  );
}

function FilterChips({
  label,
  options,
  selected,
  onChange,
}: {
  label: string;
  options: { id: string; label: string; color?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1">
      <span className="text-[10.5px] text-text-tertiary">{label}:</span>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => {
          const sel = selected.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              onClick={() =>
                onChange(
                  sel ? selected.filter((x) => x !== o.id) : [...selected, o.id],
                )
              }
              className={`inline-flex items-center gap-1 px-1.5 py-[3px] max-md:py-1.5 max-md:min-h-[36px] rounded-full border text-[10px] touch-manipulation ${
                sel
                  ? "border-transparent bg-bg-elevated text-text-primary"
                  : "border-stroke-1 text-text-tertiary hover:text-text-primary"
              }`}
              style={
                o.color && sel
                  ? { background: o.color + "26", color: o.color }
                  : undefined
              }
            >
              {o.color && (
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: o.color }}
                />
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ListView({
  issues,
  subCountByParent,
  identifier,
  states,
  members,
  labels,
  selectedIssueId,
  onSelectIssue,
}: {
  issues: IssueSummary[];
  subCountByParent: Map<string, number>;
  identifier: string;
  states: Map<string, IssueState>;
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  selectedIssueId: string | null;
  onSelectIssue: (id: string) => void;
}) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-1.5">
      {issues.length === 0 ? (
        <p className="text-center text-text-tertiary text-[12px] py-12">
          Keine Issues mit diesem Filter.
        </p>
      ) : (
        issues.map((i) => (
          <IssueCard
            key={i.id}
            issue={i}
            identifier={identifier}
            state={states.get(i.state)}
            members={members}
            labels={labels}
            density="compact"
            selected={selectedIssueId === i.id}
            showStatus
            subIssueCount={subCountByParent.get(i.id) ?? 0}
            onClick={() => onSelectIssue(i.id)}
          />
        ))
      )}
    </div>
  );
}
