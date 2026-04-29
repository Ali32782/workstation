import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { getTwentyTenant } from "@/lib/crm/config";
import { OPPORTUNITY_STAGE_NEW } from "@/lib/crm/opportunity-stages";
import { listScraperLeads } from "@/lib/crm/twenty";
import { isMauticConfigured, listSegments } from "@/lib/marketing/mautic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Lead-Inbox feed. Returns Twenty Opportunities for a given (source, stage),
 * e.g. scraper leads (google-maps-scraper) or embeddable form (web-form),
 * with embedded company snapshot and Mautic segments for Approve.
 *
 * Query params:
 *   ws       — portal workspace id (default: medtheris). Resolves the Twenty
 *              tenant config (workspace id + JWT).
 *   source   — opportunity.source filter (default: google-maps-scraper).
 *   stage    — opportunity.stage filter (default: NEW).
 *   first    — max items (default 100, hard cap 200).
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminUsername(session.user.username)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const ws = (url.searchParams.get("ws") || "medtheris").toLowerCase();
  const source = url.searchParams.get("source") || "google-maps-scraper";
  const stage = url.searchParams.get("stage") || OPPORTUNITY_STAGE_NEW;
  const first = Math.min(Number(url.searchParams.get("first") || 100) || 100, 200);

  const tenant = getTwentyTenant(ws);
  if (!tenant) {
    return NextResponse.json(
      { error: `Twenty-Tenant für Workspace "${ws}" nicht konfiguriert.` },
      { status: 400 },
    );
  }

  const defaultSegmentId = process.env.MAUTIC_DEFAULT_SCRAPER_SEGMENT_ID
    ? Number(process.env.MAUTIC_DEFAULT_SCRAPER_SEGMENT_ID)
    : null;

  try {
    const [leads, segmentsRes] = await Promise.all([
      listScraperLeads(tenant, { source, stage, first }),
      isMauticConfigured()
        ? listSegments({ limit: 200 }).catch(() => ({ total: 0, segments: [] }))
        : Promise.resolve({ total: 0, segments: [] }),
    ]);

    return NextResponse.json({
      workspace: ws,
      filter: { source, stage },
      defaultSegmentId,
      mauticConfigured: isMauticConfigured(),
      segments: segmentsRes.segments.map((s) => ({
        id: s.id,
        name: s.name,
        contactCount: s.contactCount,
        isPublished: s.isPublished,
      })),
      leads,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
