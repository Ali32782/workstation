"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Kanban,
  Loader2,
  CornerDownLeft,
  X,
  AlertCircle,
  CheckCircle2,
  Flag,
} from "lucide-react";

type Project = {
  id: string;
  name: string;
  identifier: string;
};

type Priority = "urgent" | "high" | "medium" | "low" | "none";

const PRIORITIES: Array<{ value: Priority; label: string; tone: string }> = [
  { value: "urgent", label: "Urgent", tone: "text-red-400" },
  { value: "high", label: "Hoch", tone: "text-amber-400" },
  { value: "medium", label: "Mittel", tone: "text-info" },
  { value: "low", label: "Tief", tone: "text-text-tertiary" },
  { value: "none", label: "Ohne", tone: "text-text-quaternary" },
];

const STORAGE_LAST_PROJECT = (ws: string) => `quick-issue:lastProject:${ws}`;

/**
 * Global Cmd+I quick-create for Plane issues.
 *
 * Mounts once per workspace shell and listens globally for ⌘/Ctrl+I.
 * Picks the user's last-used project by default (LocalStorage), prompts
 * for a one-line title, optional description and priority, then creates
 * the issue assigned to the current operator. Enter submits, Esc closes.
 *
 * Designed to feel like "type, hit Enter, done" — no nested menus, no
 * second confirmation. The success toast lingers for 4 s with a deep
 * link into Plane so the user can verify or jump in.
 */
export function QuickIssue({
  workspaceId,
  planeUrl,
}: {
  workspaceId: string;
  planeUrl: string;
}) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [workspaceSlug, setWorkspaceSlug] = useState<string>("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [projectId, setProjectId] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    issueId: string;
    title: string;
    sequence?: number;
    projectIdentifier?: string;
  } | null>(null);
  const titleRef = useRef<HTMLInputElement | null>(null);

  // Global hotkey: ⌘/Ctrl+I. Skip while user is typing in an input that
  // already handles ⌘+I itself (none today, but defensively check the
  // active element so e.g. a code editor with its own binding can opt
  // out via `data-no-quick-issue`).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (!isCmd) return;
      if (e.key !== "i" && e.key !== "I") return;
      const t = e.target as HTMLElement | null;
      if (t?.dataset?.noQuickIssue === "true") return;
      e.preventDefault();
      setOpen((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadProjects = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/projects/projects?ws=${encodeURIComponent(workspaceId)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as {
        projects?: Project[];
        workspaceSlug?: string;
        error?: string;
      };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setProjects(j.projects ?? []);
      setWorkspaceSlug(j.workspaceSlug ?? "");
      const stored = window.localStorage.getItem(
        STORAGE_LAST_PROJECT(workspaceId),
      );
      const initial =
        (stored && j.projects?.find((p) => p.id === stored)?.id) ||
        j.projects?.[0]?.id ||
        "";
      setProjectId(initial);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProjects([]);
    }
  }, [workspaceId]);

  // Reset on close, lazy-load projects on first open.
  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(null);
      return;
    }
    if (projects === null) void loadProjects();
    requestAnimationFrame(() => titleRef.current?.focus());
  }, [open, projects, loadProjects]);

  // Auto-dismiss success toast after 4 s so the next ⌘+I is clean.
  useEffect(() => {
    if (!success) return;
    const id = window.setTimeout(() => setSuccess(null), 4000);
    return () => window.clearTimeout(id);
  }, [success]);

  const submit = useCallback(async () => {
    const name = title.trim();
    if (!name || !projectId) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/projects/issues?ws=${encodeURIComponent(workspaceId)}&project=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            descriptionHtml: description.trim()
              ? `<p>${escapeHtml(description.trim()).replace(/\n/g, "<br/>")}</p>`
              : undefined,
            priority,
            assignToMe: true,
          }),
        },
      );
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error ?? `HTTP ${r.status}`);
      window.localStorage.setItem(
        STORAGE_LAST_PROJECT(workspaceId),
        projectId,
      );
      const project = projects?.find((p) => p.id === projectId);
      setSuccess({
        issueId: j.issue?.id,
        title: name,
        sequence: j.issue?.sequenceId,
        projectIdentifier: project?.identifier,
      });
      setTitle("");
      setDescription("");
      // Keep priority as the user set it for the next quick-add.
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [title, description, priority, projectId, projects, workspaceId]);

  const planeIssueUrl = useMemo(() => {
    if (!success?.issueId || !workspaceSlug) return "#";
    return `${planeUrl.replace(/\/$/, "")}/${workspaceSlug}/projects/${projectId}/issues/${success.issueId}`;
  }, [success, planeUrl, projectId, workspaceSlug]);

  if (!open && !success) return null;

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 pt-[15vh] px-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="w-full max-w-lg rounded-lg border border-stroke-1 bg-bg-chrome shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="px-4 py-2.5 border-b border-stroke-1 flex items-center gap-2">
              <Kanban size={14} className="text-info" />
              <h3 className="text-[12.5px] font-semibold flex-1">
                Quick-Issue erstellen
              </h3>
              <span className="text-[10.5px] text-text-tertiary tabular-nums">
                ⌘+I · Enter zum Erstellen
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded-md hover:bg-bg-overlay text-text-tertiary"
              >
                <X size={13} />
              </button>
            </header>
            <div className="p-3 space-y-2.5">
              {projects === null ? (
                <div className="flex items-center justify-center py-4 text-text-tertiary text-[12px] gap-2">
                  <Loader2 size={12} className="animate-spin" /> Lade Projekte …
                </div>
              ) : projects.length === 0 ? (
                <div className="rounded-md border border-amber-500/40 bg-amber-500/10 text-amber-300 text-[11.5px] p-2">
                  Keine Plane-Projekte gefunden. Erstelle eines unter{" "}
                  <a
                    href={`/${workspaceId}/projects`}
                    className="underline text-info"
                  >
                    Projekte
                  </a>
                  .
                </div>
              ) : (
                <>
                  <input
                    ref={titleRef}
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Escape") {
                        e.preventDefault();
                        setOpen(false);
                      }
                      if (
                        e.key === "Enter" &&
                        !e.shiftKey &&
                        title.trim() &&
                        !busy
                      ) {
                        e.preventDefault();
                        void submit();
                      }
                    }}
                    placeholder="Titel des Issues …"
                    className="w-full px-3 py-2 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[13px] outline-none"
                  />
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional: Beschreibung / Kontext"
                    rows={2}
                    className="w-full px-3 py-2 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none resize-y"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className="text-[10.5px] text-text-tertiary uppercase tracking-wide">
                        Projekt
                      </span>
                      <select
                        value={projectId}
                        onChange={(e) => setProjectId(e.target.value)}
                        className="mt-0.5 w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
                      >
                        {projects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.identifier} — {p.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-[10.5px] text-text-tertiary uppercase tracking-wide">
                        Priorität
                      </span>
                      <select
                        value={priority}
                        onChange={(e) =>
                          setPriority(e.target.value as Priority)
                        }
                        className="mt-0.5 w-full px-2 py-1.5 rounded-md bg-bg-base border border-stroke-1 focus:border-info text-[12px] outline-none"
                      >
                        {PRIORITIES.map((p) => (
                          <option key={p.value} value={p.value}>
                            {p.label}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {error && (
                    <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11.5px] p-2 flex items-start gap-1.5">
                      <AlertCircle size={11} className="mt-0.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                </>
              )}
            </div>
            <footer className="px-3 pb-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={busy}
                className="px-3 py-1.5 rounded-md text-text-tertiary hover:text-text-primary hover:bg-bg-overlay text-[11.5px]"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={busy || !title.trim() || !projectId}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-info hover:bg-info/90 text-white text-[11.5px] font-medium disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 size={11} className="animate-spin" />
                ) : (
                  <CornerDownLeft size={11} />
                )}
                Erstellen &amp; mir zuweisen
                <Flag
                  size={9}
                  className={
                    PRIORITIES.find((p) => p.value === priority)?.tone ?? ""
                  }
                />
              </button>
            </footer>
          </div>
        </div>
      )}
      {success && (
        <div className="fixed bottom-6 right-6 z-[70] max-w-sm rounded-lg border border-success/40 bg-bg-chrome shadow-2xl p-3">
          <div className="flex items-start gap-2">
            <CheckCircle2 size={14} className="text-success mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium">
                Issue{" "}
                {success.projectIdentifier && success.sequence
                  ? `${success.projectIdentifier}-${success.sequence}`
                  : ""}{" "}
                erstellt
              </p>
              <p className="text-[11px] text-text-tertiary truncate">
                {success.title}
              </p>
              <div className="mt-1.5 flex items-center gap-2 text-[11px]">
                <a
                  href={planeIssueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-info hover:underline"
                >
                  In Plane öffnen ↗
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setSuccess(null);
                    setOpen(true);
                  }}
                  className="text-text-tertiary hover:text-text-primary"
                >
                  · Noch eines (⌘+I)
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSuccess(null)}
              className="p-0.5 text-text-tertiary hover:text-text-primary"
            >
              <X size={12} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
