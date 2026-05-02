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
  Menu as MenuIcon,
} from "lucide-react";
import type { Messages } from "@/lib/i18n/messages";
import { useLocale, useT } from "@/components/LocaleProvider";
import { useIsNarrowScreen } from "@/lib/use-is-narrow-screen";
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

function mondayFirstWeekdayShort(localeTag: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const ref = new Date(2024, 0, 1 + i);
    out.push(
      new Intl.DateTimeFormat(localeTag, { weekday: "short" }).format(ref),
    );
  }
  return out;
}

function monthLong(m: number, localeTag: string): string {
  return new Intl.DateTimeFormat(localeTag, { month: "long" }).format(
    new Date(2024, m, 1),
  );
}

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

function fmtRange(
  a: string,
  b: string,
  allDay: boolean,
  allDayLabel: string,
): string {
  if (allDay) return allDayLabel;
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

function fmtTimeIn(iso: string, tz: string, localeTag: string): string {
  try {
    return new Intl.DateTimeFormat(localeTag, {
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
    // "en-US" here is the deterministic source for shortOffset labels
    // (e.g. "GMT+02:00") and is NOT user-localized output; we just
    // extract the GMT offset and render the result raw.
    // i18n-check-disable-next-line
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

function freshJitsiRoom(
  workspace: string,
  title: string,
  emptyTitleSlug: string,
): string {
  const slug =
    (title || emptyTitleSlug)
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 24) || emptyTitleSlug;
  const rand =
    Math.random().toString(36).slice(2, 8) +
    Math.random().toString(36).slice(2, 5);
  return `${JITSI_BASE}/${workspace}-${slug}-${rand}`;
}

const REMINDER_MINUTES = [5, 15, 30, 60, 24 * 60] as const;

function reminderPresetLabel(
  minutes: number,
  tr: (key: keyof Messages) => string,
): string {
  if (minutes === 5) return tr("calendar.reminder.before5");
  if (minutes === 15) return tr("calendar.reminder.before15");
  if (minutes === 30) return tr("calendar.reminder.before30");
  if (minutes === 60) return tr("calendar.reminder.before60");
  if (minutes === 24 * 60) return tr("calendar.reminder.before1d");
  return String(minutes);
}

const RECURRENCE_PRESETS: Array<{ id: string; build: () => Recurrence }> = [
  {
    id: "none",
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

function recurrenceLabel(
  r: Recurrence,
  tr: (key: keyof Messages) => string,
): string {
  const id = recurrencePresetId(r);
  if (id !== "custom") {
    return tr(`calendar.recurrence.${id}` as keyof Messages);
  }
  return tr("calendar.recurrence.customPattern")
    .replace("{freq}", r.freq)
    .replace("{interval}", String(r.interval));
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
  const isNarrow = useIsNarrowScreen();
  // Outlook-ish: Day on phones, Month on desktop. We only set this once
  // (not whenever isNarrow flips) so a user-chosen view sticks even after
  // an orientation change.
  const [view, setView] = useState<View>(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
      ? "day"
      : "month",
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const weekdayShortMonFirst = useMemo(
    () => mondayFirstWeekdayShort(localeTag),
    [localeTag],
  );

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
    openComposeRange(start, end);
  };

  const openComposeRange = (start: Date, end: Date) => {
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
      title: compose.title.trim() || t("calendar.defaultTitle"),
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
      alert(
        typeof j.error === "string" && j.error.trim()
          ? j.error
          : t("calendar.save.failed").replace("{status}", String(r.status)),
      );
    }
  };

  const deleteEvent = async (ev: CalendarEvent) => {
    if (!confirm(t("calendar.delete.confirm").replace("{title}", ev.title)))
      return;
    const r = await fetch(
      `/api/calendar/event?workspace=${encodeURIComponent(workspace)}&id=${encodeURIComponent(ev.id)}`,
      { method: "DELETE" },
    );
    if (r.ok) {
      setActiveEvent(null);
      setEvents((es) => es.filter((e) => e.id !== ev.id));
    } else {
      alert(
        t("calendar.delete.failed").replace("{status}", String(r.status)),
      );
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
      alert(
        t("calendar.rsvp.failed").replace(
          "{message}",
          e instanceof Error ? e.message : String(e),
        ),
      );
    } finally {
      setRsvpBusy(null);
    }
  };

  const skipOccurrence = async (ev: CalendarEvent, dateIso: string) => {
    if (!confirm(t("calendar.skipOccurrence.confirm"))) return;
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
      return `${monthLong(anchor.getMonth(), localeTag)} ${anchor.getFullYear()}`;
    }
    if (view === "week" || view === "scheduling") {
      const ws = startOfWeek(anchor);
      const we = endOfWeek(anchor);
      const sameMonth = ws.getMonth() === we.getMonth();
      return sameMonth
        ? `${ws.getDate()}.–${we.getDate()}. ${monthLong(ws.getMonth(), localeTag)} ${ws.getFullYear()}`
        : `${ws.getDate()}. ${monthLong(ws.getMonth(), localeTag)} – ${we.getDate()}. ${monthLong(we.getMonth(), localeTag)} ${we.getFullYear()}`;
    }
    return `${weekdayShortMonFirst[(anchor.getDay() + 6) % 7]}, ${anchor.getDate()}. ${monthLong(anchor.getMonth(), localeTag)} ${anchor.getFullYear()}`;
  }, [view, anchor, localeTag, weekdayShortMonFirst]);

  const sidebarContent = (
    <>
      <div className="p-3 border-b border-stroke-1 flex items-center gap-2">
        <button
          onClick={() => {
            setSidebarOpen(false);
            openCompose();
          }}
          className="flex-1 inline-flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium text-white"
          style={{ background: accent }}
        >
          <Plus size={16} />
          {t("calendar.newEvent")}
        </button>
        {isNarrow && (
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="shrink-0 inline-flex items-center justify-center rounded-md border border-stroke-1 bg-bg-elevated text-text-secondary hover:text-text-primary min-h-[40px] min-w-[40px]"
            aria-label={t("calendar.sidebar.close")}
          >
            <X size={16} />
          </button>
        )}
      </div>
      <MiniMonthCalendar
        anchor={anchor}
        accent={accent}
        eventsByDay={eventsByDay}
        weekdayShort={weekdayShortMonFirst}
        localeTag={localeTag}
        onPick={(d) => {
          setAnchor(d);
          if (view === "month") setView("day");
          setSidebarOpen(false);
        }}
      />
      <div className="p-3 text-xs uppercase tracking-wide text-text-tertiary">
        {t("calendar.sidebar.calendars")}
      </div>
      <div className="px-2 pb-3 space-y-0.5 overflow-auto">
        {calendars.length === 0 && !loading && (
          <div className="px-2 py-1 text-xs text-text-tertiary">
            {t("calendar.sidebar.noCalendars")}
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
                <span className="text-[10px] text-text-quaternary">
                  {t("calendar.sidebar.shared")}
                </span>
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
          title={t("calendar.sidebar.browserTz")}
        >
          <Globe size={11} />
          {shortTz(browserTz)} · {tzOffsetLabel(browserTz)}
        </div>
      </div>
    </>
  );

  return (
    <div className="h-full flex relative">
      {/* ─────────────── Left rail (desktop / tablet) ─────────────── */}
      {!isNarrow && (
        <aside className="w-60 lg:w-64 shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col">
          {sidebarContent}
        </aside>
      )}

      {/* ─────────────── Drawer (mobile) ─────────────── */}
      {isNarrow && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 flex"
          role="dialog"
          aria-modal="true"
          onClick={(e) => {
            if (e.currentTarget === e.target) setSidebarOpen(false);
          }}
        >
          <div className="absolute inset-0 bg-black/50" />
          <aside className="relative z-10 w-[80vw] max-w-[320px] h-full border-r border-stroke-1 bg-bg-chrome flex flex-col shadow-2xl pl-[env(safe-area-inset-left)] pt-[env(safe-area-inset-top,0)]">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* ─────────────── Main pane ─────────────── */}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="shrink-0 border-b border-stroke-1 bg-bg-chrome px-2 sm:px-3 py-1.5 sm:py-0 sm:h-12 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {isNarrow && (
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
              aria-label={t("calendar.sidebar.open")}
            >
              <MenuIcon size={18} />
            </button>
          )}
          <button
            onClick={goToday}
            className="px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded border border-stroke-1 text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            {t("calendar.today")}
          </button>
          <button
            onClick={goPrev}
            className="p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            aria-label={t("calendar.aria.back")}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            onClick={goNext}
            className="p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
            aria-label={t("calendar.aria.forward")}
          >
            <ChevronRight size={18} />
          </button>
          <h1 className="ml-1 text-sm font-semibold text-text-primary truncate min-w-0 flex-1 sm:flex-none">
            {headerLabel}
          </h1>
          {loading && (
            <Loader2 size={14} className="ml-1 animate-spin text-text-tertiary" />
          )}
          <div className="ml-auto flex items-center gap-1">
            <button
              onClick={refresh}
              className="p-1.5 rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
              aria-label={t("calendar.aria.refresh")}
            >
              <RefreshCw size={15} />
            </button>
            {isNarrow ? (
              <select
                value={view}
                onChange={(e) => setView(e.target.value as View)}
                className="ml-1 px-2 py-1.5 text-xs rounded border border-stroke-1 bg-bg-chrome text-text-primary"
                aria-label={t("calendar.view.label")}
              >
                <option value="day">{t("calendar.day")}</option>
                <option value="week">{t("calendar.week")}</option>
                <option value="month">{t("calendar.month")}</option>
                <option value="scheduling">{t("calendar.view.scheduling")}</option>
              </select>
            ) : (
              <div className="ml-2 inline-flex rounded border border-stroke-1 overflow-hidden text-xs">
                {(["month", "week", "day", "scheduling"] as View[]).map((v) => (
                  <button
                    key={v}
                    onClick={() => setView(v)}
                    className={`px-3 py-1.5 ${view === v ? "bg-bg-overlay text-text-primary" : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary"}`}
                    title={
                      v === "scheduling"
                        ? t("calendar.view.schedulingTooltip")
                        : undefined
                    }
                  >
                    {v === "month"
                      ? t("calendar.month")
                      : v === "week"
                        ? t("calendar.week")
                        : v === "day"
                          ? t("calendar.day")
                          : t("calendar.view.scheduling")}
                  </button>
                ))}
              </div>
            )}
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
            <CalendarWeekTimeGrid
              days={Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i))}
              eventsByDay={eventsByDay}
              accent={accent}
              onSelectEvent={setActiveEvent}
              onCreateRange={(a, b) => openComposeRange(a, b)}
            />
          )}
          {view === "day" && (
            <CalendarWeekTimeGrid
              days={[anchor]}
              eventsByDay={eventsByDay}
              accent={accent}
              onSelectEvent={setActiveEvent}
              onCreateRange={(a, b) => openComposeRange(a, b)}
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

/* ====================== Outlook-style mini calendar ===================== */

function MiniMonthCalendar({
  anchor,
  accent,
  eventsByDay,
  weekdayShort,
  localeTag,
  onPick,
}: {
  anchor: Date;
  accent: string;
  eventsByDay: Map<string, CalendarEvent[]>;
  weekdayShort: string[];
  localeTag: string;
  onPick: (d: Date) => void;
}) {
  const [cursor, setCursor] = useState<Date>(
    () => new Date(anchor.getFullYear(), anchor.getMonth(), 1),
  );
  // Keep mini-calendar anchored to the main view's month when the user
  // pages forward/back through the main calendar.
  useEffect(() => {
    setCursor(new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  }, [anchor]);

  const cells = useMemo(() => buildMonthCells(cursor), [cursor]);
  const todayKey = dayKey(new Date());
  const anchorKey = dayKey(anchor);
  const monthLabel = `${monthLong(cursor.getMonth(), localeTag)} ${cursor.getFullYear()}`;

  return (
    <div className="px-3 pt-2 pb-3 border-b border-stroke-1">
      <div className="flex items-center justify-between mb-1.5">
        <button
          type="button"
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))
          }
          className="p-1 rounded text-text-tertiary hover:bg-bg-overlay hover:text-text-primary"
          aria-label="prev month"
        >
          <ChevronLeft size={14} />
        </button>
        <div className="text-xs font-medium text-text-primary">{monthLabel}</div>
        <button
          type="button"
          onClick={() =>
            setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))
          }
          className="p-1 rounded text-text-tertiary hover:bg-bg-overlay hover:text-text-primary"
          aria-label="next month"
        >
          <ChevronRight size={14} />
        </button>
      </div>
      <div className="grid grid-cols-7 text-[10px] text-text-quaternary mb-0.5">
        {weekdayShort.map((w) => (
          <div key={w} className="text-center py-0.5">
            {w.slice(0, 2)}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {cells.map((d) => {
          const k = dayKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = k === todayKey;
          const isAnchor = k === anchorKey;
          const hasEvents = (eventsByDay.get(k) ?? []).length > 0;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onPick(d)}
              className={`h-7 text-[11px] rounded relative inline-flex items-center justify-center ${
                isAnchor
                  ? "text-white"
                  : isToday
                    ? "text-text-primary font-semibold"
                    : inMonth
                      ? "text-text-secondary hover:bg-bg-overlay"
                      : "text-text-quaternary hover:bg-bg-overlay"
              }`}
              style={isAnchor ? { background: accent } : undefined}
              aria-label={k}
            >
              {d.getDate()}
              {hasEvents && !isAnchor && (
                <span
                  className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
                  style={{ background: accent }}
                />
              )}
            </button>
          );
        })}
      </div>
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
  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const weekdayLabels = useMemo(
    () => mondayFirstWeekdayShort(localeTag),
    [localeTag],
  );
  const allDayL = t("calendar.allDay");
  const cells = useMemo(() => buildMonthCells(anchor), [anchor]);
  const todayKey = dayKey(new Date());
  const monthIdx = anchor.getMonth();

  return (
    <div className="h-full flex flex-col">
      <div className="grid grid-cols-7 border-b border-stroke-1 bg-bg-chrome shrink-0">
        {weekdayLabels.map((d) => (
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
                    title={`${e.title} · ${fmtRange(e.start, e.end, e.allDay, allDayL)}`}
                  >
                    {e.allDay ? "" : `${fmtTime(e.start)} `}
                    <span className="text-text-primary">{e.title}</span>
                    {e.recurring && <Repeat size={9} className="inline ml-1 opacity-60" />}
                  </button>
                ))}
                {more > 0 && (
                  <div className="text-[10px] text-text-tertiary px-1.5">
                    {t("calendar.moreInMonth").replace(
                      "{count}",
                      String(more),
                    )}
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

/* ===================== Week / day time grid (drag-to-create) ============ */

const WEEK_GRID_MIN_H = 6;
const WEEK_GRID_MAX_H = 22;
const WEEK_PX_PER_HOUR = 44;
const WEEK_SNAP_MIN = 15;

function totalWeekGridMinutes(): number {
  return (WEEK_GRID_MAX_H - WEEK_GRID_MIN_H) * 60;
}

function snapToGridMinutes(mins: number): number {
  const snapped = Math.round(mins / WEEK_SNAP_MIN) * WEEK_SNAP_MIN;
  return Math.max(0, Math.min(totalWeekGridMinutes(), snapped));
}

function eventTimedLayout(
  day: Date,
  e: CalendarEvent,
): { topPct: number; hPct: number } | null {
  if (e.allDay) return null;
  if (dayKey(new Date(e.start)) !== dayKey(day)) return null;
  const s = new Date(e.start);
  const en = new Date(e.end);
  const gridStartMin = WEEK_GRID_MIN_H * 60;
  const gridEndMin = WEEK_GRID_MAX_H * 60;
  let startMin = s.getHours() * 60 + s.getMinutes();
  let endMin =
    en.getTime() <= s.getTime()
      ? startMin + 30
      : en.getHours() * 60 + en.getMinutes();
  if (dayKey(en) !== dayKey(s)) endMin = gridEndMin;
  startMin = Math.max(gridStartMin, Math.min(gridEndMin, startMin));
  endMin = Math.max(gridStartMin, Math.min(gridEndMin, endMin));
  if (endMin <= startMin) return null;
  const total = totalWeekGridMinutes();
  return {
    topPct: ((startMin - gridStartMin) / total) * 100,
    hPct: ((endMin - startMin) / total) * 100,
  };
}

function dateFromDayGridRel(day: Date, relMinFromGridTop: number): Date {
  const d = new Date(day);
  d.setHours(0, 0, 0, 0);
  const absolute = WEEK_GRID_MIN_H * 60 + relMinFromGridTop;
  d.setHours(Math.floor(absolute / 60), absolute % 60, 0, 0);
  return d;
}

/** Platz paralleler Termine in Spalten (Outlook-ählich). */
function assignOverlapLanes(
  rects: Array<{ topPct: number; hPct: number }>,
): Array<{ lane: number; laneCount: number }> {
  const n = rects.length;
  if (n === 0) return [];
  type E = { topPct: number; end: number; idx: number };
  const es: E[] = rects.map((r, idx) => ({
    topPct: r.topPct,
    end: r.topPct + r.hPct,
    idx,
  }));
  es.sort((a, b) => a.topPct - b.topPct || a.end - b.end);
  const laneEnd: number[] = [];
  const laneForIndex: number[] = new Array(n);
  for (const e of es) {
    let assigned = -1;
    for (let L = 0; L < laneEnd.length; L++) {
      if (laneEnd[L]! <= e.topPct) {
        assigned = L;
        break;
      }
    }
    if (assigned === -1) {
      assigned = laneEnd.length;
      laneEnd.push(e.end);
    } else {
      laneEnd[assigned] = e.end;
    }
    laneForIndex[e.idx] = assigned;
  }
  const laneCount = Math.max(1, laneEnd.length);
  return laneForIndex.map((lane) => ({ lane, laneCount }));
}

function CalendarWeekTimeGrid({
  days,
  eventsByDay,
  accent,
  onSelectEvent,
  onCreateRange,
}: {
  days: Date[];
  eventsByDay: Map<string, CalendarEvent[]>;
  accent: string;
  onSelectEvent: (e: CalendarEvent) => void;
  onCreateRange: (start: Date, end: Date) => void;
}) {
  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const weekdayLabels = useMemo(
    () => mondayFirstWeekdayShort(localeTag),
    [localeTag],
  );
  const allDayL = t("calendar.allDay");
  const todayKey = dayKey(new Date());
  const hoursCount = WEEK_GRID_MAX_H - WEEK_GRID_MIN_H;
  const bodyPx = hoursCount * WEEK_PX_PER_HOUR;

  // Outlook-style "now" indicator: ticks once per minute.
  const [now, setNow] = useState<Date>(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  const nowRel =
    now.getHours() * 60 + now.getMinutes() - WEEK_GRID_MIN_H * 60;
  const totalMin = totalWeekGridMinutes();
  const nowVisible = nowRel >= 0 && nowRel <= totalMin;
  const nowTopPct = (nowRel / totalMin) * 100;

  // Outlook-style: scroll to ~1h before "now" on mount or when the visible
  // day range changes, so the user always lands near the current time.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const daysKey = days.map((d) => dayKey(d)).join(",");
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const showsToday = days.some((d) => dayKey(d) === todayKey);
    const target = showsToday
      ? Math.max(
          0,
          (now.getHours() - WEEK_GRID_MIN_H - 1) * WEEK_PX_PER_HOUR,
        )
      : Math.max(0, (9 - WEEK_GRID_MIN_H) * WEEK_PX_PER_HOUR);
    el.scrollTop = target;
    // We deliberately depend on the day list (stringified) and todayKey, not
    // on `now`, so the scroll snaps once per day change rather than every
    // minute when `now` ticks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysKey, todayKey]);
  const dragRef = useRef<{
    pointerId: number;
    day: Date;
    colEl: HTMLDivElement;
    startRel: number;
  } | null>(null);
  const [dragCurRel, setDragCurRel] = useState<number | null>(null);

  const endDrag = useCallback(
    (ev: PointerEvent, colEl: HTMLDivElement, day: Date, startRel: number) => {
      const rect = colEl.getBoundingClientRect();
      const raw =
        ((ev.clientY - rect.top) / rect.height) * totalWeekGridMinutes();
      const endRel = snapToGridMinutes(raw);
      const lo = Math.min(startRel, endRel);
      let hi = Math.max(startRel, endRel);
      if (hi - lo < WEEK_SNAP_MIN) hi = lo + WEEK_SNAP_MIN;
      const start = dateFromDayGridRel(day, lo);
      const end = dateFromDayGridRel(day, hi);
      if (end.getTime() <= start.getTime()) {
        end.setMinutes(start.getMinutes() + WEEK_SNAP_MIN);
      }
      onCreateRange(start, end);
    },
    [onCreateRange],
  );

  const onColPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, day: Date) => {
      if ((e.target as HTMLElement).closest("[data-cal-event]")) return;
      const colEl = e.currentTarget;
      const rect = colEl.getBoundingClientRect();
      const raw =
        ((e.clientY - rect.top) / rect.height) * totalWeekGridMinutes();
      const startRel = snapToGridMinutes(raw);
      const pid = e.pointerId;
      dragRef.current = { pointerId: pid, day, colEl, startRel };
      setDragCurRel(startRel);

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        const r = colEl.getBoundingClientRect();
        const rr =
          ((ev.clientY - r.top) / r.height) * totalWeekGridMinutes();
        setDragCurRel(snapToGridMinutes(rr));
      };
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) return;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", up);
        const anchor = dragRef.current;
        dragRef.current = null;
        setDragCurRel(null);
        if (!anchor) return;
        endDrag(ev, colEl, anchor.day, anchor.startRel);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", up);
    },
    [endDrag],
  );

  const colsClass =
    days.length === 1 ? "grid grid-cols-1 flex-1 min-w-0" : "grid grid-cols-7 flex-1 min-w-0";

  return (
    <div className="flex flex-col h-full min-h-0 flex-1">
      {/* All-day row */}
      <div className="flex border-b border-stroke-1 bg-bg-chrome shrink-0">
        <div className="w-12 shrink-0 p-1.5 text-[10px] text-text-quaternary border-r border-stroke-1">
          {t("calendar.allDayAbbrev")}
        </div>
        <div className={colsClass}>
          {days.map((d) => {
            const k = dayKey(d);
            const dayEvents = eventsByDay.get(k) ?? [];
            const allDays = dayEvents.filter((ev) => ev.allDay);
            const isToday = k === todayKey;
            return (
              <div
                key={`ad-${k}`}
                className="border-r border-stroke-1 last:border-r-0 p-1 min-h-[3rem] min-w-0"
              >
                <div className="flex items-center gap-1 mb-0.5">
                  <span
                    className={`inline-flex items-center justify-center text-[11px] h-6 w-6 rounded-full shrink-0 ${
                      isToday ? "text-white font-semibold" : "text-text-primary"
                    }`}
                    style={isToday ? { background: accent } : undefined}
                  >
                    {d.getDate()}
                  </span>
                  <span className="text-[10px] font-medium text-text-secondary truncate">
                    {weekdayLabels[(d.getDay() + 6) % 7]}
                  </span>
                </div>
                <div className="space-y-0.5">
                  {allDays.map((ev) => (
                    <button
                      key={ev.id + ev.start}
                      type="button"
                      data-cal-event
                      onClick={() => onSelectEvent(ev)}
                      className="w-full text-left text-[10px] px-1 py-0.5 rounded truncate hover:opacity-90"
                      style={{
                        background: `${ev.color}33`,
                        color: ev.color,
                        borderLeft: `2px solid ${ev.color}`,
                      }}
                      title={ev.title}
                    >
                      {ev.title}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Time grid */}
      <div ref={scrollerRef} className="flex flex-1 min-h-0 overflow-auto">
        <div className="w-12 shrink-0 border-r border-stroke-1 bg-bg-chrome sticky left-0 z-10">
          {Array.from({ length: hoursCount }, (_, i) => (
            <div
              key={i}
              style={{ height: WEEK_PX_PER_HOUR }}
              className="text-[10px] text-text-tertiary pr-1 text-right leading-none pt-0.5"
            >
              {WEEK_GRID_MIN_H + i}:00
            </div>
          ))}
        </div>
        <div className={colsClass}>
          {days.map((d) => {
            const k = dayKey(d);
            const dayEvents = eventsByDay.get(k) ?? [];
            const timed = dayEvents.filter((ev) => !ev.allDay);
            const isToday = k === todayKey;
            const dragPreview =
              dragCurRel != null &&
              dragRef.current &&
              dayKey(dragRef.current.day) === k
                ? (() => {
                    const a = dragRef.current!;
                    const lo = Math.min(a.startRel, dragCurRel);
                    const hi = Math.max(a.startRel, dragCurRel);
                    const total = totalWeekGridMinutes();
                    return {
                      top: (lo / total) * 100,
                      h: Math.max(((hi - lo) / total) * 100, 0.8),
                    };
                  })()
                : null;
            return (
              <div
                key={`tg-${k}`}
                className={`relative border-r border-stroke-1 last:border-r-0 ${
                  isToday ? "bg-bg-elevated/30" : ""
                }`}
              >
                <div
                  role="presentation"
                  className="relative cursor-crosshair select-none touch-none"
                  style={{ height: bodyPx }}
                  onPointerDown={(e) => onColPointerDown(e, d)}
                >
                  {/* hour lines */}
                  {Array.from({ length: hoursCount }, (_, i) => (
                    <div
                      key={i}
                      className="absolute left-0 right-0 border-t border-stroke-1/80 pointer-events-none"
                      style={{ top: i * WEEK_PX_PER_HOUR, height: 0 }}
                    />
                  ))}

                  {/* Outlook-style now indicator on today */}
                  {isToday && nowVisible && (
                    <div
                      className="absolute left-0 right-0 pointer-events-none z-[2]"
                      style={{ top: `${nowTopPct}%` }}
                      aria-hidden
                    >
                      <span className="absolute -left-1 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-rose-500 shadow" />
                      <div className="border-t-2 border-rose-500" />
                    </div>
                  )}

                  {/* timed events */}
                  {(() => {
                    const layouts = timed
                      .map((ev) => {
                        const lay = eventTimedLayout(d, ev);
                        return lay ? { ev, lay } : null;
                      })
                      .filter(
                        (x): x is { ev: CalendarEvent; lay: { topPct: number; hPct: number } } =>
                          x != null,
                      );
                    const lanes = assignOverlapLanes(layouts.map((x) => x.lay));
                    return layouts.map((item, ii) => {
                      const { ev, lay } = item;
                      const { lane, laneCount } = lanes[ii]!;
                      const wPct = 100 / laneCount;
                      const leftPct = (lane / laneCount) * 100;
                      return (
                        <button
                          key={ev.id + ev.start}
                          type="button"
                          data-cal-event
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectEvent(ev);
                          }}
                          className="absolute rounded px-0.5 py-0.5 text-left text-[10px] leading-tight overflow-hidden z-[1] hover:brightness-105 shadow-sm border border-black/10 box-border"
                          style={{
                            top: `${lay.topPct}%`,
                            height: `${lay.hPct}%`,
                            left:
                              laneCount > 1
                                ? `calc(${leftPct}% + 1px)`
                                : "2px",
                            width:
                              laneCount > 1
                                ? `calc(${wPct}% - 3px)`
                                : "calc(100% - 4px)",
                            background: `${ev.color}44`,
                            color: "var(--text-primary)",
                            borderLeft: `3px solid ${ev.color}`,
                          }}
                          title={`${ev.title} · ${fmtRange(ev.start, ev.end, false, allDayL)}`}
                        >
                          <span className="font-medium text-[10px] text-text-primary truncate block">
                            {ev.title}
                          </span>
                          <span className="text-[9px] text-text-tertiary font-mono">
                            {fmtTime(ev.start)}–{fmtTime(ev.end)}
                          </span>
                        </button>
                      );
                    });
                  })()}

                  {dragPreview && (
                    <div
                      className="absolute left-1 right-1 rounded border-2 pointer-events-none z-[2]"
                      style={{
                        top: `${dragPreview.top}%`,
                        height: `${dragPreview.h}%`,
                        borderColor: accent,
                        background: `${accent}22`,
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
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
  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const allDayL = t("calendar.allDay");

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
          aria-label={t("calendar.drawer.close")}
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
              <Repeat size={11} /> {t("calendar.series.short")}
            </span>
          )}
        </div>

        <div>
          <div className="text-xs text-text-tertiary uppercase mb-1">
            {t("calendar.section.when")}
          </div>
          <div className="text-sm text-text-primary">
            {fmtRange(event.start, event.end, event.allDay, allDayL)}
            {!event.allDay && (
              <span className="ml-2 text-[11px] text-text-tertiary">
                {tzOffsetLabel(eventTz)} · {shortTz(eventTz)}
              </span>
            )}
          </div>
          <div className="text-xs text-text-tertiary mt-0.5">
            {new Date(event.start).toLocaleDateString(localeTag, {
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
                {t("calendar.remoteTimesForYou")
                  .replace("{start}", fmtTimeIn(event.start, browserTz, localeTag))
                  .replace("{end}", fmtTimeIn(event.end, browserTz, localeTag))
                  .replace("{tz}", shortTz(browserTz))}
              </span>
            </div>
          )}
        </div>

        {showRsvp && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              {t("calendar.section.yourResponse")}
            </div>
            <div className="flex items-center gap-1.5">
              {(
                [
                  ["accepted", t("calendar.rsvp.accept"), Check],
                  ["tentative", t("calendar.rsvp.tentative"), HelpCircle],
                  ["declined", t("calendar.rsvp.decline"), X],
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
                {t("calendar.rsvp.current")}{" "}
                <strong>{partstatLabel(me.status, t)}</strong>
              </div>
            )}
          </div>
        )}

        {event.location && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              {t("calendar.section.where")}
            </div>
            <div className="text-sm text-text-primary flex items-center gap-2">
              <MapPin size={14} />
              {event.location}
            </div>
          </div>
        )}
        {event.videoUrl && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              {t("calendar.section.videoCall")}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <a
                href={event.videoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md bg-success/15 text-success border border-success/30 hover:bg-success/25 px-3 py-1.5 text-sm font-medium"
              >
                <Video size={14} />
                {t("calendar.video.join")}
              </a>
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(event.videoUrl);
                }}
                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-text-tertiary hover:text-text-primary"
                title={t("calendar.video.copyLink")}
              >
                <Copy size={12} />
                {t("calendar.video.copyLink")}
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
              {t("calendar.section.attendees")}
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
              {t("calendar.section.reminders")}
            </div>
            <ul className="text-sm text-text-primary space-y-1">
              {event.reminders.map((r, i) => (
                <li key={i} className="flex items-center gap-2 text-[12.5px]">
                  <Bell size={12} className="text-text-tertiary" />
                  {reminderLabel(r, t)}
                </li>
              ))}
            </ul>
          </div>
        )}
        {event.recurrence && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              {t("calendar.section.recurrence")}
            </div>
            <div className="text-sm text-text-primary flex items-center gap-2">
              <Repeat size={13} className="text-text-tertiary" />
              {recurrenceLabel(event.recurrence, t)}
              {event.recurrence.until && (
                <span className="text-[11px] text-text-tertiary">
                  {t("calendar.recurrence.untilPrefix")}{" "}
                  {event.recurrence.until}
                </span>
              )}
              {event.recurrence.count != null && (
                <span className="text-[11px] text-text-tertiary">
                  {t("calendar.recurrence.countSuffix").replace(
                    "{count}",
                    String(event.recurrence.count),
                  )}
                </span>
              )}
            </div>
            {event.recurring && (
              <button
                type="button"
                onClick={onSkipOccurrence}
                className="mt-2 text-[11.5px] text-amber-400 hover:underline"
              >
                {t("calendar.skipSeriesOccurrence")}
              </button>
            )}
          </div>
        )}
        {event.description && (
          <div>
            <div className="text-xs text-text-tertiary uppercase mb-1">
              {t("calendar.section.description")}
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
            {t("calendar.delete.action")}
          </button>
        </div>
      )}
    </div>
  );
}

function partstatLabel(
  s: AttendeeStatus,
  tr: (key: keyof Messages) => string,
): string {
  switch (s) {
    case "accepted":
      return tr("calendar.partstat.accepted");
    case "declined":
      return tr("calendar.partstat.declined");
    case "tentative":
      return tr("calendar.partstat.tentative");
    case "needs-action":
      return tr("calendar.partstat.needsAction");
    case "delegated":
      return tr("calendar.partstat.delegated");
    default:
      return tr("calendar.partstat.unknown");
  }
}

function PartstatPill({ status }: { status: AttendeeStatus }) {
  const t = useT();
  const tone =
    status === "accepted"
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : status === "declined"
        ? "bg-red-500/15 text-red-400 border-red-500/30"
        : status === "tentative"
          ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
          : "bg-bg-overlay text-text-tertiary border-stroke-1";
  const label = partstatLabel(status, t);
  return (
    <span
      className={`text-[10px] px-1.5 py-px rounded border ${tone}`}
      title={label}
    >
      {label}
    </span>
  );
}

function reminderLabel(
  r: Reminder,
  tr: (key: keyof Messages) => string,
): string {
  const when =
    REMINDER_MINUTES.includes(r.minutesBefore as (typeof REMINDER_MINUTES)[number])
      ? reminderPresetLabel(r.minutesBefore, tr)
      : `${r.minutesBefore} min`;
  const channel =
    r.action === "EMAIL"
      ? tr("calendar.reminder.channelEmail")
      : tr("calendar.reminder.channelPopup");
  return tr("calendar.reminder.line")
    .replace("{when}", when)
    .replace("{channel}", channel);
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
  const t = useT();
  const recurrenceId = recurrencePresetId(state.recurrence);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-bg-elevated border border-stroke-1 rounded-lg shadow-2xl flex flex-col max-h-[90vh]">
        <div className="h-12 border-b border-stroke-1 px-4 flex items-center">
          <h2 className="text-sm font-semibold text-text-primary">
            {t("calendar.compose.newTitle")}
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
              {t("calendar.title")}
            </label>
            <input
              autoFocus
              className="input"
              value={state.title}
              onChange={(e) => onChange({ ...state, title: e.target.value })}
              placeholder={t("calendar.compose.titlePlaceholder")}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-tertiary mb-1">
                {t("calendar.field.calendar")}
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
                {t("calendar.allDay")}
              </label>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              {t("calendar.field.date")}
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
                    {t("calendar.field.start")}
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
                    {t("calendar.field.end")}
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
                <Globe size={11} />{" "}
                {t("calendar.timesInTimezone")
                  .replace("{tz}", shortTz(browserTz))
                  .replace("{offset}", tzOffsetLabel(browserTz))}
              </div>
            </>
          )}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              {t("calendar.location")}
            </label>
            <input
              className="input"
              value={state.location}
              onChange={(e) =>
                onChange({ ...state, location: e.target.value })
              }
              placeholder={t("calendar.field.locationPlaceholder")}
            />
          </div>

          {/* Recurrence */}
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              <Repeat size={11} className="inline mr-1" />
              {t("calendar.field.recurrence")}
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
                  {t(`calendar.recurrence.${p.id}` as keyof Messages)}
                </option>
              ))}
              {recurrenceId === "custom" && (
                <option value="custom">
                  {t("calendar.recurrence.custom")}
                </option>
              )}
            </select>
            {state.recurrence && (
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-text-tertiary mb-1">
                    {t("calendar.field.endsOn")}
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
                    {t("calendar.field.afterNOccurrences")}
                  </label>
                  <input
                    type="number"
                    min={1}
                    className="input"
                    placeholder={t("calendar.optional")}
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
              {t("calendar.reminders.heading")}
            </label>
            <div className="flex flex-wrap gap-1.5">
              {REMINDER_MINUTES.map((minutes) => {
                const active = state.reminders.some(
                  (r) => r.minutesBefore === minutes,
                );
                const label = reminderPresetLabel(minutes, t);
                return (
                  <button
                    key={minutes}
                    type="button"
                    onClick={() => {
                      const next = active
                        ? state.reminders.filter(
                            (r) => r.minutesBefore !== minutes,
                          )
                        : [
                            ...state.reminders,
                            {
                              minutesBefore: minutes,
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
                    {label}
                  </button>
                );
              })}
            </div>
            {state.reminders.length === 0 && (
              <p className="text-[11px] text-text-quaternary mt-1">
                {t("calendar.reminders.none")}
              </p>
            )}
          </div>

          <VideoCallSection
            workspace={workspace}
            videoUrl={state.videoUrl}
            title={state.title}
            roomSlugFallback={t("calendar.defaultRoomSlug")}
            onChange={(videoUrl) => onChange({ ...state, videoUrl })}
          />
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              {t("calendar.attendees.label")}
            </label>
            <input
              className="input"
              value={state.attendees}
              onChange={(e) =>
                onChange({ ...state, attendees: e.target.value })
              }
              placeholder={t("calendar.attendees.placeholder")}
            />
            {state.attendees.trim() && (
              <p className="text-[11px] text-text-quaternary mt-1">
                {t("calendar.attendees.hint")}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs text-text-tertiary mb-1">
              {t("calendar.description")}
            </label>
            <textarea
              className="input"
              rows={3}
              value={state.description}
              onChange={(e) =>
                onChange({ ...state, description: e.target.value })
              }
              placeholder={t("calendar.description.placeholder")}
            />
          </div>
        </div>
        <div className="border-t border-stroke-1 p-3 flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-sm rounded text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onSubmit}
            className="px-4 py-1.5 text-sm font-medium rounded text-white"
            style={{ background: accent }}
          >
            {t("calendar.compose.save")}
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
  roomSlugFallback,
  onChange,
}: {
  workspace: string;
  videoUrl: string;
  title: string;
  roomSlugFallback: string;
  onChange: (videoUrl: string) => void;
}) {
  const t = useT();
  const enabled = !!videoUrl;

  function toggle() {
    if (enabled) {
      onChange("");
    } else {
      onChange(freshJitsiRoom(workspace, title, roomSlugFallback));
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
          <span>{t("calendar.section.videoCall")}</span>
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
          {enabled
            ? t("calendar.video.toggleRemove")
            : t("calendar.video.toggleAdd")}
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
              title={t("calendar.video.testRoom")}
            >
              <ExternalLink size={12} />
            </a>
          </div>
          <p className="text-[11px] text-text-quaternary leading-snug">
            {t("calendar.video.helpWhenOn")}
          </p>
        </>
      ) : (
        <p className="text-[11px] text-text-quaternary leading-snug">
          {t("calendar.video.helpWhenOff")}
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

  const t = useT();
  const { locale } = useLocale();
  const localeTag = locale === "en" ? "en-US" : "de-DE";
  const weekdayShortMonFirst = useMemo(
    () => mondayFirstWeekdayShort(localeTag),
    [localeTag],
  );

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
      { user: selfEmail || t("calendar.sched.youFallback"), slots: selfBusy, isSelf: true },
    ];
    for (const u of users) {
      const key = u.includes("@") ? u.split("@", 1)[0].toLowerCase() : u.toLowerCase();
      out.push({ user: u, slots: slotsByUser.get(key) ?? [], isSelf: false });
    }
    return out;
  }, [users, slotsByUser, selfEvents, selfEmail, t]);

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
            {t("calendar.sched.title")}
          </div>
          <div className="text-[12px] text-text-tertiary mt-0.5">
            {t("calendar.sched.intro")}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <UsersIcon size={12} className="text-text-tertiary" />
            <input
              className="input flex-1 text-[12px]"
              placeholder={t("calendar.sched.participantsPlaceholder")}
              value={participants}
              onChange={(e) => setParticipants(e.target.value)}
              spellCheck={false}
            />
            <label className="text-[11px] text-text-tertiary flex items-center gap-1">
              {t("calendar.sched.duration")}
              <select
                className="input text-[11px] py-0.5"
                value={meetingMin}
                onChange={(e) => setMeetingMin(Number(e.target.value))}
              >
                {[15, 30, 45, 60, 90].map((m) => (
                  <option key={m} value={m}>
                    {t("calendar.sched.minutesShort").replace(
                      "{minutes}",
                      String(m),
                    )}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-text-tertiary flex items-center gap-1">
              {t("calendar.sched.from")}
              <select
                className="input text-[11px] py-0.5"
                value={workStartH}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWorkStartH(v);
                  if (v >= workEndH) setWorkEndH(Math.min(24, v + 1));
                }}
                title={t("calendar.sched.workStartTitle")}
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {h.toString().padStart(2, "0")}:00
                  </option>
                ))}
              </select>
              {t("calendar.sched.to")}
              <select
                className="input text-[11px] py-0.5"
                value={workEndH}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setWorkEndH(v);
                  if (v <= workStartH) setWorkStartH(Math.max(0, v - 1));
                }}
                title={t("calendar.sched.workEndTitle")}
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
              title={t("calendar.sched.weekendsTitle")}
            >
              <input
                type="checkbox"
                className="accent-current"
                checked={includeWeekends}
                onChange={(e) => setIncludeWeekends(e.target.checked)}
              />
              {t("calendar.sched.weekendsShort")}
            </label>
            {loadingFb && <Loader2 size={12} className="animate-spin text-text-tertiary" />}
          </div>
          {error && (
            <div className="mt-1 text-[11px] text-red-400">{error}</div>
          )}
          {suggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-[10.5px] uppercase tracking-wide text-text-quaternary">
                {t("calendar.sched.suggestions").replace(
                  "{count}",
                  String(suggestions.length),
                )}
              </span>
              {suggestions.map((s) => {
                const end = new Date(s.getTime() + meetingMin * 60_000);
                const dayLabel = s.toLocaleDateString(localeTag, {
                  weekday: "short",
                  day: "2-digit",
                  month: "2-digit",
                });
                const timeLabel = `${s
                  .toLocaleTimeString(localeTag, {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}–${end.toLocaleTimeString(localeTag, {
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
                    title={t("calendar.sched.slotTitle")
                      .replace("{day}", dayLabel)
                      .replace("{time}", timeLabel)}
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
                  title={t("calendar.sched.moreTitle")}
                >
                  {t("calendar.sched.more")}
                </button>
              )}
            </div>
          )}
          {users.length > 0 && suggestions.length === 0 && !loadingFb && (
            <div className="mt-2 text-[11px] text-text-tertiary">
              {t("calendar.sched.noSlot")
                .replace("{minutes}", String(meetingMin))
                .replace(
                  "{window}",
                  `${workStartH.toString().padStart(2, "0")}:00–${workEndH.toString().padStart(2, "0")}:00`,
                )
                .replace(
                  "{weekendHint}",
                  includeWeekends ? t("calendar.sched.weekendIncluded") : "",
                )}
            </div>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto">
        <table className="text-[11.5px] w-full border-collapse">
          <thead className="bg-bg-chrome sticky top-0 z-10">
            <tr>
              <th className="border-b border-r border-stroke-1 px-2 py-1 text-left text-text-tertiary w-32">
                {t("calendar.sched.personColumn")}
              </th>
              {days.map((d) => (
                <th
                  key={dayKey(d)}
                  className="border-b border-r border-stroke-1 px-1 py-1 text-text-tertiary text-center"
                >
                  {weekdayShortMonFirst[(d.getDay() + 6) % 7]} {d.getDate()}.
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
                      {t("calendar.sched.selfLive")}
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
                      localeTag={localeTag}
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
                  {t("calendar.sched.emptyLanes")}
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
  localeTag,
  onPickHour,
}: {
  day: Date;
  slots: FreeBusySlot[];
  accent: string;
  localeTag: string;
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
          title={`${day.toLocaleDateString(localeTag, { weekday: "short", day: "numeric", month: "short" })} ${HOUR_FROM + h}:00`}
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
            title={`${a.toLocaleString(localeTag)} – ${b.toLocaleString(localeTag)}`}
          />
        );
      })}
    </div>
  );
}
