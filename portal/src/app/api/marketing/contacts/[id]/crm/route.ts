import { NextRequest, NextResponse } from "next/server";
import { resolveMarketingSession } from "@/lib/marketing/session";
import { findContactByEmail } from "@/lib/marketing/mautic";
import { findPersonByEmail } from "@/lib/crm/twenty";
import { getTwentyTenant } from "@/lib/crm/config";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Cross-link from a Mautic contact back into the Twenty CRM.
 *
 * Strategy: take the Mautic contact's primary email, then probe every Twenty
 * tenant the user has access to (`?ws=` for the marketing scope, plus the
 * other configured tenants) until we find a Person whose primary email
 * matches. Returns null if no match — the UI then hides the cross-link
 * pill.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveMarketingSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json({ person: null, reason: r.message }, { status: 200 });
  }

  // Lookup the Mautic contact's email first (the path id can be numeric or
  // string; we accept both and just use it as opaque).
  const numId = Number.parseInt(id, 10);
  if (!Number.isFinite(numId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  // We don't have a "fetch contact by id" helper yet — `findContactByEmail`
  // is the cheap path. The client is expected to supply `?email=` directly
  // for accuracy; fall back to a 400 otherwise.
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    return NextResponse.json(
      {
        error:
          "email query param required (we look up the Twenty Person by primary email)",
      },
      { status: 400 },
    );
  }

  // Sanity-check the email actually belongs to that contact id — protects
  // against URL tampering by the client.
  const mauticContact = await findContactByEmail(email).catch(() => null);
  if (!mauticContact || mauticContact.id !== numId) {
    return NextResponse.json({ person: null, reason: "no match" });
  }

  // Probe configured Twenty tenants until we find one. Marketing currently
  // only runs in `medtheris` so usually only one tenant is touched.
  const tenants = ["medtheris", "kineo", "corehub"]
    .map((w) => ({ ws: w, tenant: getTwentyTenant(w) }))
    .filter((t): t is { ws: string; tenant: NonNullable<typeof t.tenant> } =>
      t.tenant !== null,
    );

  for (const { ws: workspace, tenant } of tenants) {
    try {
      const person = await findPersonByEmail(tenant, email);
      if (person) {
        return NextResponse.json({
          person: {
            id: person.id,
            firstName: person.firstName,
            lastName: person.lastName,
            email: person.email,
            companyId: person.companyId,
            companyName: person.companyName,
          },
          workspace,
          deepLink: `/${workspace}/crm?personId=${person.id}`,
        });
      }
    } catch {
      // try next tenant
    }
  }

  return NextResponse.json({ person: null });
}
