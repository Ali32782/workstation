import "server-only";
import { ImapFlow } from "imapflow";
import { derivePassword } from "@/lib/derived-passwords";
import { tFor, type Locale } from "@/lib/i18n/messages";
import type { PulseModuleResult } from "./types";

const IMAP_HOST = process.env.IMAP_HOST ?? "imap.migadu.com";
const IMAP_PORT = Number(process.env.IMAP_PORT ?? 993);

/**
 * Counts unread messages in the user's INBOX via IMAP.
 *
 * Strategy: log in with the deterministic derived mail-password (same one
 * the SnappyMail bridge uses) and query INBOX for unseen messages.
 * Only mailboxes provisioned through our onboarding (or `provision-test-
 * mailboxes.mjs`) accept this password.
 */
export async function getMailPulse(
  email: string,
  locale: Locale,
): Promise<PulseModuleResult> {
  let client: ImapFlow | null = null;
  try {
    const password = derivePassword("mail", email);
    client = new ImapFlow({
      host: IMAP_HOST,
      port: IMAP_PORT,
      secure: true,
      auth: { user: email, pass: password },
      logger: false,
      // Migadu sometimes rejects fast reconnects; tighten timeouts.
      socketTimeout: 8000,
      greetingTimeout: 5000,
      connectionTimeout: 8000,
    });
    // Without an 'error' listener ImapFlow promotes socket errors into
    // uncaughtExceptions which kill the Node process.
    client.on("error", () => {
      /* swallowed — surfaced through the awaited connect/status promise */
    });

    await client.connect();
    const status = await client.status("INBOX", { unseen: true, messages: true });
    const unseen = status.unseen ?? 0;
    const total = status.messages ?? 0;

    return {
      ok: true,
      stats: [
        {
          key: "mail-unread",
          label: tFor(locale, "pulse.mail.unread"),
          value: String(unseen),
          tone: unseen > 0 ? "info" : "success",
          href: "/api/webmail/sso",
          hint:
            total > 0
              ? tFor(locale, "pulse.mail.hintTotal").replace(
                  "{total}",
                  String(total),
                )
              : tFor(locale, "pulse.mail.inboxEmpty"),
        },
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      error: msg,
      fallbackStats: [
        {
          key: "mail-unread",
          label: tFor(locale, "nav.mail"),
          value: "—",
          tone: "neutral",
          href: "/api/webmail/sso",
          hint: tFor(locale, "pulse.mail.offlineHint"),
        },
      ],
    };
  } finally {
    try {
      await client?.logout();
    } catch {
      // ignore
    }
  }
}
