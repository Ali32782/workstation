import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getHelpdeskTenant } from "@/lib/helpdesk/config";
import { listPhonestarRingSince } from "@/lib/phonestar/ring-store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Poll endpoint for Phonestar inbound call signals (portal-wide toast).
 * Enabled only when Phonestar webhook is configured and the requested
 * workspace matches `PHONESTAR_HELPDESK_WORKSPACE`.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const ws = (req.nextUrl.searchParams.get("ws") ?? "").trim().toLowerCase();
  const sinceRaw = req.nextUrl.searchParams.get("since") ?? "0";
  const sinceId = Math.max(0, Math.floor(Number(sinceRaw) || 0));

  const phonestarWs = (process.env.PHONESTAR_HELPDESK_WORKSPACE ?? "kineo")
    .trim()
    .toLowerCase();
  const webhookConfigured = !!process.env.PHONESTAR_WEBHOOK_SECRET?.trim();
  const tenantOk = ws ? Boolean(getHelpdeskTenant(ws)) : false;
  const enabled =
    webhookConfigured && tenantOk && ws === phonestarWs && ws.length > 0;

  if (!enabled) {
    return NextResponse.json(
      { enabled: false as const, events: [] },
      { headers: { "cache-control": "no-store, max-age=0" } },
    );
  }

  const events = await listPhonestarRingSince(ws, sinceId, 80);
  return NextResponse.json(
    { enabled: true as const, events },
    { headers: { "cache-control": "no-store, max-age=0" } },
  );
}
