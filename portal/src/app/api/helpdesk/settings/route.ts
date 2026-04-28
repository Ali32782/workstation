import { NextRequest, NextResponse } from "next/server";
import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import { getHelpdeskSettings } from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Helpdesk settings overview for the workspace's gear / settings panel.
 *
 * Returns configuration for the settings UI:
 *   - tenant Zammad groups (+ counts, default email / signature ids)
 *   - email addresses (sender candidates)
 *   - email channels (IMAP/SMTP — read-only summary in the portal)
 *   - admin deep-links for advanced Zammad-only tasks
 *
 * Mutations for groups, members, and sender addresses go through dedicated
 * PATCH routes under `/api/helpdesk/settings/...`. Channel credentials and
 * other Zammad-admin surface area stay in Zammad (security + API surface).
 */
export async function GET(req: NextRequest) {
  const ws = req.nextUrl.searchParams.get("ws");
  const r = await resolveHelpdeskSession(ws);
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
    const settings = await getHelpdeskSettings(r.session.tenant);
    return NextResponse.json(settings);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
