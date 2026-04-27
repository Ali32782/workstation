import { NextRequest, NextResponse } from "next/server";
import { resolveHelpdeskSession } from "@/lib/helpdesk/session";
import { getHelpdeskSettings } from "@/lib/helpdesk/zammad";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Helpdesk settings overview for the workspace's gear / settings panel.
 *
 * Returns the read-only configuration we surface in the portal:
 *   - the tenant's Zammad groups (active flag, member counts, default email
 *     and signature ids)
 *   - all email addresses configured in Zammad (sender candidates)
 *   - the email-area channels (inbound IMAP / outbound SMTP options)
 *   - admin deep-links into Zammad's own management pages
 *
 * Editing groups, channels and email addresses happens in Zammad itself for
 * now — see the deep-link buttons in the UI. A full admin proxy in the
 * portal is tracked as a follow-up item.
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
