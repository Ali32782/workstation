import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { freeBusyForUsers } from "@/lib/calendar/caldav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Multi-user free-busy report for the Scheduling Assistant.
 *
 * Body:
 *   { users: ["mara", "diana@kineo360.work"], from: ISO, to: ISO }
 *
 * The API accepts both bare usernames and email addresses; for emails we
 * keep the local-part as the NC username (matching the `@<workspace>` mail
 * convention used elsewhere in the portal).
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.username) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const workspace = req.nextUrl.searchParams.get("workspace") ?? "corehub";
  let body: { users?: string[]; from?: string; to?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const usersIn = Array.isArray(body.users) ? body.users : [];
  const from = body.from ? new Date(body.from) : null;
  const to = body.to ? new Date(body.to) : null;
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: "from/to required" }, { status: 400 });
  }
  if (usersIn.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  const targets = usersIn
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => (u.includes("@") ? u.split("@", 1)[0].toLowerCase() : u.toLowerCase()))
    // de-duplicate while preserving order
    .filter((u, i, arr) => arr.indexOf(u) === i)
    // never query self via free-busy — the UI already has self events.
    .filter((u) => u !== session.user!.username!.toLowerCase());

  try {
    const slots = await freeBusyForUsers(
      workspace,
      session.user.username,
      targets,
      from,
      to,
      session.accessToken,
    );
    return NextResponse.json({ slots });
  } catch (e) {
    console.error("[/api/calendar/freebusy] failed:", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, slots: [] }, { status: 200 });
  }
}
