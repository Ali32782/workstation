import { NextRequest, NextResponse } from "next/server";
import { findPersonByEmail } from "@/lib/crm/twenty";
import { resolveCrmSession } from "@/lib/crm/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Resolve ticket customer e-mail to a Twenty person (same workspace) and
 * return a shareable Twenty URL when possible.
 */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const email = req.nextUrl.searchParams.get("email")?.trim();
  if (!email) {
    return NextResponse.json({ person: null, personUrl: null, crmConfigured: true });
  }

  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json({
      person: null,
      personUrl: null,
      crmConfigured: false,
      message: r.message,
    });
  }

  try {
    const person = await findPersonByEmail(r.session.tenant, email);
    const base = (process.env.TWENTY_URL ?? "https://crm.kineo360.work").replace(/\/$/, "");
    const template = process.env.TWENTY_PERSON_URL_TEMPLATE?.trim();
    const personUrl = person
      ? template
        ? template.replace(/\{\{\s*id\s*\}\}/gi, person.id)
        : `${base}/object/person/${person.id}`
      : null;
    return NextResponse.json({ person, personUrl, crmConfigured: true });
  } catch (e) {
    console.error("[/api/helpdesk/crm-person]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
