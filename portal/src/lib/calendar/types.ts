import "server-only";

/**
 * Calendar domain types — kept Outlook-like so the UI can mirror the layout
 * users already know (Month / Week / Day) without leaking CalDAV/iCal jargon.
 */

export type CalendarColor = string;

export type Calendar = {
  /** CalDAV collection URL relative to the user principal, e.g. "personal". */
  id: string;
  name: string;
  /** Optional CSS color from `<x1:calendar-color>` (NC namespace), normalized to hex. */
  color: CalendarColor;
  /** ETag of the collection — clients use it as a coarse "did anything change?" hint. */
  ctag: string | null;
  owner: boolean;
};

/** RFC 5545 PARTSTAT — used for invitation tracking and RSVP. */
export type AttendeeStatus =
  | "needs-action"
  | "accepted"
  | "declined"
  | "tentative"
  | "delegated"
  | "";

export type Attendee = {
  email: string;
  name: string;
  /** REQ-PARTICIPANT, OPT-PARTICIPANT, NON-PARTICIPANT, CHAIR. */
  role: string;
  status: AttendeeStatus;
  /** RSVP=TRUE means the organizer wants a response. */
  rsvp: boolean;
};

/**
 * Reminder offset before the start of an event, expressed in minutes
 * (positive = before start). Mirrors how Outlook stores `ReminderMinutes`,
 * even though the underlying iCal `VALARM` uses an ISO duration like
 * `-PT15M`.
 */
export type Reminder = {
  /** Minutes before the start of the event. */
  minutesBefore: number;
  /** DISPLAY (popup) or EMAIL. We default to DISPLAY in the UI. */
  action: "DISPLAY" | "EMAIL";
};

/**
 * Subset of RRULE properties we expose. We only support the patterns the
 * portal UI offers: daily, weekly (with optional byday), monthly (by month
 * day), yearly. Everything else is round-tripped as-is via `raw`.
 */
export type Recurrence = {
  freq: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  /** Repeat every N units (every 2 weeks → freq=WEEKLY, interval=2). */
  interval: number;
  /** ISO date YYYY-MM-DD, recurrence ends after this date (inclusive). */
  until: string | null;
  /** Hard limit on number of occurrences, alternative to `until`. */
  count: number | null;
  /** SU/MO/TU/WE/TH/FR/SA — used for FREQ=WEEKLY. */
  byday: string[];
  /** Excluded recurrence dates (one ISO date per exception). */
  exdates: string[];
  /** Original RRULE source; preserved when round-tripping unknown features. */
  raw: string;
};

export type CalendarEvent = {
  id: string;
  uid: string;
  etag: string;
  calendarId: string;
  title: string;
  description: string;
  location: string;
  /** Start in ISO-8601. For all-day events the time is 00:00 in local TZ. */
  start: string;
  /** End in ISO-8601. Exclusive (per RFC 5545). */
  end: string;
  allDay: boolean;
  /**
   * IANA TZID of the event start (e.g. `Europe/Berlin`). Empty for floating
   * (no TZID) or UTC events. The UI uses this to render a "(GMT+1, Berlin)"
   * suffix when the event TZ differs from the viewer's browser TZ.
   */
  tzid: string;
  organizer: string;
  attendees: Attendee[];
  reminders: Reminder[];
  recurrence: Recurrence | null;
  status: "tentative" | "confirmed" | "cancelled" | "";
  color: CalendarColor;
  /** True if this instance was generated from an RRULE expansion. */
  recurring: boolean;
  /** RFC 7986 `CONFERENCE` URL — empty if no video call attached. */
  videoUrl: string;
  /** True if the current user is the organizer (set in the API layer). */
  isOrganizer: boolean;
  /** Attendee record for the current user, if any (set in the API layer). */
  selfAttendee: Attendee | null;
};

export type EventInput = {
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  allDay?: boolean;
  /** IANA TZID for non-UTC writes; defaults to the server's TZ. */
  tzid?: string;
  attendees?: string[];
  /** RFC 7986 CONFERENCE URL. */
  videoUrl?: string;
  reminders?: Reminder[];
  recurrence?: Recurrence | null;
};

/**
 * Free/Busy slot for the Scheduling Assistant. We aggregate everyone's
 * busy ranges across the requested window and surface them with a coarse
 * "BUSY" / "FREE" classification, which is all the UI overlay needs.
 */
export type FreeBusySlot = {
  user: string;
  start: string;
  end: string;
  /** BUSY-TENTATIVE shown lighter than BUSY in the UI. */
  status: "busy" | "busy-tentative" | "free";
};
