import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAttachment } from "@/lib/mail/imap";
import { resolveSessionMailbox } from "@/lib/mail/session-mailbox";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = Promise<{ folder: string; uid: string; partId: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  const mailbox = resolveSessionMailbox(session);
  if (!mailbox) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { folder, uid, partId } = await params;
  try {
    const att = await getAttachment(
      mailbox,
      decodeURIComponent(folder),
      Number(uid),
      decodeURIComponent(partId),
    );
    if (!att) return new NextResponse("not found", { status: 404 });
    return new NextResponse(new Uint8Array(att.data), {
      headers: {
        "content-type": att.contentType,
        "content-disposition": `attachment; filename="${att.filename.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=600",
      },
    });
  } catch (e) {
    return new NextResponse(e instanceof Error ? e.message : String(e), {
      status: 502,
    });
  }
}
