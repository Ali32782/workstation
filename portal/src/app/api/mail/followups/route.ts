import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSessionMailbox } from "@/lib/mail/session-mailbox";
import { listFollowups } from "@/lib/mail/followups";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DEFAULT_DAYS = 5;

/**
 * "Auf was wartest du gerade?" — outgoing mails older than N days
 * with no reply yet. Defaults to 5 days; the daily-home card surfaces
 * the count and the top 5.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const days = Math.max(
    1,
    Math.min(60, Number(req.nextUrl.searchParams.get("days") ?? DEFAULT_DAYS)),
  );

  try {
    const out = await listFollowups(mailbox, days);
    return NextResponse.json({ ...out, days });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
