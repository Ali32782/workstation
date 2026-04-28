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
  Video,
  VideoOff,
  Copy,
  ExternalLink,
  Globe,
  Bell,
  Repeat,
  Check,
  HelpCircle,
  CalendarClock,
} from "lucide-react";
import type {
  Attendee,
  AttendeeStatus,
  Calendar,
  CalendarEvent,
  EventInput,
  FreeBusySlot,
  Recurrence,
  Reminder,
} from "@/lib/calendar/types";

type View = "month" | "week" | "day" | "scheduling";

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

/* ── Date helpers (existing logic preserved) ──────────────────────────── */

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}
function startOfWeek(d: Date): Date {
  const day = d.getDay();
  const diff = (day + 6) % 7;
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
  return new Date(`${date}T${time}`).toISOString();
}

/* ── Time-zone helpers ────────────────────────────────────────────────── */

const browserTz: string =
  typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"
    : "UTC";

/** Short display of a TZ name (Europe/Berlin → Berlin). */
function shortTz(tz: string): string {
  if (!tz) return "";
  const parts = tz.split("/");
  return (parts[parts.length - 1] || tz).replace(/_/g, " ");
}

function fmtTimeIn(iso: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat("de-DE", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: tz,
    }).format(new Date(iso));
  } catch {
    return fmtTime(iso);
  }
}

function tzOffsetLabel(tz: string, at: Date = new Date()): string {
  if (!tz) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      timeZoneName: "shortOffset",
    })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    return parts?.replace(/^GMT/, "GMT") ?? "";
  } catch {
    return "";
  }
}

/* ── Compose state (now richer) ──────────────────────────────────────── */

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
  videoUrl: string;
  reminders: Reminder[];
  recurrence: Recurrence | null;
};

const JITSI_BASE =
  process.env.NEXT_PUBLIC_JITSI_BASE_URL?.replace(/\/$/, "") ||
  "https://meet.kineo360.work";

function freshJitsiRoom(workspace: string, title: string): string {
  const slug = (title || "termin")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 24) || "termin";
  const rand =
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 5);
  return `${JITSI_BASE}/${workspace}-${slug}-${rand}`;
}

const REMINDER_PRESETS: Array<{ label: string; minutes: number }> = [
  { label: "5 min vorher", minutes: 5 },
  { label: "15 min vorher", minutes: 15 },
  { label: "30 min vorher", minutes: 30 },
  { label: "1 Std. vorher", minutes: 60 },
  { label: "1 Tag vorher", minutes: 24 * 60 },
];

const RECURRENCE_PRESETS: Array<{ id: string; label: string; build: () => Recurrence }> = [
  {
    id: "none",
    label: "Einmalig",
    build: () => ({
      freq: "DAILY",
      interval: 1,
      until: null,
      count: null,
      byday: [],
      exdates: [],
      raw: "",
    }),
  },
  {
    id: "daily",
    label: "Täglich",
    build: () => ({
      freq: "DAILY",
      interval: 1,
      until: null,
      count: null,
      byday: [],
      exdates: [],
      raw: "FREQ=DAILY",
    }),
  },
  {
    id: "weekly",
    label: "Wöchentlich",
    build: () => ({
      freq: "WEEKLY",
      interval: 1,
      until: null,
      count: null,
      byday: [],
      exdates: [],
      raw: "FREQ=WEEKLY",
    }),
  },
  {
    id: "biweekly",
    label: "Alle 2 Wochen",
    build: () => ({
      freq: "WEEKLY",
      interval: 2,
      until: null,
      count: null,
      byday: [],
      exdates: [],
      raw: "FREQ=WEEKLY;INTERVAL=2",
    }),
  },
  {
    id: "monthly",
    label: "Monatlich",
    build: () => ({
      freq: "MONTHLY",
      interval: 1,
      until: null,
      count: null,
      byday: [],
      exdates: [],
      raw: "FREQ=MONTHLY",
    }),
  },
  {
    id: "yearly",
    label: "Jährlich",
    build: () => ({
      freq: "YEARLY",
      interval: 1,
      until: null,
      count: null,
      byday: [],
      exdates: [],
      raw: "FREQ=YEARLY",
    }),
  },
];

function recurrencePresetId(r: Recurrence | null): string {
  if (!r) return "none";
  if (r.freq === "DAILY" && r.interval === 1) return "daily";
  if (r.freq === "WEEKLY" && r.interval === 1) return "weekly";
  if (r.freq === "WEEKLY" && r.interval === 2) return "biweekly";
  if (r.freq === "MONTHLY" && r.interval === 1) return "monthly";
  if (r.freq === "YEARLY" && r.interval === 1) return "yearly";
  return "custom";
}

function recurrenceLabel(r: Recurrence): string {
  const id = recurrencePresetId(r);
  if (id !== "custom") {
    return RECURRENCE_PRESETS.find((p) => p.id === id)?.label ?? id;
  }
  return `${r.freq} · alle ${r.interval}`;
}

/* ─────────────────────────────────────────────────────────────────────── */

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
  const [rsvpBusy, setRsvpBusy] = useState<string | null>(null);
  const inflight = useRef(false);

  const range = useMemo(() => {
    if (view === "month") {
      const start = startOfWeek(startOfMonth(anchor));
      const end = addDays(start, 42);
      return { from: start, to: end };
    }
    if (view === "week" || view === "scheduling") {
      return { from: startOfWeek(anchor), to: addDays(endOfWeek(anchor), 1) };
    }
    const dayStart = new Date(anchor);
    dayStart.setHours(0, 0, 0, 0);
    return { from: dayStart, to: addDays(dayStart, 1) };
  }, [view, anchor]);

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

  const goPrev = () => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week" || view === "scheduling") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setAnchor(d);
  };
  const goNext = () => {
    const d = new Date(anchor);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week" || view === "scheduling") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setAnchor(d);
  };
  const goToday = () => setAnchor(new Date());

  const openCompose = (date?: Date) => {
    const start = date ? new Date(date) : new Date();
    if (!date) {
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
      videoUrl: "",
      reminders: [{ minutesBefore: 15, action: "DISPLAY" }],
      recurrence: null,
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
      tzid: browserTz,
      attendees: compose.attendees
        .split(/[,\s;]+/)
        .map((a) => a.trim())
        .filter(Boolean),
      videoUrl: compose.videoUrl || undefined,
      reminders: compose.reminders,
      recurrence: compose.recurrence,
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

  const sendRsvp = async (ev: CalendarEvent, status: AttendeeStatus) => {
    setRsvpBusy(status);
    try {
      const r = await fetch(
        `/api/calendar/event?workspace=${encodeURIComponent(workspace)}&id=${encodeURIComponent(ev.id)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ rsvp: status }),
        },
      );
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${r.status}`);
      }
      await refresh();
      // Re-look-up the event so the drawer reflects the new PARTSTAT.
      setActiveEvent((cur) => {
        if (!cur || cur.id !== ev.id) return cur;
        const updated: CalendarEvent = {
          ...cur,
          selfAttendee: cur.selfAttendee
            ? { ...cur.selfAttendee, status }
            : null,
          attendees: cur.attendees.map((a) =>
            a.email.toLowerCase() === selfEmail.toLowerCase()
              ? { ...a, status }
              : a,
          ),
        };
        return updated;
      });
    } catch (e) {
      alert(`RSVP fehlgeschlagen: ${e instanceof Error ? e.message : e}`);
    } finally {
      setRsvpBusy(null);
    }
  };

  const skipOccurrence = async (ev: CalendarEvent, dateIso: string) => {
    if (!confirm("Diesen Termin aus der Serie ausblenden?")) return;
    const r = await fetch(
      `/api/calendar/event?workspace=${encodeURIComponent(workspace)}&id=${encodeURIComponent(ev.id)}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addExdate: dateIso }),
      },
    );
    if (r.ok) {
      setActiveEvent(null);
      await refresh();
    } else {
      alert(`Konnte nicht ausgenommen werden (HTTP ${r.status})`);
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

  const headerLabel = useMemo(() => {
    if (view === "month") {
      return `${MONTHS_DE[anchor.getMonth()]} ${anchor.getFullYear()}`;
    }
    if (view === "week" || view === "scheduling") {
      const ws = startOfWeek(anchor);
      const we = endOfWeek(anchor);
      const sameMonth = ws.getMonth() === we.getMonth();
      return sameMonth
        ? `${ws.getDate()}.–${we.getDate()}. ${MONTHS_DE[ws.getMonth()]} ${ws.getFullYear()}`
        : `${ws.getDate()}. ${MONTHS_DE[ws.getMonth()]} – ${we.getDate()}. ${MONTHS_DE[we.getMonth()]} ${we.getFullYear()}`;
    }
    return `${WEEKDAYS_DE[(anchor.getDay() + 6) % 7]}, ${anchor.getDate()}. ${MONTHS_DE[anchor.getMonth()]} ${anchor.getFullYear()}`;
  }, [view, anchor]);

  return (
    <div className="h-full flex">
      {/* ─────────────── Left rail ─────────────── */}
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
          <div
            className="mt-2 flex items-center gap-1.5 text-[11px] text-text-quaternary"
            title="Browser-Zeitzone"
          >
            <Globe size={11} />
            {shortTz(browserTz)} · {tzOffsetLabel(browserTz)}
          </div>
        </div>
      </aside>

      {/* ─────────────── Main pane ─────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
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
            <Loader2 size={14} className="ml-2 animate-spin text-text-tertiary" />
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
              {(["month", "week", "day", "scheduling"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 ${view === v ? "bg-bg-overlay text-text-primary" : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary"}`}
                  title={v === "scheduling" ? "Frei/Gebucht-Sicht über mehrere Personen" : undefined}
                >
                  {v === "month"
                    ? "Monat"
                    : v === "week"
                      ? "Woche"
                      : v === "day"
                        ? "Tag"
                        : "Planung"}
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
          {view === "scheduling" && (
            <SchedulingAssistant
              workspace={workspace}
              anchor={anchor}
              accent={accent}
              selfEvents={filteredEvents}
              selfEmail={selfEmail}
              onPickSlot={(start) => {
                const end = new Date(start);
                end.setHours(start.getHours() + 1);
                setCompose({
                  calendarId:
                    calendars.find((c) => c.owner)?.id ??
                    calendars[0]?.id ??
                    "personal",
                  title: "",
                  description: "",
                  location: "",
                  date: inputDateValue(start),
                  startTime: inputTimeValue(start),
                  endTime: inputTimeValue(end),
                  allDay: false,
                  attendees: "",
                  videoUrl: "",
                  reminders: [{ minutesBefore: 15, action: "DISPLAY" }],
                  recurrence: null,
                });
              }}
            />
          )}
        </div>
      </div>

      {/* ─────────────── Detail drawer ─────────────── */}
      {activeEvent && (
        <EventDrawer
          event={activeEvent}
          selfEmail={selfEmail}
          rsvpBusy={rsvpBusy}
          onClose={() => setActiveEvent(null)}
          onDelete={() => deleteEvent(activeEvent)}
          onRsvp={(status) => sendRsvp(activeEvent, status)}
          onSkipOccurrence={() =>
            skipOccurrence(
              activeEvent,
              activeEvent.start.split("T")[0],
            )
          }
        />
      )}

      {/* ─────────────── Compose modal ─────────────── */}
      {compose && (
        <ComposeModal
          state={compose}
          calendars={calendars.filter((c) => c.owner)}
          accent={accent}
          workspace={workspace}
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
                    {e.recurring && <Repeat size={9} className="inline ml-1 opacity-60" />}
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
                  <span className="text-sm text-text-primary flex-1 truncate flex items-center gap-1.5">
                    {e.title}
                    {e.recurring && <Repeat size={11} className="opacity-60" />}
                    {e.reminders.length > 0 && <Bell size={11} className="opacity-60" />}
                    {e.tzid && e.tzid !== browserTz && (
                      <span
                        className="text-[10px] text-text-quaternary px-1 py-px rounded bg-bg-overlay"
                        title={`Termin-TZ: ${e.tzid}`}
                      >
                        {shortTz(e.tzid)}
                      </span>
                    )}
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
  selfEmail,
  rsvpBusy,
  onClose,
  onDelete,
  onRsvp,
  onSkipOccurrence,
}: {
  event: CalendarEvent;
  selfEmail: string;
  rsvpBusy: string | null;
  onClose: () => void;
  onDelete: () => void;
  onRsvp: (status: AttendeeStatus) => void;
  onSkipOccurrence: () => void;
}) {
  const me = event.attendees.find(
    (a) => a.email.toLowerCase() === selfEmail.toLowerCase(),
  );
  const showRsvp = !event.isOrganizer && me;
  const eventTz = event.tzid || browserTz;
  const showRemoteTz = event.tzid && event.tzid !== browserTz;

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
          {event.recurring && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] text-text-tertiary uppercase tracking-wide">
              <Repeat size={11} /> Serie
            </span>
          )}
        </div>

        <div>
          <div className="text-xs text-text-tertiary uppercase mb-1">Wann</div>
          <div className="text-sm text-text-primary">
            {fmtRange(event.start, event.end, event.allDay)}
            {!event.allDay && (
              <span className="ml-2 text-[11px] text-text-tertiary">
                {tzOffsetLabel(eventTz)} · {shortTz(eventTz)}
              </span>
            )}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {new Date(event.start).toLocaleDateString("de-DE", {
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          {showRemoteTz && (
            <div className="mt-2 rounded-md bg-bg-overlay/60 border border-stroke-1 px-2 py-1.5 text-[11px] text-text-secondary flex items-center gap-2">
              <Globe size={11} className="text-text-tertiary" />
              <span>
                Bei dir:{" "}
                <strong>
                  {fmtTimeIn(event.start, browserTz)}–
                  {fmtTimeIn(event.end, browserTz)}
                </strong>{" "}
                ({shortTz(browserTz)})
              </span>
            </div>
          )}
        </div>

        {showRsvp && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              Deine Antwort
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["accepted", "Annehmen", Check],
                  ["tentative", "Vielleicht", HelpCircle],
                  ["declined", "Ablehnen", X],
                ] as const
              ).map(([status, label, Icon]) => {
                const active = me?.status === status;
                const busy = rsvpBusy === status;
                const tone =
                  status === "accepted"
                    ? "text-emerald-400 border-emerald-500/40 hover:bg-emerald-500/10"
                    : status === "declined"
                      ? "text-red-400 border-red-500/40 hover:bg-red-500/10"
                      : "text-amber-400 border-amber-500/40 hover:bg-amber-500/10";
                return (
                  <button
                    key={status}
                    onClick={() => onRsvp(status)}
                    disabled={busy || active}
                    className={`flex items-center gap-1 px-2.5 py-1.5 text-[12px] rounded border transition ${tone} ${active ? "ring-1 ring-current" : ""} disabled:opacity-50`}
                  >
                    {busy ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <Icon size={11} />
                    )}
                    {label}
                  </button>
                );
              })}
            </div>
            {me?.status && me.status !== "needs-action" && (
              <div className="mt-1.5 text-[11px] text-text-tertiary">
                Aktuell: <strong>{partstatLabel(me.status)}</strong>
              </div>
            )}
          </div>
        )}

        {event.location && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">Ort</div>
            <div className="text-sm text-text-primary flex items-center gap-2">
              <MapPin size={14} />
              {event.location}
            </div>
          </div>
        )}
        {event.videoUrl && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              Video-Call
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={event.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-success/15 text-success border border-success/30 hover:bg-success/25 px-3 py-1.5 text-sm font-medium"
              >
                <Video size={14} />
                Jetzt beitreten
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(event.videoUrl);
                }}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-text-tertiary hover:text-text-primary"
                title="Link kopieren"
              >
                <Copy size={12} />
                Link kopieren
              </button>
            </div>
            <div className="text-[11px] text-text-quaternary mt-1.5 break-all">
              {event.videoUrl}
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
                <li
                  key={a.email}
                  className="flex items-center gap-2 px-1.5 py-1 rounded hover:bg-bg-overlay/40"
                >
                  <UsersIcon size={12} className="text-text-tertiary shrink-0" />
                  <span className="truncate flex-1">{a.name || a.email}</span>
                  <PartstatPill status={a.status} />
                </li>
              ))}
            </ul>
          </div>
        )}
        {event.reminders.length > 0 && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              Erinnerungen
            </div>
            <ul className="text-sm text-text-primary space-y-1">
              {event.reminders.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-[12.5px]">
                  <Bell size={12} className="text-text-tertiary" />
                  {reminderLabel(r)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {event.recurrence && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              Wiederholung
            </div>
            <div className="text-sm text-text-primary flex items-center gap-2">
              <Repeat size={13} className="text-text-tertiary" />
              {recurrenceLabel(event.recurrence)}
              {event.recurrence.until && (
                <span className="text-[11px] text-text-tertiary">
                  bis {event.recurrence.until}
                </span>
              )}
              {event.recurrence.count != null && (
                <span className="text-[11px] text-text-tertiary">
                  · {event.recurrence.count} Termine
                </span>
              )}
            </div>
            {event.recurring && (
              <button
                type="button"
                onClick={onSkipOccurrence}
                className="mt-2 text-[11.5px] text-amber-400 hover:underline"
              >
                Diesen Termin aus Serie ausnehmen
              </button>
            )}
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
      </div>
      {event.isOrganizer && (
        <div className="mt-auto p-3 border-t border-stroke-1">
          <button
            onClick={onDelete}
            className="w-full flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium text-danger border border-stroke-1 hover:bg-bg-overlay"
          >
            <Trash2 size={14} />
            Löschen
          </button>
        </div>
      )}
    </div>
  );
}

function partstatLabel(s: AttendeeStatus): string {
  switch (s) {
    case "accepted":
      return "Zugesagt";
    case "declined":
      return "Abgelehnt";
    case "tentative":
      return "Vielleicht";
    case "needs-action":
      return "Offen";
    case "delegated":
      return "Delegiert";
    default:
      return "—";
  }
}

function PartstatPill({ status }: { status: AttendeeStatus }) {
  const tone =
    status === "accepted"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : status === "declined"
        ? "bg-red-500/15 text-red-400 border-red-500/30"
        : status === "tentative"
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-bg-overlay text-text-tertiary border-stroke-1";
  return (
    <span
      className={`text-[10px] px-1.5 py-px rounded border ${tone}`}
      title={partstatLabel(status)}
    >
      {partstatLabel(status)}
    </span>
  );
}

function reminderLabel(r: Reminder): string {
  const m = r.minutesBefore;
  let unit = "";
  if (m < 60) unit = `${m} min`;
  else if (m < 24 * 60) unit = `${Math.round(m / 60)} Std.`;
  else unit = `${Math.round(m / (24 * 60))} Tag(e)`;
  return `${unit} vorher · ${r.action === "EMAIL" ? "E-Mail" : "Pop-up"}`;
}

/* ============================== Compose ================================ */

function ComposeModal({
  state,
  calendars,
  accent,
  workspace,
  onChange,
  onCancel,
  onSubmit,
}: {
  state: ComposeState;
  calendars: Calendar[];
  accent: string;
  workspace: string;
  onChange: (s: ComposeState) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const recurrenceId = recurrencePresetId(state.recurrence);

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
            <>
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
              <div className="text-[11px] text-text-quaternary flex items-center gap-1.5">
                <Globe size={11} /> Zeiten in {shortTz(browserTz)} (
                {tzOffsetLabel(browserTz)})
              </div>
            </>
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

          {/* Recurrence */}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              <Repeat size={11} className="inline mr-1" />
              Wiederholung
            </label>
            <select
              className="input"
              value={recurrenceId}
              onChange={(e) => {
                const preset = RECURRENCE_PRESETS.find(
                  (p) => p.id === e.target.value,
                );
                if (!preset) return;
                onChange({
                  ...state,
                  recurrence:
                    preset.id === "none" ? null : preset.build(),
                });
              }}
            >
              {RECURRENCE_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              {recurrenceId === "custom" && (
                <option value="custom">Benutzerdefiniert</option>
              )}
            </select>
            {state.recurrence && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">
                    Endet am
                  </label>
                  <input
                    type="date"
                    className="input"
                    value={state.recurrence.until ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...state,
                        recurrence: state.recurrence
                          ? {
                              ...state.recurrence,
                              until: e.target.value || null,
                              count: e.target.value
                                ? null
                                : state.recurrence.count,
                            }
                          : null,
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">
                    Nach N Terminen
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    placeholder="optional"
                    value={state.recurrence.count ?? ""}
                    onChange={(e) =>
                      onChange({
                        ...state,
                        recurrence: state.recurrence
                          ? {
                              ...state.recurrence,
                              count: e.target.value
                                ? Math.max(1, Number(e.target.value))
                                : null,
                              until: e.target.value
                                ? null
                                : state.recurrence.until,
                            }
                          : null,
                      })
                    }
                  />
                </div>
              </div>
            )}
          </div>

          {/* Reminders */}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              <Bell size={11} className="inline mr-1" />
              Erinnerungen
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_PRESETS.map((p) => {
                const active = state.reminders.some(
                  (r) => r.minutesBefore === p.minutes,
                );
                return (
                  <button
                    key={p.minutes}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? state.reminders.filter(
                            (r) => r.minutesBefore !== p.minutes,
                          )
                        : [
                            ...state.reminders,
                            {
                              minutesBefore: p.minutes,
                              action: "DISPLAY" as const,
                            },
                          ];
                      onChange({ ...state, reminders: next });
                    }}
                    className={`text-[11px] px-2 py-1 rounded border ${active ? "border-current" : "border-stroke-1 text-text-tertiary hover:text-text-primary"}`}
                    style={
                      active
                        ? { color: accent, background: `${accent}20` }
                        : undefined
                    }
                  >
                    {p.label}
                  </button>
                );
              })}
            </div>
            {state.reminders.length === 0 && (
              <p className="text-[11px] text-text-quaternary mt-1">
                Keine Erinnerung gesetzt.
              </p>
            )}
          </div>

          <VideoCallSection
            workspace={workspace}
            videoUrl={state.videoUrl}
            title={state.title}
            onChange={(videoUrl) => onChange({ ...state, videoUrl })}
          />
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
            {state.attendees.trim() && (
              <p className="text-[11px] text-text-quaternary mt-1">
                Teilnehmer erhalten eine Einladung mit
                Annehmen-/Ablehnen-Buttons (RFC 5545 ATTENDEE/RSVP).
              </p>
            )}
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

/* --------------------------- Video-Call section --------------------------- */

function VideoCallSection({
  workspace,
  videoUrl,
  title,
  onChange,
}: {
  workspace: string;
  videoUrl: string;
  title: string;
  onChange: (videoUrl: string) => void;
}) {
  const enabled = !!videoUrl;

  function toggle() {
    if (enabled) {
      onChange("");
    } else {
      onChange(freshJitsiRoom(workspace, title));
    }
  }

  return (
    <div className="rounded-md border border-stroke-1 bg-bg-overlay/30 p-3 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-text-primary">
          {enabled ? (
            <Video size={14} className="text-success" />
          ) : (
            <VideoOff size={14} className="text-text-tertiary" />
          )}
          <span>Video-Call</span>
        </div>
        <button
          type="button"
          onClick={toggle}
          className={
            "px-2.5 py-1 text-xs rounded-md border transition-colors " +
            (enabled
              ? "border-danger/40 text-danger hover:bg-danger/10"
              : "border-stroke-2 text-text-secondary hover:text-text-primary hover:bg-bg-overlay")
          }
        >
          {enabled ? "Entfernen" : "Hinzufügen"}
        </button>
      </div>
      {enabled ? (
        <>
          <div className="flex items-center gap-2">
            <input
              className="input flex-1 text-xs"
              value={videoUrl}
              onChange={(e) => onChange(e.target.value)}
              spellCheck={false}
            />
            <a
              href={videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs text-text-tertiary hover:text-text-primary"
              title="Raum testen"
            >
              <ExternalLink size={12} />
            </a>
          </div>
          <p className="text-[11px] text-text-quaternary leading-snug">
            Eindeutiger Jitsi-Raum. Wird in der Termin-Beschreibung als
            klickbarer Link verteilt und für moderne Clients zusätzlich als
            RFC-7986-CONFERENCE-Property gespeichert (Outlook 2024+ /
            Apple Calendar zeigen automatisch einen „Beitreten"-Button).
          </p>
        </>
      ) : (
        <p className="text-[11px] text-text-quaternary leading-snug">
          Hinzufügen erzeugt einen neuen Jitsi-Raum, hängt den Beitritts-Link
          ans Event und lädt alle Teilnehmer im iCal-Standard ein — wie eine
          Outlook-/Teams-Termineinladung.
        </p>
      )}
    </div>
  );
}

/* ===================== Scheduling Assistant view ====================== */

/**
 * Multi-person free/busy lane view. Defaults to the current week. Users
 * type comma-separated emails / usernames in a header bar; we POST the
 * list to `/api/calendar/freebusy` and render a 7×24 lane per user with
 * red blocks for BUSY and amber for BUSY-TENTATIVE. Self events are
 * overlaid on the first lane so the organizer can spot conflicts quickly.
 */
/**
 * LocalStorage namespace for the scheduling assistant. Keyed per
 * workspace so multi-tenant operators get separate teams remembered.
 */
const SCHED_STORAGE_PREFIX = "corehub:sched:";

type SchedSettings = {
  participants: string;
  meetingMin: number;
  workStartH: number;
  workEndH: number;
  includeWeekends: boolean;
};

function loadSchedSettings(workspace: string): SchedSettings {
  if (typeof window === "undefined") {
    return {
      participants: "",
      meetingMin: 30,
      workStartH: 8,
      workEndH: 18,
      includeWeekends: false,
    };
  }
  try {
    const raw = window.localStorage.getItem(
      `${SCHED_STORAGE_PREFIX}${workspace}`,
    );
    if (!raw) throw new Error("no settings");
    const parsed = JSON.parse(raw) as Partial<SchedSettings>;
    return {
      participants: typeof parsed.participants === "string" ? parsed.participants : "",
      meetingMin:
        typeof parsed.meetingMin === "number" && parsed.meetingMin > 0
          ? parsed.meetingMin
          : 30,
      workStartH:
        typeof parsed.workStartH === "number" &&
        parsed.workStartH >= 0 &&
        parsed.workStartH < 24
          ? parsed.workStartH
          : 8,
      workEndH:
        typeof parsed.workEndH === "number" &&
        parsed.workEndH > 0 &&
        parsed.workEndH <= 24
          ? parsed.workEndH
          : 18,
      includeWeekends: Boolean(parsed.includeWeekends),
    };
  } catch {
    return {
      participants: "",
      meetingMin: 30,
      workStartH: 8,
      workEndH: 18,
      includeWeekends: false,
    };
  }
}

function SchedulingAssistant({
  workspace,
  anchor,
  accent,
  selfEvents,
  selfEmail,
  onPickSlot,
}: {
  workspace: string;
  anchor: Date;
  accent: string;
  selfEvents: CalendarEvent[];
  selfEmail: string;
  onPickSlot: (start: Date) => void;
}) {
  const initial = useMemo(() => loadSchedSettings(workspace), [workspace]);
  const [participants, setParticipants] = useState(initial.participants);
  const [slots, setSlots] = useState<FreeBusySlot[]>([]);
  const [loadingFb, setLoadingFb] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Desired meeting length in minutes — controls suggestion search. */
  const [meetingMin, setMeetingMin] = useState(initial.meetingMin);
  /** Working window in hours, inclusive start, exclusive end. Defaults to typical office. */
  const [workStartH, setWorkStartH] = useState(initial.workStartH);
  const [workEndH, setWorkEndH] = useState(initial.workEndH);
  const [includeWeekends, setIncludeWeekends] = useState(initial.includeWeekends);
  /** Suggestion soft-limit; "Mehr" expands the list in steps of 6. */
  const [suggestionLimit, setSuggestionLimit] = useState(6);

  // Persist settings whenever the user changes them so the next visit
  // reopens with their preferred working window + favourite team.
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        `${SCHED_STORAGE_PREFIX}${workspace}`,
        JSON.stringify({
          participants,
          meetingMin,
          workStartH,
          workEndH,
          includeWeekends,
        } satisfies SchedSettings),
      );
    } catch {
      /* localStorage may be disabled — silent skip */
    }
  }, [
    workspace,
    participants,
    meetingMin,
    workStartH,
    workEndH,
    includeWeekends,
  ]);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)),
    [anchor],
  );

  const users = useMemo(
    () =>
      participants
        .split(/[,\s;]+/)
        .map((u) => u.trim())
        .filter(Boolean),
    [participants],
  );

  const refreshFb = useCallback(async () => {
    if (users.length === 0) {
      setSlots([]);
      return;
    }
    setLoadingFb(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/calendar/freebusy?workspace=${encodeURIComponent(workspace)}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            users,
            from: days[0].toISOString(),
            to: addDays(days[6], 1).toISOString(),
          }),
        },
      );
      const j = (await r.json()) as { slots?: FreeBusySlot[]; error?: string };
      if (j.error) setError(j.error);
      setSlots(j.slots ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFb(false);
    }
  }, [users, days, workspace]);

  useEffect(() => {
    void refreshFb();
  }, [refreshFb]);

  // Whenever the search inputs change meaningfully, collapse the
  // suggestion list back to the initial 6 so the user sees the freshest
  // top picks first.
  useEffect(() => {
    setSuggestionLimit(6);
  }, [
    participants,
    meetingMin,
    workStartH,
    workEndH,
    includeWeekends,
    anchor.toDateString(),
  ]);

  const slotsByUser = useMemo(() => {
    const m = new Map<string, FreeBusySlot[]>();
    for (const s of slots) {
      const arr = m.get(s.user) ?? [];
      arr.push(s);
      m.set(s.user, arr);
    }
    return m;
  }, [slots]);

  const lanes: Array<{ user: string; slots: FreeBusySlot[]; isSelf: boolean }> = useMemo(() => {
    const selfBusy: FreeBusySlot[] = selfEvents
      .filter((e) => !e.allDay)
      .map((e) => ({
        user: "self",
        start: e.start,
        end: e.end,
        status: e.status === "tentative" ? "busy-tentative" : "busy",
      }));
    const out: Array<{ user: string; slots: FreeBusySlot[]; isSelf: boolean }> = [
      { user: selfEmail || "Du", slots: selfBusy, isSelf: true },
    ];
    for (const u of users) {
      const key = u.includes("@") ? u.split("@", 1)[0].toLowerCase() : u.toLowerCase();
      out.push({ user: u, slots: slotsByUser.get(key) ?? [], isSelf: false });
    }
    return out;
  }, [users, slotsByUser, selfEvents, selfEmail]);

  /**
   * Suggest the next 6 common-free slots of `meetingMin` length within
   * working hours across every lane. We treat tentative blocks as soft
   * conflicts (still blocking), since the alternative — handing the
   * organizer a slot the colleague might have — is the worst outcome.
   *
   * Algorithm: union all lanes' busy ranges, walk each day from
   * workStart to workEnd in 15-min increments, and emit a slot when
   * the next `meetingMin` minutes are gap-free.
   */
  const suggestions = useMemo(() => {
    const allBusy: Array<{ start: number; end: number }> = [];
    for (const lane of lanes) {
      for (const s of lane.slots) {
        const a = new Date(s.start).getTime();
        const b = new Date(s.end).getTime();
        if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
          allBusy.push({ start: a, end: b });
        }
      }
    }
    allBusy.sort((a, b) => a.start - b.start);
    const merged: Array<{ start: number; end: number }> = [];
    for (const b of allBusy) {
      const last = merged[merged.length - 1];
      if (last && b.start <= last.end) {
        last.end = Math.max(last.end, b.end);
      } else {
        merged.push({ ...b });
      }
    }
    const isBusy = (a: number, b: number): boolean => {
      for (const m of merged) {
        if (m.start >= b) break;
        if (m.end > a) return true;
      }
      return false;
    };

    const out: Date[] = [];
    const stepMs = 15 * 60_000;
    const lengthMs = meetingMin * 60_000;
    const now = Date.now();

    for (const d of days) {
      // 0 = Sunday, 6 = Saturday in JS — skip when weekends are off.
      const wd = d.getDay();
      if (!includeWeekends && (wd === 0 || wd === 6)) continue;
      const dayStart = new Date(d);
      dayStart.setHours(workStartH, 0, 0, 0);
      const dayEnd = new Date(d);
      dayEnd.setHours(workEndH, 0, 0, 0);
      let cursor = Math.max(dayStart.getTime(), now);
      // Round cursor up to the next 15-minute mark.
      cursor = Math.ceil(cursor / stepMs) * stepMs;
      while (cursor + lengthMs <= dayEnd.getTime() && out.length < suggestionLimit) {
        if (!isBusy(cursor, cursor + lengthMs)) {
          out.push(new Date(cursor));
          cursor += lengthMs;
        } else {
          cursor += stepMs;
        }
      }
      if (out.length >= suggestionLimit) break;
    }
    return out;
  }, [
    lanes,
    days,
    meetingMin,
    workStartH,
    workEndH,
    includeWeekends,
    suggestionLimit,
  ]);

  return (
    <div className="flex flex-col">
      <div className="px-4 py-3 border-b border-stroke-1 bg-bg-chrome flex items-start gap-3">
        <CalendarClock size={16} className="text-text-tertiary mt-1" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text-primary">
            Planungs-Assistent
          </div>
          <div className="text-[12px] text-text-tertiary mt-0.5">
            Vergleicht freie/gebuchte Zeiten mehrerer Personen — klick eine
            Lücke an, um direkt einen Termin zu erstellen.
          </div>
          <div className="mt-2 flex items-center gap-2">
            <UsersIcon size={12} className="text-text-tertiary" />
            <input
              className="input flex-1 text-[12px]"
              placeholder="Personen kommagetrennt (z.B. mara, diana@kineo360.work)"
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              spellCheck={false}
            />
            <label className="text-[11px] text-text-tertiary flex items-center gap-1">
              Dauer
              <select
                className="input text-[11px] py-0.5"
                value={meetingMin}
                onChange={(e) => setMeetingMin(Number(e.target.value))}
              >
                <option value={15}>15 min</option>
                <option value={30}>30 min</option>
                <option value={45}>45 min</option>
                <option value={60}>60 min</option>
                <option value={90}>90 min</option>
              </select>
            </label>
            <label className="text-[11px] text-text-tertiary flex items-center gap-1">
              von
              <select
                className="input text-[11px] py-0.5"
                value={workStartH}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWorkStartH(v);
                  if (v >= workEndH) setWorkEndH(Math.min(24, v + 1));
                }}
                title="Arbeitsfenster Start — Vorschläge werden auf dieses Fenster begrenzt."
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              bis
              <select
                className="input text-[11px] py-0.5"
                value={workEndH}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWorkEndH(v);
                  if (v <= workStartH) setWorkStartH(Math.max(0, v - 1));
                }}
                title="Arbeitsfenster Ende"
              >
                {Array.from({ length: 24 }, (_, h) => h + 1).map((h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </label>
            <label
              className="text-[11px] text-text-tertiary flex items-center gap-1 cursor-pointer select-none"
              title="Wochenend-Vorschläge zulassen"
            >
              <input
                type="checkbox"
                className="accent-current"
                checked={includeWeekends}
                onChange={(e) => setIncludeWeekends(e.target.checked)}
              />
              Wo-End
            </label>
            {loadingFb && <Loader2 size={12} className="animate-spin text-text-tertiary" />}
          </div>
          {error && (
            <div className="mt-1 text-[11px] text-red-400">{error}</div>
          )}
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] uppercase tracking-wide text-text-quaternary">
                Vorschläge ({suggestions.length})
              </span>
              {suggestions.map((s) => {
                const end = new Date(s.getTime() + meetingMin * 60_000);
                const dayLabel = s.toLocaleDateString("de-DE", {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                });
                const timeLabel = `${s
                  .toLocaleTimeString("de-DE", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}–${end.toLocaleTimeString("de-DE", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`;
                return (
                  <button
                    key={s.toISOString()}
                    type="button"
                    onClick={() => onPickSlot(s)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-stroke-1 hover:border-stroke-2 bg-bg-elevated transition-colors"
                    style={{ color: accent, borderColor: `${accent}40` }}
                    title={`Termin ${dayLabel} ${timeLabel} eintragen`}
                  >
                    <CalendarClock size={10} />
                    <span className="font-medium">{dayLabel}</span>
                    <span className="text-text-secondary">{timeLabel}</span>
                  </button>
                );
              })}
              {suggestions.length >= suggestionLimit && (
                <button
                  type="button"
                  onClick={() => setSuggestionLimit((n) => n + 6)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] border border-dashed border-stroke-2 text-text-tertiary hover:text-text-primary"
                  title="Weitere passende Lücken anzeigen"
                >
                  Mehr…
                </button>
              )}
            </div>
          )}
          {users.length > 0 && suggestions.length === 0 && !loadingFb && (
            <div className="mt-2 text-[11px] text-text-tertiary">
              Kein gemeinsames {meetingMin}-min-Fenster im Arbeitszeit-Fenster
              {" "}
              {workStartH.toString().padStart(2, "0")}:00–
              {workEndH.toString().padStart(2, "0")}:00
              {includeWeekends ? " (inkl. Wochenende)" : ""} — Woche wechseln,
              Dauer kürzen oder Fenster vergrößern.
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="text-[11.5px] w-full border-collapse">
          <thead className="bg-bg-chrome sticky top-0 z-10">
            <tr>
              <th className="border-b border-r border-stroke-1 px-2 py-1 text-left text-text-tertiary w-32">
                Person
              </th>
              {days.map((d) => (
                <th
                  key={dayKey(d)}
                  className="border-b border-r border-stroke-1 px-1 py-1 text-text-tertiary text-center"
                >
                  {WEEKDAYS_DE[(d.getDay() + 6) % 7]} {d.getDate()}.
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lanes.map((lane) => (
              <tr key={lane.user}>
                <td className="border-b border-r border-stroke-1 px-2 py-1.5 text-text-secondary truncate w-32">
                  <div className="truncate font-medium">{lane.user}</div>
                  {lane.isSelf && (
                    <div className="text-[9.5px] text-text-quaternary">
                      du · live
                    </div>
                  )}
                </td>
                {days.map((d) => (
                  <td
                    key={dayKey(d)}
                    className="border-b border-r border-stroke-1 p-0 align-top"
                  >
                    <DayLane
                      day={d}
                      slots={lane.slots}
                      accent={accent}
                      onPickHour={(h) => {
                        const start = new Date(d);
                        start.setHours(h, 0, 0, 0);
                        onPickSlot(start);
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {lanes.length === 1 && (
              <tr>
                <td
                  colSpan={1 + days.length}
                  className="border-b border-stroke-1 px-3 py-6 text-[12px] text-text-tertiary text-center"
                >
                  Personen oben eingeben, um deren Verfügbarkeit zu sehen.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DayLane({
  day,
  slots,
  accent,
  onPickHour,
}: {
  day: Date;
  slots: FreeBusySlot[];
  accent: string;
  onPickHour: (hour: number) => void;
}) {
  const dayStart = new Date(day);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart);
  dayEnd.setHours(24, 0, 0, 0);

  const overlapping = slots.filter((s) => {
    const a = new Date(s.start).getTime();
    const b = new Date(s.end).getTime();
    return b > dayStart.getTime() && a < dayEnd.getTime();
  });

  // Each lane shows business hours 06:00 → 22:00 (16 cells, 1px per minute = 60px each).
  const HOUR_FROM = 6;
  const HOUR_TO = 22;
  const totalMinutes = (HOUR_TO - HOUR_FROM) * 60;
  const minuteOffset = (date: Date) =>
    Math.max(
      0,
      Math.min(
        totalMinutes,
        (date.getTime() - dayStart.getTime()) / 60000 - HOUR_FROM * 60,
      ),
    );

  return (
    <div className="relative h-10 bg-bg-base/40">
      {Array.from({ length: HOUR_TO - HOUR_FROM }, (_, i) => i).map((h) => (
        <button
          key={h}
          type="button"
          onClick={() => onPickHour(HOUR_FROM + h)}
          className="absolute top-0 bottom-0 hover:bg-bg-overlay/40 cursor-pointer"
          style={{
            left: `${(h * 60 * 100) / totalMinutes}%`,
            width: `${(60 * 100) / totalMinutes}%`,
            borderRight:
              h < HOUR_TO - HOUR_FROM - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
          }}
          title={`${day.toLocaleDateString("de-DE", { weekday: "short", day: "numeric", month: "short" })} ${HOUR_FROM + h}:00`}
        />
      ))}
      {overlapping.map((s, i) => {
        const a = new Date(s.start);
        const b = new Date(s.end);
        const left = minuteOffset(a);
        const right = minuteOffset(b);
        const width = Math.max(2, right - left);
        const bg =
          s.status === "busy-tentative"
            ? "rgba(245,158,11,0.55)"
            : s.user === "self"
              ? `${accent}cc`
              : "rgba(244,63,94,0.55)";
        return (
          <div
            key={i}
            className="absolute top-0.5 bottom-0.5 rounded-sm pointer-events-none"
            style={{
              left: `${(left * 100) / totalMinutes}%`,
              width: `${(width * 100) / totalMinutes}%`,
              background: bg,
            }}
            title={`${a.toLocaleString("de-DE")} – ${b.toLocaleString("de-DE")}`}
          />
        );
      })}
    </div>
  );
}
