import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listCalendars } from "@/lib/calendar/caldav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "corehub";
  try {
    const calendars = await listCalendars(workspace, session.user.username);
    return NextResponse.json({ calendars });
  } catch (e) {
    console.error("[/api/calendar/calendars] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, calendars: [] }, { status: 200 });
  }
}
