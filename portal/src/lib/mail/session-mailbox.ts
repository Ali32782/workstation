import "server-only";
import type { Session } from "next-auth";

/**
 * Resolve which IMAP/SMTP mailbox the current session should connect to.
 *
 * Priority:
 *   1. `session.user.mailbox` — set by the auth callback from the Keycloak
 *      `mailbox` user attribute. Lets us decouple "primary email used as
 *      identity" (e.g. ali.peters@kineo.swiss, hosted on Microsoft Exchange)
 *      from "mailbox the portal speaks IMAP/SMTP to" (e.g. ali@kineo360.work
 *      on Migadu).
 *   2. `session.user.email` — fallback for users whose primary email already
 *      lives on the portal's mail provider.
 *
 * Returns null if there's no usable mailbox — callers should treat this
 * as "unauthenticated for mail" and respond with 401.
 */
export function resolveSessionMailbox(session: Session | null): string | null {
  const mailbox = session?.user?.mailbox?.trim();
  if (mailbox && mailbox.includes("@")) return mailbox.toLowerCase();
  const email = session?.user?.email?.trim();
  if (email && email.includes("@")) return email.toLowerCase();
  return null;
}
