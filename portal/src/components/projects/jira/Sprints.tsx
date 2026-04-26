"use client";

import { useMemo, useState } from "react";
import { Calendar, Plus, Loader2, Pencil, X } from "lucide-react";
import type {
  CycleSummary,
  IssueLabel,
  IssueState,
  IssueSummary,
  WorkspaceMember,
} from "@/lib/projects/types";
import {
  CycleStatusPill,
  IssueCard,
  STATE_GROUP_COLOR,
  STATE_GROUP_LABEL,
  STATE_GROUP_ORDER,
} from "./shared";

/**
 * Sprint manager: pick a cycle on the left and see its issues grouped by
 * state group on the right (mini Kanban). Includes a sprint summary header
 * with progress + burndown.
 */
export function JiraSprints({
  cycles,
  issues,
  states,
  members,
  labels,
  identifier,
  selectedIssueId,
  onSelectIssue,
  onMoveIssue,
  onCreateCycle,
  onUpdateCycle,
  onDeleteCycle,
  accent,
}: {
  cycles: CycleSummary[];
  issues: IssueSummary[];
  states: IssueState[];
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  identifier: string;
  selectedIssueId: string | null;
  onSelectIssue: (id: string) => void;
  onMoveIssue: (issueId: string, stateId: string) => Promise<void> | void;
  onCreateCycle: (input: {
    name: string;
    startDate: string;
    endDate: string;
  }) => Promise<void> | void;
  onUpdateCycle: (
    cycleId: string,
    input: {
      name?: string;
      startDate?: string | null;
      endDate?: string | null;
    },
  ) => Promise<void> | void;
  onDeleteCycle: (cycleId: string) => Promise<void> | void;
  accent: string;
}) {
  const stateById = useMemo(() => {
    const m = new Map<string, IssueState>();
    for (const s of states) m.set(s.id, s);
    return m;
  }, [states]);

  const ordered = useMemo(() => {
    const order: Record<CycleSummary["status"], number> = {
      current: 0,
      upcoming: 1,
      draft: 2,
      completed: 3,
    };
    return [...cycles].sort((a, b) => {
      const oa = order[a.status];
      const ob = order[b.status];
      if (oa !== ob) return oa - ob;
      const ad = a.startDate ? new Date(a.startDate).getTime() : 0;
      const bd = b.startDate ? new Date(b.startDate).getTime() : 0;
      return bd - ad;
    });
  }, [cycles]);

  const [activeId, setActiveId] = useState<string | null>(
    () => ordered[0]?.id ?? null,
  );
  const active = useMemo(
    () => cycles.find((c) => c.id === activeId) ?? null,
    [cycles, activeId],
  );

  const [showNew, setShowNew] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newStart, setNewStart] = useState(today());
  const [newEnd, setNewEnd] = useState(addDays(today(), 14));

  const submitNew = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    try {
      await onCreateCycle({ name, startDate: newStart, endDate: newEnd });
      setShowNew(false);
      setNewName("");
    } finally {
      setCreating(false);
    }
  };

  const cycleIssues = useMemo(
    () => (active ? issues.filter((i) => i.cycle === active.id) : []),
    [active, issues],
  );

  const stats = useMemo(() => {
    const total = cycleIssues.length;
    const done = cycleIssues.filter((i) => {
      const s = stateById.get(i.state);
      return s?.group === "completed";
    }).length;
    const inProgress = cycleIssues.filter((i) => {
      const s = stateById.get(i.state);
      return s?.group === "started";
    }).length;
    const points = cycleIssues.reduce((n, i) => n + (i.estimatePoint ?? 0), 0);
    const donePoints = cycleIssues
      .filter((i) => stateById.get(i.state)?.group === "completed")
      .reduce((n, i) => n + (i.estimatePoint ?? 0), 0);
    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    return { total, done, inProgress, points, donePoints, pct };
  }, [cycleIssues, stateById]);

  return (
    <div className="flex-1 min-h-0 flex">
      {/* Cycle list */}
      <aside className="w-[260px] shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col min-h-0">
        <header className="shrink-0 px-3 py-2 border-b border-stroke-1 flex items-center gap-2">
          <Calendar size={13} style={{ color: accent }} />
          <h3 className="text-[12px] font-semibold">Sprints</h3>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="ml-auto p-1 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
            title="Neuer Sprint"
          >
            <Plus size={12} />
          </button>
        </header>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {showNew && (
            <div className="m-2 rounded-md border border-stroke-1 bg-bg-elevated p-2 space-y-1.5">
              <input
                autoFocus
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Sprint-Name…"
                className="w-full bg-bg-base border border-stroke-1 rounded-md px-2 py-1 text-[11.5px] outline-none focus:border-stroke-2"
              />
              <div className="flex gap-1.5">
                <input
                  type="date"
                  value={newStart}
                  onChange={(e) => setNewStart(e.target.value)}
                  className="flex-1 bg-bg-base border border-stroke-1 rounded-md px-2 py-1 text-[10.5px] outline-none focus:border-stroke-2"
                />
                <input
                  type="date"
                  value={newEnd}
                  onChange={(e) => setNewEnd(e.target.value)}
                  className="flex-1 bg-bg-base border border-stroke-1 rounded-md px-2 py-1 text-[10.5px] outline-none focus:border-stroke-2"
                />
              </div>
              <div className="flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowNew(false)}
                  className="text-[10.5px] text-text-tertiary px-2 py-1"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => void submitNew()}
                  disabled={creating || !newName.trim()}
                  className="px-2 py-1 rounded-md text-white text-[10.5px] inline-flex items-center gap-1 disabled:opacity-50"
                  style={{ background: accent }}
                >
                  {creating && <Loader2 size={10} className="spin" />}
                  Anlegen
                </button>
              </div>
            </div>
          )}
          {ordered.length === 0 && !showNew && (
            <div className="p-4 text-center text-[11.5px] text-text-tertiary">
              Noch kein Sprint angelegt.
            </div>
          )}
          <ul>
            {ordered.map((c) => {
              const cnt = issues.filter((i) => i.cycle === c.id).length;
              const isActive = activeId === c.id;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setActiveId(c.id)}
                    className={`w-full text-left px-3 py-2 border-l-2 ${
                      isActive
                        ? "bg-bg-overlay border-l-sky-500"
                        : "border-l-transparent hover:bg-bg-overlay/50"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[12px] font-medium text-text-primary truncate">
                        {c.name}
                      </span>
                      <span className="ml-auto text-[10.5px] font-mono text-text-tertiary tabular-nums">
                        {cnt}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <CycleStatusPill cycle={c} />
                      {c.startDate && c.endDate && (
                        <span className="text-[9.5px] text-text-tertiary">
                          {fmtRange(c.startDate, c.endDate)}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      {/* Sprint detail */}
      <section className="flex-1 min-w-0 flex flex-col min-h-0">
        {!active ? (
          <div className="flex-1 flex items-center justify-center text-text-tertiary text-[12.5px]">
            Wähle einen Sprint links.
          </div>
        ) : (
          <SprintDetail
            cycle={active}
            issues={cycleIssues}
            stateById={stateById}
            members={members}
            labels={labels}
            states={states}
            identifier={identifier}
            selectedIssueId={selectedIssueId}
            onSelectIssue={onSelectIssue}
            onMoveIssue={onMoveIssue}
            stats={stats}
            onUpdateCycle={onUpdateCycle}
            onDeleteCycle={onDeleteCycle}
            accent={accent}
          />
        )}
      </section>
    </div>
  );
}

function SprintDetail({
  cycle,
  issues,
  stateById,
  members,
  labels,
  states,
  identifier,
  selectedIssueId,
  onSelectIssue,
  onMoveIssue,
  stats,
  onUpdateCycle,
  onDeleteCycle,
  accent,
}: {
  cycle: CycleSummary;
  issues: IssueSummary[];
  stateById: Map<string, IssueState>;
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  states: IssueState[];
  identifier: string;
  selectedIssueId: string | null;
  onSelectIssue: (id: string) => void;
  onMoveIssue: (issueId: string, stateId: string) => Promise<void> | void;
  stats: {
    total: number;
    done: number;
    inProgress: number;
    points: number;
    donePoints: number;
    pct: number;
  };
  onUpdateCycle: (
    cycleId: string,
    input: {
      name?: string;
      startDate?: string | null;
      endDate?: string | null;
    },
  ) => Promise<void> | void;
  onDeleteCycle: (cycleId: string) => Promise<void> | void;
  accent: string;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cycle.name);
  const [start, setStart] = useState(cycle.startDate ?? "");
  const [end, setEnd] = useState(cycle.endDate ?? "");

  const saveEdit = async () => {
    await onUpdateCycle(cycle.id, {
      name,
      startDate: start || null,
      endDate: end || null,
    });
    setEditing(false);
  };

  const groups = useMemo(() => {
    const byGroup = new Map<string, { state: IssueState; issues: IssueSummary[] }[]>();
    for (const s of states) {
      if (!byGroup.has(s.group)) byGroup.set(s.group, []);
      byGroup.get(s.group)!.push({ state: s, issues: [] });
    }
    for (const i of issues) {
      const s = stateById.get(i.state);
      if (!s) continue;
      const arr = byGroup.get(s.group);
      if (!arr) continue;
      const bucket = arr.find((b) => b.state.id === i.state);
      if (bucket) bucket.issues.push(i);
    }
    return STATE_GROUP_ORDER.map((g) => {
      const buckets = byGroup.get(g) ?? [];
      const allIssues = buckets.flatMap((b) => b.issues);
      const firstStateId = buckets[0]?.state.id ?? null;
      return { group: g, firstStateId, issues: allIssues };
    });
  }, [issues, states, stateById]);

  return (
    <>
      <header className="shrink-0 px-4 py-3 border-b border-stroke-1 bg-bg-chrome">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            {editing ? (
              <div className="flex flex-col gap-1.5">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[14px] font-semibold outline-none focus:border-stroke-2"
                />
                <div className="flex gap-1.5">
                  <input
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                    className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[11.5px]"
                  />
                  <input
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                    className="bg-bg-elevated border border-stroke-1 rounded-md px-2 py-1 text-[11.5px]"
                  />
                  <button
                    type="button"
                    onClick={() => void saveEdit()}
                    className="px-2 py-1 rounded-md text-white text-[11.5px]"
                    style={{ background: accent }}
                  >
                    Speichern
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(false);
                      setName(cycle.name);
                      setStart(cycle.startDate ?? "");
                      setEnd(cycle.endDate ?? "");
                    }}
                    className="px-2 py-1 rounded-md border border-stroke-1 text-[11.5px] text-text-tertiary"
                  >
                    Abbrechen
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 text-[10.5px] text-text-tertiary mb-0.5">
                  <CycleStatusPill cycle={cycle} />
                  {cycle.startDate && cycle.endDate && (
                    <span>{fmtRange(cycle.startDate, cycle.endDate)}</span>
                  )}
                  <span>· {daysLeftLabel(cycle)}</span>
                </div>
                <h2 className="text-[16px] font-semibold text-text-primary truncate">
                  {cycle.name}
                </h2>
              </>
            )}
          </div>
          {!editing && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="p-1.5 rounded-md hover:bg-bg-overlay text-text-tertiary hover:text-text-primary"
                title="Bearbeiten"
              >
                <Pencil size={13} />
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`Sprint "${cycle.name}" wirklich löschen?`)) {
                    void onDeleteCycle(cycle.id);
                  }
                }}
                className="p-1.5 rounded-md hover:bg-red-500/10 text-text-tertiary hover:text-red-500"
                title="Sprint löschen"
              >
                <X size={13} />
              </button>
            </div>
          )}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-3">
          <Stat label="Issues" value={String(stats.total)} />
          <Stat
            label="Erledigt"
            value={`${stats.done} (${stats.pct}%)`}
            tone="success"
          />
          <Stat label="In Arbeit" value={String(stats.inProgress)} tone="info" />
          <Stat
            label="Story Points"
            value={
              stats.points === 0
                ? "—"
                : `${stats.donePoints} / ${stats.points}`
            }
          />
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-bg-elevated overflow-hidden">
          <div
            className="h-full transition-all"
            style={{
              width: `${stats.pct}%`,
              background: stats.pct === 100 ? "#10b981" : accent,
            }}
          />
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-x-auto overflow-y-hidden">
        <div className="h-full flex gap-3 p-3 min-w-max">
          {groups.map((col) => (
            <SprintColumn
              key={col.group}
              group={col.group}
              firstStateId={col.firstStateId}
              issues={col.issues}
              members={members}
              labels={labels}
              identifier={identifier}
              stateById={stateById}
              selectedIssueId={selectedIssueId}
              onSelectIssue={onSelectIssue}
              onMoveIssue={onMoveIssue}
              accent={accent}
            />
          ))}
        </div>
      </div>
    </>
  );
}

function SprintColumn({
  group,
  firstStateId,
  issues,
  members,
  labels,
  identifier,
  stateById,
  selectedIssueId,
  onSelectIssue,
  onMoveIssue,
  accent,
}: {
  group: string;
  firstStateId: string | null;
  issues: IssueSummary[];
  members: Map<string, WorkspaceMember>;
  labels: Map<string, IssueLabel>;
  identifier: string;
  stateById: Map<string, IssueState>;
  selectedIssueId: string | null;
  onSelectIssue: (id: string) => void;
  onMoveIssue: (issueId: string, stateId: string) => Promise<void> | void;
  accent: string;
}) {
  const [over, setOver] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  return (
    <div
      className="flex flex-col w-[260px] shrink-0 bg-bg-chrome rounded-lg border border-stroke-1 min-h-0"
      onDragOver={(e) => {
        if (!firstStateId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        if (!over) setOver(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const id = dragId ?? e.dataTransfer.getData("text/plain");
        if (!id || !firstStateId) return;
        void onMoveIssue(id, firstStateId);
        setDragId(null);
        setOver(false);
      }}
      style={over ? { boxShadow: `inset 0 0 0 2px ${accent}` } : undefined}
    >
      <header className="flex items-center gap-2 px-3 py-2 border-b border-stroke-1">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full"
          style={{ background: STATE_GROUP_COLOR[group] }}
        />
        <h3 className="text-[11px] font-semibold uppercase tracking-wide">
          {STATE_GROUP_LABEL[group] ?? group}
        </h3>
        <span className="ml-auto text-[10.5px] font-mono text-text-tertiary">
          {issues.length}
        </span>
      </header>
      <div className="flex-1 min-h-0 overflow-y-auto px-2 py-2 space-y-2">
        {issues.length === 0 && (
          <p className="text-[11px] text-text-quaternary text-center py-6">
            —
          </p>
        )}
        {issues.map((issue) => (
          <IssueCard
            key={issue.id}
            issue={issue}
            identifier={identifier}
            state={stateById.get(issue.state)}
            members={members}
            labels={labels}
            density="compact"
            selected={selectedIssueId === issue.id}
            onClick={() => onSelectIssue(issue.id)}
            draggable
            onDragStart={(e) => {
              setDragId(issue.id);
              e.dataTransfer.effectAllowed = "move";
              e.dataTransfer.setData("text/plain", issue.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success" | "info";
}) {
  const color =
    tone === "success" ? "#10b981" : tone === "info" ? "#3b82f6" : undefined;
  return (
    <div className="rounded-md border border-stroke-1 bg-bg-elevated px-2.5 py-1.5">
      <p className="text-[9.5px] uppercase tracking-wide text-text-tertiary">
        {label}
      </p>
      <p
        className="text-[14px] font-semibold tabular-nums"
        style={color ? { color } : undefined}
      >
        {value}
      </p>
    </div>
  );
}

function fmtRange(start: string, end: string): string {
  const s = new Date(start);
  const e = new Date(end);
  const o: Intl.DateTimeFormatOptions = { day: "2-digit", month: "short" };
  return `${s.toLocaleDateString("de-DE", o)} – ${e.toLocaleDateString(
    "de-DE",
    o,
  )}`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysLeftLabel(cycle: CycleSummary): string {
  if (cycle.status === "completed") return "abgeschlossen";
  if (cycle.status === "draft") return "Entwurf";
  if (!cycle.endDate) return "ohne Enddatum";
  const ms = new Date(cycle.endDate).getTime() - Date.now();
  const days = Math.ceil(ms / 86_400_000);
  if (days < 0) return `${Math.abs(days)} Tage überfällig`;
  if (days === 0) return "endet heute";
  if (days === 1) return "noch 1 Tag";
  return `noch ${days} Tage`;
}
