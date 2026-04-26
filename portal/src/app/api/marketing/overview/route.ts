import { NextRequest, NextResponse } from "next/server";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { getOverview, mauticPublicUrl } from "@/lib/marketing/mautic";

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
    // Return a safe empty overview so the UI can render its empty state.
    return NextResponse.json(
      {
        error: r.message,
        workspace: r.workspace,
        code: "not_configured",
        publicUrl: mauticPublicUrl(),
      },
      { status: 503 },
    );
  }
  try {
    const overview = await getOverview();
    return NextResponse.json({ overview });
  } catch (e) {
    console.error("[/api/marketing/overview] failed:", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : String(e),
        publicUrl: mauticPublicUrl(),
      },
      { status: 502 },
    );
  }
}
