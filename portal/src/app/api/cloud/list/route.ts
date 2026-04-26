import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listDirectory } from "@/lib/cloud/webdav";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  const username = session?.user?.username;
  if (!username) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const path = req.nextUrl.searchParams.get("path") ?? "/";

  try {
    const data = await listDirectory({
      workspace: ws,
      user: username,
      path,
      accessToken: session.accessToken,
    });
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
