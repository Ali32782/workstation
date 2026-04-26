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
