"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  RefreshCw,
  X,
  Trash2,
  MapPin,
  Users as UsersIcon,
  Loader2,
  CalendarDays,
} from "lucide-react";
import type { Calendar, CalendarEvent, EventInput } from "@/lib/calendar/types";

type View = "month" | "week" | "day";

const WEEKDAYS_DE = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const MONTHS_DE = [
  "Januar",
  "Februar",
  "März",
  "April",
  "Mai",
  "Juni",
  "Juli",
  "August",
  "September",
  "Oktober",
  "November",
  "Dezember",
];

/** Local-day key used for grouping events into the month grid. */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
/** Monday-based start-of-week for German UX. */
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // Mon=0 … Sun=6
  const out = new Date(d);
  out.setDate(d.getDate() - diff);
  out.setHours(0, 0, 0, 0);
  return out;
}
function endOfWeek(d: Date): Date {
  const out = startOfWeek(d);
  out.setDate(out.getDate() + 6);
  out.setHours(23, 59, 59, 999);
  return out;
}
function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(d.getDate() + n);
  return out;
}

function buildMonthCells(anchor: Date): Date[] {
  const start = startOfWeek(startOfMonth(anchor));
  const cells: Date[] = [];
  for (let i = 0; i < 42; i++) cells.push(addDays(start, i));
  return cells;
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function fmtRange(a: string, b: string, allDay: boolean): string {
  if (allDay) return "Ganztägig";
  return `${fmtTime(a)}–${fmtTime(b)}`;
}

function inputDateValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function inputTimeValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localDateTime(date: string, time: string): string {
  // Build a JS Date in local time, then emit ISO. Using `new Date("YYYY-MM-DDTHH:mm")`
  // is parsed as local-tz, which is what the Outlook-style picker expects.
  return new Date(`${date}T${time}`).toISOString();
}

type ComposeState = {
  calendarId: string;
  title: string;
  description: string;
  location: string;
  date: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  attendees: string;
};

export function CalendarClient({
  workspace,
  accent,
  selfEmail,
  selfName,
}: {
  workspace: string;
  accent: string;
  selfEmail: string;
  selfName: string;
}) {
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [calendars, setCalendars] = useState<Calendar[]>([]);
  const [hiddenCals, setHiddenCals] = useState<Set<string>>(new Set());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);
  const [compose, setCompose] = useState<ComposeState | null>(null);
  const inflight = useRef(false);

  /* ----------------------------- Range to fetch ---------------------------- */

  const range = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(anchor));
      const end = addDays(start, 42);
      return { from: start, to: end };
    }
    if (view === "week") {
      return { from: startOfWeek(anchor), to: addDays(endOfWeek(anchor), 1) };
    }
    const dayStart = new Date(anchor);
    dayStart.setHours(0, 0, 0, 0);
    return { from: dayStart, to: addDays(dayStart, 1) };
  }, [view, anchor]);

  /* -------------------------------- Fetcher -------------------------------- */

  const refresh = useCallback(async () => {
    if (inflight.current) return;
    inflight.current = true;
    setLoading(true);
    setError(null);
    try {
      const url = `/api/calendar/events?workspace=${encodeURIComponent(workspace)}&from=${encodeURIComponent(range.from.toISOString())}&to=${encodeURIComponent(range.to.toISOString())}`;
      const r = await fetch(url, { cache: "no-store" });
      const j = (await r.json()) as {
        events?: CalendarEvent[];
        calendars?: Calendar[];
        error?: string;
      };
      if (j.error) setError(j.error);
      setEvents(j.events ?? []);
      if (j.calendars) setCalendars(j.calendars);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  }, [workspace, range.from, range.to]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  /* ------------------------------- Derived view ---------------------------- */

  const filteredEvents = useMemo(
    () => events.filter((e) => !hiddenCals.has(e.calendarId)),
    [events, hiddenCals],
  );

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of filteredEvents) {
      const d = new Date(e.start);
      const k = dayKey(d);
      const list = map.get(k) ?? [];
      list.push(e);
      map.set(k, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => {
        if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
        return a.start.localeCompare(b.start);
      });
    }
    return map;
  }, [filteredEvents]);

  /* ------------------------------- Navigation ------------------------------ */

  const goPrev = () => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setAnchor(d);
  };
  const goNext = () => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setAnchor(d);
  };
  const goToday = () => setAnchor(new Date());

  /* ------------------------------- Composition ----------------------------- */

  const openCompose = (date?: Date) => {
    const start = date ? new Date(date) : new Date();
    if (!date) {
      // Default to next half-hour slot.
      start.setMinutes(start.getMinutes() < 30 ? 30 : 0);
      if (start.getMinutes() === 0) start.setHours(start.getHours() + 1);
      start.setSeconds(0, 0);
    } else {
      start.setHours(9, 0, 0, 0);
    }
    const end = new Date(start);
    end.setHours(start.getHours() + 1);
    const writable =
      calendars.find((c) => c.owner)?.id ?? calendars[0]?.id ?? "personal";
    setCompose({
      calendarId: writable,
      title: "",
      description: "",
      location: "",
      date: inputDateValue(start),
      startTime: inputTimeValue(start),
      endTime: inputTimeValue(end),
      allDay: false,
      attendees: "",
    });
  };

  const submitCompose = async () => {
    if (!compose) return;
    const startIso = compose.allDay
      ? new Date(`${compose.date}T00:00:00`).toISOString()
      : localDateTime(compose.date, compose.startTime);
    const endIso = compose.allDay
      ? new Date(`${compose.date}T23:59:59`).toISOString()
      : localDateTime(compose.date, compose.endTime);
    const body: EventInput = {
      calendarId: compose.calendarId,
      title: compose.title.trim() || "(ohne Titel)",
      description: compose.description,
      location: compose.location,
      start: startIso,
      end: endIso,
      allDay: compose.allDay,
      attendees: compose.attendees
        .split(/[,\s;]+/)
        .map((a) => a.trim())
        .filter(Boolean),
    };
    const r = await fetch(
      `/api/calendar/event?workspace=${encodeURIComponent(workspace)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    if (r.ok) {
      setCompose(null);
      refresh();
    } else {
      const j = await r.json().catch(() => ({}));
      alert(j.error ?? `Fehler beim Speichern (HTTP ${r.status})`);
    }
  };

  const deleteEvent = async (ev: CalendarEvent) => {
    if (!confirm(`„${ev.title}" wirklich löschen?`)) return;
    const r = await fetch(
      `/api/calendar/event?workspace=${encodeURIComponent(workspace)}&id=${encodeURIComponent(ev.id)}`,
      { method: "DELETE" },
    );
    if (r.ok) {
      setActiveEvent(null);
      setEvents((es) => es.filter((e) => e.id !== ev.id));
    } else {
      alert(`Löschen fehlgeschlagen (HTTP ${r.status})`);
    }
  };

  const toggleCal = (id: string) => {
    setHiddenCals((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  /* ------------------------------- Header label ---------------------------- */

  const headerLabel = useMemo(() => {
    if (view === "month") {
      return `${MONTHS_DE[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }
    if (view === "week") {
      const ws = startOfWeek(anchor);
      const we = endOfWeek(anchor);
      const sameMonth = ws.getMonth() === we.getMonth();
      return sameMonth
        ? `${ws.getDate()}.–${we.getDate()}. ${MONTHS_DE[ws.getMonth()]} ${ws.getFullYear()}`
        : `${ws.getDate()}. ${MONTHS_DE[ws.getMonth()]} – ${we.getDate()}. ${MONTHS_DE[we.getMonth()]} ${we.getFullYear()}`;
    }
    return `${WEEKDAYS_DE[(anchor.getDay() + 6) % 7]}, ${anchor.getDate()}. ${MONTHS_DE[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [view, anchor]);

  /* --------------------------------- Render -------------------------------- */

  return (
    <div className="h-full flex">
      {/* ─────────────── Left rail: calendars + mini month ─────────────── */}
      <aside className="w-64 shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
        <div className="p-3 border-b border-stroke-1">
          <button
            onClick={() => openCompose()}
            className="w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium text-white"
            style={{ background: accent }}
          >
            <Plus size={16} />
            Neuer Termin
          </button>
        </div>
        <div className="p-3 text-xs uppercase tracking-wide text-text-tertiary">
          Kalender
        </div>
        <div className="px-2 pb-3 space-y-0.5 overflow-auto">
          {calendars.length === 0 && !loading && (
            <div className="px-2 py-1 text-xs text-text-tertiary">
              Keine Kalender gefunden.
            </div>
          )}
          {calendars.map((c) => {
            const hidden = hiddenCals.has(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggleCal(c.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-sm text-left text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
              >
                <span
                  className="w-3 h-3 rounded-sm border border-stroke-2"
                  style={{ background: hidden ? "transparent" : c.color }}
                  aria-hidden
                />
                <span className="truncate flex-1">{c.name}</span>
                {!c.owner && (
                  <span className="text-[10px] text-text-quaternary">geteilt</span>
                )}
              </button>
            );
          })}
        </div>
        <div className="mt-auto p-3 border-t border-stroke-1 text-xs text-text-tertiary">
          <div className="flex items-center gap-2">
            <CalendarDays size={12} />
            <span className="truncate">{selfName}</span>
          </div>
          <div className="truncate font-mono mt-0.5">{selfEmail}</div>
        </div>
      </aside>

      {/* ─────────────── Main pane ─────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* toolbar */}
        <div className="h-12 shrink-0 border-b border-stroke-1 bg-bg-chrome px-3 flex items-center gap-2">
          <button
            onClick={goToday}
            className="px-3 py-1.5 text-xs font-medium rounded border border-stroke-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            Heute
          </button>
          <button
            onClick={goPrev}
            className="p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            aria-label="Zurück"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            aria-label="Vor"
          >
            <ChevronRight size={18} />
          </button>
          <h1 className="ml-1 text-sm font-semibold text-text-primary">
            {headerLabel}
          </h1>
          {loading && (
            <Loader2 size={14} className="ml-2 spin text-text-tertiary" />
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={refresh}
              className="p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
              aria-label="Aktualisieren"
            >
              <RefreshCw size={15} />
            </button>
            <div className="ml-2 inline-flex rounded border border-stroke-1 overflow-hidden text-xs">
              {(["month", "week", "day"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 ${view === v ? "bg-bg-overlay text-text-primary" : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary"}`}
                >
                  {v === "month" ? "Monat" : v === "week" ? "Woche" : "Tag"}
                </button>
              ))}
            </div>
          </div>
        </div>

        {error && (
          <div className="px-3 py-2 text-xs text-warning border-b border-stroke-1 bg-bg-elevated">
            {error}
          </div>
        )}

        {/* grid */}
        <div className="flex-1 overflow-auto">
          {view === "month" && (
            <MonthGrid
              anchor={anchor}
              eventsByDay={eventsByDay}
              accent={accent}
              onSelectEvent={setActiveEvent}
              onSelectDay={(d) => openCompose(d)}
            />
          )}
          {view === "week" && (
            <WeekOrDayList
              days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))}
              eventsByDay={eventsByDay}
              accent={accent}
              onSelectEvent={setActiveEvent}
            />
          )}
          {view === "day" && (
            <WeekOrDayList
              days={[anchor]}
              eventsByDay={eventsByDay}
              accent={accent}
              onSelectEvent={setActiveEvent}
            />
          )}
        </div>
      </div>

      {/* ─────────────── Detail drawer ─────────────── */}
      {activeEvent && (
        <EventDrawer
          event={activeEvent}
          onClose={() => setActiveEvent(null)}
          onDelete={() => deleteEvent(activeEvent)}
        />
      )}

      {/* ─────────────── Compose modal ─────────────── */}
      {compose && (
        <ComposeModal
          state={compose}
          calendars={calendars.filter((c) => c.owner)}
          accent={accent}
          onChange={setCompose}
          onCancel={() => setCompose(null)}
          onSubmit={submitCompose}
        />
      )}
    </div>
  );
}

/* ============================== Month grid ============================== */

function MonthGrid({
  anchor,
  eventsByDay,
  accent,
  onSelectEvent,
  onSelectDay,
}: {
  anchor: Date;
  eventsByDay: Map<string, CalendarEvent[]>;
  accent: string;
  onSelectEvent: (e: CalendarEvent) => void;
  onSelectDay: (d: Date) => void;
}) {
  const cells = useMemo(() => buildMonthCells(anchor), [anchor]);
  const todayKey = dayKey(new Date());
  const monthIdx = anchor.getMonth();

  return (
    <div className="h-full flex flex-col">
      {/* weekday header */}
      <div className="grid grid-cols-7 border-b border-stroke-1 bg-bg-chrome shrink-0">
        {WEEKDAYS_DE.map((d) => (
          <div
            key={d}
            className="px-2 py-2 text-xs font-medium uppercase tracking-wide text-text-tertiary"
          >
            {d}
          </div>
        ))}
      </div>
      {/* 6 rows × 7 cols */}
      <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0">
        {cells.map((d, idx) => {
          const k = dayKey(d);
          const isCurrentMonth = d.getMonth() === monthIdx;
          const isToday = k === todayKey;
          const dayEvents = eventsByDay.get(k) ?? [];
          const visible = dayEvents.slice(0, 3);
          const more = dayEvents.length - visible.length;
          return (
            <div
              key={idx}
              className={`relative border-b border-r border-stroke-1 p-1 overflow-hidden cursor-pointer hover:bg-bg-elevated ${isCurrentMonth ? "" : "bg-bg-base/40"}`}
              onClick={() => onSelectDay(d)}
            >
              <div className="flex items-start justify-between">
                <span
                  className={`inline-flex items-center justify-center text-xs h-6 w-6 rounded-full ${
                    isToday
                      ? "text-white font-semibold"
                      : isCurrentMonth
                        ? "text-text-primary"
                        : "text-text-quaternary"
                  }`}
                  style={isToday ? { background: accent } : undefined}
                >
                  {d.getDate()}
                </span>
              </div>
              <div className="mt-1 space-y-0.5">
                {visible.map((e) => (
                  <button
                    key={e.id + e.start}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelectEvent(e);
                    }}
                    className="w-full text-left text-[11px] px-1.5 py-0.5 rounded truncate hover:opacity-80"
                    style={{
                      background: `${e.color}33`,
                      color: e.color,
                      borderLeft: `3px solid ${e.color}`,
                    }}
                    title={`${e.title} · ${fmtRange(e.start, e.end, e.allDay)}`}
                  >
                    {e.allDay ? "" : `${fmtTime(e.start)} `}
                    <span className="text-text-primary">{e.title}</span>
                  </button>
                ))}
                {more > 0 && (
                  <div className="text-[10px] text-text-tertiary px-1.5">
                    +{more} weitere
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ Week / Day list =========================== */

function WeekOrDayList({
  days,
  eventsByDay,
  accent,
  onSelectEvent,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  accent: string;
  onSelectEvent: (e: CalendarEvent) => void;
}) {
  const todayKey = dayKey(new Date());
  return (
    <div className="divide-y divide-stroke-1">
      {days.map((d) => {
        const k = dayKey(d);
        const isToday = k === todayKey;
        const dayEvents = eventsByDay.get(k) ?? [];
        return (
          <div key={k} className="px-4 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`inline-flex items-center justify-center text-xs h-6 w-6 rounded-full ${isToday ? "text-white font-semibold" : "text-text-primary"}`}
                style={isToday ? { background: accent } : undefined}
              >
                {d.getDate()}
              </span>
              <span className="text-sm font-medium text-text-primary">
                {WEEKDAYS_DE[(d.getDay() + 6) % 7]}, {d.getDate()}.{" "}
                {MONTHS_DE[d.getMonth()]}
              </span>
              <span className="text-xs text-text-tertiary">
                {dayEvents.length} Termin{dayEvents.length === 1 ? "" : "e"}
              </span>
            </div>
            {dayEvents.length === 0 && (
              <div className="text-xs text-text-tertiary pl-8">
                Keine Termine.
              </div>
            )}
            <div className="space-y-1 pl-8">
              {dayEvents.map((e) => (
                <button
                  key={e.id + e.start}
                  onClick={() => onSelectEvent(e)}
                  className="w-full text-left flex items-center gap-3 px-2 py-2 rounded border border-stroke-1 hover:bg-bg-elevated"
                  style={{ borderLeft: `3px solid ${e.color}` }}
                >
                  <span className="text-xs font-mono text-text-tertiary w-24 shrink-0">
                    {fmtRange(e.start, e.end, e.allDay)}
                  </span>
                  <span className="text-sm text-text-primary flex-1 truncate">
                    {e.title}
                  </span>
                  {e.location && (
                    <span className="text-xs text-text-tertiary truncate max-w-[200px]">
                      <MapPin size={11} className="inline mr-1" />
                      {e.location}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ============================== Drawer ================================= */

function EventDrawer({
  event,
  onClose,
  onDelete,
}: {
  event: CalendarEvent;
  onClose: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="w-96 shrink-0 border-l border-stroke-1 bg-bg-chrome flex flex-col">
      <div className="h-12 shrink-0 border-b border-stroke-1 px-3 flex items-center">
        <h2 className="text-sm font-semibold text-text-primary truncate">
          {event.title}
        </h2>
        <button
          onClick={onClose}
          className="ml-auto p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          aria-label="Schließen"
        >
          <X size={16} />
        </button>
      </div>
      <div className="p-4 space-y-4 overflow-auto">
        <div className="flex items-center gap-3">
          <span
            className="w-3 h-3 rounded-sm"
            style={{ background: event.color }}
            aria-hidden
          />
          <div className="text-xs text-text-tertiary">{event.calendarId}</div>
        </div>
        <div>
          <div className="text-xs text-text-tertiary uppercase mb-1">Wann</div>
          <div className="text-sm text-text-primary">
            {fmtRange(event.start, event.end, event.allDay)}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {new Date(event.start).toLocaleDateString("de-DE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
        </div>
        {event.location && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">Ort</div>
            <div className="text-sm text-text-primary flex items-center gap-2">
              <MapPin size={14} />
              {event.location}
            </div>
          </div>
        )}
        {event.attendees.length > 0 && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              Teilnehmer
            </div>
            <ul className="text-sm text-text-primary space-y-1">
              {event.attendees.map((a) => (
                <li key={a} className="flex items-center gap-2">
                  <UsersIcon size={14} className="text-text-tertiary" />
                  {a}
                </li>
              ))}
            </ul>
          </div>
        )}
        {event.description && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              Beschreibung
            </div>
            <div className="text-sm text-text-primary whitespace-pre-wrap">
              {event.description}
            </div>
          </div>
        )}
        {event.recurring && (
          <div className="text-xs text-text-tertiary border-t border-stroke-1 pt-3">
            Serientermin · {event.rrule}
          </div>
        )}
      </div>
      <div className="mt-auto p-3 border-t border-stroke-1">
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium text-danger border border-stroke-1 hover:bg-bg-overlay"
        >
          <Trash2 size={14} />
          Löschen
        </button>
      </div>
    </div>
  );
}

/* ============================== Compose ================================ */

function ComposeModal({
  state,
  calendars,
  accent,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: ComposeState;
  calendars: Calendar[];
  accent: string;
  onChange: (s: ComposeState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-bg-elevated border border-stroke-1 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="h-12 border-b border-stroke-1 px-4 flex items-center">
          <h2 className="text-sm font-semibold text-text-primary">
            Neuer Termin
          </h2>
          <button
            onClick={onCancel}
            className="ml-auto p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            <X size={16} />
          </button>
        </div>
        <div className="p-4 space-y-3 overflow-auto">
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Titel
            </label>
            <input
              autoFocus
              className="input"
              value={state.title}
              onChange={(e) => onChange({ ...state, title: e.target.value })}
              placeholder="Was steht an?"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-tertiary mb-1">
                Kalender
              </label>
              <select
                className="input"
                value={state.calendarId}
                onChange={(e) =>
                  onChange({ ...state, calendarId: e.target.value })
                }
              >
                {calendars.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={state.allDay}
                  onChange={(e) =>
                    onChange({ ...state, allDay: e.target.checked })
                  }
                />
                Ganztägig
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Datum
            </label>
            <input
              type="date"
              className="input"
              value={state.date}
              onChange={(e) => onChange({ ...state, date: e.target.value })}
            />
          </div>
          {!state.allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-text-tertiary mb-1">
                  Beginn
                </label>
                <input
                  type="time"
                  className="input"
                  value={state.startTime}
                  onChange={(e) =>
                    onChange({ ...state, startTime: e.target.value })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-text-tertiary mb-1">
                  Ende
                </label>
                <input
                  type="time"
                  className="input"
                  value={state.endTime}
                  onChange={(e) =>
                    onChange({ ...state, endTime: e.target.value })
                  }
                />
              </div>
            </div>
          )}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Ort
            </label>
            <input
              className="input"
              value={state.location}
              onChange={(e) =>
                onChange({ ...state, location: e.target.value })
              }
              placeholder="Raum, Adresse oder Link"
            />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Teilnehmer (komma-getrennt)
            </label>
            <input
              className="input"
              value={state.attendees}
              onChange={(e) =>
                onChange({ ...state, attendees: e.target.value })
              }
              placeholder="diana@corehub.kineo360.work, …"
            />
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              Beschreibung
            </label>
            <textarea
              className="input"
              rows={3}
              value={state.description}
              onChange={(e) =>
                onChange({ ...state, description: e.target.value })
              }
              placeholder="Agenda, Notizen, Links …"
            />
          </div>
        </div>
        <div className="border-t border-stroke-1 p-3 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            Abbrechen
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-1.5 text-sm font-medium rounded text-white"
            style={{ background: accent }}
          >
            Speichern
          </button>
        </div>
      </div>
    </div>
  );
}
