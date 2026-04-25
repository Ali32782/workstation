import "server-only";

/**
 * Calendar domain types — kept Outlook-like so the UI can mirror the layout
 * users already know (Month / Week / Day) without leaking CalDAV/iCal jargon.
 */

export type CalendarColor = string; // CSS hex like "#1e4d8c"

export type Calendar = {
  /** CalDAV collection URL relative to the user principal, e.g. "personal". */
  id: string;
  /** Display name as shown in NC ("Personal", "Work", …). */
  name: string;
  /** Optional CSS color from `<x1:calendar-color>` (NC namespace), normalized to hex. */
  color: CalendarColor;
  /** ETag of the collection — clients use it as a coarse "did anything change?" hint. */
  ctag: string | null;
  /** True if the user owns the calendar; false for shared/subscribed ones. */
  owner: boolean;
};

export type CalendarEvent = {
  /** Stable identifier used by API: <calendar-id>/<ics-filename-without-ext>. */
  id: string;
  /** UID inside the .ics file — globally unique, survives moves. */
  uid: string;
  /** ETag of the .ics resource — needed for safe update / delete. */
  etag: string;
  calendarId: string;
  title: string;
  description: string;
  location: string;
  /** Start in ISO-8601. For all-day events the time is 00:00 in local TZ. */
  start: string;
  /** End in ISO-8601. Exclusive (per RFC 5545 spec). */
  end: string;
  allDay: boolean;
  /** From the ORGANIZER property — empty for personal events. */
  organizer: string;
  /** ATTENDEE list (mailto: prefix stripped). */
  attendees: string[];
  /** STATUS: tentative / confirmed / cancelled (lowercased). */
  status: "tentative" | "confirmed" | "cancelled" | "";
  /** Resolved color: event takes the parent calendar's color. */
  color: CalendarColor;
  /** RRULE source line if recurring (informational; expansion done server-side). */
  rrule: string | null;
  /** True if this instance was generated from an RRULE expansion. */
  recurring: boolean;
};

export type EventInput = {
  calendarId: string;
  title: string;
  description?: string;
  location?: string;
  start: string; // ISO
  end: string; // ISO
  allDay?: boolean;
  attendees?: string[];
};
