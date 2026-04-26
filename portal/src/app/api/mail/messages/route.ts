import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listMessages } from "@/lib/mail/imap";
import { resolveSessionMailbox } from "@/lib/mail/session-mailbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const folder = req.nextUrl.searchParams.get("folder") ?? "INBOX";
  const page = Number(req.nextUrl.searchParams.get("page") ?? 0);
  const perPage = Math.min(
    100,
    Math.max(10, Number(req.nextUrl.searchParams.get("perPage") ?? 50)),
  );
  try {
    const result = await listMessages(mailbox, { folder, page, perPage });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
