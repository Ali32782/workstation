import { NextRequest, NextResponse } from "next/server";
import { addArticle, getTicket } from "@/lib/helpdesk/zammad";
import { getHelpdeskTenant } from "@/lib/helpdesk/config";
import { verifyPortalToken } from "@/lib/helpdesk/portal-token";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BODY_BYTES = 32 * 1024;

/**
 * Public reply endpoint — the customer types in the magic-link page and
 * we append the message as a non-internal article on the ticket. We use
 * Zammad's `X-On-Behalf-Of` header so the post is attributed to the
 * actual customer (resolved from the ticket's `customerEmail`), not to
 * the bridge admin.
 *
 * Strict guardrails:
 *   - body length capped at ~32 KiB
 *   - never accepts `internal: true` from the wire
 *   - never lets the customer change subject / type beyond `note`
 */
export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
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

  let body: { body?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const text = typeof body.body === "string" ? body.body.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Nachricht ist leer." }, { status: 400 });
  }
  if (Buffer.byteLength(text, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Nachricht zu lang." }, { status: 413 });
  }

  try {
    const ticket = await getTicket(tenant, claim.ticketId);
    if (!ticket) {
      return NextResponse.json(
        { error: "Ticket nicht gefunden." },
        { status: 404 },
      );
    }
    if (!ticket.customerEmail) {
      return NextResponse.json(
        {
          error:
            "Ticket hat keine Kunden-Adresse hinterlegt — bitte Support kontaktieren.",
        },
        { status: 422 },
      );
    }
    const article = await addArticle(tenant, claim.ticketId, {
      body: text,
      type: "note",
      internal: false,
      onBehalfOf: ticket.customerEmail,
    });
    return NextResponse.json({ ok: true, article });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 502 },
    );
  }
}
