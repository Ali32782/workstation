import { NextRequest, NextResponse } from "next/server";
import { resolveCrmSession } from "@/lib/crm/session";
import { getCrmSettings } from "@/lib/crm/twenty";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Read-only CRM settings overview, mirrors `/api/helpdesk/settings`.
 * Returns API status, tenant info, member list, pipeline stages, lead
 * sources and admin deep-links.  Editing happens in Twenty itself for now.
 */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveCrmSession(ws);
  if (r.kind === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (r.kind === "forbidden") {
    return NextResponse.json({ error: r.message }, { status: 403 });
  }
  if (r.kind === "not_configured") {
    return NextResponse.json(
      { error: r.message, code: "not_configured", workspace: r.workspace },
      { status: 503 },
    );
  }

  try {
    const settings = await getCrmSettings(r.session.tenant);
    return NextResponse.json({ workspace: r.session.workspace, ...settings });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
