import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPulseForCurrentUser } from "@/lib/pulse";
import type { Locale } from "@/lib/i18n/messages";

function localeFromPulseRequest(req: NextRequest): Locale {
  const c = req.cookies.get("corehub:locale")?.value;
  return c === "en" ? "en" : "de";
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const ws = req.nextUrl.searchParams.get("ws") ?? "corehub";
  const locale = localeFromPulseRequest(req);
  const snapshot = await getPulseForCurrentUser(ws, locale);
  return NextResponse.json(snapshot, {
    headers: { "cache-control": "no-store, max-age=0" },
  });
}
