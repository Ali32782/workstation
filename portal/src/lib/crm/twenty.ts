import "server-only";
import { createAppFetch, AppApiError } from "@/lib/app-clients/base";
import type { TwentyTenantConfig } from "./config";
import type {
  CompanyDetail,
  CompanySummary,
  NoteSummary,
  OpportunitySummary,
  PersonDetail,
  PersonSummary,
  TaskSummary,
  WorkspaceMember,
} from "./types";
import { OPPORTUNITY_STAGE_NEW } from "./opportunity-stages";

/**
 * Native Twenty CRM client — multi-tenant.
 *
 * Every public function accepts a `TwentyTenantConfig` (workspace id +
 * workspace-scoped JWT) so the same Twenty instance can serve multiple
 * portal workspaces without leaking data between them. The caller resolves
 * which tenant to use via `getTwentyTenant(coreWorkspace)` from `./config`.
 *
 * The transport details (URL, internal vs public origin, error mapping) are
 * shared via the `lib/app-clients/base` helper.
 */

const PUBLIC = process.env.TWENTY_URL ?? "https://crm.kineo360.work";
const INTERNAL = process.env.TWENTY_INTERNAL_URL ?? "http://twenty:3000";

function createTenantFetch(tenant: TwentyTenantConfig) {
  return createAppFetch({
    app: "twenty",
    origins: { internal: INTERNAL, public: PUBLIC },
    authHeaders: () => ({ Authorization: `Bearer ${tenant.apiToken}` }),
  });
}

async function gql<T = unknown>(
  tenant: TwentyTenantConfig,
  query: string,
  variables: Record<string, unknown> = {},
): Promise<T> {
  const fetcher = createTenantFetch(tenant);
  const r = await fetcher("/graphql", {
    method: "POST",
    json: { query, variables },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new AppApiError("twenty", r.status, "/graphql", body);
  }
  const payload = (await r.json()) as { data?: T; errors?: { message: string }[] };
  if (payload.errors?.length) {
    throw new AppApiError(
      "twenty",
      400,
      "/graphql",
      payload.errors.map((e) => e.message).join("; "),
    );
  }
  return (payload.data ?? ({} as T)) as T;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Companies                                  */
/* ─────────────────────────────────────────────────────────────────────── */

const COMPANY_LIST_FIELDS = `
  id
  name
  domainName { primaryLinkUrl primaryLinkLabel }
  address { addressCity addressCountry }
  phone
  generalEmail
  bookingSystem
  leadSource
  employeeCountPhysio
  googleRating
  googleReviewCount
  ownerName
  ownerEmail
  createdAt
  updatedAt
`;

const COMPANY_DETAIL_FIELDS = `
  id
  name
  domainName { primaryLinkUrl primaryLinkLabel secondaryLinks }
  address {
    addressStreet1 addressStreet2 addressCity addressState
    addressPostcode addressCountry addressLat addressLng
  }
  phone
  generalEmail
  bookingSystem
  leadSource
  employeeCountPhysio
  googleRating
  googleReviewCount
  ownerName
  ownerEmail
  ownerSource
  leadTherapistName
  leadTherapistEmail
  linkedinLink { primaryLinkUrl primaryLinkLabel }
  xLink { primaryLinkUrl primaryLinkLabel }
  annualRecurringRevenue { amountMicros currencyCode }
  idealCustomerProfile
  tenant
  specializations
  languages
  position
  createdAt
  updatedAt
`;

type RawCompany = Record<string, unknown> & {
  id: string;
  name?: string | null;
  domainName?: { primaryLinkUrl?: string | null; primaryLinkLabel?: string | null } | null;
  address?: { addressCity?: string | null; addressCountry?: string | null } | null;
  phone?: string | null;
  generalEmail?: string | null;
  bookingSystem?: string | null;
  leadSource?: string | null;
  employeeCountPhysio?: number | null;
  googleRating?: number | null;
  googleReviewCount?: number | null;
  ownerName?: string | null;
  ownerEmail?: string | null;
  createdAt: string;
  updatedAt: string;
};

function compactSummary(c: RawCompany): CompanySummary {
  return {
    id: c.id,
    name: c.name ?? "",
    domain: c.domainName?.primaryLinkUrl ?? null,
    city: c.address?.addressCity ?? null,
    country: c.address?.addressCountry ?? null,
    phone: c.phone ?? null,
    generalEmail: c.generalEmail ?? null,
    bookingSystem: c.bookingSystem ?? null,
    leadSource: c.leadSource ?? null,
    employeeCountPhysio: c.employeeCountPhysio ?? null,
    googleRating: c.googleRating ?? null,
    googleReviewCount: c.googleReviewCount ?? null,
    ownerName: c.ownerName ?? null,
    ownerEmail: c.ownerEmail ?? null,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

export async function listCompanies(
  tenant: TwentyTenantConfig,
  opts: {
    search?: string;
    limit?: number;
    cursor?: string | null;
  } = {},
): Promise<{ items: CompanySummary[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const filter: Record<string, unknown> = {};
  if (opts.search?.trim()) {
    filter.name = { ilike: `%${opts.search.trim()}%` };
  }

  const data = await gql<{
    companies: {
      edges: { node: RawCompany; cursor: string }[];
      pageInfo: { hasNextPage: boolean; endCursor?: string };
    };
  }>(
    tenant,
    `query Companies($first: Int!, $after: String, $filter: CompanyFilterInput, $orderBy: [CompanyOrderByInput!]) {
      companies(first: $first, after: $after, filter: $filter, orderBy: $orderBy) {
        edges { cursor node { ${COMPANY_LIST_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {
      first: limit,
      after: opts.cursor ?? null,
      filter: Object.keys(filter).length ? filter : undefined,
      orderBy: [{ name: "AscNullsLast" }],
    },
  );

  return {
    items: data.companies.edges.map((e) => compactSummary(e.node)),
    nextCursor: data.companies.pageInfo.hasNextPage
      ? data.companies.pageInfo.endCursor ?? null
      : null,
  };
}

export async function getCompany(
  tenant: TwentyTenantConfig,
  id: string,
): Promise<CompanyDetail | null> {
  const data = await gql<{ company: RawCompany | null }>(
    tenant,
    `query Company($filter: CompanyFilterInput!) {
      company(filter: $filter) { ${COMPANY_DETAIL_FIELDS} }
    }`,
    { filter: { id: { eq: id } } },
  );
  if (!data.company) return null;
  const c = data.company;
  return {
    ...compactSummary(c),
    address: (c.address as CompanyDetail["address"]) ?? null,
    domainName: (c.domainName as CompanyDetail["domainName"]) ?? null,
    linkedinLink: (c.linkedinLink as CompanyDetail["linkedinLink"]) ?? null,
    xLink: (c.xLink as CompanyDetail["xLink"]) ?? null,
    annualRecurringRevenue:
      (c.annualRecurringRevenue as CompanyDetail["annualRecurringRevenue"]) ?? null,
    idealCustomerProfile: Boolean(c.idealCustomerProfile),
    tenant: (c.tenant as string | null) ?? null,
    specializations: (c.specializations as string | null) ?? null,
    languages: (c.languages as string | null) ?? null,
    leadTherapistName: (c.leadTherapistName as string | null | undefined) ?? null,
    leadTherapistEmail: (c.leadTherapistEmail as string | null | undefined) ?? null,
    ownerSource: (c.ownerSource as string | null) ?? null,
    position: (c.position as number) ?? 0,
  };
}

export async function updateCompany(
  tenant: TwentyTenantConfig,
  id: string,
  patch: Record<string, unknown>,
): Promise<CompanyDetail | null> {
  await gql(
    tenant,
    `mutation UpdateCompany($id: UUID!, $data: CompanyUpdateInput!) {
      updateCompany(id: $id, data: $data) { id }
    }`,
    { id, data: patch },
  );
  return getCompany(tenant, id);
}

export async function createCompany(
  tenant: TwentyTenantConfig,
  data: { name: string } & Record<string, unknown>,
): Promise<CompanyDetail | null> {
  const result = await gql<{ createCompany: { id: string } }>(
    tenant,
    `mutation CreateCompany($data: CompanyCreateInput!) {
      createCompany(data: $data) { id }
    }`,
    { data },
  );
  return getCompany(tenant, result.createCompany.id);
}

export async function deleteCompany(
  tenant: TwentyTenantConfig,
  id: string,
): Promise<boolean> {
  await gql(
    tenant,
    `mutation DeleteCompany($id: UUID!) { deleteCompany(id: $id) { id } }`,
    { id },
  );
  return true;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                People                                   */
/* ─────────────────────────────────────────────────────────────────────── */

const PERSON_LIST_FIELDS = `
  id
  name { firstName lastName }
  jobTitle
  emails { primaryEmail }
  phones { primaryPhoneNumber }
  city
  company { id name }
  createdAt
  updatedAt
`;

const PERSON_DETAIL_FIELDS = `
  id
  name { firstName lastName }
  jobTitle
  emails { primaryEmail additionalEmails }
  phones { primaryPhoneNumber primaryPhoneCountryCode primaryPhoneCallingCode }
  city
  avatarUrl
  linkedinLink { primaryLinkUrl primaryLinkLabel }
  xLink { primaryLinkUrl primaryLinkLabel }
  company { id name }
  position
  createdAt
  updatedAt
`;

type RawPerson = {
  id: string;
  name?: { firstName?: string | null; lastName?: string | null } | null;
  jobTitle?: string | null;
  emails?: { primaryEmail?: string | null; additionalEmails?: string[] | null } | null;
  phones?: {
    primaryPhoneNumber?: string | null;
    primaryPhoneCountryCode?: string | null;
    primaryPhoneCallingCode?: string | null;
  } | null;
  city?: string | null;
  avatarUrl?: string | null;
  linkedinLink?: PersonDetail["linkedinLink"] | null;
  xLink?: PersonDetail["xLink"] | null;
  company?: { id?: string | null; name?: string | null } | null;
  position?: number | null;
  createdAt: string;
  updatedAt: string;
};

function personSummary(p: RawPerson): PersonSummary {
  return {
    id: p.id,
    firstName: p.name?.firstName ?? "",
    lastName: p.name?.lastName ?? "",
    jobTitle: p.jobTitle ?? null,
    email: p.emails?.primaryEmail ?? null,
    phone: p.phones?.primaryPhoneNumber ?? null,
    city: p.city ?? null,
    companyId: p.company?.id ?? null,
    companyName: p.company?.name ?? null,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

/**
 * Look up a single Person by *exact* primary email match within the given
 * tenant. Returns null when no Person exists yet — used by the Marketing
 * → CRM cross-link to decide whether to surface a "Open in CRM" link.
 *
 * Twenty's GraphQL filter on emails is a nested `eq` on `primaryEmail`
 * (case-sensitive in older versions); we lower-case both sides defensively.
 */
export async function findPersonByEmail(
  tenant: TwentyTenantConfig,
  email: string,
): Promise<PersonSummary | null> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned) return null;
  const data = await gql<{
    people: { edges: { node: RawPerson }[] };
  }>(
    tenant,
    `query PersonByEmail($filter: PersonFilterInput!) {
      people(filter: $filter, first: 5) {
        edges { node { ${PERSON_LIST_FIELDS} } }
      }
    }`,
    {
      filter: {
        emails: { primaryEmail: { ilike: cleaned } },
      },
    },
  );
  const match = data.people.edges
    .map((e) => e.node)
    .find((p) => (p.emails?.primaryEmail ?? "").toLowerCase() === cleaned);
  return match ? personSummary(match) : null;
}

export async function listPeople(
  tenant: TwentyTenantConfig,
  opts: {
    companyId?: string;
    search?: string;
    limit?: number;
    cursor?: string | null;
  } = {},
): Promise<{ items: PersonSummary[]; nextCursor: string | null }> {
  const limit = Math.min(opts.limit ?? 50, 100);
  const filter: Record<string, unknown> = {};
  if (opts.companyId) filter.companyId = { eq: opts.companyId };
  if (opts.search?.trim()) {
    filter.or = [
      { name: { firstName: { ilike: `%${opts.search.trim()}%` } } },
      { name: { lastName: { ilike: `%${opts.search.trim()}%` } } },
      { emails: { primaryEmail: { ilike: `%${opts.search.trim()}%` } } },
    ];
  }

  const data = await gql<{
    people: {
      edges: { node: RawPerson; cursor: string }[];
      pageInfo: { hasNextPage: boolean; endCursor?: string };
    };
  }>(
    tenant,
    `query People($first: Int!, $after: String, $filter: PersonFilterInput, $orderBy: [PersonOrderByInput!]) {
      people(first: $first, after: $after, filter: $filter, orderBy: $orderBy) {
        edges { cursor node { ${PERSON_LIST_FIELDS} } }
        pageInfo { hasNextPage endCursor }
      }
    }`,
    {
      first: limit,
      after: opts.cursor ?? null,
      filter: Object.keys(filter).length ? filter : undefined,
      orderBy: [{ updatedAt: "DescNullsLast" }],
    },
  );

  return {
    items: data.people.edges.map((e) => personSummary(e.node)),
    nextCursor: data.people.pageInfo.hasNextPage
      ? data.people.pageInfo.endCursor ?? null
      : null,
  };
}

export async function getPerson(
  tenant: TwentyTenantConfig,
  id: string,
): Promise<PersonDetail | null> {
  const data = await gql<{ person: RawPerson | null }>(
    tenant,
    `query Person($filter: PersonFilterInput!) {
      person(filter: $filter) { ${PERSON_DETAIL_FIELDS} }
    }`,
    { filter: { id: { eq: id } } },
  );
  if (!data.person) return null;
  const p = data.person;
  return {
    ...personSummary(p),
    emails: p.emails ?? null,
    phones: p.phones ?? null,
    avatarUrl: p.avatarUrl ?? null,
    linkedinLink: p.linkedinLink ?? null,
    xLink: p.xLink ?? null,
    position: p.position ?? 0,
  };
}

export async function updatePerson(
  tenant: TwentyTenantConfig,
  id: string,
  patch: Record<string, unknown>,
): Promise<PersonDetail | null> {
  await gql(
    tenant,
    `mutation UpdatePerson($id: UUID!, $data: PersonUpdateInput!) {
      updatePerson(id: $id, data: $data) { id }
    }`,
    { id, data: patch },
  );
  return getPerson(tenant, id);
}

export async function createPerson(
  tenant: TwentyTenantConfig,
  data: {
    name: { firstName: string; lastName: string };
    emails?: { primaryEmail: string };
    phones?: { primaryPhoneNumber: string };
    companyId?: string;
  },
): Promise<PersonDetail | null> {
  const result = await gql<{ createPerson: { id: string } }>(
    tenant,
    `mutation CreatePerson($data: PersonCreateInput!) {
      createPerson(data: $data) { id }
    }`,
    { data },
  );
  return getPerson(tenant, result.createPerson.id);
}

export async function deletePerson(
  tenant: TwentyTenantConfig,
  id: string,
): Promise<boolean> {
  await gql(
    tenant,
    `mutation DeletePerson($id: UUID!) { deletePerson(id: $id) { id } }`,
    { id },
  );
  return true;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                            Opportunities                                */
/* ─────────────────────────────────────────────────────────────────────── */

type RawOpp = {
  id: string;
  name: string;
  stage?: string | null;
  amount?: { amountMicros?: number | null; currencyCode?: string | null } | null;
  closeDate?: string | null;
  company?: { id?: string | null; name?: string | null } | null;
  createdAt: string;
  updatedAt: string;
};

function normaliseOpp(node: RawOpp): OpportunitySummary {
  return {
    id: node.id,
    name: node.name,
    stage: node.stage ?? "",
    amount: node.amount ?? null,
    closeDate: node.closeDate ?? null,
    companyId: node.company?.id ?? null,
    companyName: node.company?.name ?? null,
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
  };
}

export async function listOpportunitiesForCompany(
  tenant: TwentyTenantConfig,
  companyId: string,
): Promise<OpportunitySummary[]> {
  const data = await gql<{ opportunities: { edges: { node: RawOpp }[] } }>(
    tenant,
    `query Opps($filter: OpportunityFilterInput!) {
      opportunities(filter: $filter, orderBy: [{ updatedAt: DescNullsLast }], first: 50) {
        edges { node {
          id name stage amount { amountMicros currencyCode } closeDate
          company { id name } createdAt updatedAt
        } }
      }
    }`,
    { filter: { companyId: { eq: companyId } } },
  );
  return data.opportunities.edges.map((e) => normaliseOpp(e.node));
}

/**
 * Lists every Twenty opportunity, with optional substring filter on the
 * deal name. Used by the workspace-wide pipeline kanban — companies are
 * embedded so the card UI can render context without a second round-trip.
 */
export async function listAllOpportunities(
  tenant: TwentyTenantConfig,
  opts: { search?: string; first?: number } = {},
): Promise<OpportunitySummary[]> {
  const filter = opts.search?.trim()
    ? { name: { ilike: `%${opts.search.trim()}%` } }
    : {};
  const data = await gql<{ opportunities: { edges: { node: RawOpp }[] } }>(
    tenant,
    `query AllOpps($filter: OpportunityFilterInput, $first: Int!) {
      opportunities(filter: $filter, orderBy: [{ updatedAt: DescNullsLast }], first: $first) {
        edges { node {
          id name stage amount { amountMicros currencyCode } closeDate
          company { id name } createdAt updatedAt
        } }
      }
    }`,
    { filter, first: opts.first ?? 200 },
  );
  return data.opportunities.edges.map((e) => normaliseOpp(e.node));
}

/** Loads one opportunity by id (company embedded) — deep-links, GET API. */
export async function getOpportunityById(
  tenant: TwentyTenantConfig,
  id: string,
): Promise<OpportunitySummary | null> {
  const data = await gql<{ opportunity: RawOpp | null }>(
    tenant,
    `query OneOppById($id: UUID!) {
      opportunity(filter: { id: { eq: $id } }) {
        id name stage amount { amountMicros currencyCode } closeDate
        company { id name } createdAt updatedAt
      }
    }`,
    { id },
  );
  return data.opportunity ? normaliseOpp(data.opportunity) : null;
}

/**
 * Creates a pipeline opportunity (inbound form, scraper, etc.).
 * `stage` defaults to `NEW` to match `listScraperLeads` / Lead-Inbox conventions.
 */
export async function createOpportunity(
  tenant: TwentyTenantConfig,
  data: {
    name: string;
    companyId: string;
    stage?: string;
    source?: string | null;
    pointOfContactId?: string | null;
  },
): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    name: data.name.trim(),
    companyId: data.companyId,
    stage: (data.stage ?? OPPORTUNITY_STAGE_NEW).trim(),
  };
  const src = data.source?.trim();
  if (src) payload.source = src;
  const poc = data.pointOfContactId?.trim();
  if (poc) payload.pointOfContactId = poc;

  const result = await gql<{ createOpportunity: { id: string } }>(
    tenant,
    `mutation CreateOpportunity($data: OpportunityCreateInput!) {
      createOpportunity(data: $data) { id }
    }`,
    { data: payload },
  );
  return result.createOpportunity;
}

/**
 * Patches a Twenty opportunity (stage / amount / closeDate / name). The
 * stage must be a member of Twenty's OpportunityStage enum — the public
 * pipeline columns ship that exact set.
 */
export async function updateOpportunity(
  tenant: TwentyTenantConfig,
  id: string,
  patch: Record<string, unknown>,
): Promise<OpportunitySummary | null> {
  await gql(
    tenant,
    `mutation UpdateOpportunity($id: UUID!, $data: OpportunityUpdateInput!) {
      updateOpportunity(id: $id, data: $data) { id }
    }`,
    { id, data: patch },
  );
  return getOpportunityById(tenant, id);
}

/**
 * Lists "fresh" opportunities matching a `(source, stage)` pair together with
 * the embedded company snapshot — exactly what the admin Lead-Inbox needs in
 * a single round-trip. The Python scraper writes opportunities with
 * `source = "google-maps-scraper"` and `stage = "NEW"`; the inbox queues
 * those for human review before they get pushed into the Mautic funnel.
 */
export type ScraperLead = {
  opportunityId: string;
  opportunityName: string;
  opportunityStage: string;
  opportunitySource: string | null;
  opportunityCreatedAt: string;
  company: CompanyDetail;
};

export async function listScraperLeads(
  tenant: TwentyTenantConfig,
  opts: { source?: string; stage?: string; first?: number } = {},
): Promise<ScraperLead[]> {
  const source = opts.source ?? "google-maps-scraper";
  const stage = opts.stage ?? OPPORTUNITY_STAGE_NEW;
  const data = await gql<{
    opportunities: {
      edges: {
        node: {
          id: string;
          name: string;
          stage?: string | null;
          source?: string | null;
          createdAt: string;
          company?: RawCompany | null;
        };
      }[];
    };
  }>(
    tenant,
    `query ScraperLeads($filter: OpportunityFilterInput!, $first: Int!) {
      opportunities(filter: $filter, orderBy: [{ createdAt: DescNullsLast }], first: $first) {
        edges { node {
          id name stage source createdAt
          company { ${COMPANY_DETAIL_FIELDS} }
        } }
      }
    }`,
    {
      filter: {
        stage: { eq: stage },
        source: { eq: source },
      },
      first: opts.first ?? 100,
    },
  );
  return data.opportunities.edges
    .filter((e) => Boolean(e.node.company))
    .map((e) => {
      const c = e.node.company as RawCompany;
      const company: CompanyDetail = {
        ...compactSummary(c),
        address: (c.address as CompanyDetail["address"]) ?? null,
        domainName: (c.domainName as CompanyDetail["domainName"]) ?? null,
        linkedinLink: (c.linkedinLink as CompanyDetail["linkedinLink"]) ?? null,
        xLink: (c.xLink as CompanyDetail["xLink"]) ?? null,
        annualRecurringRevenue:
          (c.annualRecurringRevenue as CompanyDetail["annualRecurringRevenue"]) ?? null,
        idealCustomerProfile: Boolean(c.idealCustomerProfile),
        tenant: (c.tenant as string | null) ?? null,
        specializations: (c.specializations as string | null) ?? null,
        languages: (c.languages as string | null) ?? null,
        leadTherapistName: (c.leadTherapistName as string | null | undefined) ?? null,
        leadTherapistEmail: (c.leadTherapistEmail as string | null | undefined) ?? null,
        ownerSource: (c.ownerSource as string | null) ?? null,
        position: (c.position as number) ?? 0,
      };
      return {
        opportunityId: e.node.id,
        opportunityName: e.node.name,
        opportunityStage: e.node.stage ?? "",
        opportunitySource: e.node.source ?? null,
        opportunityCreatedAt: e.node.createdAt,
        company,
      };
    });
}

/**
 * Single-shot opportunity loader — returns the embedded company too so the
 * admin UI can render the full lead context after an approve/reject without
 * a second round-trip.
 */
export async function getScraperLead(
  tenant: TwentyTenantConfig,
  opportunityId: string,
): Promise<ScraperLead | null> {
  const data = await gql<{
    opportunity: {
      id: string;
      name: string;
      stage?: string | null;
      source?: string | null;
      createdAt: string;
      company?: RawCompany | null;
    } | null;
  }>(
    tenant,
    `query OneScraperLead($id: UUID!) {
      opportunity(filter: { id: { eq: $id } }) {
        id name stage source createdAt
        company { ${COMPANY_DETAIL_FIELDS} }
      }
    }`,
    { id: opportunityId },
  );
  const o = data.opportunity;
  if (!o || !o.company) return null;
  const c = o.company;
  const company: CompanyDetail = {
    ...compactSummary(c),
    address: (c.address as CompanyDetail["address"]) ?? null,
    domainName: (c.domainName as CompanyDetail["domainName"]) ?? null,
    linkedinLink: (c.linkedinLink as CompanyDetail["linkedinLink"]) ?? null,
    xLink: (c.xLink as CompanyDetail["xLink"]) ?? null,
    annualRecurringRevenue:
      (c.annualRecurringRevenue as CompanyDetail["annualRecurringRevenue"]) ?? null,
    idealCustomerProfile: Boolean(c.idealCustomerProfile),
    tenant: (c.tenant as string | null) ?? null,
    specializations: (c.specializations as string | null) ?? null,
    languages: (c.languages as string | null) ?? null,
    leadTherapistName: (c.leadTherapistName as string | null | undefined) ?? null,
    leadTherapistEmail: (c.leadTherapistEmail as string | null | undefined) ?? null,
    ownerSource: (c.ownerSource as string | null) ?? null,
    position: (c.position as number) ?? 0,
  };
  return {
    opportunityId: o.id,
    opportunityName: o.name,
    opportunityStage: o.stage ?? "",
    opportunitySource: o.source ?? null,
    opportunityCreatedAt: o.createdAt,
    company,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Notes & Tasks (timeline)                       */
/* ─────────────────────────────────────────────────────────────────────── */

export async function listNotesForCompany(
  tenant: TwentyTenantConfig,
  companyId: string,
): Promise<NoteSummary[]> {
  const data = await gql<{
    noteTargets: {
      edges: {
        node: {
          note: {
            id: string;
            title: string;
            bodyV2?: { markdown?: string | null; blocknote?: string | null } | null;
            createdAt: string;
            updatedAt: string;
          };
        };
      }[];
    };
  }>(
    tenant,
    `query CompanyNotes($filter: NoteTargetFilterInput!) {
      noteTargets(filter: $filter, orderBy: [{ createdAt: DescNullsLast }], first: 50) {
        edges { node { note {
          id title bodyV2 { markdown blocknote } createdAt updatedAt
        } } }
      }
    }`,
    { filter: { targetCompanyId: { eq: companyId } } },
  );
  return data.noteTargets.edges
    .filter((e) => e.node.note)
    .map((e) => ({
      id: e.node.note.id,
      title: e.node.note.title ?? "",
      bodyV2Markdown: e.node.note.bodyV2?.markdown ?? null,
      bodyV2BlockNote: e.node.note.bodyV2?.blocknote ?? null,
      createdAt: e.node.note.createdAt,
      updatedAt: e.node.note.updatedAt,
    }));
}

export async function createNoteForCompany(
  tenant: TwentyTenantConfig,
  companyId: string,
  title: string,
  body: string,
): Promise<NoteSummary | null> {
  const note = await gql<{ createNote: { id: string } }>(
    tenant,
    `mutation CreateNote($data: NoteCreateInput!) {
      createNote(data: $data) { id }
    }`,
    {
      data: {
        title,
        bodyV2: { markdown: body, blocknote: null },
      },
    },
  );
  await gql(
    tenant,
    `mutation CreateNoteTarget($data: NoteTargetCreateInput!) {
      createNoteTarget(data: $data) { id }
    }`,
    { data: { noteId: note.createNote.id, targetCompanyId: companyId } },
  );
  const fresh = await gql<{ note: NoteSummary | null }>(
    tenant,
    `query OneNote($filter: NoteFilterInput!) {
      note(filter: $filter) {
        id title bodyV2 { markdown blocknote } createdAt updatedAt
      }
    }`,
    { filter: { id: { eq: note.createNote.id } } },
  );
  return fresh.note;
}

export async function listTasksForCompany(
  tenant: TwentyTenantConfig,
  companyId: string,
): Promise<TaskSummary[]> {
  const data = await gql<{
    taskTargets: {
      edges: {
        node: {
          task: {
            id: string;
            title: string;
            status: string;
            bodyV2?: { markdown?: string | null } | null;
            dueAt?: string | null;
            assignee?: { id?: string | null; name?: { firstName?: string; lastName?: string } | null } | null;
            createdAt: string;
            updatedAt: string;
          };
        };
      }[];
    };
  }>(
    tenant,
    `query CompanyTasks($filter: TaskTargetFilterInput!) {
      taskTargets(filter: $filter, orderBy: [{ createdAt: DescNullsLast }], first: 50) {
        edges { node { task {
          id title status bodyV2 { markdown } dueAt
          assignee { id name { firstName lastName } }
          createdAt updatedAt
        } } }
      }
    }`,
    { filter: { targetCompanyId: { eq: companyId } } },
  );
  return data.taskTargets.edges
    .filter((e) => e.node.task)
    .map((e) => {
      const t = e.node.task;
      const a = t.assignee;
      const aName = a?.name
        ? `${a.name.firstName ?? ""} ${a.name.lastName ?? ""}`.trim()
        : "";
      return {
        id: t.id,
        title: t.title ?? "",
        status: t.status ?? "TODO",
        bodyV2Markdown: t.bodyV2?.markdown ?? null,
        dueAt: t.dueAt ?? null,
        assigneeId: a?.id ?? null,
        assigneeName: aName || null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      };
    });
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                            Workspace members                            */
/* ─────────────────────────────────────────────────────────────────────── */

const memberCache = new Map<string, { ts: number; data: WorkspaceMember[] }>();

export async function listWorkspaceMembers(
  tenant: TwentyTenantConfig,
): Promise<WorkspaceMember[]> {
  const cached = memberCache.get(tenant.workspaceId);
  if (cached && Date.now() - cached.ts < 60_000) return cached.data;
  const data = await gql<{
    workspaceMembers: {
      edges: {
        node: {
          id: string;
          name?: { firstName?: string; lastName?: string } | null;
          userEmail?: string | null;
          avatarUrl?: string | null;
        };
      }[];
    };
  }>(
    tenant,
    `query Members { workspaceMembers(first: 100) { edges { node {
      id name { firstName lastName } userEmail avatarUrl
    } } } }`,
  );
  const items = data.workspaceMembers.edges.map((e) => {
    const fn = e.node.name?.firstName ?? "";
    const ln = e.node.name?.lastName ?? "";
    return {
      id: e.node.id,
      name: `${fn} ${ln}`.trim() || e.node.userEmail || "",
      email: e.node.userEmail ?? "",
      avatarUrl: e.node.avatarUrl ?? null,
    };
  });
  memberCache.set(tenant.workspaceId, { ts: Date.now(), data: items });
  return items;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Settings                                   */
/* ─────────────────────────────────────────────────────────────────────── */

export type CrmSettings = {
  apiReachable: boolean;
  publicUrl: string;
  internalUrl: string;
  /** The active Twenty workspace id for this portal tenant. */
  workspaceId: string;
  /** Total counts. Used as KPIs in the settings overview. */
  totals: {
    companies: number;
    people: number;
  };
  members: WorkspaceMember[];
  /** Top open-deal stages with counts — quick pipeline view. */
  pipeline: Array<{ stage: string; count: number }>;
  /** Distinct lead sources observed across companies — useful when tagging. */
  leadSources: string[];
  /** Deep links into the Twenty admin UI. */
  adminLinks: {
    profile: string;
    workspace: string;
    members: string;
    apiKeys: string;
    dataModel: string;
    integrations: string;
  };
  warnings: string[];
};

/**
 * Aggregates the read-only configuration we surface in the portal-native
 * CRM settings panel. Mirrors the shape of `getHelpdeskSettings()` so the
 * client-side renderer can stay close to `HelpdeskSettingsClient`.
 */
export async function getCrmSettings(
  tenant: TwentyTenantConfig,
): Promise<CrmSettings> {
  const warnings: string[] = [];
  let apiReachable = false;
  let totals = { companies: 0, people: 0 };
  let members: WorkspaceMember[] = [];
  let pipeline: CrmSettings["pipeline"] = [];
  let leadSources: string[] = [];

  try {
    const probe = await gql<{
      companies: { totalCount?: number };
      people: { totalCount?: number };
    }>(
      tenant,
      `query Probe {
        companies(first: 1) { totalCount }
        people(first: 1) { totalCount }
      }`,
    );
    totals = {
      companies: probe.companies.totalCount ?? 0,
      people: probe.people.totalCount ?? 0,
    };
    apiReachable = true;
  } catch (e) {
    warnings.push(
      "GraphQL-Probe fehlgeschlagen: " +
        (e instanceof Error ? e.message : String(e)),
    );
  }

  if (apiReachable) {
    try {
      members = await listWorkspaceMembers(tenant);
    } catch (e) {
      warnings.push(
        "workspaceMembers konnte nicht gelesen werden: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  if (apiReachable) {
    try {
      const data = await gql<{
        opportunities: {
          edges: { node: { stage?: string | null } }[];
        };
      }>(
        tenant,
        `query Pipeline {
          opportunities(first: 200) { edges { node { stage } } }
        }`,
      );
      const counts = new Map<string, number>();
      for (const e of data.opportunities.edges) {
        const s = (e.node.stage ?? "(unbekannt)").trim() || "(unbekannt)";
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
      pipeline = [...counts.entries()]
        .map(([stage, count]) => ({ stage, count }))
        .sort((a, b) => b.count - a.count);
    } catch {
      // Stages are optional info — silent fallback.
    }

    try {
      const data = await gql<{
        companies: {
          edges: { node: { leadSource?: string | null } }[];
        };
      }>(
        tenant,
        `query LeadSources {
          companies(first: 200) { edges { node { leadSource } } }
        }`,
      );
      const set = new Set<string>();
      for (const e of data.companies.edges) {
        const s = (e.node.leadSource ?? "").trim();
        if (s) set.add(s);
      }
      leadSources = [...set].sort();
    } catch {
      // also non-critical
    }
  }

  return {
    apiReachable,
    publicUrl: PUBLIC,
    internalUrl: INTERNAL,
    workspaceId: tenant.workspaceId,
    totals,
    members,
    pipeline,
    leadSources,
    adminLinks: {
      profile: "/settings/profile",
      workspace: "/settings/workspace",
      members: "/settings/workspace-members",
      apiKeys: "/settings/developers",
      dataModel: "/settings/data-model",
      integrations: "/settings/integrations",
    },
    warnings,
  };
}
