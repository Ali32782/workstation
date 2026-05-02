"use client";

import { useMemo, useRef, useState } from "react";
import { Calendar } from "lucide-react";
import type {
  CycleSummary,
  IssueState,
  IssueSummary,
} from "@/lib/projects/types";
import { CycleStatusPill, STATE_GROUP_COLOR } from "./shared";
import { useLocale } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

const DAY_MS = 86_400_000;

/**
 * Roadmap timeline (Gantt-style) for cycles. Each cycle is a horizontal
 * bar on the timeline, scaled to its [startDate, endDate] interval.
 *
 * Drag the right edge of a bar to extend the cycle's end date; drag the
 * whole bar to shift both endpoints. The grid header shows weeks/months
 * depending on the zoom level.
 */
export function JiraRoadmap({
  cycles,
  issues,
  states,
  onUpdateCycle,
  accent,
}: {
  cycles: CycleSummary[];
  issues: IssueSummary[];
  states: IssueState[];
  onUpdateCycle: (
    cycleId: string,
    input: { startDate?: string | null; endDate?: string | null },
  ) => Promise<void> | void;
  accent: string;
}) {
  const { t, locale } = useLocale();
  const localeFmt = useMemo(() => localeTag(locale), [locale]);
  const [zoom, setZoom] = useState<"weeks" | "months">("weeks");

  const stateById = useMemo(() => {
    const m = new Map<string, IssueState>();
    for (const s of states) m.set(s.id, s);
    return m;
  }, [states]);

  const datedCycles = useMemo(
    () =>
      cycles.filter(
        (c): c is CycleSummary & { startDate: string; endDate: string } =>
          !!c.startDate && !!c.endDate,
      ),
    [cycles],
  );

  // Determine timeline bounds: span from earliest cycle to latest, with a
  // little padding. If everything is in the future, anchor to today.
  const bounds = useMemo(() => {
    if (datedCycles.length === 0) {
      const today = startOfDay(new Date());
      return {
        start: addDays(today, -7),
        end: addDays(today, 60),
      };
    }
    const min = Math.min(
      ...datedCycles.map((c) => new Date(c.startDate).getTime()),
    );
    const max = Math.max(
      ...datedCycles.map((c) => new Date(c.endDate).getTime()),
    );
    return {
      start: startOfDay(new Date(min - DAY_MS * 7)),
      end: startOfDay(new Date(max + DAY_MS * 7)),
    };
  }, [datedCycles]);

  // Pixel-per-day. weeks → 18px/day, months → 6px/day.
  const PPD = zoom === "weeks" ? 18 : 6;
  const totalDays = Math.ceil(
    (bounds.end.getTime() - bounds.start.getTime()) / DAY_MS,
  );
  const totalWidth = totalDays * PPD;

  // Pre-compute month/week tick marks for the header.
  const ticks = useMemo(() => {
    const xs: { x: number; label: string; major: boolean }[] = [];
    const cursor = new Date(bounds.start);
    cursor.setDate(1);
    while (cursor.getTime() < bounds.end.getTime()) {
      const offsetDays = Math.round(
        (cursor.getTime() - bounds.start.getTime()) / DAY_MS,
      );
      xs.push({
        x: offsetDays * PPD,
        label: cursor.toLocaleDateString(localeFmt, {
          month: "short",
          year: "2-digit",
        }),
        major: true,
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    if (zoom === "weeks") {
      const w = new Date(bounds.start);
      // align to next monday
      const day = w.getDay();
      const offset = (8 - day) % 7;
      w.setDate(w.getDate() + offset);
      while (w.getTime() < bounds.end.getTime()) {
        const offsetDays = Math.round(
          (w.getTime() - bounds.start.getTime()) / DAY_MS,
        );
        xs.push({
          x: offsetDays * PPD,
          label: t("projects.roadmap.weekLabel").replace(
            "{n}",
            String(weekNumber(w)),
          ),
          major: false,
        });
        w.setDate(w.getDate() + 7);
      }
    }
    return xs.sort((a, b) => a.x - b.x);
  }, [bounds, PPD, zoom, localeFmt, t]);

  const todayX = useMemo(() => {
    const today = startOfDay(new Date()).getTime();
    if (today < bounds.start.getTime() || today > bounds.end.getTime()) return null;
    return Math.round((today - bounds.start.getTime()) / DAY_MS) * PPD;
  }, [bounds, PPD]);

  const scrollerRef = useRef<HTMLDivElement>(null);
  const scrollToToday = () => {
    if (todayX == null || !scrollerRef.current) return;
    scrollerRef.current.scrollLeft = Math.max(0, todayX - 200);
  };

  const orderedCycles = useMemo(
    () =>
      [...cycles].sort((a, b) => {
        const ad = a.startDate ? new Date(a.startDate).getTime() : Infinity;
        const bd = b.startDate ? new Date(b.startDate).getTime() : Infinity;
        return ad - bd;
      }),
    [cycles],
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      <header className="shrink-0 px-3 py-2 border-b border-stroke-1 bg-bg-chrome flex items-center gap-2">
        <Calendar size={13} style={{ color: accent }} />
        <h3 className="text-[12px] font-semibold">{t("projects.roadmap.title")}</h3>
        <span className="text-[10.5px] text-text-tertiary">
          {t("projects.roadmap.subtitle").replace(
            "{count}",
            String(datedCycles.length),
          )}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <div className="inline-flex rounded-md border border-stroke-1 overflow-hidden text-[10.5px]">
            {(["weeks", "months"] as const).map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                className={`px-2 py-1 ${
                  zoom === z
                    ? "text-white"
                    : "text-text-tertiary hover:text-text-primary bg-bg-elevated"
                }`}
                style={zoom === z ? { background: accent } : undefined}
              >
                {z === "weeks" ? t("projects.roadmap.weeks") : t("projects.roadmap.months")}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={scrollToToday}
            className="ml-1 px-2 py-1 rounded-md border border-stroke-1 text-[10.5px] text-text-tertiary hover:text-text-primary"
          >
            {t("projects.roadmap.today")}
          </button>
        </div>
      </header>

      <div ref={scrollerRef} className="flex-1 min-h-0 overflow-auto">
        <div className="relative" style={{ width: totalWidth + 200, minWidth: "100%" }}>
          {/* Sticky left rail with cycle names */}
          <div className="sticky left-0 z-20 inline-block w-[200px] align-top bg-bg-base border-r border-stroke-1">
            <div
              className="h-[60px] flex items-end px-3 pb-2 border-b border-stroke-1 bg-bg-chrome text-[10.5px] uppercase tracking-wide text-text-tertiary"
            >
              {t("projects.roadmap.sprintColumn")}
            </div>
            {orderedCycles.map((c) => {
              const cnt = issues.filter((i) => i.cycle === c.id).length;
              const done = issues.filter((i) => {
                if (i.cycle !== c.id) return false;
                const s = stateById.get(i.state);
                return s?.group === "completed";
              }).length;
              return (
                <div
                  key={c.id}
                  className="h-[44px] flex items-center px-3 border-b border-stroke-1/50 gap-2"
                >
                  <CycleStatusPill cycle={c} />
                  <span className="text-[12px] font-medium truncate">{c.name}</span>
                  <span className="ml-auto text-[10px] text-text-tertiary tabular-nums">
                    {done}/{cnt}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Timeline */}
          <div
            className="inline-block align-top relative"
            style={{ width: totalWidth }}
          >
            <div className="h-[60px] border-b border-stroke-1 bg-bg-chrome relative">
              {ticks.map((tick, i) => (
                <div
                  key={i}
                  className={`absolute top-0 bottom-0 ${
                    tick.major ? "border-l border-stroke-2" : "border-l border-stroke-1/50"
                  }`}
                  style={{ left: tick.x }}
                >
                  <span
                    className={`absolute top-1 left-1 text-[9.5px] ${
                      tick.major
                        ? "text-text-secondary font-semibold"
                        : "text-text-tertiary"
                    }`}
                  >
                    {tick.label}
                  </span>
                </div>
              ))}
              {todayX != null && (
                <div
                  className="absolute top-0 bottom-0 border-l-2"
                  style={{ left: todayX, borderColor: "#ef4444" }}
                  title={t("projects.roadmap.todayTooltip")}
                />
              )}
            </div>

            {orderedCycles.map((c) => (
              <RoadmapRow
                key={c.id}
                cycle={c}
                bounds={bounds}
                ppd={PPD}
                todayX={todayX}
                onUpdateCycle={onUpdateCycle}
                accent={accent}
                resizeEndTooltip={t("projects.roadmap.resizeEndTooltip")}
              />
            ))}

            {datedCycles.length === 0 && (
              <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-[12px]">
                {t("projects.roadmap.empty")}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function RoadmapRow({
  cycle,
  bounds,
  ppd,
  todayX,
  onUpdateCycle,
  accent,
  resizeEndTooltip,
}: {
  cycle: CycleSummary;
  bounds: { start: Date; end: Date };
  ppd: number;
  todayX: number | null;
  onUpdateCycle: (
    cycleId: string,
    input: { startDate?: string | null; endDate?: string | null },
  ) => Promise<void> | void;
  accent: string;
  resizeEndTooltip: string;
}) {
  const [drag, setDrag] = useState<
    | null
    | { mode: "move" | "resize-end"; startX: number; origStart: Date; origEnd: Date }
  >(null);

  const start = cycle.startDate ? new Date(cycle.startDate) : null;
  const end = cycle.endDate ? new Date(cycle.endDate) : null;
  const offsetX =
    start && end
      ? Math.round(
          (start.getTime() - bounds.start.getTime()) / DAY_MS,
        ) * ppd
      : null;
  const widthPx =
    start && end
      ? Math.max(
          ppd,
          Math.round((end.getTime() - start.getTime()) / DAY_MS) * ppd,
        )
      : null;

  const color =
    cycle.status === "completed"
      ? STATE_GROUP_COLOR.completed
      : cycle.status === "current"
        ? "#10b981"
        : accent;

  const startMove = (mode: "move" | "resize-end") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!start || !end) return;
    setDrag({ mode, startX: e.clientX, origStart: start, origEnd: end });
    const onMove = (m: MouseEvent) => {
      const deltaPx = m.clientX - e.clientX;
      const deltaDays = Math.round(deltaPx / ppd);
      let newStart = start;
      let newEnd = end;
      if (mode === "move") {
        newStart = addDays(start, deltaDays);
        newEnd = addDays(end, deltaDays);
      } else {
        newEnd = addDays(end, deltaDays);
        if (newEnd.getTime() < start.getTime()) {
          newEnd = new Date(start);
        }
      }
      const ghost = document.getElementById(`ghost-${cycle.id}`);
      if (ghost) {
        const newOffset =
          Math.round((newStart.getTime() - bounds.start.getTime()) / DAY_MS) *
          ppd;
        const newWidth = Math.max(
          ppd,
          Math.round((newEnd.getTime() - newStart.getTime()) / DAY_MS) * ppd,
        );
        ghost.style.left = `${newOffset}px`;
        ghost.style.width = `${newWidth}px`;
      }
    };
    const onUp = (m: MouseEvent) => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      const deltaPx = m.clientX - e.clientX;
      const deltaDays = Math.round(deltaPx / ppd);
      if (deltaDays === 0) {
        setDrag(null);
        return;
      }
      let newStart = start;
      let newEnd = end;
      if (mode === "move") {
        newStart = addDays(start, deltaDays);
        newEnd = addDays(end, deltaDays);
      } else {
        newEnd = addDays(end, deltaDays);
        if (newEnd.getTime() < start.getTime()) newEnd = new Date(start);
      }
      void onUpdateCycle(cycle.id, {
        startDate: toIsoDate(newStart),
        endDate: toIsoDate(newEnd),
      });
      setDrag(null);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className="h-[44px] relative border-b border-stroke-1/50"
      style={{ background: todayX != null ? "transparent" : undefined }}
    >
      {todayX != null && (
        <div
          className="absolute top-0 bottom-0 border-l border-red-500/60"
          style={{ left: todayX }}
        />
      )}
      {offsetX != null && widthPx != null && (
        <div
          id={`ghost-${cycle.id}`}
          className="absolute top-2 bottom-2 rounded-md flex items-center px-2 text-[11px] text-white font-medium select-none cursor-grab active:cursor-grabbing"
          style={{
            left: offsetX,
            width: widthPx,
            background: color,
            opacity: drag ? 0.85 : 1,
          }}
          onMouseDown={startMove("move")}
          title={`${cycle.name}: ${cycle.startDate} → ${cycle.endDate}`}
        >
          <span className="truncate flex-1">{cycle.name}</span>
          <span
            className="ml-1 w-1.5 self-stretch cursor-ew-resize hover:bg-white/40 rounded-r"
            onMouseDown={startMove("resize-end")}
            title={resizeEndTooltip}
          />
        </div>
      )}
    </div>
  );
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function weekNumber(d: Date): number {
  // ISO 8601 week number
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  return Math.ceil(
    ((tmp.getTime() - yearStart.getTime()) / DAY_MS + 1) / 7,
  );
}
