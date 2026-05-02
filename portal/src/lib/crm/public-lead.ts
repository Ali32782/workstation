import "server-only";

import { AppApiError } from "@/lib/app-clients/base";
import {
  hasAnyUtm,
  utmFromSearchParams,
  type UtmTouchPayload,
} from "@/lib/marketing/attribution-types";
import { upsertCompanyAttribution } from "@/lib/marketing/attribution-store";
import { getTwentyTenant } from "./config";
import { OPPORTUNITY_STAGE_NEW } from "./opportunity-stages";
import {
  createCompany,
  createNoteForCompany,
  createOpportunity,
  createPerson,
} from "./twenty";

const WEB_FORM_SOURCE = "web-form";

export type PublicLeadInput = {
  workspace?: string;
  companyName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  message?: string;
  /** Honeypot: must stay empty */
  website?: string;
  pageUrl?: string;
  attribution?: Partial<
    Pick<
      UtmTouchPayload,
      | "utm_source"
      | "utm_medium"
      | "utm_campaign"
      | "utm_term"
      | "utm_content"
      | "referrer"
      | "landingPath"
    >
  >;
};

function emailOk(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
}

function mergeUtm(
  fromBody: PublicLeadInput["attribution"],
  pageUrl: string | undefined,
): Pick<
  UtmTouchPayload,
  | "utm_source"
  | "utm_medium"
  | "utm_campaign"
  | "utm_term"
  | "utm_content"
  | "referrer"
  | "landingPath"
> {
  let landingPath = fromBody?.landingPath?.trim() || null;
  const referrer = fromBody?.referrer?.trim() || null;
  const utm = {
    utm_source: fromBody?.utm_source ?? null,
    utm_medium: fromBody?.utm_medium ?? null,
    utm_campaign: fromBody?.utm_campaign ?? null,
    utm_term: fromBody?.utm_term ?? null,
    utm_content: fromBody?.utm_content ?? null,
  };

  if (pageUrl?.trim()) {
    try {
      const u = new URL(pageUrl.trim());
      const fromParams = utmFromSearchParams(u.searchParams);
      utm.utm_source = (utm.utm_source ?? fromParams.utm_source) ?? null;
      utm.utm_medium = (utm.utm_medium ?? fromParams.utm_medium) ?? null;
      utm.utm_campaign = (utm.utm_campaign ?? fromParams.utm_campaign) ?? null;
      utm.utm_term = (utm.utm_term ?? fromParams.utm_term) ?? null;
      utm.utm_content = (utm.utm_content ?? fromParams.utm_content) ?? null;
      landingPath = landingPath ?? `${u.pathname}${u.search}`;
    } catch {
      /* ignore invalid pageUrl */
    }
  }

  return { ...utm, referrer, landingPath };
}

export async function submitPublicLead(
  input: PublicLeadInput,
): Promise<
  | { ok: true; companyId: string; personId: string; opportunityId: string }
  | { ok: false; status: number; code: string }
> {
  if (input.website != null && String(input.website).trim() !== "") {
    return { ok: false, status: 400, code: "rejected" };
  }

  const defaultWs = process.env.PUBLIC_LEAD_DEFAULT_WORKSPACE?.trim().toLowerCase() ?? "";
  const ws = (input.workspace?.trim().toLowerCase() || defaultWs).trim().toLowerCase();
  if (!ws) {
    return { ok: false, status: 400, code: "workspace_required" };
  }

  const tenant = getTwentyTenant(ws);
  if (!tenant) {
    return { ok: false, status: 503, code: "crm_not_configured" };
  }

  const companyName = input.companyName.trim();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const email = input.email.trim();
  if (!companyName || !firstName || !lastName || !emailOk(email)) {
    return { ok: false, status: 400, code: "validation" };
  }

  let company;
  try {
    company = await createCompany(tenant, { name: companyName });
  } catch (e) {
    console.error("[public-lead] createCompany", e);
    return { ok: false, status: 502, code: "company_failed" };
  }
  if (!company?.id) {
    return { ok: false, status: 502, code: "company_failed" };
  }

  const personPayload: Parameters<typeof createPerson>[1] = {
    name: { firstName, lastName },
    emails: { primaryEmail: email },
    companyId: company.id,
  };
  const phone = input.phone?.trim();
  if (phone) {
    personPayload.phones = { primaryPhoneNumber: phone };
  }

  let person;
  try {
    person = await createPerson(tenant, personPayload);
  } catch (e) {
    console.error("[public-lead] createPerson", e);
    return { ok: false, status: 502, code: "person_failed" };
  }
  if (!person?.id) {
    return { ok: false, status: 502, code: "person_failed" };
  }

  const oppName = `Web: ${companyName}`;
  let opportunityId: string;
  try {
    const opp = await createOpportunity(tenant, {
      name: oppName,
      companyId: company.id,
      stage: OPPORTUNITY_STAGE_NEW,
      source: WEB_FORM_SOURCE,
      pointOfContactId: person.id,
    });
    opportunityId = opp.id;
  } catch (e) {
    if (
      e instanceof AppApiError &&
      /pointOfContact|point.?of.?contact|doesn.*field|unknown field/i.test(e.body)
    ) {
      try {
        const opp = await createOpportunity(tenant, {
          name: oppName,
          companyId: company.id,
          stage: OPPORTUNITY_STAGE_NEW,
          source: WEB_FORM_SOURCE,
        });
        opportunityId = opp.id;
      } catch (e2) {
        console.error("[public-lead] createOpportunity (retry)", e2);
        return { ok: false, status: 502, code: "opportunity_failed" };
      }
    } else {
      console.error("[public-lead] createOpportunity", e);
      return { ok: false, status: 502, code: "opportunity_failed" };
    }
  }

  const msg = input.message?.trim();
  if (msg) {
    try {
      await createNoteForCompany(tenant, company.id, "Lead-Formular", msg);
    } catch (e) {
      console.error("[public-lead] createNoteForCompany", e);
    }
  }

  const touch = mergeUtm(input.attribution, input.pageUrl?.trim());
  if (hasAnyUtm(touch)) {
    try {
      await upsertCompanyAttribution({
        workspace: ws,
        companyId: company.id,
        touch: "last",
        payload: {
          utm_source: touch.utm_source,
          utm_medium: touch.utm_medium,
          utm_campaign: touch.utm_campaign,
          utm_term: touch.utm_term,
          utm_content: touch.utm_content,
          referrer: touch.referrer,
          landingPath: touch.landingPath,
        },
      });
    } catch (e) {
      console.error("[public-lead] upsertCompanyAttribution", e);
    }
  }

  return {
    ok: true,
    companyId: company.id,
    personId: person.id,
    opportunityId,
  };
}
