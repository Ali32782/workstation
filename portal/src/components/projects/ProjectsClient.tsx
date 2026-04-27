"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ChevronRight,
  ExternalLink,
  Filter,
  Kanban,
  LayoutGrid,
  List,
  ListChecks,
  Loader2,
  Plus,
  RefreshCw,
  Calendar,
  Map as MapIcon,
  PanelLeft,
  PanelLeftClose,
  Search,
  Star,
  X,
  Settings as SettingsIcon,
} from "lucide-react";
import { PaneHeader } from "@/components/ui/ThreePaneLayout";
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
import { JiraBoard } from "./jira/Board";
import { JiraBacklog } from "./jira/Backlog";
import { JiraSprints } from "./jira/Sprints";
import { JiraRoadmap } from "./jira/Roadmap";
import { IssueDrawer } from "./jira/IssueDrawer";
import {
  EMPTY_FILTER,
  IssueCard,
  PRIORITY_LABEL,
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
  { id: "list", labelKey: "projects.view.list", fallback: "Liste", icon: List },
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
      setProjects(j.projects ?? []);
      if ((j.projects?.length ?? 0) > 0) {
        setSelectedProjectId((cur) =>
          cur && j.projects!.some((p) => p.id === cur) ? cur : j.projects![0].id,
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
    const name = window.prompt("Name des neuen Projekts:")?.trim();
    if (!name) return;
    const identifier =
      window
        .prompt(
          "Kurzkennung (Großbuchstaben, max. 5 Zeichen — optional):",
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
      alert("Projekt anlegen fehlgeschlagen: " + (e instanceof Error ? e.message : e));
    } finally {
      setBusy(false);
    }
  }, [loadProjects, apiUrl]);

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
        alert("Issue anlegen fehlgeschlagen: " + (e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    },
    [selectedProjectId, apiUrl],
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
        alert(
          "Issue anlegen fehlgeschlagen: " + (e instanceof Error ? e.message : e),
        );
      }
    },
    [selectedProjectId, apiUrl],
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
        alert("Speichern fehlgeschlagen: " + (e instanceof Error ? e.message : e));
        if (selectedProjectId) void loadProjectData(selectedProjectId);
      }
    },
    [selectedProjectId, apiUrl, loadProjectData],
  );

  const onDeleteIssue = useCallback(
    async (issueId: string) => {
      if (!selectedProjectId) return;
      if (!window.confirm("Issue wirklich löschen?")) return;
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
        alert("Löschen fehlgeschlagen: " + (e instanceof Error ? e.message : e));
      } finally {
        setBusy(false);
      }
    },
    [selectedProjectId, apiUrl],
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
          "Sprint-Zuweisung fehlgeschlagen: " +
            (e instanceof Error ? e.message : e),
        );
      }
    },
    [selectedProjectId, apiUrl],
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
          "Sprint anlegen fehlgeschlagen: " +
            (e instanceof Error ? e.message : e),
        );
      }
    },
    [selectedProjectId, apiUrl],
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
          "Sprint speichern fehlgeschlagen: " +
            (e instanceof Error ? e.message : e),
        );
        if (selectedProjectId) void loadProjectData(selectedProjectId);
      }
    },
    [selectedProjectId, apiUrl, loadProjectData],
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
          "Sprint löschen fehlgeschlagen: " +
            (e instanceof Error ? e.message : e),
        );
      }
    },
    [selectedProjectId, apiUrl],
  );

  /* ── Render ───────────────────────────────────────────────── */

  const projectListPane = sidebarCollapsed ? (
    <aside className="shrink-0 w-[44px] border-r border-stroke-1 bg-bg-chrome flex flex-col min-h-0 items-center py-2 gap-1">
      <button
        type="button"
        onClick={() => setSidebarCollapsed(false)}
        title="Projekte einblenden"
        className="w-8 h-8 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-bg-elevated"
      >
        <PanelLeft size={14} />
      </button>
      <div className="w-7 border-t border-stroke-1 my-1" />
      {filteredProjects.slice(0, 12).map((p) => (
        <button
          key={p.id}
          type="button"
          onClick={() => setSelectedProjectId(p.id)}
          title={p.name}
          className={`w-8 h-8 rounded flex items-center justify-center text-[10.5px] font-semibold ${
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
    <aside className="shrink-0 w-[240px] border-r border-stroke-1 bg-bg-chrome flex flex-col min-h-0">
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
              href="https://projects.kineo360.work/profile"
              target="_blank"
              rel="noopener noreferrer"
              className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
              title={t("common.settings") + " (Plane)"}
            >
              <SettingsIcon size={13} />
            </a>
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
    : "Board";

  const viewToolbar = (
    <header className="shrink-0 flex flex-col gap-2 px-3 py-2 border-b border-stroke-1 bg-bg-chrome">
      <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
        <span className="hover:text-text-primary cursor-default">
          Projekte
        </span>
        {selectedProject && (
          <>
            <ChevronRight size={11} className="opacity-60" />
            <span
              className="inline-flex items-center justify-center w-4 h-4 rounded text-[8.5px] font-bold text-white"
              style={{ background: accent }}
            >
              {(selectedProject.emoji || selectedProject.identifier.slice(0, 1) || "P")
                .toString()
                .slice(0, 1)}
            </span>
            <span className="text-text-secondary font-medium">
              {selectedProject.name}
            </span>
            <ChevronRight size={11} className="opacity-60" />
            <span className="text-text-primary">{currentViewLabel}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <h1 className="text-[15px] font-semibold leading-tight text-text-primary">
          {selectedProject
            ? `${selectedProject.identifier} ${currentViewLabel}`
            : "Projekte"}
        </h1>
        {selectedProject && (
          <button
            type="button"
            className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-amber-400"
            title="Favorit"
          >
            <Star size={13} />
          </button>
        )}
        {selectedProject && (
          <span className="ml-1 text-[10.5px] text-text-tertiary tabular-nums">
            {filteredIssues.length} / {issues.length} Issues
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          {selectedProject && (
            <button
              type="button"
              onClick={() => {
                setShowNewIssue(true);
                setTimeout(() => newIssueRef.current?.focus(), 30);
              }}
              disabled={busy}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-white text-[11.5px] disabled:opacity-50"
              style={{ background: accent }}
              title="Neues Issue"
            >
              <Plus size={12} /> Issue
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              selectedProjectId && void loadProjectData(selectedProjectId)
            }
            className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title="Neu laden"
          >
            <RefreshCw size={13} />
          </button>
          <a
            href={`/api/plane/sso?ws=${workspaceId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md border border-stroke-1 hover:border-stroke-2 text-text-tertiary hover:text-text-primary text-[11px]"
            title="In Plane öffnen"
          >
            <ExternalLink size={11} />
            Plane
          </a>
        </div>
      </div>
      {selectedProject && (
        <>
          <div className="flex items-center gap-1 text-[11px]">
            {VIEW_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = view === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setView(tab.id)}
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${
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

            <div className="ml-auto flex items-center gap-1">
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
                  placeholder="Suche…"
                  className="bg-bg-elevated border border-stroke-1 rounded-md pl-7 pr-2 py-1 text-[11.5px] outline-none focus:border-stroke-2 w-48"
                />
              </div>
              <button
                type="button"
                onClick={() => setShowFilter((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border text-[11px] ${
                  showFilter ||
                  filter.priorities.length > 0 ||
                  filter.assignees.length > 0 ||
                  filter.labels.length > 0
                    ? "border-stroke-2 text-text-primary"
                    : "border-stroke-1 text-text-tertiary hover:text-text-primary"
                }`}
              >
                <Filter size={11} />
                Filter
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
        Wähle links ein Projekt.
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
        <Loader2 size={16} className="spin mr-2" /> lädt…
      </div>
    );
  } else if (view === "board") {
    viewContent = (
      <JiraBoard
        issues={filteredIssues}
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
    <div className="flex h-full min-h-0 bg-bg-base text-text-primary text-[13px]">
      {projectListPane}
      <section className="flex-1 min-w-0 flex flex-col min-h-0">
        {viewToolbar}
        {showNewIssue && selectedProject && (
          <div className="px-3 py-2 border-b border-stroke-1 bg-bg-elevated flex items-center gap-2">
            <input
              ref={newIssueRef}
              type="text"
              placeholder="Was ist zu tun? Enter zum Anlegen, Esc zum Abbrechen."
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
        <div className="w-[640px] shrink-0 min-h-0 flex">
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
          />
        </div>
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
  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]">
      <FilterChips
        label="Priorität"
        options={PRIORITY_ORDER.map((p) => ({ id: p, label: PRIORITY_LABEL[p] }))}
        selected={filter.priorities as string[]}
        onChange={(next) =>
          onChange({ ...filter, priorities: next as IssuePriority[] })
        }
      />
      <FilterChips
        label="Bearbeiter"
        options={members.map((m) => ({ id: m.id, label: m.displayName }))}
        selected={filter.assignees}
        onChange={(next) => onChange({ ...filter, assignees: next })}
      />
      <FilterChips
        label="Labels"
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
          Filter zurücksetzen
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
              className={`inline-flex items-center gap-1 px-1.5 py-[1px] rounded-full border text-[10px] ${
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
  identifier,
  states,
  members,
  labels,
  selectedIssueId,
  onSelectIssue,
}: {
  issues: IssueSummary[];
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
            onClick={() => onSelectIssue(i.id)}
          />
        ))
      )}
    </div>
  );
}
