import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { createEvent, deleteEvent } from "@/lib/calendar/caldav";
import type { EventInput } from "@/lib/calendar/types";

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
    );
    return NextResponse.json({ event });
  } catch (e) {
    console.error("[/api/calendar/event POST] failed:", e);
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
    await deleteEvent(workspace, session.user.username, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[/api/calendar/event DELETE] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
