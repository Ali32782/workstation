import "server-only";
import { createAppFetch, AppApiError } from "@/lib/app-clients/base";
import type {
  MarketingOverview,
  MauticCampaign,
  MauticContact,
  MauticEmail,
  MauticSegment,
} from "./types";

/**
 * Mautic REST client for the native /marketing UI.
 *
 * Mautic is single-tenant from its own POV (one DB), so we only auth with
 * one service account ("portal-bridge"). Multi-tenancy at the portal layer
 * is enforced by the route guard (`SIGN_ALLOWED_GROUPS`-style — see
 * `getMarketingTenant` below) — only the medtheris workspace exposes /marketing
 * for now, since Mautic only carries MedTheris campaigns.
 *
 * Authentication: HTTP Basic Auth with `MAUTIC_API_USERNAME` + `MAUTIC_API_TOKEN`.
 * Mautic's "API Credentials" feature lets you provision a token-style password
 * for a dedicated service user without touching its real password — that's
 * what we want here. OAuth2 would also work, but the extra round-trip and
 * refresh-token management isn't worth it for a server-to-server bridge.
 */

const PUBLIC = process.env.MAUTIC_URL ?? "https://marketing.medtheris.kineo360.work";
const INTERNAL = process.env.MAUTIC_INTERNAL_URL ?? "http://mautic_web";
const API_USER = process.env.MAUTIC_API_USERNAME ?? "";
const API_PASS = process.env.MAUTIC_API_TOKEN ?? "";

export function isMauticConfigured(): boolean {
  return Boolean(API_USER && API_PASS);
}

export function mauticPublicUrl(): string {
  return PUBLIC;
}

const authHeaders = (): Record<string, string> => {
  if (!API_USER || !API_PASS) return {};
  const basic = Buffer.from(`${API_USER}:${API_PASS}`).toString("base64");
  return { Authorization: `Basic ${basic}` };
};

const fetcher = createAppFetch({
  app: "mautic",
  origins: { internal: INTERNAL, public: PUBLIC },
  authHeaders,
});

async function getJson<T>(path: string): Promise<T> {
  const r = await fetcher(path);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new AppApiError("mautic", r.status, path, body);
  }
  return (await r.json()) as T;
}

/**
 * Mautic returns lists as objects keyed by entity id, e.g.
 *   { total: "12", contacts: { "1": {...}, "2": {...} } }
 * We normalise that to a plain array for easier downstream handling.
 */
function valuesOf<T>(map: Record<string, T> | T[] | null | undefined): T[] {
  if (!map) return [];
  if (Array.isArray(map)) return map;
  return Object.values(map);
}

// ─── Contacts ──────────────────────────────────────────────────────────────

type RawContact = {
  id: number;
  fields?: {
    core?: Record<string, { alias: string; value: string | null } | undefined>;
  };
  points?: number;
  stage?: { id: number; name: string } | null;
  tags?: { id: number; tag: string }[];
  lastActive?: string | null;
  dateModified?: string | null;
  dateAdded?: string | null;
};

function pickField(c: RawContact, alias: string): string | null {
  const v = c.fields?.core?.[alias]?.value;
  return v ?? null;
}

function normaliseContact(c: RawContact, segments: Map<number, string>): MauticContact {
  const segIds = (c as unknown as { segments?: { id: number }[] }).segments ?? [];
  return {
    id: c.id,
    email: pickField(c, "email"),
    firstName: pickField(c, "firstname"),
    lastName: pickField(c, "lastname"),
    company: pickField(c, "company"),
    city: pickField(c, "city"),
    country: pickField(c, "country"),
    lastActive: c.lastActive ?? c.dateModified ?? null,
    points: typeof c.points === "number" ? c.points : 0,
    stage: c.stage?.name ?? null,
    tags: (c.tags ?? []).map((t) => t.tag),
    segments: segIds
      .map((s) => segments.get(s.id))
      .filter((v): v is string => Boolean(v)),
  };
}

/**
 * Look up a single Mautic contact by exact email match. Returns null if no
 * contact exists yet (callers can decide whether to upsert).
 *
 * Mautic's `/api/contacts?search=...` accepts a free-text search that matches
 * email + name, so we constrain it with `email:foo@bar` filter syntax to
 * avoid matching co-workers with the same first name.
 */
export async function findContactByEmail(
  email: string,
): Promise<MauticContact | null> {
  if (!email.trim()) return null;
  const params = new URLSearchParams();
  params.set("limit", "1");
  params.set("search", `email:${email.trim()}`);
  const [raw, segs] = await Promise.all([
    getJson<{ total: string | number; contacts?: Record<string, RawContact> }>(
      `/api/contacts?${params}`,
    ),
    listSegments({ limit: 200 }).catch(() => ({ segments: [] as MauticSegment[] })),
  ]);
  const segMap = new Map(segs.segments.map((s) => [s.id, s.name]));
  const arr = valuesOf(raw.contacts);
  if (arr.length === 0) return null;
  // Defensive double-check on email since Mautic's search is fuzzy on older
  // versions — only return if it really matches.
  const match = arr.find(
    (c) => (pickField(c, "email") ?? "").toLowerCase() === email.trim().toLowerCase(),
  );
  return match ? normaliseContact(match, segMap) : null;
}

/**
 * Returns every Mautic contact whose email lives at the given domain
 * (e.g. all `*@medtheris.com` contacts for the MedTheris company in
 * Twenty). Used to power the "Marketing" sidebar in the CRM company
 * detail view.
 */
export async function listContactsByDomain(
  domain: string,
  limit = 50,
): Promise<MauticContact[]> {
  const cleaned = domain
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "")
    .trim()
    .toLowerCase();
  if (!cleaned) return [];
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  // Mautic search can match a substring on the email field. Anchoring with
  // `@` makes it behave like a domain filter for the typical case.
  params.set("search", `email:@${cleaned}`);
  const [raw, segs] = await Promise.all([
    getJson<{ total: string | number; contacts?: Record<string, RawContact> }>(
      `/api/contacts?${params}`,
    ),
    listSegments({ limit: 200 }).catch(() => ({ segments: [] as MauticSegment[] })),
  ]);
  const segMap = new Map(segs.segments.map((s) => [s.id, s.name]));
  return valuesOf(raw.contacts)
    .filter((c) =>
      (pickField(c, "email") ?? "").toLowerCase().endsWith(`@${cleaned}`),
    )
    .map((c) => normaliseContact(c, segMap));
}

export async function listContacts(opts: {
  search?: string;
  limit?: number;
  start?: number;
  segmentId?: number;
} = {}): Promise<{ total: number; contacts: MauticContact[] }> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  params.set("start", String(opts.start ?? 0));
  params.set("orderBy", "last_active");
  params.set("orderByDir", "DESC");
  if (opts.search) params.set("search", opts.search);
  const path = opts.segmentId
    ? `/api/segments/${opts.segmentId}/contacts?${params}`
    : `/api/contacts?${params}`;

  const [raw, segs] = await Promise.all([
    getJson<{ total: string | number; contacts?: Record<string, RawContact> }>(path),
    listSegments({ limit: 200 }).catch(() => ({ segments: [] as MauticSegment[] })),
  ]);
  const segMap = new Map(segs.segments.map((s) => [s.id, s.name]));
  return {
    total: Number(raw.total ?? 0),
    contacts: valuesOf(raw.contacts).map((c) => normaliseContact(c, segMap)),
  };
}

// ─── Segments ──────────────────────────────────────────────────────────────

type RawSegment = {
  id: number;
  name: string;
  alias: string;
  description?: string | null;
  isPublished: boolean;
  /** Some Mautic versions return this as a number, others as a string. */
  contactCount?: number | string | null;
};

function normaliseSegment(s: RawSegment): MauticSegment {
  return {
    id: s.id,
    name: s.name,
    alias: s.alias,
    description: s.description ?? null,
    contactCount: Number(s.contactCount ?? 0) || 0,
    isPublished: Boolean(s.isPublished),
  };
}

export async function listSegments(opts: { limit?: number } = {}): Promise<{
  total: number;
  segments: MauticSegment[];
}> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 100));
  const raw = await getJson<{
    total: string | number;
    lists?: Record<string, RawSegment>;
  }>(`/api/segments?${params}`);
  return {
    total: Number(raw.total ?? 0),
    segments: valuesOf(raw.lists).map(normaliseSegment),
  };
}

// ─── Emails ────────────────────────────────────────────────────────────────

type RawEmail = {
  id: number;
  name: string;
  subject: string;
  emailType?: string;
  isPublished?: boolean;
  sentCount?: number | string;
  readCount?: number | string;
  dateAdded?: string | null;
};

function normaliseEmail(e: RawEmail): MauticEmail {
  const sent = Number(e.sentCount ?? 0) || 0;
  const read = Number(e.readCount ?? 0) || 0;
  return {
    id: e.id,
    name: e.name,
    subject: e.subject,
    type: e.emailType ?? "list",
    sentCount: sent,
    readCount: read,
    readPercent: sent > 0 ? Math.round((read / sent) * 1000) / 10 : null,
    isPublished: Boolean(e.isPublished),
    createdAt: e.dateAdded ?? null,
  };
}

export async function listEmails(opts: { limit?: number } = {}): Promise<{
  total: number;
  emails: MauticEmail[];
}> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  params.set("orderBy", "date_added");
  params.set("orderByDir", "DESC");
  const raw = await getJson<{
    total: string | number;
    emails?: Record<string, RawEmail>;
  }>(`/api/emails?${params}`);
  return {
    total: Number(raw.total ?? 0),
    emails: valuesOf(raw.emails).map(normaliseEmail),
  };
}

// ─── Campaigns ─────────────────────────────────────────────────────────────

type RawCampaign = {
  id: number;
  name: string;
  description?: string | null;
  isPublished?: boolean;
  category?: { title: string } | null;
  contactCount?: number | string;
  dateAdded?: string | null;
};

function normaliseCampaign(c: RawCampaign): MauticCampaign {
  return {
    id: c.id,
    name: c.name,
    description: c.description ?? null,
    isPublished: Boolean(c.isPublished),
    category: c.category?.title ?? null,
    contactCount: Number(c.contactCount ?? 0) || 0,
    createdAt: c.dateAdded ?? null,
  };
}

export async function listCampaigns(opts: { limit?: number } = {}): Promise<{
  total: number;
  campaigns: MauticCampaign[];
}> {
  const params = new URLSearchParams();
  params.set("limit", String(opts.limit ?? 50));
  const raw = await getJson<{
    total: string | number;
    campaigns?: Record<string, RawCampaign>;
  }>(`/api/campaigns?${params}`);
  return {
    total: Number(raw.total ?? 0),
    campaigns: valuesOf(raw.campaigns).map(normaliseCampaign),
  };
}

export async function getCampaignRaw(id: number): Promise<Record<string, unknown>> {
  const raw = await getJson<{ campaign: Record<string, unknown> }>(
    `/api/campaigns/${id}`,
  );
  return raw.campaign ?? {};
}

/**
 * Toggles `isPublished` on a Mautic campaign. Mautic enforces this by
 * actually pausing event-execution, so it's the closest thing the public
 * API gives us to a "Start / Pause" button. The UI-level action is the
 * same toggle.
 */
export async function setCampaignPublished(
  id: number,
  published: boolean,
): Promise<MauticCampaign> {
  const r = await fetcher(`/api/campaigns/${id}/edit`, {
    method: "PATCH",
    json: { isPublished: published },
  });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new AppApiError("mautic", r.status, `/api/campaigns/${id}/edit`, t);
  }
  const j = (await r.json()) as { campaign: RawCampaign };
  return normaliseCampaign(j.campaign);
}

/**
 * Clones a Mautic campaign into a new draft. Mautic doesn't expose a
 * native /clone endpoint in its public API, so we GET the source, strip
 * the read-only fields, and POST it back to /api/campaigns/new with a
 * fresh name and `isPublished: false` (always start the copy as a draft —
 * accidentally re-broadcasting to the audience would be very bad).
 *
 * Events / decisions / actions: the GET endpoint returns these as part of
 * the campaign payload on Mautic 4+, and `POST /api/campaigns/new`
 * accepts the same shape, so the clone preserves the full flow tree. On
 * older Mautic versions (where events live behind separate endpoints)
 * the clone falls back to a metadata-only copy and the user is asked to
 * recreate the flow manually — surfaced via the `eventsCopied` flag.
 */
export async function cloneCampaign(
  id: number,
  opts: { newName?: string } = {},
): Promise<{ campaign: MauticCampaign; eventsCopied: boolean }> {
  const src = await getCampaignRaw(id);

  const stripReadOnly = (obj: Record<string, unknown>) => {
    const out: Record<string, unknown> = { ...obj };
    delete out.id;
    delete out.dateAdded;
    delete out.dateModified;
    delete out.createdBy;
    delete out.createdByUser;
    delete out.modifiedBy;
    delete out.modifiedByUser;
    delete out.contactCount;
    delete out.checkedOut;
    delete out.checkedOutBy;
    delete out.checkedOutByUser;
    return out;
  };

  const sourceName =
    typeof src.name === "string" && src.name ? src.name : `Campaign ${id}`;
  const newName = opts.newName?.trim() || `${sourceName} (Kopie)`;

  const events = Array.isArray(src.events)
    ? (src.events as Array<Record<string, unknown>>).map((e) => stripReadOnly(e))
    : [];
  const lists = Array.isArray(src.lists)
    ? (src.lists as Array<Record<string, unknown>>).map((l) => ({
        id: typeof l.id === "number" ? l.id : undefined,
      }))
    : [];
  const forms = Array.isArray(src.forms)
    ? (src.forms as Array<Record<string, unknown>>).map((f) => ({
        id: typeof f.id === "number" ? f.id : undefined,
      }))
    : [];

  const payload: Record<string, unknown> = {
    name: newName,
    description: typeof src.description === "string" ? src.description : null,
    isPublished: false,
    allowRestart: src.allowRestart ?? false,
    category:
      src.category && typeof src.category === "object" && "id" in src.category
        ? (src.category as { id: number }).id
        : null,
  };
  if (events.length > 0) payload.events = events;
  if (lists.length > 0) payload.lists = lists;
  if (forms.length > 0) payload.forms = forms;

  const r = await fetcher("/api/campaigns/new", { method: "POST", json: payload });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    // If the events payload was rejected (older Mautic), retry without it
    // so admins at least get a metadata copy to start from.
    if (events.length > 0) {
      const retry = await fetcher("/api/campaigns/new", {
        method: "POST",
        json: { ...payload, events: undefined, lists: undefined, forms: undefined },
      });
      if (retry.ok) {
        const j = (await retry.json()) as { campaign: RawCampaign };
        return { campaign: normaliseCampaign(j.campaign), eventsCopied: false };
      }
    }
    throw new AppApiError("mautic", r.status, "/api/campaigns/new", t);
  }
  const j = (await r.json()) as { campaign: RawCampaign };
  return { campaign: normaliseCampaign(j.campaign), eventsCopied: events.length > 0 };
}

// ─── Aggregated overview for dashboard tiles ───────────────────────────────

export async function getOverview(): Promise<MarketingOverview> {
  const [contacts, segments, campaigns, emails] = await Promise.all([
    listContacts({ limit: 1 }).catch(() => ({ total: 0, contacts: [] })),
    listSegments({ limit: 1 }).catch(() => ({ total: 0, segments: [] })),
    listCampaigns({ limit: 100 }).catch(() => ({ total: 0, campaigns: [] })),
    listEmails({ limit: 100 }).catch(() => ({ total: 0, emails: [] })),
  ]);

  const recentSends = emails.emails.reduce((acc, e) => acc + (e.sentCount ?? 0), 0);
  const activeCampaigns = campaigns.campaigns.filter((c) => c.isPublished).length;
  const publishedEmails = emails.emails.filter((e) => e.isPublished).length;

  // "Recent" contacts = roughly count of those modified in last 7d. Mautic
  // doesn't expose this as a single counter so we approximate via the first
  // page sorted by last_active. Good enough for a dashboard tile; the real
  // truth lives in the Mautic UI.
  let recentContacts = 0;
  try {
    const recent = await listContacts({ limit: 100 });
    const sevenDaysAgo = Date.now() - 1000 * 60 * 60 * 24 * 7;
    recentContacts = recent.contacts.filter((c) =>
      c.lastActive ? new Date(c.lastActive).getTime() >= sevenDaysAgo : false,
    ).length;
  } catch {
    recentContacts = 0;
  }

  return {
    contacts: { total: contacts.total, recent: recentContacts },
    segments: segments.total,
    campaigns: { total: campaigns.total, active: activeCampaigns },
    emails: { total: emails.total, published: publishedEmails },
    recentSends,
    publicUrl: PUBLIC,
  };
}

// ─── Mutations (used by Twenty → Mautic sync + manual contact add) ─────────

export async function upsertContact(input: {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  city?: string;
  country?: string;
  tags?: string[];
}): Promise<MauticContact> {
  const body = {
    email: input.email,
    firstname: input.firstName ?? "",
    lastname: input.lastName ?? "",
    company: input.company ?? "",
    city: input.city ?? "",
    country: input.country ?? "",
    tags: input.tags ?? [],
  };
  const r = await fetcher("/api/contacts/new", { method: "POST", json: body });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    throw new AppApiError("mautic", r.status, "/api/contacts/new", t);
  }
  const j = (await r.json()) as { contact: RawContact };
  return normaliseContact(j.contact, new Map());
}

export async function addContactToSegment(
  contactId: number,
  segmentId: number,
): Promise<void> {
  const r = await fetcher(
    `/api/segments/${segmentId}/contact/${contactId}/add`,
    { method: "POST" },
  );
  if (!r.ok && r.status !== 200) {
    const t = await r.text().catch(() => "");
    throw new AppApiError(
      "mautic",
      r.status,
      `/api/segments/${segmentId}/contact/${contactId}/add`,
      t,
    );
  }
}

// ─── Settings panel ────────────────────────────────────────────────────────

export type MauticSettings = {
  /** True iff `/api/contacts` returns 2xx with the configured Basic-Auth. */
  apiReachable: boolean;
  apiUser: string;
  /** Public Mautic URL (https://marketing.…) for deep links. */
  publicUrl: string;
  /** Internal compose URL — mostly informational. */
  internalUrl: string;
  totals: {
    contacts: number;
    segments: number;
    campaigns: number;
    emails: number;
  };
  /** Top-N segments with their contact count, used as a quick overview. */
  topSegments: Array<{
    id: number;
    name: string;
    contactCount: number;
    isPublished: boolean;
  }>;
  /** First couple of system mail-channel configs — surfaces sender details. */
  channels: Array<{
    type: string;
    fromName?: string;
    fromAddress?: string;
    transport?: string;
  }>;
  /** Deep-links the settings UI exposes as buttons. */
  adminLinks: {
    apiCredentials: string;
    users: string;
    emailConfig: string;
    segments: string;
    campaigns: string;
    forms: string;
  };
  /** Plain-language reasons collected during the probe (warnings + tips). */
  warnings: string[];
};

export async function getMauticSettings(): Promise<MauticSettings> {
  const warnings: string[] = [];
  let apiReachable = false;
  let totals = { contacts: 0, segments: 0, campaigns: 0, emails: 0 };
  let topSegments: MauticSettings["topSegments"] = [];

  if (!isMauticConfigured()) {
    warnings.push(
      "MAUTIC_API_USERNAME / MAUTIC_API_TOKEN sind nicht gesetzt – API-Zugriff aus dem Portal ist deaktiviert.",
    );
  } else {
    try {
      const [contacts, segments, campaigns, emails] = await Promise.all([
        listContacts({ limit: 1 }),
        listSegments({ limit: 100 }),
        listCampaigns({ limit: 1 }),
        listEmails({ limit: 1 }),
      ]);
      totals = {
        contacts: contacts.total,
        segments: segments.total,
        campaigns: campaigns.total,
        emails: emails.total,
      };
      topSegments = segments.segments
        .slice()
        .sort((a, b) => b.contactCount - a.contactCount)
        .slice(0, 8)
        .map((s) => ({
          id: s.id,
          name: s.name,
          contactCount: s.contactCount,
          isPublished: s.isPublished,
        }));
      apiReachable = true;
    } catch (e) {
      warnings.push(
        "API-Probe fehlgeschlagen: " +
          (e instanceof Error ? e.message : String(e)),
      );
    }
  }

  // We can't reliably introspect Mautic's email transport without admin-only
  // calls, so leave channels empty for now and surface a hint.
  const channels: MauticSettings["channels"] = [];
  if (apiReachable) {
    warnings.push(
      "Versand-Transport (SMTP/Mailgun/…) wird in Mautic unter Settings → Configuration → Email Settings gepflegt.",
    );
  }

  return {
    apiReachable,
    apiUser: API_USER || "—",
    publicUrl: PUBLIC,
    internalUrl: INTERNAL,
    totals,
    topSegments,
    channels,
    adminLinks: {
      apiCredentials: "/s/config/edit#leadconfig",
      users: "/s/users",
      emailConfig: "/s/config/edit#emailconfig",
      segments: "/s/segments",
      campaigns: "/s/campaigns",
      forms: "/s/forms",
    },
    warnings,
  };
}
