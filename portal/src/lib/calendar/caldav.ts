import "server-only";
import { derivePassword } from "@/lib/derived-passwords";
import type { Calendar, CalendarEvent, EventInput } from "./types";

/**
 * Minimal CalDAV client targeting Nextcloud's `/remote.php/dav/calendars/<user>/`
 * collection. We only implement what the Outlook-style UI needs — listing
 * calendars, range-querying events, and CRUD on individual VEVENTs.
 *
 * Authentication: per-user HTTP Basic with the same `derivePassword(...)`
 * scheme used for Migadu & Plane. The portal therefore never stores any
 * Nextcloud-specific secret — it just regenerates the deterministic password
 * on demand. On 401 we fall back once with capitalised first letter, because
 * NC remembers the case of the username at creation time and our pre-existing
 * "Ali" account differs from the lowercased Keycloak username.
 *
 * iCal parsing: we keep this dependency-free with a small line-folding +
 * property-grouping reader. Nextcloud always emits well-formed RFC 5545
 * resources, and we only read the half-dozen properties needed for display.
 */

type NCInstance = {
  /** Internal Docker DNS name, used for fast intra-stack calls. */
  internalBase: string;
  /** Public hostname, used as a fallback when the container DNS isn't reachable. */
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
  // Kineo currently piggybacks on the corehub instance — see PRODUCT-VISION.md
  // ("eigene NC/Zammad-Backends sind deferred").
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

/**
 * Fetch helper that tries internal Docker DNS first (no proxy hop, no TLS),
 * then falls back to the public hostname. Returns the raw `Response`; callers
 * are responsible for status-code handling.
 */
async function dav(
  workspace: string,
  user: string,
  path: string,
  init: RequestInit & { rawBody?: string },
): Promise<Response> {
  const inst = instance(workspace);
  const headers = new Headers(init.headers);
  headers.set("Authorization", basicAuth(user, derivePassword("nextcloud", user)));
  if (!headers.has("Content-Type")) {
    if (init.method === "PROPFIND" || init.method === "REPORT") {
      headers.set("Content-Type", "application/xml; charset=utf-8");
    } else if (init.rawBody !== undefined) {
      headers.set("Content-Type", "text/calendar; charset=utf-8");
    }
  }

  const tryOnce = async (base: string): Promise<Response> =>
    fetch(`${base}${path}`, {
      ...init,
      headers,
      body: init.rawBody ?? init.body,
    });

  let res = await tryOnce(inst.internalBase).catch(() => null);
  if (!res) {
    res = await tryOnce(inst.publicBase);
  }

  // NC remembers the username case at creation; if the lowercase version
  // 401s, retry once with the first letter capitalised. Pre-migration users
  // (e.g. "Ali") still authenticate this way without a manual rename.
  if (res.status === 401 && /^[a-z]/.test(user)) {
    const Capital = user[0].toUpperCase() + user.slice(1);
    const headers2 = new Headers(headers);
    headers2.set(
      "Authorization",
      basicAuth(Capital, derivePassword("nextcloud", Capital)),
    );
    const fixedPath = path.replace(`/calendars/${user}/`, `/calendars/${Capital}/`);
    res = await tryOnce(inst.internalBase)
      .then(() =>
        fetch(`${inst.internalBase}${fixedPath}`, {
          ...init,
          headers: headers2,
          body: init.rawBody ?? init.body,
        }),
      )
      .catch(() =>
        fetch(`${inst.publicBase}${fixedPath}`, {
          ...init,
          headers: headers2,
          body: init.rawBody ?? init.body,
        }),
      );
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
): Promise<Calendar[]> {
  const path = `/remote.php/dav/calendars/${user}/`;
  const res = await dav(workspace, user, path, {
    method: "PROPFIND",
    headers: { Depth: "1" },
    rawBody: PROPFIND_CALENDARS,
  });
  if (res.status !== 207) {
    throw new Error(`PROPFIND calendars failed: HTTP ${res.status}`);
  }
  const xml = await res.text();
  return parseCalendarsResponse(xml, user);
}

function parseCalendarsResponse(xml: string, user: string): Calendar[] {
  const out: Calendar[] = [];
  // Split on </d:response> — the DAV response is always one <d:response> per
  // collection; parsing as plain regex is fine here because NC's output is
  // stable and we never feed user-controlled data through it.
  const blocks = xml.split(/<\/(?:d:)?response>/i);
  for (const b of blocks) {
    const href = b.match(/<(?:d:)?href>([^<]+)<\/(?:d:)?href>/i)?.[1];
    if (!href || !href.includes(`/calendars/${user}/`)) continue;
    // The user principal itself appears as a "/" — skip it.
    if (/\/calendars\/[^/]+\/?$/i.test(href)) continue;

    const isCalendar = /<(?:c:)?calendar\b/i.test(b);
    if (!isCalendar) continue;

    const id = href.replace(/.*\/calendars\/[^/]+\//i, "").replace(/\/?$/, "");
    if (!id) continue;

    const supportsVEVENT = /<(?:c:)?comp\s[^>]*name="VEVENT"/i.test(b);
    if (!supportsVEVENT) continue; // skip address-books, task-lists, …

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
  // NC writes "#RRGGBBAA" sometimes — strip the alpha to keep CSS consumers happy.
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
      /<(?:c:)?calendar-data[^>]*>([\s\S]*?)<\/(?:c:)?calendar-data>/i,
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
  // RFC 5545 line folding: a line that begins with a single space or tab is
  // a continuation of the previous one. Drop the leading whitespace and join.
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

function parseIcsDate(value: string, params: Record<string, string>): { iso: string; allDay: boolean } {
  // VALUE=DATE means a floating date (no time, no TZ).
  if (params.VALUE === "DATE" || /^\d{8}$/.test(value)) {
    const y = value.slice(0, 4);
    const m = value.slice(4, 6);
    const d = value.slice(6, 8);
    return { iso: `${y}-${m}-${d}T00:00:00`, allDay: true };
  }
  // DATE-TIME (UTC: trailing Z, or local with TZID).
  const m = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) return { iso: value, allDay: false };
  const [, y, mo, da, h, mi, s, z] = m;
  const iso = `${y}-${mo}-${da}T${h}:${mi}:${s}${z ? "Z" : ""}`;
  return { iso, allDay: false };
}

function parseVevent(
  ics: string,
  ctx: { id: string; etag: string; calendarId: string },
): CalendarEvent | null {
  const lines = unfold(ics);
  let inEvent = false;
  const props: Prop[] = [];
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") inEvent = true;
    else if (line === "END:VEVENT") break;
    else if (inEvent) {
      const p = parseProp(line);
      if (p) props.push(p);
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
  // If DTEND is missing we assume a 1h event, matching Outlook's default.
  const endInfo = dtend
    ? parseIcsDate(dtend.value, dtend.params)
    : (() => {
        const d = new Date(startInfo.iso);
        d.setUTCHours(d.getUTCHours() + 1);
        return { iso: d.toISOString(), allDay: startInfo.allDay };
      })();

  const status = (get("STATUS")?.value ?? "").toLowerCase();
  const validStatus =
    status === "tentative" || status === "confirmed" || status === "cancelled"
      ? status
      : "";

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
    organizer: (get("ORGANIZER")?.value ?? "").replace(/^mailto:/i, ""),
    attendees: all("ATTENDEE")
      .map((p) => p.value.replace(/^mailto:/i, ""))
      .filter(Boolean),
    status: validStatus,
    color: "#1e4d8c", // overwritten by caller after looking up parent calendar
    rrule: get("RRULE")?.value ?? null,
    recurring: !!get("RRULE"),
  };
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
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART${dtParam}:${dtFmt(start)}`,
    `DTEND${dtParam}:${dtFmt(end)}`,
    `SUMMARY:${escapeIcal(ev.title || "(ohne Titel)")}`,
  ];
  if (ev.description) lines.push(`DESCRIPTION:${escapeIcal(ev.description)}`);
  if (ev.location) lines.push(`LOCATION:${escapeIcal(ev.location)}`);
  if (organizer) lines.push(`ORGANIZER:mailto:${organizer}`);
  for (const a of ev.attendees ?? []) {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT:mailto:${a}`);
  }
  lines.push("END:VEVENT", "END:VCALENDAR");
  // Ensure CRLF + a trailing line per RFC 5545.
  return lines.join("\r\n") + "\r\n";
}

function newUid(): string {
  // RFC 5545 says UIDs SHOULD include an "@domain" suffix; we use the portal
  // hostname so events created from the portal are easy to spot in raw .ics.
  return `${crypto.randomUUID()}@app.kineo360.work`;
}

export async function createEvent(
  workspace: string,
  user: string,
  ev: EventInput,
  organizer?: string,
): Promise<CalendarEvent> {
  const uid = newUid();
  const filename = `${uid.split("@")[0]}.ics`;
  const path = `/remote.php/dav/calendars/${user}/${encodeURIComponent(ev.calendarId)}/${filename}`;
  const body = buildVevent(uid, ev, organizer);
  const res = await dav(workspace, user, path, {
    method: "PUT",
    headers: { "If-None-Match": "*" },
    rawBody: body,
  });
  if (res.status !== 201 && res.status !== 204) {
    throw new Error(`PUT event failed: HTTP ${res.status}`);
  }
  // Re-read so we get the canonical iCal text + ETag back.
  const events = await rangeQuery(
    workspace,
    user,
    ev.calendarId,
    new Date(ev.start),
    new Date(new Date(ev.end).getTime() + 1000),
  );
  return (
    events.find((e) => e.uid === uid) ?? {
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
      organizer: organizer ?? "",
      attendees: ev.attendees ?? [],
      status: "",
      color: "#1e4d8c",
      rrule: null,
      recurring: false,
    }
  );
}

export async function deleteEvent(
  workspace: string,
  user: string,
  eventId: string,
): Promise<void> {
  const slash = eventId.indexOf("/");
  if (slash < 0) throw new Error(`Bad eventId: ${eventId}`);
  const calId = eventId.slice(0, slash);
  const file = eventId.slice(slash + 1);
  const path = `/remote.php/dav/calendars/${user}/${encodeURIComponent(calId)}/${encodeURIComponent(file)}.ics`;
  const res = await dav(workspace, user, path, { method: "DELETE" });
  if (res.status !== 204 && res.status !== 200 && res.status !== 404) {
    throw new Error(`DELETE event failed: HTTP ${res.status}`);
  }
}
