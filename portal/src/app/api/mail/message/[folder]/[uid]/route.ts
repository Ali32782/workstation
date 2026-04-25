import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
  getMessage,
  setSeen,
  moveMessage,
  deleteMessage,
} from "@/lib/mail/imap";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = Promise<{ folder: string; uid: string }>;

export async function GET(_req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { folder, uid } = await params;
  try {
    const msg = await getMessage(email, decodeURIComponent(folder), Number(uid));
    if (!msg) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json(msg);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { folder, uid } = await params;
  const body = (await req.json()) as { seen?: boolean; moveTo?: string };
  try {
    if (typeof body.seen === "boolean") {
      await setSeen(email, decodeURIComponent(folder), Number(uid), body.seen);
    }
    if (body.moveTo) {
      await moveMessage(email, decodeURIComponent(folder), Number(uid), body.moveTo);
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Params }) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { folder, uid } = await params;
  try {
    await deleteMessage(email, decodeURIComponent(folder), Number(uid));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
