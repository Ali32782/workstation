import { NextRequest, NextResponse } from "next/server";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { getMauticSettings } from "@/lib/marketing/mautic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveMarketingSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json(
      { error: r.message, code: "not_configured", workspace: r.workspace },
      { status: 503 },
    );
  }
  try {
    const settings = await getMauticSettings();
    return NextResponse.json({ workspace: r.session.workspace, ...settings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
