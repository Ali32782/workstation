import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";
import {
  readScraperSchedule,
  writeScraperSchedule,
  type ScraperScheduleFile,
} from "@/lib/scraper/schedule-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminUsername(session.user.username)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const data = await readScraperSchedule();
  return NextResponse.json(data, {
    headers: { "cache-control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminUsername(session.user.username)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  let body: Partial<ScraperScheduleFile>;
  try {
    body = (await req.json()) as Partial<ScraperScheduleFile>;
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const cur = await readScraperSchedule();
  const merged: ScraperScheduleFile = {
    version: 1,
    updatedAt: cur.updatedAt,
    notes: typeof body.notes === "string" ? body.notes : cur.notes,
    profileHints:
      "profileHints" in body &&
      body.profileHints &&
      typeof body.profileHints === "object"
        ? (body.profileHints as ScraperScheduleFile["profileHints"])
        : cur.profileHints,
  };
  await writeScraperSchedule(merged);
  return NextResponse.json(merged);
}
