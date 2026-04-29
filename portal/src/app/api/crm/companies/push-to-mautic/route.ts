import { NextRequest, NextResponse } from "next/server";
import { getCompany } from "@/lib/crm/twenty";
import { resolveCrmSession, type CrmSession } from "@/lib/crm/session";
import {
  addContactToSegment,
  isMauticConfigured,
  upsertContact,
} from "@/lib/marketing/mautic";
import { audit } from "@/lib/audit";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * POST /api/crm/companies/push-to-mautic
 *
 * Bulk-push selected CRM companies into Mautic. For each company we
 * upsert a Mautic contact using the best email we can find (general →
 * owner) and optionally bind it to a target segment so the operator's
 * "in den Funnel"-Knopf does the whole job in one round-trip.
 *
 * The request body is:
 *   {
 *     companyIds: string[];        // Twenty company IDs
 *     segmentId?: number;          // Mautic segment to add to (optional)
 *     extraTags?: string[];        // tags appended to every contact
 *   }
 *
 * Per-company outcome is reported in `results` so the UI can show
 * "5/12 erfolgreich, 7 ohne E-Mail übersprungen" — partial failure is
 * expected on Triage data and shouldn't fail the whole batch.
 */
async function gate(req: NextRequest): Promise<
  | { session: CrmSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return { err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  if (r.kind === "forbidden") {
    return { err: NextResponse.json({ error: r.message }, { status: 403 }) };
  }
  if (r.kind === "not_configured") {
    return {
      err: NextResponse.json(
        { error: r.message, workspace: r.workspace, code: "not_configured" },
        { status: 503 },
      ),
    };
  }
  return { session: r.session };
}

type PushResult = {
  companyId: string;
  status: "pushed" | "skipped" | "error";
  reason?: string;
  mauticContactId?: number;
};

export async function POST(req: NextRequest) {
  if (!isMauticConfigured()) {
    return NextResponse.json(
      { error: "mautic not configured", code: "not_configured" },
      { status: 503 },
    );
  }
  const g = await gate(req);
  if (g.err) return g.err;

  let body: {
    companyIds?: string[];
    segmentId?: number;
    extraTags?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const ids = Array.isArray(body.companyIds) ? body.companyIds : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "companyIds required" }, { status: 400 });
  }
  // Sanity-cap so a runaway selection can't pin Mautic for minutes.
  const capped = ids.slice(0, 200);
  const segmentId = typeof body.segmentId === "number" ? body.segmentId : null;
  const extraTags = Array.isArray(body.extraTags) ? body.extraTags : [];

  const results: PushResult[] = [];

  // Sequential — Mautic's API throttles aggressively at >5 r/s and the
  // small upside of a Promise.all is not worth a 429-storm during peak
  // Triage. If this becomes a bottleneck we'll add a 4-wide pool.
  for (const id of capped) {
    try {
      const company = await getCompany(g.session.tenant, id);
      if (!company) {
        results.push({ companyId: id, status: "error", reason: "not_found" });
        continue;
      }
      const email = (company.generalEmail || company.ownerEmail || "").trim();
      if (!email || !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) {
        results.push({
          companyId: id,
          status: "skipped",
          reason: "no_valid_email",
        });
        continue;
      }
      const tags: string[] = [];
      if (company.leadSource) tags.push(company.leadSource);
      tags.push(...extraTags);

      // Owner-name → first/last split. Twenty exposes a single string,
      // Mautic wants firstName / lastName separately. The split is
      // best-effort and only used for personalisation tokens — Mautic
      // matches by email under the hood, so this is cosmetic.
      const ownerParts = (company.ownerName ?? "").trim().split(/\s+/);
      const firstName = ownerParts[0] ?? "";
      const lastName = ownerParts.slice(1).join(" ");

      const contact = await upsertContact({
        email,
        firstName,
        lastName,
        company: company.name,
        city: company.city ?? "",
        country: company.country ?? "",
        tags,
      });

      if (segmentId) {
        try {
          await addContactToSegment(contact.id, segmentId);
        } catch (e) {
          // Segment add failed but contact was created — surface the
          // partial success so the operator can decide whether to retry.
          results.push({
            companyId: id,
            status: "error",
            reason:
              "added_contact_but_segment_failed: " +
              (e instanceof Error ? e.message : String(e)),
            mauticContactId: contact.id,
          });
          continue;
        }
      }
      results.push({
        companyId: id,
        status: "pushed",
        mauticContactId: contact.id,
      });
    } catch (e) {
      results.push({
        companyId: id,
        status: "error",
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const summary = {
    total: results.length,
    pushed: results.filter((r) => r.status === "pushed").length,
    skipped: results.filter((r) => r.status === "skipped").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  // Best-effort audit. Don't await failures into the user response.
  const session = await auth().catch(() => null);
  void audit({
    kind: "crm.mautic_push",
    workspace: g.session.workspace,
    actorEmail: session?.user?.email ?? null,
    actorName: session?.user?.name ?? null,
    action: "push_to_mautic",
    details: { ...summary, segmentId },
  });

  return NextResponse.json({ summary, results });
}
