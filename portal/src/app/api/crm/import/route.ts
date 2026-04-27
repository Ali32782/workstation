import { NextRequest, NextResponse } from "next/server";
import {
  buildCrmPreview,
  type CompanyDraft,
  type CrmEntity,
  type CrmImportPreview,
  type PersonDraft,
} from "@/lib/crm/import";
import {
  createCompany,
  createPerson,
  findPersonByEmail,
  listCompanies,
} from "@/lib/crm/twenty";
import { resolveCrmSession, type CrmSession } from "@/lib/crm/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function gate(
  req: NextRequest,
): Promise<
  | { session: CrmSession; err?: undefined }
  | { err: NextResponse; session?: undefined }
> {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return {
      err: NextResponse.json({ error: "unauthenticated" }, { status: 401 }),
    };
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

type PreviewBody = {
  mode: "preview";
  text: string;
  entity: CrmEntity;
  delimiter?: string;
  mapping?: Record<string, string>;
};

type ExecuteBody = {
  mode: "execute";
  entity: CrmEntity;
  companies?: CompanyDraft[];
  people?: PersonDraft[];
  /** When true, missing company-by-name links are auto-created during a People import. */
  autoCreateCompanies?: boolean;
};

type ImportBody = PreviewBody | ExecuteBody;

export async function POST(req: NextRequest) {
  const g = await gate(req);
  if (g.err) return g.err;
  const session = g.session;

  let body: ImportBody;
  try {
    body = (await req.json()) as ImportBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  if (body.mode === "preview") {
    if (typeof body.text !== "string") {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }
    const preview: CrmImportPreview = buildCrmPreview({
      text: body.text,
      entity: body.entity,
      delimiter: body.delimiter,
      mapping: body.mapping,
    });
    return NextResponse.json({ preview });
  }

  if (body.mode === "execute") {
    if (body.entity === "companies") {
      const drafts = (body.companies ?? []).filter(
        (d) => d.errors.length === 0 && d.name.trim().length > 0,
      );
      let created = 0;
      const errors: { rowIndex: number; error: string }[] = [];
      for (const d of drafts) {
        try {
          // Twenty CompanyCreateInput uses scalar ARR + nested domainName/etc. shape.
          // Keep the payload minimal — Twenty silently rejects unknown attrs.
          const payload: Record<string, unknown> = { name: d.name };
          if (d.domainName) payload.domainName = { primaryLinkUrl: d.domainName };
          if (d.industry) payload.industry = d.industry;
          if (d.employees != null) payload.employees = d.employees;
          if (d.annualRecurringRevenue != null) {
            payload.annualRecurringRevenue = {
              amountMicros: Math.round(d.annualRecurringRevenue * 1_000_000),
              currencyCode: "EUR",
            };
          }
          if (d.linkedinUrl) payload.linkedinLink = { primaryLinkUrl: d.linkedinUrl };
          if (d.xUrl) payload.xLink = { primaryLinkUrl: d.xUrl };
          if (d.address) {
            payload.address = {
              addressStreet1: d.address,
              addressCity: d.city,
              addressCountry: d.country,
            };
          } else if (d.city || d.country) {
            payload.address = { addressCity: d.city, addressCountry: d.country };
          }
          await createCompany(session.tenant, payload as { name: string });
          created++;
        } catch (e) {
          errors.push({
            rowIndex: d.rowIndex,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return NextResponse.json({ created, errors });
    }

    if (body.entity === "people") {
      const drafts = (body.people ?? []).filter((d) => d.errors.length === 0);
      let created = 0;
      const skipped: { rowIndex: number; reason: string }[] = [];
      const errors: { rowIndex: number; error: string }[] = [];

      // Cache company-name → id lookups so a 200-row CSV with the same employer
      // doesn't issue 200 separate listCompanies calls.
      const companyCache = new Map<string, string | null>();
      const resolveCompany = async (
        name: string | undefined,
      ): Promise<string | null> => {
        if (!name) return null;
        const key = name.trim().toLowerCase();
        if (companyCache.has(key)) return companyCache.get(key) ?? null;
        try {
          const result = await listCompanies(session.tenant, {
            search: name,
            limit: 5,
          });
          const exact = result.items.find(
            (c) => c.name.trim().toLowerCase() === key,
          );
          const match = exact ?? result.items[0] ?? null;
          if (match) {
            companyCache.set(key, match.id);
            return match.id;
          }
          if (body.autoCreateCompanies) {
            const created = await createCompany(session.tenant, { name });
            const id = created?.id ?? null;
            companyCache.set(key, id);
            return id;
          }
          companyCache.set(key, null);
          return null;
        } catch {
          companyCache.set(key, null);
          return null;
        }
      };

      for (const d of drafts) {
        try {
          // Skip duplicates by primary email when present.
          if (d.email) {
            const existing = await findPersonByEmail(session.tenant, d.email);
            if (existing) {
              skipped.push({ rowIndex: d.rowIndex, reason: "existing email" });
              continue;
            }
          }
          const firstName = (d.firstName ?? "").trim();
          const lastName = (d.lastName ?? "").trim();
          if (!firstName && !lastName && !d.email) {
            skipped.push({ rowIndex: d.rowIndex, reason: "no identifier" });
            continue;
          }
          const payload: Record<string, unknown> = {
            name: { firstName: firstName || "—", lastName: lastName || "—" },
          };
          if (d.email) payload.emails = { primaryEmail: d.email };
          if (d.phone) payload.phones = { primaryPhoneNumber: d.phone };
          if (d.jobTitle) payload.jobTitle = d.jobTitle;
          if (d.city || d.country) {
            payload.city = d.city;
            // Twenty's Person doesn't always have country — store best-effort
            // in jobTitle when missing? No — leave it as a comment in notes.
          }
          if (d.linkedinUrl) payload.linkedinLink = { primaryLinkUrl: d.linkedinUrl };
          if (d.xUrl) payload.xLink = { primaryLinkUrl: d.xUrl };

          const companyId = await resolveCompany(d.company);
          if (companyId) payload.companyId = companyId;

          await createPerson(
            session.tenant,
            payload as Parameters<typeof createPerson>[1],
          );
          created++;
        } catch (e) {
          errors.push({
            rowIndex: d.rowIndex,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
      return NextResponse.json({ created, skipped, errors });
    }
  }

  return NextResponse.json({ error: "invalid mode" }, { status: 400 });
}
