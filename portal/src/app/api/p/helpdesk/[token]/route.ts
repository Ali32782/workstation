import { NextRequest, NextResponse } from "next/server";
import { getTicket } from "@/lib/helpdesk/zammad";
import { getHelpdeskTenant } from "@/lib/helpdesk/config";
import { verifyPortalToken } from "@/lib/helpdesk/portal-token";
import { rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public, no-auth API for the customer-facing helpdesk portal page.
 *
 * The token in the URL is the only thing protecting access — it's a
 * signed HMAC envelope that encodes (workspace, ticketId, expiresAt).
 * We rotate by changing HELPDESK_PORTAL_SECRET, which kicks every
 * outstanding link.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;

  // Rate-limit: 30 GETs per minute per IP+token combo. Plenty for a real
  // customer polling the page; chokes brute-force token guessers regardless
  // of how cheap a single round-trip is.
  const limited = rateLimitResponse(
    req,
    { scope: "p-helpdesk-get", windowMs: 60_000, max: 30 },
    `${req.headers.get("x-forwarded-for") ?? "ip"}:${token.slice(0, 8)}`,
  );
  if (limited) return limited;

  const claim = verifyPortalToken(token);
  if (!claim) {
    return NextResponse.json(
      { error: "Link ungültig oder abgelaufen." },
      { status: 401 },
    );
  }
  const tenant = getHelpdeskTenant(claim.workspace);
  if (!tenant) {
    return NextResponse.json(
      { error: "Workspace nicht konfiguriert." },
      { status: 503 },
    );
  }
  try {
    const ticket = await getTicket(tenant, claim.ticketId);
    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket nicht gefunden." },
        { status: 404 },
      );
    }
    // Customers should only see public articles, never internal notes.
    const visibleArticles = ticket.articles.filter((a) => !a.internal);
    return NextResponse.json({
      ticket: { ...ticket, articles: visibleArticles },
      expiresAt: claim.expiresAt,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
