import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isAdminUsername } from "@/lib/admin-allowlist";
import { getTwentyTenant } from "@/lib/crm/config";
import { OPPORTUNITY_STAGE_LOST } from "@/lib/crm/opportunity-stages";
import {
  createNoteForCompany,
  getScraperLead,
  updateOpportunity,
} from "@/lib/crm/twenty";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RejectBody = {
  ws?: string;
  reason?: string;
  /** Override stage. Default: LOST. */
  targetStage?: string;
};

/**
 * Reject a scraper lead — sets the opportunity stage to LOST so it disappears
 * from the inbox feed (filter is stage=NEW). Optionally writes a short note
 * on the underlying company so the next reviewer sees why it was dismissed.
 * Company itself stays — a future scraper run can still re-merge fields.
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
  const body = (await req.json().catch(() => ({}))) as RejectBody;
  const ws = (body.ws || "medtheris").toLowerCase();
  const targetStage = body.targetStage || OPPORTUNITY_STAGE_LOST;
  const reason = (body.reason || "").trim();

  const tenant = getTwentyTenant(ws);
  if (!tenant) {
    return NextResponse.json(
      { error: `Twenty-Tenant für Workspace "${ws}" nicht konfiguriert.` },
      { status: 400 },
    );
  }

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

  let noteId: string | null = null;
  if (reason) {
    try {
      const reviewer = session.user.username || "admin";
      const note = await createNoteForCompany(
        tenant,
        lead.company.id,
        `Lead verworfen: ${lead.opportunityName}`,
        `Reviewer: @${reviewer}\n\n${reason}`,
      );
      noteId = note?.id ?? null;
    } catch {
      // Note creation is best-effort — never fail the reject because the
      // note couldn't be written.
    }
  }

  return NextResponse.json({
    ok: true,
    opportunityId,
    targetStage,
    noteId,
  });
}
