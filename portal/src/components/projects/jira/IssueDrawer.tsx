"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Send,
  Trash2,
  X,
  ListTree,
  Plus,
  CornerDownRight,
} from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import type {
  CycleSummary,
  IssueComment,
  IssueLabel,
  IssuePriority,
  IssueState,
  IssueSummary,
  WorkspaceMember,
} from "@/lib/projects/types";
import type { WorkspaceId } from "@/lib/workspaces";
import {
  ISSUE_TYPE_META,
  ISSUE_TYPE_ORDER,
  IssueType,
  IssueTypeIcon,
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  PriorityBadge,
  StateBadge,
  deriveIssueType,
} from "./shared";

/**
 * Jira-style issue drawer that slides in from the right of the JiraClient
 * shell. Renders title + description + activity in the main column, and
 * properties (status, priority, assignees, labels, sprint, parent, dates) in
 * the right sidebar. Includes inline children/sub-tasks list.
 */
export function IssueDrawer({
  issue,
  states,
  labels,
  members,
  cycles,
  allIssues,
  memberById,
  labelById,
  stateById,
  identifier,
  workspaceId,
  projectId,
  accent,
  onUpdate,
  onDelete,
  onClose,
  onSelectIssue,
  apiUrl,
}: {
  issue: IssueSummary;
  states: IssueState[];
  labels: IssueLabel[];
  members: WorkspaceMember[];
  cycles: CycleSummary[];
  allIssues: IssueSummary[];
  memberById: Map<string, WorkspaceMember>;
  labelById: Map<string, IssueLabel>;
  stateById: Map<string, IssueState>;
  identifier: string;
  workspaceId: WorkspaceId;
  projectId: string;
  accent: string;
  onUpdate: (patch: Partial<IssueSummary>) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onClose: () => void;
  onSelectIssue: (id: string) => void;
  apiUrl: (path: string) => string;
}) {
  const [titleDraft, setTitleDraft] = useState(issue.name);
  const [descDraft, setDescDraft] = useState(htmlToPlain(issue.descriptionHtml));
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingDesc, setSavingDesc] = useState(false);

  useEffect(() => {
    setTitleDraft(issue.name);
    setDescDraft(htmlToPlain(issue.descriptionHtml));
  }, [issue.id, issue.name, issue.descriptionHtml]);

  const commitTitle = useCallback(async () => {
    const t = titleDraft.trim();
    if (!t) {
      setTitleDraft(issue.name);
      return;
    }
    if (t === issue.name) return;
    setSavingTitle(true);
    try {
      await onUpdate({ name: t });
    } finally {
      setSavingTitle(false);
    }
  }, [titleDraft, issue.name, onUpdate]);

  const commitDesc = useCallback(async () => {
    const next = plainToHtml(descDraft);
    if (next === issue.descriptionHtml) return;
    setSavingDesc(true);
    try {
      await onUpdate({ descriptionHtml: next });
    } finally {
      setSavingDesc(false);
    }
  }, [descDraft, issue.descriptionHtml, onUpdate]);

  const currentState = stateById.get(issue.state);
  const currentCycle = issue.cycle ? cycles.find((c) => c.id === issue.cycle) : null;
  const parentIssue = issue.parent
    ? allIssues.find((i) => i.id === issue.parent)
    : null;
  const subIssues = useMemo(
    () => allIssues.filter((i) => i.parent === issue.id),
    [allIssues, issue.id],
  );

  const labelByIdMap = useMemo(() => {
    const m = new Map<string, IssueLabel>();
    for (const l of labels) m.set(l.id, l);
    return m;
  }, [labels]);

  const issueType = useMemo(
    () => deriveIssueType(issue, labelByIdMap),
    [issue, labelByIdMap],
  );

  return (
    <aside className="flex flex-col h-full bg-bg-base border-l border-stroke-1 shadow-xl">
      <header
        className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-stroke-1 bg-bg-chrome"
        style={{ boxShadow: `inset 0 -1px 0 0 ${accent}30` }}
      >
        <IssueTypeIcon type={issueType} size={16} />
        <span className="font-mono text-[12px] font-semibold text-text-secondary">
          {identifier}-{issue.sequenceId}
        </span>
        <span className="text-text-quaternary">/</span>
        {currentState && <StateBadge state={currentState} />}
        {savingTitle && (
          <Loader2 size={11} className="spin text-text-quaternary" />
        )}
        <button
          type="button"
          onClick={onClose}
          className="ml-auto p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
          title="Schließen"
        >
          <X size={14} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden flex">
        <div className="flex-1 min-w-0 overflow-y-auto">
          <div className="px-4 py-4 space-y-5">
            {parentIssue && (
              <button
                type="button"
                onClick={() => onSelectIssue(parentIssue.id)}
                className="inline-flex items-center gap-1.5 text-[11px] text-sky-400 hover:underline"
              >
                <CornerDownRight size={11} />
                <span className="font-mono">
                  {identifier}-{parentIssue.sequenceId}
                </span>
                <span className="text-text-tertiary">{parentIssue.name}</span>
              </button>
            )}

            <input
              type="text"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={() => void commitTitle()}
              onKeyDown={(e) => {
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="w-full bg-transparent border border-transparent hover:border-stroke-1 focus:border-stroke-2 rounded-md px-1.5 py-1 text-[18px] font-semibold text-text-primary outline-none"
            />

            <Section title="Beschreibung" loading={savingDesc}>
              <textarea
                value={descDraft}
                onChange={(e) => setDescDraft(e.target.value)}
                onBlur={() => void commitDesc()}
                placeholder="Beschreibung hinzufügen…"
                className="w-full min-h-[140px] bg-bg-elevated border border-stroke-1 focus:border-stroke-2 rounded-md px-3 py-2 text-[12.5px] text-text-primary outline-none resize-y leading-relaxed"
              />
            </Section>

            <SubTasks
              identifier={identifier}
              parent={issue}
              children={subIssues}
              stateById={stateById}
              members={memberById}
              onSelectIssue={onSelectIssue}
              workspaceId={workspaceId}
              projectId={projectId}
              accent={accent}
              onCreated={() => {
                /* parent will refresh its list */
              }}
            />

            <ActivitySection
              issueId={issue.id}
              workspaceId={workspaceId}
              projectId={projectId}
              memberById={memberById}
              accent={accent}
              apiUrl={apiUrl}
            />
          </div>
        </div>

        <aside className="w-[260px] shrink-0 border-l border-stroke-1 bg-bg-chrome overflow-y-auto">
          <div className="p-3 space-y-4">
            <Field label="Issue-Typ">
              <div className="flex flex-wrap gap-1">
                {ISSUE_TYPE_ORDER.map((t) => {
                  const meta = ISSUE_TYPE_META[t];
                  const isSel = t === issueType;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() =>
                        void changeIssueType(
                          t,
                          issue,
                          labels,
                          onUpdate,
                          apiUrl,
                          projectId,
                        )
                      }
                      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10.5px] border transition-colors ${
                        isSel
                          ? "border-transparent text-white"
                          : "border-stroke-1 text-text-secondary hover:text-text-primary hover:border-stroke-2"
                      }`}
                      style={isSel ? { background: meta.bg } : undefined}
                    >
                      <IssueTypeIcon type={t} size={11} />
                      {meta.label}
                    </button>
                  );
                })}
              </div>
            </Field>

            <Field label="Status">
              <select
                value={issue.state && stateById.has(issue.state) ? issue.state : ""}
                onChange={(e) => void onUpdate({ state: e.target.value })}
                className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none"
              >
                {(!issue.state || !stateById.has(issue.state)) && (
                  <option value="" disabled>
                    — wählen —
                  </option>
                )}
                {states.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Priorität">
              <select
                value={issue.priority}
                onChange={(e) =>
                  void onUpdate({ priority: e.target.value as IssuePriority })
                }
                className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none"
              >
                {PRIORITY_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
              <div className="mt-1">
                <PriorityBadge priority={issue.priority} showLabel />
              </div>
            </Field>

            <Field label="Bearbeiter">
              <MultiPicker
                options={members.map((m) => ({
                  id: m.id,
                  label: m.displayName,
                  sub: m.email,
                }))}
                selected={issue.assignees}
                onChange={(next) => void onUpdate({ assignees: next })}
                emptyLabel="Niemand"
                renderChip={(id) => {
                  const m = memberById.get(id);
                  if (!m) return null;
                  return (
                    <span className="inline-flex items-center gap-1 px-1 py-0.5 rounded-full bg-bg-elevated border border-stroke-1">
                      <Avatar
                        name={m.displayName}
                        email={m.email}
                        size={14}
                      />
                      <span className="text-[10.5px]">
                        {m.displayName.split(" ")[0]}
                      </span>
                    </span>
                  );
                }}
                accent={accent}
              />
            </Field>

            <Field label="Labels">
              <MultiPicker
                options={labels.map((l) => ({
                  id: l.id,
                  label: l.name,
                  color: l.color,
                }))}
                selected={issue.labels}
                onChange={(next) => void onUpdate({ labels: next })}
                emptyLabel="Keine"
                renderChip={(id) => {
                  const l = labelById.get(id);
                  if (!l) return null;
                  return (
                    <span
                      className="inline-block px-1.5 py-[1px] rounded-full text-[9.5px] font-medium text-white"
                      style={{ background: l.color }}
                    >
                      {l.name}
                    </span>
                  );
                }}
                accent={accent}
              />
            </Field>

            <Field label="Sprint">
              <select
                value={issue.cycle ?? ""}
                onChange={(e) =>
                  void changeIssueCycle(
                    apiUrl,
                    issue.id,
                    issue.cycle,
                    e.target.value || null,
                    onUpdate,
                  )
                }
                className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none"
              >
                <option value="">— Backlog —</option>
                {cycles
                  .filter(
                    (c) => c.status !== "completed" || c.id === issue.cycle,
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{" "}
                      {c.status === "current"
                        ? "· Aktiv"
                        : c.status === "upcoming"
                          ? "· Geplant"
                          : ""}
                    </option>
                  ))}
              </select>
              {currentCycle && currentCycle.endDate && (
                <p className="mt-1 text-[10px] text-text-tertiary">
                  Endet{" "}
                  {new Date(currentCycle.endDate).toLocaleDateString("de-DE", {
                    day: "2-digit",
                    month: "short",
                  })}
                </p>
              )}
            </Field>

            <Field label="Parent-Issue">
              <select
                value={issue.parent ?? ""}
                onChange={(e) =>
                  void onUpdate({ parent: e.target.value || null })
                }
                className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none"
              >
                <option value="">— keiner —</option>
                {allIssues
                  .filter((i) => i.id !== issue.id && i.parent !== issue.id)
                  .slice(0, 200)
                  .map((i) => (
                    <option key={i.id} value={i.id}>
                      {identifier}-{i.sequenceId} · {i.name.slice(0, 40)}
                    </option>
                  ))}
              </select>
            </Field>

            <Field label="Story Points">
              <input
                type="number"
                min={0}
                step={1}
                value={issue.estimatePoint ?? ""}
                onChange={(e) =>
                  void onUpdate({
                    estimatePoint:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
                className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none"
                placeholder="—"
              />
            </Field>

            <div className="grid grid-cols-2 gap-2">
              <Field label="Start">
                <input
                  type="date"
                  value={issue.startDate ?? ""}
                  onChange={(e) =>
                    void onUpdate({ startDate: e.target.value || null })
                  }
                  className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1 py-1 text-[10.5px] outline-none"
                />
              </Field>
              <Field label="Fällig">
                <input
                  type="date"
                  value={issue.targetDate ?? ""}
                  onChange={(e) =>
                    void onUpdate({ targetDate: e.target.value || null })
                  }
                  className="w-full bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1 py-1 text-[10.5px] outline-none"
                />
              </Field>
            </div>

            <div className="pt-3 border-t border-stroke-1 text-[10.5px] text-text-tertiary leading-relaxed">
              <p>
                Erstellt {new Date(issue.createdAt).toLocaleString("de-DE")}
              </p>
              <p>
                Geändert {new Date(issue.updatedAt).toLocaleString("de-DE")}
              </p>
              {issue.completedAt && (
                <p>
                  Erledigt{" "}
                  {new Date(issue.completedAt).toLocaleString("de-DE")}
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => void onDelete()}
              className="w-full inline-flex items-center justify-center gap-2 px-2 py-1.5 rounded-md border border-red-500/40 text-red-400 hover:bg-red-500/10 text-[11.5px]"
            >
              <Trash2 size={12} />
              Issue löschen
            </button>
          </div>
        </aside>
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------------- */
/*                          Helpers                                    */
/* ----------------------------------------------------------------- */

function htmlToPlain(html: string): string {
  if (typeof document === "undefined") return html;
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent ?? "";
}

function plainToHtml(plain: string): string {
  const escaped = plain
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/**
 * Set the issue's "type" by manipulating labels. Plane CE has no native
 * issue-type field, so we mirror Jira's Story/Task/Bug/Epic/Subtask via a
 * dedicated label (creating it on the project if it doesn't exist yet) and
 * stripping any other type-style labels at the same time.
 */
async function changeIssueType(
  newType: IssueType,
  issue: IssueSummary,
  labels: IssueLabel[],
  onUpdate: (patch: Partial<IssueSummary>) => Promise<void> | void,
  apiUrl: (path: string) => string,
  projectId: string,
): Promise<void> {
  if (newType === "subtask") {
    // Subtask is implicit (parent !== null); just clear type-labels.
    const cleaned = stripTypeLabels(issue.labels, labels);
    if (cleaned.length !== issue.labels.length) {
      await onUpdate({ labels: cleaned });
    }
    return;
  }
  const meta = ISSUE_TYPE_META[newType];
  let typeLabel = labels.find(
    (l) => l.name.trim().toLowerCase() === meta.label.toLowerCase(),
  );
  if (!typeLabel) {
    try {
      const r = await fetch(
        apiUrl(`/api/projects/labels?project=${encodeURIComponent(projectId)}`),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name: meta.label, color: meta.bg }),
        },
      );
      if (r.ok) {
        const j = (await r.json()) as { label?: IssueLabel };
        if (j.label) typeLabel = j.label;
      }
    } catch (e) {
      console.warn("[changeIssueType] label create failed", e);
    }
  }
  const next = stripTypeLabels(issue.labels, labels);
  if (typeLabel && !next.includes(typeLabel.id)) next.push(typeLabel.id);
  await onUpdate({ labels: next });
}

/** Strip any label whose name matches a known issue-type name. */
function stripTypeLabels(ids: string[], labels: IssueLabel[]): string[] {
  const typeNames = new Set(
    Object.values(ISSUE_TYPE_META).map((m) => m.label.toLowerCase()),
  );
  return ids.filter((id) => {
    const l = labels.find((x) => x.id === id);
    if (!l) return true;
    return !typeNames.has(l.name.trim().toLowerCase());
  });
}

/**
 * Move an issue between cycles. Plane treats `cycle` as a relationship table
 * rather than a column on the issue, so we POST to the cycle-issues endpoint
 * for the new cycle. Setting `null` removes from any cycle.
 */
async function changeIssueCycle(
  apiUrl: (path: string) => string,
  issueId: string,
  oldCycle: string | null,
  newCycle: string | null,
  onUpdate: (patch: Partial<IssueSummary>) => Promise<void> | void,
): Promise<void> {
  if (oldCycle === newCycle) return;
  if (oldCycle) {
    try {
      await fetch(
        apiUrl(
          `/api/projects/cycle/${oldCycle}/issues?issue=${encodeURIComponent(issueId)}`,
        ),
        { method: "DELETE" },
      );
    } catch (e) {
      console.warn("[changeIssueCycle] remove failed", e);
    }
  }
  if (newCycle) {
    try {
      await fetch(apiUrl(`/api/projects/cycle/${newCycle}/issues`), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueIds: [issueId] }),
      });
    } catch (e) {
      console.warn("[changeIssueCycle] add failed", e);
    }
  }
  await onUpdate({ cycle: newCycle });
}

function Section({
  title,
  loading,
  children,
}: {
  title: string;
  loading?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h3 className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1.5 flex items-center gap-1">
        {title}
        {loading && <Loader2 size={10} className="spin" />}
      </h3>
      {children}
    </section>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[9.5px] uppercase tracking-wide font-semibold text-text-tertiary mb-1">
        {label}
      </p>
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                          Sub-tasks                                  */
/* ----------------------------------------------------------------- */

function SubTasks({
  identifier,
  parent,
  children,
  stateById,
  members,
  onSelectIssue,
  workspaceId,
  projectId,
  accent,
  onCreated,
}: {
  identifier: string;
  parent: IssueSummary;
  children: IssueSummary[];
  stateById: Map<string, IssueState>;
  members: Map<string, WorkspaceMember>;
  onSelectIssue: (id: string) => void;
  workspaceId: WorkspaceId;
  projectId: string;
  accent: string;
  onCreated: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const name = text.trim();
    if (!name) return;
    setBusy(true);
    try {
      const r = await fetch(
        `/api/projects/issues?ws=${workspaceId}&project=${projectId}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        },
      );
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = (await r.json()) as { issue?: IssueSummary };
      if (j.issue) {
        await fetch(
          `/api/projects/issue/${j.issue.id}?ws=${workspaceId}&project=${projectId}`,
          {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parent: parent.id }),
          },
        );
      }
      setText("");
      setAdding(false);
      onCreated();
    } finally {
      setBusy(false);
    }
  };

  if (children.length === 0 && !adding) {
    return (
      <Section title="Sub-Tasks">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
        >
          <Plus size={11} /> Sub-Task hinzufügen
        </button>
      </Section>
    );
  }

  return (
    <Section title={`Sub-Tasks (${children.length})`}>
      <ul className="rounded-md border border-stroke-1 bg-bg-elevated divide-y divide-stroke-1/60">
        {children.map((c) => {
          const s = stateById.get(c.state);
          const a = c.assignees.map((id) => members.get(id)).filter(Boolean);
          return (
            <li
              key={c.id}
              className="flex items-center gap-2 px-2.5 py-1.5 hover:bg-bg-overlay/40 cursor-pointer"
              onClick={() => onSelectIssue(c.id)}
            >
              <ListTree size={11} className="text-text-tertiary" />
              <span className="font-mono text-[10.5px] text-text-tertiary shrink-0">
                {identifier}-{c.sequenceId}
              </span>
              <span className="flex-1 text-[12px] truncate">{c.name}</span>
              {s && (
                <span
                  className="text-[9.5px] px-1.5 py-[1px] rounded"
                  style={{ background: s.color + "26", color: s.color }}
                >
                  {s.name}
                </span>
              )}
              {a[0] && (
                <Avatar
                  name={a[0]!.displayName}
                  email={a[0]!.email}
                  size={16}
                />
              )}
            </li>
          );
        })}
      </ul>
      {adding ? (
        <div className="mt-2 flex items-center gap-2">
          <input
            autoFocus
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Sub-Task…"
            className="flex-1 bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[11.5px] outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
              else if (e.key === "Escape") {
                setAdding(false);
                setText("");
              }
            }}
          />
          <button
            type="button"
            onClick={() => void submit()}
            disabled={busy}
            className="px-2 py-1 text-[11px] rounded-md text-white"
            style={{ background: accent }}
          >
            {busy ? <Loader2 size={11} className="spin" /> : "Anlegen"}
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="mt-2 text-[11px] text-text-tertiary hover:text-text-primary inline-flex items-center gap-1"
        >
          <Plus size={11} /> Weitere Sub-Task
        </button>
      )}
    </Section>
  );
}

/* ----------------------------------------------------------------- */
/*                          MultiPicker                                */
/* ----------------------------------------------------------------- */

function MultiPicker({
  options,
  selected,
  onChange,
  emptyLabel,
  renderChip,
  accent,
}: {
  options: { id: string; label: string; sub?: string; color?: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  emptyLabel: string;
  renderChip: (id: string) => React.ReactNode;
  accent: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");

  const visibleOptions = useMemo(() => {
    if (!filter.trim()) return options;
    const q = filter.toLowerCase();
    return options.filter(
      (o) =>
        o.label.toLowerCase().includes(q) ||
        (o.sub && o.sub.toLowerCase().includes(q)),
    );
  }, [options, filter]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else onChange([...selected, id]);
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left bg-bg-elevated border border-stroke-1 hover:border-stroke-2 rounded-md px-1.5 py-1 text-[11.5px] outline-none focus:border-stroke-2 min-h-[26px] flex items-center flex-wrap gap-1"
      >
        {selected.length === 0 ? (
          <span className="text-text-quaternary">{emptyLabel}</span>
        ) : (
          selected.map((id) => <span key={id}>{renderChip(id)}</span>)
        )}
      </button>
      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => {
              setOpen(false);
              setFilter("");
            }}
          />
          <div
            className="absolute right-0 mt-1 z-50 w-[240px] max-h-[260px] overflow-auto rounded-md border border-stroke-2 bg-bg-elevated shadow-xl"
            style={{ boxShadow: `0 10px 30px rgba(0,0,0,0.4), 0 0 0 1px ${accent}30` }}
          >
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Suchen…"
              autoFocus
              className="w-full bg-transparent border-b border-stroke-1 px-2 py-1.5 text-[11.5px] outline-none"
            />
            <ul>
              {visibleOptions.length === 0 && (
                <li className="px-2 py-2 text-[11px] text-text-tertiary">
                  Keine Treffer.
                </li>
              )}
              {visibleOptions.map((o) => {
                const isSel = selected.includes(o.id);
                return (
                  <li key={o.id}>
                    <button
                      type="button"
                      onClick={() => toggle(o.id)}
                      className={`w-full text-left px-2 py-1.5 text-[11.5px] flex items-center gap-2 ${
                        isSel ? "bg-bg-overlay" : "hover:bg-bg-chrome"
                      }`}
                    >
                      <span
                        className="inline-block w-3 h-3 rounded-sm border"
                        style={{
                          background: isSel ? accent : "transparent",
                          borderColor: isSel ? accent : "var(--stroke-2, #444)",
                        }}
                      />
                      {o.color && (
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ background: o.color }}
                        />
                      )}
                      <span className="flex-1 truncate">{o.label}</span>
                      {o.sub && (
                        <span className="text-[10px] text-text-tertiary truncate">
                          {o.sub}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- */
/*                          Activity                                   */
/* ----------------------------------------------------------------- */

function ActivitySection({
  issueId,
  workspaceId,
  projectId,
  memberById,
  accent,
  apiUrl,
}: {
  issueId: string;
  workspaceId: WorkspaceId;
  projectId: string;
  memberById: Map<string, WorkspaceMember>;
  accent: string;
  apiUrl: (path: string) => string;
}) {
  const [comments, setComments] = useState<IssueComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(
        apiUrl(
          `/api/projects/issue/${issueId}/comment?project=${projectId}&_ws=${workspaceId}`,
        ),
        { cache: "no-store" },
      );
      const j = (await r.json()) as { comments?: IssueComment[]; error?: string };
      if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
      setComments(j.comments ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [issueId, workspaceId, projectId, apiUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    setSubmitting(true);
    try {
      const r = await fetch(
        apiUrl(
          `/api/projects/issue/${issueId}/comment?project=${projectId}&_ws=${workspaceId}`,
        ),
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ commentHtml: plainToHtml(text) }),
        },
      );
      const j = (await r.json()) as { comment?: IssueComment; error?: string };
      if (!r.ok || !j.comment) throw new Error(j.error ?? `HTTP ${r.status}`);
      setComments((c) => [...c, j.comment!]);
      setDraft("");
    } catch (e) {
      alert("Kommentar fehlgeschlagen: " + (e instanceof Error ? e.message : e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Section title={`Aktivität${comments.length ? ` (${comments.length})` : ""}`}>
      {loading && (
        <div className="flex items-center gap-2 text-[11px] text-text-tertiary">
          <Loader2 size={11} className="spin" /> lädt…
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 text-red-400 text-[11px] p-2">
          {error}
        </div>
      )}
      <ul className="space-y-3">
        {comments.map((c) => {
          const author = c.actorId ? memberById.get(c.actorId) : null;
          const name =
            c.actorDisplayName ?? author?.displayName ?? "Unbekannt";
          return (
            <li
              key={c.id}
              className="flex gap-2.5"
            >
              <Avatar
                name={author?.displayName ?? name}
                email={author?.email ?? null}
                size={26}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[10.5px] text-text-tertiary mb-0.5">
                  <span className="font-medium text-text-secondary">{name}</span>
                  <span>{new Date(c.createdAt).toLocaleString("de-DE")}</span>
                </div>
                <div
                  className="rounded-md border border-stroke-1 bg-bg-elevated px-3 py-2 text-[12.5px] text-text-primary leading-relaxed [&_p]:my-1 [&_a]:text-sky-400 [&_a]:underline"
                  dangerouslySetInnerHTML={{ __html: c.commentHtml }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 rounded-md border border-stroke-1 bg-bg-elevated">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Kommentar verfassen … (Strg/⌘+Enter zum Senden)"
          className="w-full min-h-[80px] bg-transparent rounded-t-md px-3 py-2 text-[12.5px] outline-none resize-y leading-relaxed"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex items-center justify-end gap-2 px-2 py-1.5 border-t border-stroke-1">
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || !draft.trim()}
            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-white text-[11.5px] font-medium disabled:opacity-50"
            style={{ background: accent }}
          >
            {submitting ? (
              <Loader2 size={11} className="spin" />
            ) : (
              <Send size={11} />
            )}
            Senden
          </button>
        </div>
      </div>
    </Section>
  );
}
