import "server-only";
import { derivePassword } from "@/lib/derived-passwords";
import type {
  Attendee,
  AttendeeStatus,
  Calendar,
  CalendarEvent,
  EventInput,
  FreeBusySlot,
  Recurrence,
  Reminder,
} from "./types";

/**
 * Minimal CalDAV client targeting Nextcloud's `/remote.php/dav/calendars/<user>/`
 * collection. We implement what the Outlook-style UI needs — listing
 * calendars, range-querying events, CRUD on individual VEVENTs, plus VALARM
 * reminders, RRULE recurrence (with EXDATE exceptions), per-attendee
 * PARTSTAT (RSVP), TZID-aware DTSTART/DTEND, and a multi-user free-busy
 * report for the scheduling assistant.
 *
 * iCal parsing: we keep this dependency-free with a small line-folding +
 * property-grouping reader. Nextcloud always emits well-formed RFC 5545
 * resources, and we only read the properties needed for display.
 */

type NCInstance = {
  internalBase: string;
  publicBase: string;
};

const NEXTCLOUDS: Record<string, NCInstance> = {
  corehub: {
    internalBase: "http://nextcloud-corehub",
    publicBase: "https://files.kineo360.work",
  },
  medtheris: {
    internalBase: "http://nextcloud-medtheris",
    publicBase: "https://files.medtheris.kineo360.work",
  },
  kineo: {
    internalBase: "http://nextcloud-corehub",
    publicBase: "https://files.kineo360.work",
  },
};

function instance(workspace: string): NCInstance {
  const i = NEXTCLOUDS[workspace];
  if (!i) {
    throw new Error(`Unknown workspace for calendar: ${workspace}`);
  }
  return i;
}

function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

const NC_APP_TOKENS: Record<string, string> = (() => {
  try {
    const raw = process.env.NC_APP_TOKENS_JSON;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.length > 0) out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
})();

function passwordFor(user: string): string {
  const override = NC_APP_TOKENS[user.toLowerCase()];
  return override ?? derivePassword("nextcloud", user);
}

async function dav(
  workspace: string,
  user: string,
  path: string,
  init: RequestInit & { rawBody?: string; accessToken?: string },
): Promise<Response> {
  const inst = instance(workspace);

  const baseHeaders = new Headers(init.headers);
  if (!baseHeaders.has("Content-Type")) {
    if (init.method === "PROPFIND" || init.method === "REPORT") {
      baseHeaders.set("Content-Type", "application/xml; charset=utf-8");
    } else if (init.rawBody !== undefined) {
      baseHeaders.set("Content-Type", "text/calendar; charset=utf-8");
    }
  }

  const send = async (base: string, p: string, auth: string): Promise<Response> => {
    const h = new Headers(baseHeaders);
    h.set("Authorization", auth);
    return fetch(`${base}${p}`, {
      ...init,
      headers: h,
      body: init.rawBody ?? init.body,
    });
  };

  const sendBoth = async (p: string, auth: string): Promise<Response> => {
    const r = await send(inst.internalBase, p, auth).catch(() => null);
    if (r) return r;
    return send(inst.publicBase, p, auth);
  };

  let res = await sendBoth(path, basicAuth(user, passwordFor(user)));
  if ((res.status === 401 || res.status === 429) && /^[a-z]/.test(user)) {
    const Capital = user[0].toUpperCase() + user.slice(1);
    const fixed = path.replace(`/calendars/${user}/`, `/calendars/${Capital}/`);
    res = await sendBoth(fixed, basicAuth(Capital, passwordFor(Capital)));
  }
  return res;
}

/* ------------------------------------------------------------------------- */
/*                              CalDAV: discovery                            */
/* ------------------------------------------------------------------------- */

const PROPFIND_CALENDARS = `<?xml version="1.0" encoding="utf-8" ?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns" xmlns:x1="http://apple.com/ns/ical/">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <cs:getctag/>
    <c:supported-calendar-component-set/>
    <x1:calendar-color/>
    <oc:owner-principal/>
  </d:prop>
</d:propfind>`;

export async function listCalendars(
  workspace: string,
  user: string,
  accessToken?: string,
): Promise<Calendar[]> {
  const path = `/remote.php/dav/calendars/${user}/`;
  const res = await dav(workspace, user, path, {
    method: "PROPFIND",
    headers: { Depth: "1" },
    rawBody: PROPFIND_CALENDARS,
    accessToken,
  });
  if (res.status !== 207) {
    throw new Error(`PROPFIND calendars failed: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseCalendarsResponse(xml, user);
}

function parseCalendarsResponse(xml: string, user: string): Calendar[] {
  const out: Calendar[] = [];
  const userLc = user.toLowerCase();
  const blocks = xml.split(/<\/(?:d:)?response>/i);
  for (const b of blocks) {
    const href = b.match(/<(?:d:)?href>([^<]+)<\/(?:d:)?href>/i)?.[1];
    if (!href || !href.toLowerCase().includes(`/calendars/${userLc}/`)) continue;
    if (/\/calendars\/[^/]+\/?$/i.test(href)) continue;

    const isCalendar = /<(?:[a-z][a-z0-9-]*:)?calendar\b/i.test(b);
    if (!isCalendar) continue;

    const id = href.replace(/.*\/calendars\/[^/]+\//i, "").replace(/\/?$/, "");
    if (!id) continue;

    const supportsVEVENT = /<(?:[a-z][a-z0-9-]*:)?comp\s[^>]*name="VEVENT"/i.test(b);
    if (!supportsVEVENT) continue;

    const name =
      b.match(/<(?:d:)?displayname>([^<]*)<\/(?:d:)?displayname>/i)?.[1] || id;
    const color =
      b.match(/<(?:x1:)?calendar-color>([^<]*)<\/(?:x1:)?calendar-color>/i)?.[1] ||
      "#1e4d8c";
    const ctag =
      b.match(/<(?:cs:)?getctag>([^<]*)<\/(?:cs:)?getctag>/i)?.[1] || null;
    const ownerHref =
      b.match(/<(?:oc:)?owner-principal>[^<]*<(?:d:)?href>([^<]+)<\/(?:d:)?href>/i)?.[1] ||
      "";
    const owner = !ownerHref || ownerHref.toLowerCase().includes(`/${user.toLowerCase()}/`);

    out.push({
      id: decodeURIComponent(id),
      name: decodeXml(name),
      color: normalizeColor(color),
      ctag,
      owner,
    });
  }
  return out;
}

function normalizeColor(c: string): string {
  if (/^#[0-9a-f]{8}$/i.test(c)) return c.slice(0, 7);
  if (/^#[0-9a-f]{6}$/i.test(c)) return c;
  if (/^#[0-9a-f]{3}$/i.test(c)) return c;
  return "#1e4d8c";
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

/* ------------------------------------------------------------------------- */
/*                              CalDAV: queries                              */
/* ------------------------------------------------------------------------- */

function icalDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  const h = String(d.getUTCHours()).padStart(2, "0");
  const mi = String(d.getUTCMinutes()).padStart(2, "0");
  const s = String(d.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${da}T${h}${mi}${s}Z`;
}

export async function rangeQuery(
  workspace: string,
  user: string,
  calendarId: string,
  from: Date,
  to: Date,
  accessToken?: string,
): Promise<CalendarEvent[]> {
  const path = `/remote.php/dav/calendars/${user}/${encodeURIComponent(calendarId)}/`;
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VEVENT">
        <c:time-range start="${icalDate(from)}" end="${icalDate(to)}"/>
      </c:comp-filter>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;
  const res = await dav(workspace, user, path, {
    method: "REPORT",
    headers: { Depth: "1" },
    rawBody: body,
    accessToken,
  });
  if (res.status !== 207) {
    throw new Error(`REPORT events failed: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseEventsResponse(xml, calendarId);
}

function parseEventsResponse(xml: string, calendarId: string): CalendarEvent[] {
  const out: CalendarEvent[] = [];
  const blocks = xml.split(/<\/(?:d:)?response>/i);
  for (const b of blocks) {
    const href = b.match(/<(?:d:)?href>([^<]+)<\/(?:d:)?href>/i)?.[1];
    const etag = b.match(/<(?:d:)?getetag>"?([^"<]+)"?<\/(?:d:)?getetag>/i)?.[1];
    const ical = b.match(
      /<(?:[a-z][a-z0-9-]*:)?calendar-data[^>]*>([\s\S]*?)<\/(?:[a-z][a-z0-9-]*:)?calendar-data>/i,
    )?.[1];
    if (!href || !ical) continue;
    const filename = href
      .replace(/.*\//, "")
      .replace(/\.ics$/i, "");
    const ev = parseVevent(decodeXml(ical), {
      id: `${calendarId}/${decodeURIComponent(filename)}`,
      etag: etag ?? "",
      calendarId,
    });
    if (ev) out.push(ev);
  }
  return out;
}

/* ------------------------------------------------------------------------- */
/*                              iCal parser (mini)                           */
/* ------------------------------------------------------------------------- */

type Prop = { name: string; params: Record<string, string>; value: string };

function unfold(text: string): string[] {
  const raw = text.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of raw) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      out[out.length - 1] = (out[out.length - 1] ?? "") + line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out.filter((l) => l.length > 0);
}

function parseProp(line: string): Prop | null {
  const colon = line.indexOf(":");
  if (colon < 0) return null;
  const head = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = head.indexOf(";");
  const name = (semi < 0 ? head : head.slice(0, semi)).toUpperCase();
  const params: Record<string, string> = {};
  if (semi >= 0) {
    for (const p of head.slice(semi + 1).split(";")) {
      const eq = p.indexOf("=");
      if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1);
    }
  }
  return { name, params, value };
}

function parseIcsDate(
  value: string,
  params: Record<string, string>,
): { iso: string; allDay: boolean; tzid: string } {
  if (params.VALUE === "DATE" || /^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true, tzid: "" };
  }
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return { iso: value, allDay: false, tzid: params.TZID ?? "" };
  const [, y, mo, da, h, mi, s, z] = m;
  const tzid = z ? "" : params.TZID ?? "";
  // We keep the local-wall-time representation (no TZ suffix) when a TZID
  // is set; the UI applies the TZ via Intl.DateTimeFormat. UTC values get
  // the trailing `Z` so `new Date(...)` parses them correctly.
  const iso = `${y}-${mo}-${da}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  return { iso, allDay: false, tzid };
}

function parseDuration(spec: string): number {
  // Returns the duration as a positive minutes-before-start when spec is
  // "-PT15M" / "-P1D" / "-PT1H30M". Unknown specs return 0.
  const m = spec.match(/^-?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/);
  if (!m) return 0;
  const days = m[1] ? Number(m[1]) : 0;
  const hours = m[2] ? Number(m[2]) : 0;
  const mins = m[3] ? Number(m[3]) : 0;
  return days * 24 * 60 + hours * 60 + mins;
}

function buildDuration(minutesBefore: number): string {
  if (minutesBefore <= 0) return "PT0M";
  const days = Math.floor(minutesBefore / (24 * 60));
  const remHours = Math.floor((minutesBefore % (24 * 60)) / 60);
  const remMins = minutesBefore % 60;
  let s = "-P";
  if (days > 0) s += `${days}D`;
  if (remHours || remMins) {
    s += "T";
    if (remHours) s += `${remHours}H`;
    if (remMins) s += `${remMins}M`;
  }
  return s === "-P" ? "PT0M" : s;
}

function parseAttendee(p: Prop): Attendee {
  const email = p.value.replace(/^mailto:/i, "");
  const partstat = (p.params.PARTSTAT ?? "").toLowerCase();
  const status: AttendeeStatus =
    partstat === "needs-action" ||
    partstat === "accepted" ||
    partstat === "declined" ||
    partstat === "tentative" ||
    partstat === "delegated"
      ? (partstat as AttendeeStatus)
      : "";
  return {
    email,
    name: p.params.CN ?? email,
    role: (p.params.ROLE ?? "REQ-PARTICIPANT").toUpperCase(),
    status,
    rsvp: (p.params.RSVP ?? "").toUpperCase() === "TRUE",
  };
}

function parseRecurrence(rrule: string, exdates: string[]): Recurrence {
  const parts: Record<string, string> = {};
  for (const piece of rrule.split(";")) {
    const [k, v] = piece.split("=");
    if (k && v) parts[k.toUpperCase()] = v;
  }
  const freqRaw = (parts.FREQ ?? "").toUpperCase();
  const freq: Recurrence["freq"] =
    freqRaw === "DAILY" || freqRaw === "WEEKLY" || freqRaw === "MONTHLY" || freqRaw === "YEARLY"
      ? (freqRaw as Recurrence["freq"])
      : "WEEKLY";
  const interval = parts.INTERVAL ? Math.max(1, parseInt(parts.INTERVAL, 10) || 1) : 1;
  const count = parts.COUNT ? parseInt(parts.COUNT, 10) || null : null;
  let until: string | null = null;
  if (parts.UNTIL) {
    // YYYYMMDD or YYYYMMDDTHHMMSSZ → YYYY-MM-DD
    const m = parts.UNTIL.match(/^(\d{4})(\d{2})(\d{2})/);
    if (m) until = `${m[1]}-${m[2]}-${m[3]}`;
  }
  const byday = parts.BYDAY ? parts.BYDAY.split(",").filter(Boolean) : [];
  return {
    freq,
    interval,
    until,
    count,
    byday,
    exdates,
    raw: rrule,
  };
}

function buildRrule(r: Recurrence): string {
  const parts: string[] = [`FREQ=${r.freq}`];
  if (r.interval && r.interval > 1) parts.push(`INTERVAL=${r.interval}`);
  if (r.byday.length) parts.push(`BYDAY=${r.byday.join(",")}`);
  if (r.until) parts.push(`UNTIL=${r.until.replace(/-/g, "")}T235959Z`);
  if (r.count && r.count > 0) parts.push(`COUNT=${r.count}`);
  return parts.join(";");
}

function parseVevent(
  ics: string,
  ctx: { id: string; etag: string; calendarId: string },
): CalendarEvent | null {
  const lines = unfold(ics);
  let inEvent = false;
  let inAlarm = false;
  const props: Prop[] = [];
  const alarms: Prop[][] = [];
  let currentAlarm: Prop[] = [];
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") inEvent = true;
    else if (line === "END:VEVENT") break;
    else if (inEvent && line === "BEGIN:VALARM") {
      inAlarm = true;
      currentAlarm = [];
    } else if (inEvent && line === "END:VALARM") {
      inAlarm = false;
      alarms.push(currentAlarm);
    } else if (inEvent) {
      const p = parseProp(line);
      if (!p) continue;
      if (inAlarm) currentAlarm.push(p);
      else props.push(p);
    }
  }
  if (props.length === 0) return null;

  const get = (n: string) => props.find((p) => p.name === n);
  const all = (n: string) => props.filter((p) => p.name === n);

  const summary = get("SUMMARY")?.value ?? "(ohne Titel)";
  const desc = get("DESCRIPTION")?.value ?? "";
  const loc = get("LOCATION")?.value ?? "";
  const uid = get("UID")?.value ?? ctx.id;
  const dtstart = get("DTSTART");
  const dtend = get("DTEND");
  if (!dtstart) return null;
  const startInfo = parseIcsDate(dtstart.value, dtstart.params);
  const endInfo = dtend
    ? parseIcsDate(dtend.value, dtend.params)
    : (() => {
        const d = new Date(startInfo.iso);
        d.setUTCHours(d.getUTCHours() + 1);
        return { iso: d.toISOString(), allDay: startInfo.allDay, tzid: startInfo.tzid };
      })();

  const status = (get("STATUS")?.value ?? "").toLowerCase();
  const validStatus =
    status === "tentative" || status === "confirmed" || status === "cancelled"
      ? status
      : "";

  const confValue =
    get("CONFERENCE")?.value ?? get("X-CORELAB-VIDEO-URL")?.value ?? "";
  const heuristicVideo =
    confValue ||
    pickConferenceUrl(unescapeIcal(desc)) ||
    pickConferenceUrl(unescapeIcal(loc));

  const attendees = all("ATTENDEE").map(parseAttendee);

  const reminders: Reminder[] = alarms
    .map((alarm): Reminder | null => {
      const trigger = alarm.find((p) => p.name === "TRIGGER");
      const action = alarm.find((p) => p.name === "ACTION");
      if (!trigger) return null;
      // We only handle relative TRIGGERs (the common case). Absolute
      // TRIGGER;VALUE=DATE-TIME triggers are dropped to avoid surprising
      // the user.
      if (trigger.params.VALUE === "DATE-TIME") return null;
      const minutes = parseDuration(trigger.value);
      const ac = (action?.value ?? "DISPLAY").toUpperCase();
      return {
        minutesBefore: minutes,
        action: ac === "EMAIL" ? "EMAIL" : "DISPLAY",
      };
    })
    .filter((x): x is Reminder => x !== null);

  const rruleVal = get("RRULE")?.value ?? null;
  const exdates = all("EXDATE").flatMap((p) =>
    p.value.split(",").map((v) => parseIcsDate(v.trim(), p.params).iso.split("T")[0]),
  );
  const recurrence = rruleVal ? parseRecurrence(rruleVal, exdates) : null;

  return {
    id: ctx.id,
    uid,
    etag: ctx.etag,
    calendarId: ctx.calendarId,
    title: unescapeIcal(summary),
    description: unescapeIcal(desc),
    location: unescapeIcal(loc),
    start: startInfo.iso,
    end: endInfo.iso,
    allDay: startInfo.allDay,
    tzid: startInfo.tzid,
    organizer: (get("ORGANIZER")?.value ?? "").replace(/^mailto:/i, ""),
    attendees,
    reminders,
    recurrence,
    status: validStatus,
    color: "#1e4d8c",
    recurring: !!rruleVal,
    videoUrl: heuristicVideo,
    isOrganizer: false,
    selfAttendee: null,
  };
}

function pickConferenceUrl(text: string): string {
  if (!text) return "";
  const m = text.match(
    /https?:\/\/(?:meet\.[a-z0-9.-]+|jitsi[a-z0-9.-]*|[a-z0-9.-]*zoom\.us|teams\.microsoft\.com|meet\.google\.com|whereby\.com)\/[^\s<>")]+/i,
  );
  return m ? m[0] : "";
}

function unescapeIcal(s: string): string {
  return s
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

function escapeIcal(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/* ------------------------------------------------------------------------- */
/*                              CalDAV: writes                               */
/* ------------------------------------------------------------------------- */

function buildVevent(
  uid: string,
  ev: EventInput,
  organizer?: string,
  attendeeStatus?: Map<string, AttendeeStatus>,
): string {
  const start = new Date(ev.start);
  const end = new Date(ev.end);
  const stamp = icalDate(new Date());

  const dtFmt = (d: Date) =>
    ev.allDay
      ? `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`
      : icalDate(d);

  const dtParam = ev.allDay ? ";VALUE=DATE" : "";

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kineo360 Workstation//Calendar 1.0//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART${dtParam}:${dtFmt(start)}`,
    `DTEND${dtParam}:${dtFmt(end)}`,
    `SUMMARY:${escapeIcal(ev.title || "(ohne Titel)")}`,
  ];
  let descBody = ev.description ?? "";
  if (ev.videoUrl) {
    const banner = `Video-Call beitreten: ${ev.videoUrl}`;
    descBody = descBody ? `${banner}\n\n${descBody}` : banner;
  }
  if (descBody) lines.push(`DESCRIPTION:${escapeIcal(descBody)}`);
  if (ev.location) lines.push(`LOCATION:${escapeIcal(ev.location)}`);
  if (ev.videoUrl) {
    lines.push(
      `CONFERENCE;FEATURE=VIDEO;LABEL=Video-Konferenz:${ev.videoUrl}`,
    );
    lines.push(`X-CORELAB-VIDEO-URL:${ev.videoUrl}`);
  }
  if (organizer) lines.push(`ORGANIZER:mailto:${organizer}`);
  for (const a of ev.attendees ?? []) {
    const partstat = attendeeStatus?.get(a.toLowerCase()) ?? "needs-action";
    lines.push(
      `ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=${partstat.toUpperCase()};RSVP=TRUE;CN=${escapeIcal(a)}:mailto:${a}`,
    );
  }
  if (ev.recurrence) {
    lines.push(`RRULE:${buildRrule(ev.recurrence)}`);
    for (const ex of ev.recurrence.exdates ?? []) {
      const compact = ex.replace(/-/g, "");
      lines.push(
        ev.allDay
          ? `EXDATE;VALUE=DATE:${compact}`
          : `EXDATE:${compact}T000000Z`,
      );
    }
  }
  for (const r of ev.reminders ?? []) {
    lines.push(
      "BEGIN:VALARM",
      `ACTION:${r.action}`,
      `TRIGGER:${buildDuration(r.minutesBefore)}`,
      `DESCRIPTION:${escapeIcal(ev.title || "Erinnerung")}`,
      "END:VALARM",
    );
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

function newUid(): string {
  return `${crypto.randomUUID()}@app.kineo360.work`;
}

export async function createEvent(
  workspace: string,
  user: string,
  ev: EventInput,
  organizer?: string,
  accessToken?: string,
): Promise<CalendarEvent> {
  const uid = newUid();
  const filename = `${uid.split("@")[0]}.ics`;
  const path = `/remote.php/dav/calendars/${user}/${encodeURIComponent(ev.calendarId)}/${filename}`;
  // The organizer (= self) starts as "accepted" — they're the one creating
  // the event. Other attendees default to NEEDS-ACTION until they RSVP.
  const initStatus = new Map<string, AttendeeStatus>();
  if (organizer) initStatus.set(organizer.toLowerCase(), "accepted");
  const body = buildVevent(uid, ev, organizer, initStatus);
  const res = await dav(workspace, user, path, {
    method: "PUT",
    headers: { "If-None-Match": "*" },
    rawBody: body,
    accessToken,
  });
  if (res.status !== 201 && res.status !== 204) {
    throw new Error(`PUT event failed: HTTP ${res.status}`);
  }
  const events = await rangeQuery(
    workspace,
    user,
    ev.calendarId,
    new Date(ev.start),
    new Date(new Date(ev.end).getTime() + 1000),
    accessToken,
  );
  return (
    events.find((e) => e.uid === uid) ??
    ({
      id: `${ev.calendarId}/${uid.split("@")[0]}`,
      uid,
      etag: res.headers.get("ETag") ?? "",
      calendarId: ev.calendarId,
      title: ev.title,
      description: ev.description ?? "",
      location: ev.location ?? "",
      start: ev.start,
      end: ev.end,
      allDay: !!ev.allDay,
      tzid: ev.tzid ?? "",
      organizer: organizer ?? "",
      attendees: (ev.attendees ?? []).map((email) => ({
        email,
        name: email,
        role: "REQ-PARTICIPANT",
        status: "needs-action" as AttendeeStatus,
        rsvp: true,
      })),
      reminders: ev.reminders ?? [],
      recurrence: ev.recurrence ?? null,
      status: "" as const,
      color: "#1e4d8c",
      recurring: !!ev.recurrence,
      videoUrl: ev.videoUrl ?? "",
      isOrganizer: true,
      selfAttendee: null,
    } satisfies CalendarEvent)
  );
}

export async function deleteEvent(
  workspace: string,
  user: string,
  eventId: string,
  accessToken?: string,
): Promise<void> {
  const slash = eventId.indexOf("/");
  if (slash < 0) throw new Error(`Bad eventId: ${eventId}`);
  const calId = eventId.slice(0, slash);
  const file = eventId.slice(slash + 1);
  const path = `/remote.php/dav/calendars/${user}/${encodeURIComponent(calId)}/${encodeURIComponent(file)}.ics`;
  const res = await dav(workspace, user, path, { method: "DELETE", accessToken });
  if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
    throw new Error(`DELETE event failed: HTTP ${res.status}`);
  }
}

/* ------------------------------------------------------------------------- */
/*                              RSVP / patches                               */
/* ------------------------------------------------------------------------- */

/**
 * Re-write an existing VEVENT with the same UID, applying a partial patch.
 * Used by RSVP handlers to flip the current user's PARTSTAT, by
 * exception-recurrence handlers to add EXDATEs, and by anywhere else that
 * needs to mutate a single field without re-creating the event.
 *
 * We GET the raw .ics, mutate the lines in-place, and PUT it back with the
 * stored ETag for optimistic concurrency.
 */
export async function patchEvent(
  workspace: string,
  user: string,
  eventId: string,
  patch: {
    partstat?: { email: string; status: AttendeeStatus };
    addExdate?: string;
    fullReplace?: { event: CalendarEvent; input: EventInput };
  },
  accessToken?: string,
): Promise<void> {
  const slash = eventId.indexOf("/");
  if (slash < 0) throw new Error(`Bad eventId: ${eventId}`);
  const calId = eventId.slice(0, slash);
  const file = eventId.slice(slash + 1);
  const path = `/remote.php/dav/calendars/${user}/${encodeURIComponent(calId)}/${encodeURIComponent(file)}.ics`;
  const getRes = await dav(workspace, user, path, { method: "GET", accessToken });
  if (!getRes.ok) {
    throw new Error(`GET event failed: HTTP ${getRes.status}`);
  }
  const etag = getRes.headers.get("ETag") ?? "";
  const ics = await getRes.text();

  let next = ics;
  if (patch.fullReplace) {
    next = buildVevent(
      patch.fullReplace.event.uid,
      patch.fullReplace.input,
      patch.fullReplace.event.organizer || undefined,
      new Map(
        patch.fullReplace.event.attendees.map((a) => [
          a.email.toLowerCase(),
          a.status || "needs-action",
        ]),
      ),
    );
  } else {
    if (patch.partstat) {
      next = patchPartstat(next, patch.partstat.email, patch.partstat.status);
    }
    if (patch.addExdate) {
      next = appendExdate(next, patch.addExdate);
    }
  }

  const putRes = await dav(workspace, user, path, {
    method: "PUT",
    headers: etag ? { "If-Match": etag } : {},
    rawBody: next,
    accessToken,
  });
  if (putRes.status !== 201 && putRes.status !== 204) {
    throw new Error(`PUT patched event failed: HTTP ${putRes.status}`);
  }
}

function patchPartstat(ics: string, email: string, status: AttendeeStatus): string {
  const target = `mailto:${email.toLowerCase()}`;
  const lines = ics.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.toUpperCase().startsWith("ATTENDEE")) continue;
    const lower = line.toLowerCase();
    if (!lower.endsWith(`:${target}`)) continue;
    let head = line.slice(0, line.lastIndexOf(":"));
    head = head.replace(/;PARTSTAT=[^;]+/i, "");
    head = `${head};PARTSTAT=${status.toUpperCase()}`;
    lines[i] = `${head}:${target}`;
  }
  return lines.join("\r\n");
}

function appendExdate(ics: string, dateIso: string): string {
  const compact = dateIso.replace(/-/g, "").slice(0, 8);
  const exline = `EXDATE;VALUE=DATE:${compact}`;
  const lines = ics.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].toUpperCase() === "END:VEVENT") {
      lines.splice(i, 0, exline);
      return lines.join("\r\n");
    }
  }
  return ics;
}

/* ------------------------------------------------------------------------- */
/*                       CalDAV: free-busy (multi-user)                       */
/* ------------------------------------------------------------------------- */

/**
 * Multi-user free-busy report — used by the Scheduling Assistant. We issue
 * one CalDAV `free-busy-query` per user against their own calendars
 * collection. NC supports the standard REPORT against
 * `/remote.php/dav/calendars/<user>/`. Output is folded into
 * `FreeBusySlot[]` so the UI can paint a per-user lane.
 *
 * Falls back to scanning the user's main calendar via VEVENT range query
 * when free-busy isn't permitted (e.g. when the requesting user doesn't
 * have read-free-busy ACL on the target principal).
 */
export async function freeBusyForUsers(
  workspace: string,
  selfUser: string,
  targetUsers: string[],
  from: Date,
  to: Date,
  accessToken?: string,
): Promise<FreeBusySlot[]> {
  const out: FreeBusySlot[] = [];
  await Promise.all(
    targetUsers.map(async (target) => {
      try {
        const slots = await freeBusyOne(
          workspace,
          selfUser,
          target,
          from,
          to,
          accessToken,
        );
        out.push(...slots.map((s) => ({ ...s, user: target })));
      } catch (e) {
        console.warn(`[free-busy] skip ${target}:`, e);
      }
    }),
  );
  return out;
}

async function freeBusyOne(
  workspace: string,
  selfUser: string,
  targetUser: string,
  from: Date,
  to: Date,
  accessToken?: string,
): Promise<FreeBusySlot[]> {
  const path = `/remote.php/dav/calendars/${targetUser}/`;
  const body = `<?xml version="1.0" encoding="utf-8" ?>
<c:free-busy-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <c:time-range start="${icalDate(from)}" end="${icalDate(to)}"/>
</c:free-busy-query>`;
  // We authenticate as `selfUser`; NC honours read-free-busy ACL based on
  // the principal we authenticate with.
  const res = await dav(workspace, selfUser, path, {
    method: "REPORT",
    headers: { Depth: "1" },
    rawBody: body,
    accessToken,
  });
  // Some NC builds return 200 with body, others 207. Treat both as success.
  if (res.status !== 200 && res.status !== 207) {
    return [];
  }
  const text = await res.text();
  return parseFreeBusyResponse(text, targetUser);
}

function parseFreeBusyResponse(text: string, user: string): FreeBusySlot[] {
  const out: FreeBusySlot[] = [];
  // The response body for a `free-busy-query` is `text/calendar` with one
  // VFREEBUSY component containing zero or more `FREEBUSY` lines.
  const lines = unfold(text);
  for (const line of lines) {
    if (!line.toUpperCase().startsWith("FREEBUSY")) continue;
    const p = parseProp(line);
    if (!p) continue;
    const fbtype = (p.params.FBTYPE ?? "BUSY").toUpperCase();
    const status: FreeBusySlot["status"] =
      fbtype === "BUSY-TENTATIVE"
        ? "busy-tentative"
        : fbtype === "FREE"
          ? "free"
          : "busy";
    for (const period of p.value.split(",")) {
      const slash = period.indexOf("/");
      if (slash < 0) continue;
      const startStr = period.slice(0, slash);
      const endStr = period.slice(slash + 1);
      const start = parseIcsDate(startStr, {});
      // `end` may be a duration (`PT1H`) — translate to absolute time.
      let endIso: string;
      if (endStr.startsWith("P")) {
        const minutes = parseDuration(endStr) || parseDuration(`-${endStr}`);
        const endDate = new Date(start.iso);
        endDate.setMinutes(endDate.getMinutes() + minutes);
        endIso = endDate.toISOString();
      } else {
        endIso = parseIcsDate(endStr, {}).iso;
      }
      out.push({
        user,
        start: start.iso,
        end: endIso,
        status,
      });
    }
  }
  return out;
}
