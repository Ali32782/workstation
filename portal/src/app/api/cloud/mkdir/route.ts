import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { makeCollection } from "@/lib/cloud/webdav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { ws?: string; path?: string };
  const ws = body.ws ?? "corehub";
  const path = body.path;
  if (!path || !path.startsWith("/")) {
    return NextResponse.json({ error: "absolute path required" }, { status: 400 });
  }

  try {
    await makeCollection({
      workspace: ws,
      user: username,
      path,
      accessToken: session.accessToken,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
