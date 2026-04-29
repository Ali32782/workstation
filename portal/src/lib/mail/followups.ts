import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { derivePassword } from "@/lib/derived-passwords";

const HOST = process.env.IMAP_HOST ?? "imap.migadu.com";
const PORT = Number(process.env.IMAP_PORT ?? 993);

/**
 * Outgoing mails that haven't received a reply yet.
 *
 * Strategy:
 *   1. Pull the last ~30 days of mail from the SENT folder.
 *   2. Index the per-message Message-IDs we sent.
 *   3. Pull recent INBOX messages, build a set of every Message-ID
 *      that any of them references (via In-Reply-To + References
 *      headers; we don't trust subject matching alone — newsletters
 *      reuse subjects).
 *   4. Anything in (1) whose Message-ID is *not* in (3) and is older
 *      than `staleDays` is reported as a follow-up candidate.
 *
 * The implementation streams headers only (no bodies), so even a
 * large SENT folder costs <1.5 s on the typical Migadu round-trip.
 *
 * Caveats we accept (instead of trying to be too clever):
 *   - Replies that arrive via a DIFFERENT mailbox/account than the
 *     one we're checking won't be detected. The user can mark them
 *     "Done" via the dashboard card to suppress the reminder.
 *   - Auto-responses ("Out-of-Office") count as replies, which is
 *     usually OK — those are a hint to follow up *later*, not now.
 *   - We only look in INBOX. If the user has a complex
 *     server-side filter that immediately moves replies elsewhere,
 *     they'll see false positives.
 */

export type Followup = {
  uid: number;
  messageId: string;
  subject: string;
  to: Array<{ name?: string; address: string }>;
  sentAt: string;
  daysSinceSent: number;
  /** SENT folder path — needed for the "Open" deeplink. */
  folder: string;
};

const SENT_LOOKBACK_DAYS = 30;
const REPLY_LOOKBACK_DAYS = 35;

async function withClient<T>(
  email: string,
  fn: (c: ImapFlow) => Promise<T>,
): Promise<T> {
  const c = new ImapFlow({
    host: HOST,
    port: PORT,
    secure: true,
    auth: { user: email, pass: derivePassword("mail", email) },
    logger: false,
    socketTimeout: 20000,
    greetingTimeout: 5000,
    connectionTimeout: 8000,
  });
  c.on("error", () => {});
  await c.connect();
  try {
    return await fn(c);
  } finally {
    try {
      await c.logout();
    } catch {
      /* ignore */
    }
  }
}

function parseAddressList(envTo: unknown): Followup["to"] {
  const arr = Array.isArray(envTo) ? envTo : [];
  return arr
    .map((a) => {
      const e = a as { name?: string | null; address?: string | null };
      return {
        name: e.name ?? undefined,
        address: (e.address ?? "").trim(),
      };
    })
    .filter((a) => a.address.length > 0);
}

function extractMessageIds(value: string | null | undefined): string[] {
  if (!value) return [];
  // Message-IDs are angle-bracketed; multiple IDs separated by whitespace.
  const out: string[] = [];
  const re = /<([^>\s]+)>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    if (m[1]) out.push(m[1].toLowerCase());
  }
  return out;
}

async function findFolderByRole(
  c: ImapFlow,
  role: "sent" | "inbox",
): Promise<string> {
  if (role === "inbox") return "INBOX";
  const list = await c.list();
  const sent = list.find((entry) => {
    const flags = entry.flags ? Array.from(entry.flags) : [];
    if (entry.specialUse === "\\Sent") return true;
    if (flags.includes("\\Sent")) return true;
    return /^(sent|gesendet|sent[ -](items|mail|messages))$/i.test(
      entry.name ?? "",
    );
  });
  return sent?.path ?? "Sent";
}

export async function listFollowups(
  email: string,
  staleDays: number,
): Promise<{ items: Followup[]; sentChecked: number }> {
  const sinceSent = new Date(
    Date.now() - SENT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const sinceReply = new Date(
    Date.now() - REPLY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  );
  const cutoffStale = new Date(
    Date.now() - staleDays * 24 * 60 * 60 * 1000,
  );

  return withClient(email, async (c) => {
    const sentFolder = await findFolderByRole(c, "sent");

    // 1) Sent index
    const sentLock = await c.getMailboxLock(sentFolder);
    type SentEntry = {
      uid: number;
      messageId: string;
      sentAt: Date;
      subject: string;
      to: Followup["to"];
    };
    const sent: SentEntry[] = [];
    try {
      const uids = await c.search({ since: sinceSent }, { uid: true });
      if (uids && uids.length > 0) {
        for await (const m of c.fetch(
          uids,
          { uid: true, envelope: true, internalDate: true },
          { uid: true },
        )) {
          const env = (m as FetchMessageObject).envelope;
          const messageId = (env?.messageId ?? "").replace(/^<|>$/g, "").toLowerCase();
          if (!messageId) continue;
          const sentAt = new Date(
            env?.date ??
              (m as FetchMessageObject).internalDate ??
              Date.now(),
          );
          // Drop self-mails (cc:me / drafts that landed via Bcc) — the
          // recipient list is normalised to *external* addresses.
          const to = parseAddressList(env?.to).filter(
            (a) => a.address.toLowerCase() !== email.toLowerCase(),
          );
          if (to.length === 0) continue;
          sent.push({
            uid: m.uid,
            messageId,
            sentAt,
            subject: env?.subject ?? "(kein Betreff)",
            to,
          });
        }
      }
    } finally {
      sentLock.release();
    }

    if (sent.length === 0) return { items: [], sentChecked: 0 };

    // 2) Inbox replies index — collect every referenced Message-ID
    const replied = new Set<string>();
    const inboxLock = await c.getMailboxLock("INBOX");
    try {
      const uids = await c.search({ since: sinceReply }, { uid: true });
      if (uids && uids.length > 0) {
        for await (const m of c.fetch(
          uids,
          {
            uid: true,
            headers: ["in-reply-to", "references"],
          },
          { uid: true },
        )) {
          const headers = (m as FetchMessageObject).headers as
            | Buffer
            | string
            | undefined;
          if (!headers) continue;
          const text = headers.toString();
          for (const id of extractMessageIds(text)) replied.add(id);
        }
      }
    } finally {
      inboxLock.release();
    }

    // 3) Filter to stale + not-yet-answered
    const items: Followup[] = sent
      .filter(
        (s) =>
          s.sentAt.getTime() <= cutoffStale.getTime() &&
          !replied.has(s.messageId),
      )
      .map((s) => ({
        uid: s.uid,
        messageId: s.messageId,
        subject: s.subject,
        to: s.to,
        sentAt: s.sentAt.toISOString(),
        daysSinceSent: Math.floor(
          (Date.now() - s.sentAt.getTime()) / (1000 * 60 * 60 * 24),
        ),
        folder: sentFolder,
      }))
      .sort((a, b) => b.daysSinceSent - a.daysSinceSent)
      .slice(0, 50);

    return { items, sentChecked: sent.length };
  });
}
