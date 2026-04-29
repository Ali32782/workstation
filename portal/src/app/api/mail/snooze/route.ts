import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { resolveSessionMailbox } from "@/lib/mail/session-mailbox";
import { snoozeMessage, wakeDueSnoozed } from "@/lib/mail/snooze";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Snooze a message: move to /Snoozed with a wake-time keyword.
 *
 * Body shape:
 *   { folder: string, uid: number, wakeAt: ISO-8601 }
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  let body: { folder?: string; uid?: number; wakeAt?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const folder = (body.folder ?? "").trim();
  const uid = Number(body.uid);
  const wakeAt = body.wakeAt ? new Date(body.wakeAt) : null;
  if (!folder)
    return NextResponse.json({ error: "folder required" }, { status: 400 });
  if (!Number.isFinite(uid) || uid <= 0)
    return NextResponse.json({ error: "uid required" }, { status: 400 });
  if (!wakeAt || Number.isNaN(wakeAt.getTime()))
    return NextResponse.json({ error: "wakeAt invalid" }, { status: 400 });
  if (wakeAt.getTime() < Date.now() + 60 * 1000) {
    return NextResponse.json(
      { error: "wakeAt must be at least 1 minute in the future" },
      { status: 400 },
    );
  }

  try {
    await snoozeMessage(mailbox, folder, uid, wakeAt);
    return NextResponse.json({ ok: true, wakeAt: wakeAt.toISOString() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

/**
 * GET acts as the wake check — runs `wakeDueSnoozed` and returns the
 * count.  The mail UI calls this on mount + every 60 s while the tab
 * is foregrounded; the request is cheap (one IMAP connection, fetch
 * flags only) and idempotent.
 */
export async function GET(_req: NextRequest) {
  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox)
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const out = await wakeDueSnoozed(mailbox);
    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
