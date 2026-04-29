import { NextRequest, NextResponse } from "next/server";
import { resolveCrmSession } from "@/lib/crm/session";
import { isMauticConfigured, listContacts } from "@/lib/marketing/mautic";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * GET /api/crm/companies/mautic-status?ws=…
 *
 * Returns a {domain → contactCount} map for the company list, so the
 * CRM frontend can render a small "im Funnel"-Chip on every card without
 * doing N round-trips to Mautic. We could also accept a `domains`
 * query-param to scope the lookup, but in practice listing all contacts
 * once and bucketing client-side is much cheaper for the Triage view
 * (which routinely shows 50+ companies).
 *
 * Implementation: fetch a generous slice (1000) of Mautic contacts and
 * bucket by email-domain. Mautic's Triage/MedTheris workspace today has
 * ~few-hundred contacts so this is well within budget; if the contact
 * count grows past ~5k we'll switch to a paginated bucketing job that
 * runs nightly and caches in Redis.
 */
export async function GET(req: NextRequest) {
  if (!isMauticConfigured()) {
    return NextResponse.json({
      buckets: {},
      details: {},
      total: 0,
      code: "not_configured",
    });
  }
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  // not_configured isn't fatal here — we still return an empty bucket map
  // so the CRM page doesn't error out for non-MedTheris workspaces.
  if (r.kind === "not_configured") {
    return NextResponse.json({ buckets: {}, details: {}, total: 0 });
  }

  try {
    const { contacts } = await listContacts({ limit: 1000 });
    const buckets: Record<string, number> = {};
    const details: Record<
      string,
      { count: number; segments: string[]; stages: string[] }
    > = {};
    for (const c of contacts) {
      const email = (c.email ?? "").toLowerCase().trim();
      const at = email.indexOf("@");
      if (at < 0) continue;
      const domain = email.slice(at + 1).replace(/^www\./, "");
      if (!domain) continue;
      buckets[domain] = (buckets[domain] ?? 0) + 1;

      const segList = [...(c.segments ?? [])].filter(Boolean);
      const stageName = (c.stage ?? "").trim();
      let row = details[domain];
      if (!row) {
        row = { count: 0, segments: [], stages: [] };
        details[domain] = row;
      }
      row.count += 1;
      for (const s of segList) {
        if (!row.segments.includes(s)) row.segments.push(s);
      }
      if (stageName && !row.stages.includes(stageName)) {
        row.stages.push(stageName);
      }
    }
    for (const d of Object.values(details)) {
      d.segments.sort();
      d.stages.sort();
    }
    return NextResponse.json({
      buckets,
      details,
      total: contacts.length,
      // The cap is leaky — surface it so the UI can warn if we ever hit it.
      truncated: contacts.length >= 1000,
    });
  } catch (e) {
    console.error("[/api/crm/companies/mautic-status] failed:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
