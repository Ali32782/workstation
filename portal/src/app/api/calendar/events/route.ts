import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listCalendars, rangeQuery } from "@/lib/calendar/caldav";
import type { CalendarEvent } from "@/lib/calendar/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Aggregate events from every calendar the user has access to within a time
 * range. The UI passes `from`/`to` covering whatever it currently displays
 * (a month, a week, a day) and we trust those bounds rather than running
 * a separate "give me all of next year" pre-fetch.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "corehub";
  const fromStr = req.nextUrl.searchParams.get("from");
  const toStr = req.nextUrl.searchParams.get("to");
  if (!fromStr || !toStr) {
    return NextResponse.json({ error: "from/to required" }, { status: 400 });
  }
  const from = new Date(fromStr);
  const to = new Date(toStr);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "invalid date" }, { status: 400 });
  }

  try {
    const accessToken = session.accessToken;
    const username = session.user.username;
    const selfEmail = (session.user.email ?? "").toLowerCase();
    const cals = await listCalendars(workspace, username, accessToken);
    const all = await Promise.all(
      cals.map(async (c) => {
        try {
          const events = await rangeQuery(
            workspace,
            username,
            c.id,
            from,
            to,
            accessToken,
          );
          return events.map((e): CalendarEvent => {
            const self =
              e.attendees.find((a) => a.email.toLowerCase() === selfEmail) ?? null;
            return {
              ...e,
              color: c.color,
              isOrganizer:
                e.organizer.toLowerCase() === selfEmail || !e.organizer,
              selfAttendee: self,
            };
          });
        } catch (e) {
          console.warn(`[calendar] skip ${c.id}:`, e);
          return [] as CalendarEvent[];
        }
      }),
    );
    const events = all.flat().sort((a, b) => a.start.localeCompare(b.start));
    return NextResponse.json({ events, calendars: cals });
  } catch (e) {
    console.error("[/api/calendar/events] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: msg, events: [], calendars: [] },
      { status: 200 },
    );
  }
}
