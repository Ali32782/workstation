import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPulseForCurrentUser } from "@/lib/pulse";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const snapshot = await getPulseForCurrentUser(ws);
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
