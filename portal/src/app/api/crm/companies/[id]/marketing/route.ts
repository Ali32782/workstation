import { NextRequest, NextResponse } from "next/server";
import { resolveCrmSession } from "@/lib/crm/session";
import { getCompany, listPeople } from "@/lib/crm/twenty";
import {
  isMauticConfigured,
  listContactsByDomain,
  findContactByEmail,
  upsertContact,
  mauticPublicUrl,
} from "@/lib/marketing/mautic";
import type { MauticContact } from "@/lib/marketing/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Per-company Marketing snapshot for the CRM company sidebar.
 *
 *   GET  → returns existing Mautic contacts that match the company
 *          (by email-domain or by company-name fallback) plus segment +
 *          activity stats and a deep-link to the equivalent search in
 *          Mautic.
 *   POST → upserts every Twenty Person of the company into Mautic (one
 *          contact per primary email). Used for the "Sync Personen → Mautic"
 *          action button. Returns the resulting list of Mautic contacts.
 */

async function resolveCompany(req: NextRequest, id: string) {
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
        { error: r.message, code: "not_configured" },
        { status: 503 },
      ),
    };
  }
  const company = await getCompany(r.session.tenant, id);
  if (!company) {
    return { err: NextResponse.json({ error: "not_found" }, { status: 404 }) };
  }
  return { session: r.session, company };
}

function pickDomain(c: { domain: string | null; generalEmail: string | null }) {
  if (c.domain) return c.domain;
  if (c.generalEmail && c.generalEmail.includes("@")) {
    return c.generalEmail.split("@")[1] ?? null;
  }
  return null;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await resolveCompany(req, id);
  if ("err" in r) return r.err;
  const { company } = r;

  if (!isMauticConfigured()) {
    return NextResponse.json(
      {
        configured: false,
        contacts: [],
        message:
          "Mautic ist nicht konfiguriert (MAUTIC_API_USERNAME/_TOKEN fehlen).",
      },
      { status: 200 },
    );
  }

  const domain = pickDomain(company);
  let contacts: MauticContact[] = [];
  try {
    if (domain) {
      contacts = await listContactsByDomain(domain, 100);
    }
  } catch (e) {
    return NextResponse.json(
      {
        configured: true,
        contacts: [],
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 502 },
    );
  }

  const segments = new Map<string, number>();
  let totalPoints = 0;
  let lastActivity: string | null = null;
  for (const c of contacts) {
    totalPoints += c.points;
    for (const s of c.segments) {
      segments.set(s, (segments.get(s) ?? 0) + 1);
    }
    if (c.lastActive) {
      if (!lastActivity || c.lastActive > lastActivity) {
        lastActivity = c.lastActive;
      }
    }
  }

  const mauticUrl = mauticPublicUrl();
  const searchHref = domain
    ? `${mauticUrl}/s/contacts?search=${encodeURIComponent(`email:@${domain}`)}`
    : `${mauticUrl}/s/contacts?search=${encodeURIComponent(company.name)}`;

  return NextResponse.json({
    configured: true,
    domain,
    company: { id: company.id, name: company.name },
    contacts,
    stats: {
      total: contacts.length,
      totalPoints,
      lastActivity,
      segments: [...segments.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count),
    },
    deepLink: searchHref,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const r = await resolveCompany(req, id);
  if ("err" in r) return r.err;
  const { session, company } = r;

  if (!isMauticConfigured()) {
    return NextResponse.json(
      {
        error:
          "Mautic ist nicht konfiguriert. Bitte MAUTIC_API_USERNAME/_TOKEN setzen.",
        code: "not_configured",
      },
      { status: 503 },
    );
  }

  let people;
  try {
    const result = await listPeople(session.tenant, { companyId: id, limit: 100 });
    people = result.items;
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }

  const eligible = people.filter((p) => p.email && p.email.includes("@"));
  if (eligible.length === 0) {
    return NextResponse.json(
      {
        synced: 0,
        skipped: people.length,
        message:
          "Keine Personen mit Primär-Email gefunden – bitte zuerst im CRM ergänzen.",
      },
      { status: 200 },
    );
  }

  const synced: MauticContact[] = [];
  const errors: { email: string; message: string }[] = [];
  for (const p of eligible) {
    try {
      const existing = await findContactByEmail(p.email!).catch(() => null);
      if (existing) {
        synced.push(existing);
        continue;
      }
      const created = await upsertContact({
        email: p.email!,
        firstName: p.firstName ?? undefined,
        lastName: p.lastName ?? undefined,
        company: company.name,
        city: company.address?.addressCity ?? undefined,
        country: company.address?.addressCountry ?? undefined,
        tags: ["crm-sync", `company:${company.name.toLowerCase()}`],
      });
      synced.push(created);
    } catch (e) {
      errors.push({
        email: p.email!,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return NextResponse.json({
    synced: synced.length,
    skipped: people.length - eligible.length,
    contacts: synced,
    errors,
  });
}
