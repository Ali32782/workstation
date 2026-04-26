import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  createEvent,
  deleteEvent,
  patchEvent,
} from "@/lib/calendar/caldav";
import type { AttendeeStatus, EventInput } from "@/lib/calendar/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "corehub";
  let body: EventInput;
  try {
    body = (await req.json()) as EventInput;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!body.calendarId || !body.title?.trim() || !body.start || !body.end) {
    return NextResponse.json(
      { error: "calendarId, title, start, end required" },
      { status: 400 },
    );
  }
  try {
    const event = await createEvent(
      workspace,
      session.user.username,
      body,
      session.user.email ?? undefined,
      session.accessToken,
    );
    return NextResponse.json({ event });
  } catch (e) {
    console.error("[/api/calendar/event POST] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

/**
 * Patch an existing event without re-creating it. Supports three operations
 * picked via the body shape:
 *
 *   { rsvp: "accepted"|"declined"|"tentative" }   — flip self PARTSTAT
 *   { addExdate: "2026-04-30" }                   — recurrence exception
 *   { ...full EventInput }                        — full replacement (title, time, …)
 *
 * The RSVP variant is what the EventDrawer "Annehmen / Ablehnen" buttons
 * post; everything else is used by the compose modal when editing.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "corehub";
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  let body: {
    rsvp?: AttendeeStatus;
    addExdate?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  try {
    if (body.rsvp) {
      const email = (session.user.email ?? "").toLowerCase();
      if (!email) {
        return NextResponse.json(
          { error: "session has no email" },
          { status: 400 },
        );
      }
      await patchEvent(
        workspace,
        session.user.username,
        id,
        { partstat: { email, status: body.rsvp } },
        session.accessToken,
      );
      return NextResponse.json({ ok: true });
    }
    if (body.addExdate) {
      await patchEvent(
        workspace,
        session.user.username,
        id,
        { addExdate: body.addExdate },
        session.accessToken,
      );
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "unknown patch" }, { status: 400 });
  } catch (e) {
    console.error("[/api/calendar/event PATCH] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "corehub";
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  try {
    await deleteEvent(workspace, session.user.username, id, session.accessToken);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/calendar/event DELETE] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
