import "server-only";
import sanitizeHtml from "sanitize-html";
import { createAppFetch, fetchJson } from "@/lib/app-clients/base";
import type { HelpdeskTenantConfig } from "./config";
import { tenantAllowsGroup } from "./config";
import type {
  MacroSummary,
  OverviewSummary,
  TagSuggestion,
  TicketArticle,
  TicketAttachment,
  TicketDetail,
  TicketGroup,
  TicketMeta,
  TicketPriority,
  TicketState,
  TicketSummary,
  TicketUser,
} from "./types";

/**
 * Native Zammad client. Uses the workspace-scoped admin Token API so the
 * same backend can serve every portal user — per-user attribution happens
 * via the `X-On-Behalf-Of` header (Zammad standard) for write actions.
 */

const TOKEN = process.env.ZAMMAD_BRIDGE_TOKEN;
const PUBLIC = process.env.ZAMMAD_URL ?? "https://support.medtheris.kineo360.work";
const INTERNAL = process.env.ZAMMAD_INTERNAL_URL ?? "http://zammad-nginx:8080";

if (!TOKEN && process.env.NODE_ENV === "production") {
  console.warn("[zammad] ZAMMAD_BRIDGE_TOKEN missing — Helpdesk calls will fail.");
}

const zammadFetch = createAppFetch({
  app: "zammad",
  origins: { internal: INTERNAL, public: PUBLIC },
  authHeaders: () => ({ Authorization: `Token token=${TOKEN ?? ""}` }),
});

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Types & helpers                            */
/* ─────────────────────────────────────────────────────────────────────── */

type RawTicket = {
  id: number;
  number: string;
  title: string;
  state_id: number;
  state?: string;
  priority_id: number;
  priority?: string;
  group_id: number;
  group?: string;
  customer_id: number;
  customer?: string;
  owner_id: number;
  owner?: string;
  created_at: string;
  updated_at: string;
  last_contact_at?: string | null;
  article_count?: number | null;
  note?: string | null;
  // SLA fields (only present when an SLA is attached to the ticket)
  first_response_escalation_at?: string | null;
  first_response_in_min?: number | null;
  close_escalation_at?: string | null;
  close_in_min?: number | null;
  escalation_at?: string | null;
};

type RawArticle = {
  id: number;
  ticket_id: number;
  from?: string | null;
  to?: string | null;
  cc?: string | null;
  subject?: string | null;
  body: string;
  content_type: string;
  internal: boolean;
  sender_id: number;
  sender?: string;
  type_id: number;
  type?: string;
  created_at: string;
  attachments?: { id: number; filename: string; size: string | number; preferences?: Record<string, unknown> }[];
};

type RawUser = {
  id: number;
  login: string;
  email: string;
  firstname?: string;
  lastname?: string;
  image?: string | null;
};

function summariseTicket(t: RawTicket, expandNames: Record<string, string> = {}): TicketSummary {
  return {
    id: t.id,
    number: t.number,
    title: t.title,
    stateId: t.state_id,
    stateName: t.state ?? expandNames[`state_${t.state_id}`] ?? "",
    priorityId: t.priority_id,
    priorityName: t.priority ?? expandNames[`priority_${t.priority_id}`] ?? "",
    groupId: t.group_id,
    groupName: t.group ?? expandNames[`group_${t.group_id}`] ?? "",
    customerId: t.customer_id,
    customerName: t.customer ?? expandNames[`user_${t.customer_id}`] ?? "",
    ownerId: t.owner_id,
    ownerName: t.owner ?? expandNames[`user_${t.owner_id}`] ?? "",
    createdAt: t.created_at,
    updatedAt: t.updated_at,
    lastContactAt: t.last_contact_at ?? null,
    articleCount: t.article_count ?? 0,
    firstResponseEscalationAt: t.first_response_escalation_at ?? null,
    firstResponseInMin: t.first_response_in_min ?? null,
    closeEscalationAt: t.close_escalation_at ?? null,
    closeInMin: t.close_in_min ?? null,
    escalationAt: t.escalation_at ?? null,
  };
}

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "h1",
    "h2",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
  ],
  allowedAttributes: {
    "*": ["style", "class", "align", "width", "height"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    table: ["cellspacing", "cellpadding", "border", "width", "align"],
  },
  allowedSchemes: ["http", "https", "mailto", "cid"],
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
  },
};

function normaliseArticle(a: RawArticle): TicketArticle {
  const rawHtml =
    a.content_type === "text/html" ? a.body : escapePlainToHtml(a.body);
  return {
    id: a.id,
    ticketId: a.ticket_id,
    fromName: a.from ?? "",
    to: a.to ?? null,
    cc: a.cc ?? null,
    subject: a.subject ?? null,
    bodyHtml: sanitizeHtml(rawHtml, SANITIZE_OPTIONS),
    internal: Boolean(a.internal),
    senderName: a.sender ?? "",
    type: a.type ?? "",
    contentType: a.content_type,
    createdAt: a.created_at,
    attachments: (a.attachments ?? []).map(
      (att): TicketAttachment => ({
        id: att.id,
        filename: att.filename,
        size: typeof att.size === "string" ? parseInt(att.size, 10) || 0 : att.size,
        contentType:
          (att.preferences?.["Content-Type"] as string | undefined) ??
          (att.preferences?.["Mime-Type"] as string | undefined) ??
          "application/octet-stream",
      }),
    ),
  };
}

function escapePlainToHtml(s: string): string {
  const esc = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return esc
    .split(/\n{2,}/)
    .map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`)
    .join("");
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                Tickets                                  */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Build a Zammad search predicate that restricts results to the tenant's
 * groups. Zammad's search supports OR via parentheses: `group.name:("a" OR "b")`.
 */
function tenantGroupPredicate(tenant: HelpdeskTenantConfig): string {
  const quoted = tenant.groupNames
    .map((g) => `"${g.replace(/"/g, '\\"')}"`)
    .join(" OR ");
  return `group.name:(${quoted})`;
}

/**
 * Find an open ticket with an exact title match, updated within the last
 * `maxAgeMinutes`. Used by Phonestar webhooks to append call lifecycle
 * events to the ticket opened at channel_create.
 */
export async function findOpenTicketByExactTitle(
  tenant: HelpdeskTenantConfig,
  title: string,
  maxAgeMinutes: number,
): Promise<number | null> {
  const tickets = await listTickets(tenant, { state: "open", perPage: 60 });
  const cutoff = Date.now() - maxAgeMinutes * 60_000;
  for (const t of tickets) {
    if (t.title !== title) continue;
    if (new Date(t.updatedAt).getTime() >= cutoff) return t.id;
  }
  return null;
}

export async function listTickets(
  tenant: HelpdeskTenantConfig,
  opts: {
    query?: string;
    state?: "open" | "closed" | "all";
    page?: number;
    perPage?: number;
    /**
     * Optional Zammad overview id. When set, we ask the overview endpoint
     * for its tickets instead of running our own search predicate, then
     * apply the tenant filter client-side so a forged overview id can't
     * leak tickets across workspaces.
     */
    overviewId?: number;
  } = {},
): Promise<TicketSummary[]> {
  const page = opts.page ?? 1;
  const perPage = Math.min(opts.perPage ?? 50, 100);

  if (opts.overviewId) {
    const params = new URLSearchParams({
      view: String(opts.overviewId),
      // Zammad expects per_page on this endpoint
      per_page: String(perPage),
    });
    if (page > 1) params.set("page", String(page));
    type OverviewBag = {
      tickets?: number[];
      assets?: { Ticket?: Record<string, RawTicket> };
    };
    const data = await fetchJson<OverviewBag>(
      zammadFetch,
      "zammad",
      `/api/v1/ticket_overviews?${params}`,
    );
    const ids = data.tickets ?? [];
    const ticketBag = data.assets?.Ticket ?? {};
    return ids
      .map((id) => ticketBag[String(id)])
      .filter((t): t is RawTicket => !!t)
      .filter((t) => tenantAllowsGroup(tenant, t.group ?? ""))
      .map((t) => summariseTicket(t));
  }

  // Always go through the search endpoint when we have a tenant, because
  // it accepts our group predicate. The index endpoint cannot filter by
  // group name in a single round trip.
  const userQuery = (opts.query ?? "").trim();
  const stateClause =
    opts.state === "open"
      ? " state.state_type.name:(new OR open OR pending)"
      : opts.state === "closed"
        ? " state.state_type.name:closed"
        : "";
  const predicate = [tenantGroupPredicate(tenant), stateClause, userQuery]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({
    query: predicate,
    limit: String(perPage),
    sort_by: "updated_at",
    order_by: "desc",
    expand: "true",
  });
  if (page > 1) params.set("page", String(page));
  // With expand=true Zammad returns a flat array of fully-resolved tickets
  // (group/state/priority/owner names included) instead of the assets bag.
  const data = await fetchJson<RawTicket[]>(
    zammadFetch,
    "zammad",
    `/api/v1/tickets/search?${params}`,
  );
  return data.map((t) => summariseTicket(t));
}

const STATS_MAX_PAGES = 30;
const STATS_PER_PAGE = 100;

function ticketSlaAtRisk(t: TicketSummary, now: number): boolean {
  const check = (iso: string | null) => {
    if (!iso) return false;
    return (new Date(iso).getTime() - now) / 60_000 < 60;
  };
  return (
    check(t.firstResponseEscalationAt) ||
    check(t.closeEscalationAt) ||
    check(t.escalationAt)
  );
}

/**
 * Paginated queue metrics for the portal header (up to STATS_MAX_PAGES ×
 * STATS_PER_PAGE tickets per dimension). Caps indicate “≥” when the tenant
 * has more rows than we scanned.
 */
export async function getHelpdeskQueueStats(tenant: HelpdeskTenantConfig): Promise<{
  openCount: number;
  openCountCapped: boolean;
  slaAtRiskCount: number;
  /** Same as openCountCapped — SLA tally only covers scanned open pages. */
  slaAtRiskCapped: boolean;
  closedTodayCount: number;
  closedTodayCapped: boolean;
}> {
  const now = Date.now();
  const dayStart = new Date(now);
  dayStart.setHours(0, 0, 0, 0);
  const sinceMs = dayStart.getTime();

  let openCount = 0;
  let slaAtRiskCount = 0;
  let openCountCapped = false;
  for (let page = 1; page <= STATS_MAX_PAGES; page++) {
    const batch = await listTickets(tenant, {
      state: "open",
      perPage: STATS_PER_PAGE,
      page,
    });
    openCount += batch.length;
    for (const t of batch) {
      if (ticketSlaAtRisk(t, now)) slaAtRiskCount++;
    }
    if (batch.length < STATS_PER_PAGE) break;
    if (page === STATS_MAX_PAGES) openCountCapped = true;
  }

  let closedTodayCount = 0;
  let closedTodayCapped = false;
  for (let page = 1; page <= STATS_MAX_PAGES; page++) {
    const batch = await listTickets(tenant, {
      state: "closed",
      perPage: STATS_PER_PAGE,
      page,
    });
    let stopped = false;
    for (const t of batch) {
      if (new Date(t.updatedAt).getTime() >= sinceMs) {
        closedTodayCount++;
      } else {
        stopped = true;
        break;
      }
    }
    if (stopped || batch.length < STATS_PER_PAGE) break;
    if (page === STATS_MAX_PAGES) closedTodayCapped = true;
  }

  return {
    openCount,
    openCountCapped,
    slaAtRiskCount,
    slaAtRiskCapped: openCountCapped,
    closedTodayCount,
    closedTodayCapped,
  };
}

export async function getTicket(
  tenant: HelpdeskTenantConfig,
  id: number,
): Promise<TicketDetail | null> {
  const ticket = await fetchJson<RawTicket & { customer?: string }>(
    zammadFetch,
    "zammad",
    `/api/v1/tickets/${id}?expand=true`,
  );
  if (!tenantAllowsGroup(tenant, ticket.group ?? "")) {
    return null;
  }
  const articles = await fetchJson<RawArticle[]>(
    zammadFetch,
    "zammad",
    `/api/v1/ticket_articles/by_ticket/${id}?expand=true`,
  );
  const [customer, tags] = await Promise.all([
    fetchJson<RawUser>(zammadFetch, "zammad", `/api/v1/users/${ticket.customer_id}`).catch(
      () => null,
    ),
    listTagsForTicket(id).catch(() => [] as string[]),
  ]);

  return {
    ...summariseTicket(ticket),
    note: ticket.note ?? null,
    customerEmail: customer?.email ?? "",
    articles: articles.map(normaliseArticle),
    tags,
  };
}

export async function updateTicket(
  tenant: HelpdeskTenantConfig,
  id: number,
  patch: Partial<{
    state_id: number;
    priority_id: number;
    group_id: number;
    owner_id: number;
    title: string;
  }>,
): Promise<TicketDetail | null> {
  // Verify the ticket lives in one of the tenant's groups before mutating.
  const guard = await fetchJson<RawTicket>(
    zammadFetch,
    "zammad",
    `/api/v1/tickets/${id}?expand=true`,
  );
  if (!tenantAllowsGroup(tenant, guard.group ?? "")) {
    throw new Error("Ticket geh\u00f6rt nicht zu diesem Workspace.");
  }
  await fetchJson(zammadFetch, "zammad", `/api/v1/tickets/${id}`, {
    method: "PUT",
    json: patch,
  });
  return getTicket(tenant, id);
}

/**
 * Ensure that a Zammad customer record exists for the given e-mail address.
 * Keycloak is the source of truth for identities, but Zammad doesn't have
 * an OIDC user-sync, so we create the customer on first ticket creation.
 */
async function ensureCustomer(email: string, displayName?: string): Promise<void> {
  const trimmed = email.trim();
  if (!trimmed) return;
  try {
    const search = await fetchJson<{ id: number; email: string }[]>(
      zammadFetch,
      "zammad",
      `/api/v1/users/search?query=${encodeURIComponent(trimmed)}&limit=5`,
    );
    if (Array.isArray(search) && search.some((u) => u.email?.toLowerCase() === trimmed.toLowerCase())) {
      return;
    }
  } catch {
    // fall through to create attempt
  }
  const local = trimmed.split("@")[0] ?? trimmed;
  const [first, ...rest] = (displayName ?? local).trim().split(/\s+/);
  try {
    await fetchJson(zammadFetch, "zammad", "/api/v1/users", {
      method: "POST",
      json: {
        email: trimmed,
        login: trimmed,
        firstname: first || local,
        lastname: rest.join(" ") || "",
        roles: ["Customer"],
        active: true,
      },
    });
  } catch (err) {
    console.warn(`[zammad] could not auto-provision customer ${trimmed}:`, err);
  }
}

export async function createTicket(
  tenant: HelpdeskTenantConfig,
  input: {
    title: string;
    body: string;
    customerEmail: string;
    customerName?: string;
    groupId?: number;
    priorityId?: number;
    internal?: boolean;
  },
): Promise<TicketDetail | null> {
  await ensureCustomer(input.customerEmail, input.customerName);
  // Resolve the tenant's first group when no explicit groupId is supplied,
  // so newly created tickets land inside this workspace's slice.
  let groupId = input.groupId;
  if (!groupId) {
    const groups = await fetchJson<{ id: number; name: string; active: boolean }[]>(
      zammadFetch,
      "zammad",
      "/api/v1/groups",
    );
    const match = groups.find((g) =>
      tenant.groupNames.some((tg) => tg.toLowerCase() === g.name.toLowerCase()),
    );
    if (!match) {
      throw new Error(
        `Keine passende Zammad-Gruppe f\u00fcr Workspace "${tenant.workspace}" gefunden ` +
          `(erwartet eine von: ${tenant.groupNames.join(", ")}).`,
      );
    }
    groupId = match.id;
  }
  const created = await fetchJson<RawTicket>(zammadFetch, "zammad", `/api/v1/tickets`, {
    method: "POST",
    json: {
      title: input.title,
      group_id: groupId,
      priority_id: input.priorityId ?? 2,
      customer: input.customerEmail,
      article: {
        subject: input.title,
        body: input.body,
        type: "note",
        internal: Boolean(input.internal),
      },
    },
  });
  return getTicket(tenant, created.id);
}

export async function addArticle(
  tenant: HelpdeskTenantConfig,
  ticketId: number,
  input: {
    body: string;
    type?: "note" | "email" | "phone";
    internal?: boolean;
    subject?: string;
    onBehalfOf?: string;
  },
): Promise<TicketArticle> {
  // Same tenant guard as updateTicket so a forged ticketId can't leak across.
  const guard = await fetchJson<RawTicket>(
    zammadFetch,
    "zammad",
    `/api/v1/tickets/${ticketId}?expand=true`,
  );
  if (!tenantAllowsGroup(tenant, guard.group ?? "")) {
    throw new Error("Ticket geh\u00f6rt nicht zu diesem Workspace.");
  }
  const headers: Record<string, string> = {};
  if (input.onBehalfOf) headers["X-On-Behalf-Of"] = input.onBehalfOf;
  const created = await fetchJson<RawArticle>(
    zammadFetch,
    "zammad",
    `/api/v1/ticket_articles`,
    {
      method: "POST",
      headers,
      json: {
        ticket_id: ticketId,
        body: input.body,
        type: input.type ?? "note",
        internal: Boolean(input.internal),
        subject: input.subject,
        content_type: "text/html",
      },
    },
  );
  return normaliseArticle(created);
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Meta / lookups                             */
/* ─────────────────────────────────────────────────────────────────────── */

const metaCache = new Map<string, { ts: number; data: TicketMeta }>();

export async function loadMeta(tenant: HelpdeskTenantConfig): Promise<TicketMeta> {
  const cacheKey = tenant.workspace;
  const cached = metaCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 60_000) return cached.data;
  const [states, priorities, groups, agents, macros, overviews] = await Promise.all([
    fetchJson<{
      id: number;
      name: string;
      state_type_id: number;
      active: boolean;
    }[]>(zammadFetch, "zammad", "/api/v1/ticket_states"),
    fetchJson<{
      id: number;
      name: string;
      ui_color: string | null;
      ui_icon: string | null;
    }[]>(zammadFetch, "zammad", "/api/v1/ticket_priorities"),
    fetchJson<{ id: number; name: string; active: boolean }[]>(
      zammadFetch,
      "zammad",
      "/api/v1/groups",
    ),
    listAgents().catch(() => [] as TicketUser[]),
    listMacros().catch(() => [] as MacroSummary[]),
    listOverviews().catch(() => [] as OverviewSummary[]),
  ]);

  // States and priorities are global in Zammad; groups are scoped to the
  // tenant so the UI can only assign tickets within this workspace.
  const data: TicketMeta = {
    states: states.map<TicketState>((s) => ({
      id: s.id,
      name: s.name,
      stateTypeId: s.state_type_id,
      active: s.active,
    })),
    priorities: priorities.map<TicketPriority>((p) => ({
      id: p.id,
      name: p.name,
      uiColor: p.ui_color,
      uiIcon: p.ui_icon,
    })),
    groups: groups
      .filter((g) =>
        tenant.groupNames.some((tg) => tg.toLowerCase() === g.name.toLowerCase()),
      )
      .map<TicketGroup>((g) => ({
        id: g.id,
        name: g.name,
        active: g.active,
      })),
    agents,
    macros,
    overviews,
  };
  metaCache.set(cacheKey, { ts: Date.now(), data });
  return data;
}

/** Force-invalidate the meta cache. Call after admins change agents/macros. */
export function invalidateMetaCache(workspace?: string): void {
  if (workspace) metaCache.delete(workspace);
  else metaCache.clear();
}

export async function searchUsers(query: string, limit = 10): Promise<TicketUser[]> {
  const params = new URLSearchParams({ query, limit: String(limit) });
  const users = await fetchJson<RawUser[]>(
    zammadFetch,
    "zammad",
    `/api/v1/users/search?${params}`,
  );
  return users.map((u) => ({
    id: u.id,
    login: u.login,
    email: u.email,
    firstName: u.firstname ?? "",
    lastName: u.lastname ?? "",
    fullName: `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.email,
    image: u.image ?? null,
  }));
}

/**
 * Resolve the Zammad user id for the current portal user. We search by email
 * which Zammad indexes; result is cached per email for 5 min so we don't hit
 * Zammad on every list-render.
 */
const meCache = new Map<string, { ts: number; id: number | null }>();
const ME_TTL_MS = 5 * 60_000;

export async function getZammadUserIdByEmail(email: string): Promise<number | null> {
  const k = email.toLowerCase();
  const cached = meCache.get(k);
  if (cached && Date.now() - cached.ts < ME_TTL_MS) return cached.id;
  try {
    const params = new URLSearchParams({ query: email, limit: "5" });
    const users = await fetchJson<RawUser[]>(
      zammadFetch,
      "zammad",
      `/api/v1/users/search?${params}`,
    );
    const exact = users.find(
      (u) => u.email?.toLowerCase() === k || u.login?.toLowerCase() === k,
    );
    const id = exact?.id ?? null;
    meCache.set(k, { ts: Date.now(), id });
    return id;
  } catch {
    return null;
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                Agents                                   */
/* ─────────────────────────────────────────────────────────────────────── */

const agentsCache = { ts: 0, data: [] as TicketUser[] };
const AGENTS_TTL_MS = 5 * 60_000;

/**
 * List all active Zammad agents (role:Agent). Cached for 5 min — agent
 * roster changes are rare and the owner-picker queries this on every meta
 * load.
 */
export async function listAgents(): Promise<TicketUser[]> {
  if (agentsCache.data.length && Date.now() - agentsCache.ts < AGENTS_TTL_MS) {
    return agentsCache.data;
  }
  // Zammad search supports role-name predicates: `role:Agent active:true`.
  const params = new URLSearchParams({
    query: "role:Agent AND active:true",
    limit: "200",
  });
  const users = await fetchJson<RawUser[]>(
    zammadFetch,
    "zammad",
    `/api/v1/users/search?${params}`,
  );
  const data = users.map<TicketUser>((u) => ({
    id: u.id,
    login: u.login,
    email: u.email,
    firstName: u.firstname ?? "",
    lastName: u.lastname ?? "",
    fullName: `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.email || u.login,
    image: u.image ?? null,
  }));
  agentsCache.data = data;
  agentsCache.ts = Date.now();
  return data;
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                  Tags                                   */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Tags in Zammad live under `/api/v1/tags?object=Ticket&o_id=<id>`. The
 * response shape is `{ tags: string[] }`; we normalise into a plain array.
 */
export async function listTagsForTicket(ticketId: number): Promise<string[]> {
  const params = new URLSearchParams({ object: "Ticket", o_id: String(ticketId) });
  const data = await fetchJson<{ tags?: string[] }>(
    zammadFetch,
    "zammad",
    `/api/v1/tags?${params}`,
  );
  return Array.isArray(data?.tags) ? data!.tags! : [];
}

export async function addTicketTag(
  tenant: HelpdeskTenantConfig,
  ticketId: number,
  tag: string,
): Promise<string[]> {
  await assertTicketInTenant(tenant, ticketId);
  const trimmed = tag.trim();
  if (!trimmed) throw new Error("Tag darf nicht leer sein.");
  await fetchJson(zammadFetch, "zammad", `/api/v1/tags/add`, {
    method: "POST",
    json: { object: "Ticket", o_id: ticketId, item: trimmed },
  });
  return listTagsForTicket(ticketId);
}

export async function removeTicketTag(
  tenant: HelpdeskTenantConfig,
  ticketId: number,
  tag: string,
): Promise<string[]> {
  await assertTicketInTenant(tenant, ticketId);
  // DELETE with body is non-standard, but Zammad accepts it and so do
  // fetch+undici. Fallback: POST /api/v1/tags/remove with same body.
  await fetchJson(zammadFetch, "zammad", `/api/v1/tags/remove`, {
    method: "DELETE",
    json: { object: "Ticket", o_id: ticketId, item: tag },
  });
  return listTagsForTicket(ticketId);
}

/**
 * Autocomplete tag input. Zammad's `/api/v1/tag_search` returns matching
 * tag *names* (and globally-known counts). The endpoint is admin-only on
 * older versions — guarded so the UI keeps working without it.
 */
export async function suggestTags(
  query: string,
  limit = 10,
): Promise<TagSuggestion[]> {
  if (!query.trim()) return [];
  try {
    const params = new URLSearchParams({ term: query, limit: String(limit) });
    const data = await fetchJson<{ id: number; name: string; count?: number }[]>(
      zammadFetch,
      "zammad",
      `/api/v1/tag_search?${params}`,
    );
    return data.map((t) => ({ name: t.name, count: t.count }));
  } catch {
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                 Macros                                  */
/* ─────────────────────────────────────────────────────────────────────── */

type RawMacro = {
  id: number;
  name: string;
  active: boolean;
  perform: Record<string, unknown> | null;
  ux_flow_next_up?: string | null;
  group_ids?: number[] | null;
};

const macrosCache = { ts: 0, data: [] as MacroSummary[], raw: [] as RawMacro[] };
const MACROS_TTL_MS = 60_000;

async function ensureMacrosFetched(): Promise<RawMacro[]> {
  if (macrosCache.raw.length && Date.now() - macrosCache.ts < MACROS_TTL_MS) {
    return macrosCache.raw;
  }
  const data = await fetchJson<RawMacro[]>(zammadFetch, "zammad", `/api/v1/macros`);
  macrosCache.raw = data;
  macrosCache.data = data
    .filter((m) => m.active)
    .map<MacroSummary>((m) => ({
      id: m.id,
      name: m.name,
      active: m.active,
      affects: deriveMacroAffects(m.perform),
    }));
  macrosCache.ts = Date.now();
  return data;
}

function deriveMacroAffects(perform: Record<string, unknown> | null | undefined): string[] {
  if (!perform || typeof perform !== "object") return [];
  const out: string[] = [];
  for (const key of Object.keys(perform)) {
    if (key === "ticket.state_id" || key === "ticket.state") out.push("state");
    else if (key === "ticket.priority_id" || key === "ticket.priority")
      out.push("priority");
    else if (key === "ticket.owner_id") out.push("owner");
    else if (key === "ticket.group_id") out.push("group");
    else if (key === "ticket.tags") out.push("tags");
    else if (key === "article.note" || key === "notification.email") out.push("article");
    else if (key === "ticket.pending_time") out.push("pending");
  }
  return Array.from(new Set(out));
}

export async function listMacros(): Promise<MacroSummary[]> {
  await ensureMacrosFetched();
  return macrosCache.data;
}

/**
 * Replace `{{ticket.number}}`, `{{customer.email}}`, … in macro perform
 * strings. Unknown keys stay as-is (literal `{{…}}`).
 */
function interpolateMacroPlaceholders(template: string, ticket: TicketDetail): string {
  const map: Record<string, string> = {};
  const add = (key: string, value: string) => {
    map[key.replace(/\s+/g, "").toLowerCase()] = value;
  };
  const tagsJoined = (ticket.tags ?? []).join(", ");
  add("ticket.id", String(ticket.id));
  add("ticket.number", ticket.number);
  add("ticket.title", ticket.title);
  add("ticket.customer.email", ticket.customerEmail ?? "");
  add("ticket.customer.name", ticket.customerName ?? "");
  add("customer.email", ticket.customerEmail ?? "");
  add("customer.name", ticket.customerName ?? "");
  add("ticket.state", ticket.stateName ?? "");
  add("ticket.priority", ticket.priorityName ?? "");
  add("ticket.group", ticket.groupName ?? "");
  add("ticket.tags", tagsJoined);
  add("ticket.owner", ticket.ownerName ?? "");

  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (full, raw: string) => {
    const key = String(raw).replace(/\s+/g, "").toLowerCase().replace(/_/g, ".");
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key]! : full;
  });
}

/**
 * Apply a Zammad macro server-side.
 *
 * Zammad's web app applies macros client-side: it walks the macro's
 * `perform` map and PATCHes the ticket / posts an article. We replicate
 * that here so the portal can run the same macros without exposing the
 * full Zammad API to the browser.
 *
 * Supported keys (subset): `ticket.state_id|state`, `ticket.priority_id|priority`,
 * `ticket.owner_id|owner`, `ticket.group_id|group`, `ticket.tags`
 * (add/remove/replace), `article.note` (subject/body/internal),
 * `ticket.title`, `ticket.pending_time`.
 */
export async function executeMacro(
  tenant: HelpdeskTenantConfig,
  ticketId: number,
  macroId: number,
  ctx: { onBehalfOf?: string } = {},
): Promise<TicketDetail | null> {
  const macros = await ensureMacrosFetched();
  const macro = macros.find((m) => m.id === macroId);
  if (!macro) throw new Error("Macro nicht gefunden.");
  if (!macro.active) throw new Error("Macro ist deaktiviert.");
  await assertTicketInTenant(tenant, ticketId);
  const ticketCtx = await getTicket(tenant, ticketId);
  if (!ticketCtx) throw new Error("Ticket nicht gefunden.");
  const perform = macro.perform ?? {};

  // 1) Build a single PUT-patch from all `ticket.*` operations
  const patch: Record<string, unknown> = {};
  // 2) Tag adds/removes are separate calls, collect them
  const tagAdds: string[] = [];
  const tagRemoves: string[] = [];
  // 3) Optional follow-up article
  let articleBody: string | undefined;
  let articleSubject: string | undefined;
  let articleInternal = false;
  let articleType: "note" | "email" = "note";

  for (const [key, raw] of Object.entries(perform)) {
    const v = raw as { value?: unknown; pre_condition?: string; operator?: string; body?: string; subject?: string; internal?: string | boolean; type?: string };
    if (key === "ticket.state_id" && v?.value != null) {
      patch.state_id = Number(v.value);
    } else if (key === "ticket.state" && v?.value != null) {
      // Resolve name -> id via meta cache (cheap call, cached)
      const meta = await loadMeta(tenant);
      const stateName = interpolateMacroPlaceholders(String(v.value), ticketCtx);
      const s = meta.states.find((x) => x.name === stateName);
      if (s) patch.state_id = s.id;
    } else if (key === "ticket.priority_id" && v?.value != null) {
      patch.priority_id = Number(v.value);
    } else if (key === "ticket.priority" && v?.value != null) {
      const meta = await loadMeta(tenant);
      const prioName = interpolateMacroPlaceholders(String(v.value), ticketCtx);
      const p = meta.priorities.find((x) => x.name === prioName);
      if (p) patch.priority_id = p.id;
    } else if (key === "ticket.owner_id" && v?.value != null) {
      patch.owner_id = Number(v.value);
    } else if (key === "ticket.group_id" && v?.value != null) {
      patch.group_id = Number(v.value);
    } else if (key === "ticket.title" && v?.value != null) {
      patch.title = interpolateMacroPlaceholders(String(v.value), ticketCtx);
    } else if (key === "ticket.pending_time" && v?.value != null) {
      patch.pending_time = interpolateMacroPlaceholders(String(v.value), ticketCtx);
    } else if (key === "ticket.tags" && v?.value != null) {
      const items = interpolateMacroPlaceholders(String(v.value), ticketCtx)
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      if (v.operator === "remove") tagRemoves.push(...items);
      else tagAdds.push(...items);
    } else if (key === "article.note" && (v?.body || v?.subject)) {
      articleBody = interpolateMacroPlaceholders(v.body ?? "", ticketCtx);
      articleSubject = interpolateMacroPlaceholders(v.subject ?? "", ticketCtx);
      articleInternal = String(v.internal ?? "true") === "true";
      articleType = "note";
    } else if (key === "notification.email" && v?.body) {
      articleBody = interpolateMacroPlaceholders(String(v.body), ticketCtx);
      articleSubject = interpolateMacroPlaceholders(v.subject ?? "", ticketCtx);
      articleInternal = false;
      articleType = "email";
    }
  }

  // Apply patch first (atomic on the Zammad side).
  if (Object.keys(patch).length) {
    await fetchJson(zammadFetch, "zammad", `/api/v1/tickets/${ticketId}`, {
      method: "PUT",
      json: patch,
    });
  }

  // Then tag operations (sequential so ordering matches Zammad's perform order).
  for (const t of tagAdds) await addTicketTag(tenant, ticketId, t).catch(() => {});
  for (const t of tagRemoves)
    await removeTicketTag(tenant, ticketId, t).catch(() => {});

  // Finally the optional article.
  if (articleBody?.trim()) {
    const headers: Record<string, string> = {};
    if (ctx.onBehalfOf) headers["X-On-Behalf-Of"] = ctx.onBehalfOf;
    await fetchJson(zammadFetch, "zammad", `/api/v1/ticket_articles`, {
      method: "POST",
      headers,
      json: {
        ticket_id: ticketId,
        body: articleBody,
        subject: articleSubject,
        type: articleType,
        internal: articleInternal,
        content_type: "text/html",
      },
    });
  }

  return getTicket(tenant, ticketId);
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Bulk operations                            */
/* ─────────────────────────────────────────────────────────────────────── */

export type BulkPatch = Partial<{
  state_id: number;
  priority_id: number;
  group_id: number;
  owner_id: number;
}>;

/**
 * Update many tickets with the same patch in parallel. Each ticket is
 * tenant-checked individually so a forged id can't escape the workspace.
 *
 * Returns per-ticket success/error so the UI can highlight what failed.
 */
export async function bulkUpdateTickets(
  tenant: HelpdeskTenantConfig,
  ticketIds: number[],
  patch: BulkPatch,
): Promise<{ id: number; ok: boolean; error?: string }[]> {
  const cleaned = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v != null),
  );
  if (!Object.keys(cleaned).length) {
    throw new Error("Keine Felder zum Aktualisieren.");
  }
  const work = ticketIds.map(async (id) => {
    try {
      await assertTicketInTenant(tenant, id);
      await fetchJson(zammadFetch, "zammad", `/api/v1/tickets/${id}`, {
        method: "PUT",
        json: cleaned,
      });
      return { id, ok: true as const };
    } catch (e) {
      return {
        id,
        ok: false as const,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  });
  return Promise.all(work);
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                         Customer 360 (history)                          */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Fetch every ticket associated with a given customer that lives inside
 * the tenant's groups. Supports an optional state filter.
 */
export async function listTicketsForCustomer(
  tenant: HelpdeskTenantConfig,
  customerId: number,
  opts: { state?: "open" | "closed" | "all"; limit?: number } = {},
): Promise<TicketSummary[]> {
  const limit = Math.min(opts.limit ?? 100, 200);
  const stateClause =
    opts.state === "open"
      ? " state.state_type.name:(new OR open OR pending)"
      : opts.state === "closed"
        ? " state.state_type.name:closed"
        : "";
  const predicate = [
    tenantGroupPredicate(tenant),
    `customer_id:${customerId}`,
    stateClause,
  ]
    .filter(Boolean)
    .join(" ");
  const params = new URLSearchParams({
    query: predicate,
    limit: String(limit),
    sort_by: "updated_at",
    order_by: "desc",
    expand: "true",
  });
  const data = await fetchJson<RawTicket[]>(
    zammadFetch,
    "zammad",
    `/api/v1/tickets/search?${params}`,
  );
  return data.map((t) => summariseTicket(t));
}

/**
 * Lightweight customer profile for the slide-in drawer. Combines core
 * user fields with their ticket counts (open/closed) so we can show a
 * "since 2024 · 12 Tickets · 2 offen" summary.
 */
export async function getCustomerProfile(
  tenant: HelpdeskTenantConfig,
  customerId: number,
): Promise<{
  user: TicketUser & { organization: string | null; phone: string | null; createdAt: string | null };
  tickets: TicketSummary[];
  openCount: number;
  closedCount: number;
} | null> {
  const user = await fetchJson<
    RawUser & {
      organization?: string | null;
      phone?: string | null;
      created_at?: string;
    }
  >(zammadFetch, "zammad", `/api/v1/users/${customerId}`).catch(() => null);
  if (!user) return null;
  const tickets = await listTicketsForCustomer(tenant, customerId, { state: "all", limit: 100 });
  const openCount = tickets.filter((t) =>
    /new|open|pending/i.test(t.stateName),
  ).length;
  const closedCount = tickets.filter((t) => /closed|merged/i.test(t.stateName)).length;
  return {
    user: {
      id: user.id,
      login: user.login,
      email: user.email,
      firstName: user.firstname ?? "",
      lastName: user.lastname ?? "",
      fullName: `${user.firstname ?? ""} ${user.lastname ?? ""}`.trim() || user.email,
      image: user.image ?? null,
      organization: user.organization ?? null,
      phone: user.phone ?? null,
      createdAt: user.created_at ?? null,
    },
    tickets,
    openCount,
    closedCount,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                               Overviews                                 */
/* ─────────────────────────────────────────────────────────────────────── */

type RawOverview = {
  id: number;
  name: string;
  link: string;
  active: boolean;
  prio?: number;
};

/**
 * Saved Zammad views ("Overviews") — exposed in the sidebar as additional
 * scope filters. We preserve the original Zammad ordering (`prio`) so
 * admins can curate the order in Zammad and have it reflected here.
 */
/* ─────────────────────────────────────────────────────────────────────── */
/*                              Settings panel                             */
/* ─────────────────────────────────────────────────────────────────────── */

export type HelpdeskGroupSetting = {
  id: number;
  name: string;
  active: boolean;
  emailAddressId: number | null;
  signatureId: number | null;
  memberCount: number | null;
  note: string | null;
};

export type HelpdeskEmailAddressSetting = {
  id: number;
  name: string;
  email: string;
  channelId: number | null;
  active: boolean;
  inUseByTenant: boolean;
};

export type HelpdeskChannelSetting = {
  id: number;
  area: string;
  active: boolean;
  /** Sender / recipient settings for the channel as Zammad reports them. */
  options: Record<string, unknown>;
};

export type HelpdeskSettings = {
  workspace: string;
  tenant: { groupNames: string[] };
  groups: HelpdeskGroupSetting[];
  emailAddresses: HelpdeskEmailAddressSetting[];
  channels: HelpdeskChannelSetting[];
  adminLinks: Record<string, string>;
};

/**
 * Read-only settings overview for a tenant: the Zammad groups, mail
 * addresses, channels and member counts. Used by the portal Helpdesk
 * gear / settings page so admins can see (and deep-link into Zammad to
 * edit) sender addresses, group membership and inbound mail routing.
 */
export async function getHelpdeskSettings(
  tenant: HelpdeskTenantConfig,
): Promise<HelpdeskSettings> {
  type RawGroup = {
    id: number;
    name: string;
    active: boolean;
    email_address_id: number | null;
    signature_id: number | null;
    note?: string | null;
  };
  type RawEmailAddress = {
    id: number;
    name: string;
    email: string;
    channel_id: number | null;
    active: boolean;
  };
  type RawChannel = {
    id: number;
    area: string;
    active: boolean;
    options?: Record<string, unknown>;
  };
  type RawUser = {
    id: number;
    active: boolean;
    group_ids?: Record<string, string[]>;
  };

  const [allGroups, emailAddresses, channels] = await Promise.all([
    fetchJson<RawGroup[]>(zammadFetch, "zammad", "/api/v1/groups").catch(
      () => [] as RawGroup[],
    ),
    fetchJson<RawEmailAddress[]>(
      zammadFetch,
      "zammad",
      "/api/v1/email_addresses",
    ).catch(() => [] as RawEmailAddress[]),
    fetchJson<RawChannel[]>(zammadFetch, "zammad", "/api/v1/channels").catch(
      () => [] as RawChannel[],
    ),
  ]);

  const tenantGroupNames = new Set(
    tenant.groupNames.map((n) => n.toLowerCase()),
  );
  const tenantGroups = allGroups.filter((g) =>
    tenantGroupNames.has(g.name.toLowerCase()),
  );
  const tenantEmailIds = new Set(
    tenantGroups
      .map((g) => g.email_address_id)
      .filter((x): x is number => typeof x === "number"),
  );

  const memberCounts = new Map<number, number>();
  try {
    const users = await fetchJson<RawUser[]>(
      zammadFetch,
      "zammad",
      "/api/v1/users?expand=true&limit=200",
    );
    for (const u of users) {
      if (!u.active) continue;
      const ass = u.group_ids;
      if (!ass || typeof ass !== "object") continue;
      for (const [gid] of Object.entries(ass)) {
        const id = Number(gid);
        if (!Number.isFinite(id)) continue;
        memberCounts.set(id, (memberCounts.get(id) ?? 0) + 1);
      }
    }
  } catch {
    // Non-fatal — counts just stay null.
  }

  return {
    workspace: tenant.workspace,
    tenant: { groupNames: tenant.groupNames },
    groups: tenantGroups.map((g) => ({
      id: g.id,
      name: g.name,
      active: g.active,
      emailAddressId: g.email_address_id,
      signatureId: g.signature_id,
      memberCount: memberCounts.get(g.id) ?? null,
      note: g.note ?? null,
    })),
    emailAddresses: emailAddresses.map((e) => ({
      id: e.id,
      name: e.name,
      email: e.email,
      channelId: e.channel_id,
      active: e.active,
      inUseByTenant: tenantEmailIds.has(e.id),
    })),
    channels: channels
      .filter((c) => c.area?.toLowerCase().startsWith("email"))
      .map((c) => ({
        id: c.id,
        area: c.area,
        active: c.active,
        options: c.options ?? {},
      })),
    adminLinks: {
      groups: "/#manage/groups",
      emailAddresses: "/#manage/email_addresses",
      channels: "/#channels/email",
      signatures: "/#manage/signatures",
      agents: "/#manage/users",
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                       Settings mutations (admin-only)                   */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Patch a Zammad group via `PUT /api/v1/groups/:id`. Only fields exposed in
 * the portal settings UI are accepted (name, active, default sender email
 * address, default signature, note). Caller must verify the group belongs
 * to the calling tenant before invoking this — ensureGroupInTenant() helps.
 */
export async function updateGroup(
  tenant: HelpdeskTenantConfig,
  groupId: number,
  patch: Partial<{
    name: string;
    active: boolean;
    email_address_id: number | null;
    signature_id: number | null;
    note: string | null;
  }>,
): Promise<HelpdeskGroupSetting> {
  await ensureGroupInTenant(tenant, groupId);
  await fetchJson(zammadFetch, "zammad", `/api/v1/groups/${groupId}`, {
    method: "PUT",
    json: patch,
  });
  invalidateMetaCache(tenant.workspace);
  // Re-read so the UI gets canonical state.
  const all = await fetchJson<
    {
      id: number;
      name: string;
      active: boolean;
      email_address_id: number | null;
      signature_id: number | null;
      note?: string | null;
    }[]
  >(zammadFetch, "zammad", `/api/v1/groups`);
  const g = all.find((x) => x.id === groupId);
  if (!g) throw new Error("Gruppe nach Update nicht gefunden.");
  return {
    id: g.id,
    name: g.name,
    active: g.active,
    emailAddressId: g.email_address_id,
    signatureId: g.signature_id,
    memberCount: null,
    note: g.note ?? null,
  };
}

/**
 * Patch a Zammad email-address record (sender). Only display name + active
 * flag are editable from the portal — IMAP/SMTP credentials live on the
 * channel and stay out of UI scope. Caller must check that the address is
 * actually in use by the tenant (or admin override) before calling.
 */
export async function updateEmailAddress(
  emailAddressId: number,
  patch: Partial<{ name: string; active: boolean }>,
): Promise<HelpdeskEmailAddressSetting> {
  await fetchJson(
    zammadFetch,
    "zammad",
    `/api/v1/email_addresses/${emailAddressId}`,
    { method: "PUT", json: patch },
  );
  const all = await fetchJson<
    {
      id: number;
      name: string;
      email: string;
      channel_id: number | null;
      active: boolean;
    }[]
  >(zammadFetch, "zammad", `/api/v1/email_addresses`);
  const ea = all.find((x) => x.id === emailAddressId);
  if (!ea) throw new Error("Absender-Adresse nach Update nicht gefunden.");
  return {
    id: ea.id,
    name: ea.name,
    email: ea.email,
    channelId: ea.channel_id,
    active: ea.active,
    inUseByTenant: false, // recomputed by the caller against the tenant
  };
}

/**
 * Members of a single Zammad group. Zammad models membership as a
 * per-user `group_ids` map: `{ "<group_id>": ["full","read","change", ...] }`.
 * We list all active users and pick the ones whose map contains the group.
 */
export async function listGroupMembers(
  tenant: HelpdeskTenantConfig,
  groupId: number,
): Promise<Array<TicketUser & { accessLevel: string[] }>> {
  await ensureGroupInTenant(tenant, groupId);
  const users = await fetchJson<
    Array<RawUser & { active?: boolean; group_ids?: Record<string, string[]> }>
  >(zammadFetch, "zammad", `/api/v1/users?expand=true&limit=200`);
  const out: Array<TicketUser & { accessLevel: string[] }> = [];
  for (const u of users) {
    if (u.active === false) continue;
    const access = u.group_ids?.[String(groupId)];
    if (!access || access.length === 0) continue;
    out.push({
      id: u.id,
      login: u.login,
      email: u.email,
      firstName: u.firstname ?? "",
      lastName: u.lastname ?? "",
      fullName:
        `${u.firstname ?? ""} ${u.lastname ?? ""}`.trim() || u.email || u.login,
      image: u.image ?? null,
      accessLevel: access,
    });
  }
  return out;
}

/**
 * Toggle a user's membership in a group. `accessLevel` is the set of
 * Zammad permissions we want (default: full). Pass `null` to remove the
 * user from the group entirely.
 */
export async function setGroupMembership(
  tenant: HelpdeskTenantConfig,
  groupId: number,
  userId: number,
  accessLevel: string[] | null,
): Promise<void> {
  await ensureGroupInTenant(tenant, groupId);
  // Read the user's current group_ids so we don't clobber other groups.
  const user = await fetchJson<{
    id: number;
    group_ids?: Record<string, string[]>;
  }>(zammadFetch, "zammad", `/api/v1/users/${userId}`);
  const current = { ...(user.group_ids ?? {}) };
  const key = String(groupId);
  if (accessLevel && accessLevel.length > 0) {
    current[key] = accessLevel;
  } else {
    delete current[key];
  }
  await fetchJson(zammadFetch, "zammad", `/api/v1/users/${userId}`, {
    method: "PUT",
    json: { group_ids: current },
  });
}

async function ensureGroupInTenant(
  tenant: HelpdeskTenantConfig,
  groupId: number,
): Promise<void> {
  const all = await fetchJson<{ id: number; name: string }[]>(
    zammadFetch,
    "zammad",
    `/api/v1/groups`,
  );
  const g = all.find((x) => x.id === groupId);
  if (!g) throw new Error(`Gruppe ${groupId} nicht gefunden.`);
  if (!tenantAllowsGroup(tenant, g.name)) {
    throw new Error(
      `Gruppe "${g.name}" geh\u00f6rt nicht zum Workspace ${tenant.workspace}.`,
    );
  }
}

export async function listOverviews(): Promise<OverviewSummary[]> {
  const data = await fetchJson<RawOverview[]>(zammadFetch, "zammad", `/api/v1/overviews`);
  return data
    .filter((o) => o.active)
    .sort((a, b) => (a.prio ?? 0) - (b.prio ?? 0))
    .map<OverviewSummary>((o) => ({
      id: o.id,
      name: o.name,
      link: o.link,
      ticketCount: null, // populated lazily by /overviews/[id]/tickets if asked
    }));
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                            Internal helpers                             */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Throws if the ticket isn't in one of the tenant's groups. Used by every
 * mutating endpoint to keep tenants from poking at each other's tickets
 * via raw IDs.
 */
async function assertTicketInTenant(
  tenant: HelpdeskTenantConfig,
  ticketId: number,
): Promise<void> {
  const guard = await fetchJson<RawTicket>(
    zammadFetch,
    "zammad",
    `/api/v1/tickets/${ticketId}?expand=true`,
  );
  if (!tenantAllowsGroup(tenant, guard.group ?? "")) {
    throw new Error("Ticket gehört nicht zu diesem Workspace.");
  }
}
