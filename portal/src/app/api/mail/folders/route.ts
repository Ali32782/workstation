import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listFolders } from "@/lib/mail/imap";
import { resolveSessionMailbox } from "@/lib/mail/session-mailbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    const folders = await listFolders(mailbox);
    return NextResponse.json({ folders });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}
