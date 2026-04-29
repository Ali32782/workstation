import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { getTwentyTenant } from "@/lib/crm/config";
import {
  getScraperLead,
  listPeople,
  updateOpportunity,
} from "@/lib/crm/twenty";
import {
  OPPORTUNITY_STAGE_QUALIFIED,
} from "@/lib/crm/opportunity-stages";
import {
  addContactToSegment,
  isMauticConfigured,
  upsertContact,
} from "@/lib/marketing/mautic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type ApproveBody = {
  ws?: string;
  segmentId?: number | string;
  /** Override stage. Default: QUALIFIED. */
  targetStage?: string;
};

type PersonError = { personId: string; email: string | null; error: string };

/**
 * Approve a scraper lead:
 *   1. Update the Twenty opportunity stage (default: QUALIFIED).
 *   2. List all people on the embedded company.
 *   3. Upsert each into Mautic + add to the chosen segment.
 *
 * The Mautic segment can come from:
 *   - request body: `segmentId`
 *   - server env: `MAUTIC_DEFAULT_SCRAPER_SEGMENT_ID`
 * If neither is set, the call returns 400 — the operator must pick one in the UI.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminUsername(session.user.username)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id: opportunityId } = await context.params;
  const body = (await req.json().catch(() => ({}))) as ApproveBody;
  const ws = (body.ws || "medtheris").toLowerCase();
  const targetStage = body.targetStage || OPPORTUNITY_STAGE_QUALIFIED;

  const tenant = getTwentyTenant(ws);
  if (!tenant) {
    return NextResponse.json(
      { error: `Twenty-Tenant für Workspace "${ws}" nicht konfiguriert.` },
      { status: 400 },
    );
  }

  const segmentIdRaw =
    body.segmentId ?? process.env.MAUTIC_DEFAULT_SCRAPER_SEGMENT_ID;
  const segmentId =
    segmentIdRaw != null && segmentIdRaw !== "" ? Number(segmentIdRaw) : null;
  if (!segmentId || Number.isNaN(segmentId)) {
    return NextResponse.json(
      {
        error:
          "Bitte ein Mautic-Segment wählen oder MAUTIC_DEFAULT_SCRAPER_SEGMENT_ID setzen.",
      },
      { status: 400 },
    );
  }
  if (!isMauticConfigured()) {
    return NextResponse.json(
      { error: "Mautic ist nicht konfiguriert (MAUTIC_API_USERNAME / MAUTIC_API_TOKEN fehlen)." },
      { status: 400 },
    );
  }

  // Load lead first so we have the embedded company (needed for tags + as a
  // sanity check that this opportunity actually exists in this tenant).
  const lead = await getScraperLead(tenant, opportunityId).catch((e) => {
    throw new Error(
      `Lead konnte nicht geladen werden: ${e instanceof Error ? e.message : String(e)}`,
    );
  });
  if (!lead) {
    return NextResponse.json(
      { error: "Opportunity nicht gefunden." },
      { status: 404 },
    );
  }

  try {
    await updateOpportunity(tenant, opportunityId, { stage: targetStage });
  } catch (e) {
    return NextResponse.json(
      {
        error: `Stage-Update fehlgeschlagen: ${e instanceof Error ? e.message : String(e)}`,
      },
      { status: 502 },
    );
  }

  const peoplePages = await listPeople(tenant, {
    companyId: lead.company.id,
    limit: 100,
  });

  const tags = ["scraper-approved", `tenant:${ws}`];
  let pushed = 0;
  const errors: PersonError[] = [];

  for (const p of peoplePages.items) {
    if (!p.email) continue;
    try {
      const contact = await upsertContact({
        email: p.email,
        firstName: p.firstName || undefined,
        lastName: p.lastName || undefined,
        company: lead.company.name || undefined,
        city:
          p.city || lead.company.address?.addressCity || undefined,
        country: lead.company.address?.addressCountry || undefined,
        tags,
      });
      await addContactToSegment(contact.id, segmentId);
      pushed += 1;
    } catch (e) {
      errors.push({
        personId: p.id,
        email: p.email,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // Fallback: if there is no Person with an email but the company has a
  // generalEmail, still push a contact so the lead enters the funnel.
  if (
    pushed === 0 &&
    !peoplePages.items.some((p) => p.email) &&
    lead.company.generalEmail
  ) {
    try {
      const contact = await upsertContact({
        email: lead.company.generalEmail,
        company: lead.company.name || undefined,
        city: lead.company.address?.addressCity || undefined,
        country: lead.company.address?.addressCountry || undefined,
        tags: [...tags, "company-general-email"],
      });
      await addContactToSegment(contact.id, segmentId);
      pushed = 1;
    } catch (e) {
      errors.push({
        personId: "(company.generalEmail)",
        email: lead.company.generalEmail,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    ok: true,
    opportunityId,
    targetStage,
    segmentId,
    pushed,
    peopleCount: peoplePages.items.length,
    errors,
  });
}
