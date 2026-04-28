import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getHelpdeskTenant } from "@/lib/helpdesk/config";
import { verifyPortalToken } from "@/lib/helpdesk/portal-token";
import { getTicket } from "@/lib/helpdesk/zammad";
import { CustomerPortalClient } from "./CustomerPortalClient";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public, magic-link-gated customer portal view for a single ticket.
 *
 * Lives at `/p/helpdesk/<token>` and is intentionally not part of the
 * authenticated `/[workspace]/` namespace — customers don't have portal
 * accounts. The signed token in the URL encodes (workspace, ticketId,
 * expiresAt); we verify it server-side, fetch the ticket via the bridge
 * token, and hand a sanitised snapshot to the client component.
 */

export const metadata: Metadata = {
  title: "Ticket-Portal",
  robots: { index: false, follow: false },
};

export default async function HelpdeskPortalPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const claim = verifyPortalToken(token);
  if (!claim) {
    return (
      <ExpiredOrInvalid
        title="Link ungültig oder abgelaufen"
        hint="Bitte fordere bei deinem Ansprechpartner einen neuen Link an."
      />
    );
  }

  const tenant = getHelpdeskTenant(claim.workspace);
  if (!tenant) {
    return (
      <ExpiredOrInvalid
        title="Workspace nicht erreichbar"
        hint="Der zuständige Helpdesk ist gerade nicht verfügbar."
      />
    );
  }

  let ticket;
  try {
    ticket = await getTicket(tenant, claim.ticketId);
  } catch {
    ticket = null;
  }
  if (!ticket) return notFound();

  // Strip internal notes — customers must never see them.
  const visibleArticles = ticket.articles.filter((a) => !a.internal);

  return (
    <CustomerPortalClient
      token={token}
      ticket={{ ...ticket, articles: visibleArticles }}
      expiresAt={claim.expiresAt}
      workspace={claim.workspace}
    />
  );
}

function ExpiredOrInvalid({ title, hint }: { title: string; hint: string }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-bg-base p-6">
      <div className="max-w-md w-full rounded-lg border border-stroke-1 bg-bg-elevated p-6 text-center">
        <h1 className="text-[15px] font-semibold mb-2">{title}</h1>
        <p className="text-[12.5px] text-text-tertiary leading-relaxed">{hint}</p>
      </div>
    </main>
  );
}
