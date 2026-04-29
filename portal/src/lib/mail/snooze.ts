import "server-only";
import { ImapFlow, type FetchMessageObject } from "imapflow";
import { derivePassword } from "@/lib/derived-passwords";

const HOST = process.env.IMAP_HOST ?? "imap.migadu.com";
const PORT = Number(process.env.IMAP_PORT ?? 993);
const SNOOZE_FOLDER = "Snoozed";
const SNOOZE_FLAG_PREFIX = "$snooze";

/**
 * IMAP-flag-driven mail snooze.
 *
 * Storage model:
 *   - A dedicated `Snoozed` mailbox (auto-created on first snooze).
 *   - The wake time is encoded as a custom IMAP keyword on the message,
 *     e.g.  $snooze1764201600  (unix seconds, no separator — periods
 *     and dashes are technically allowed but Migadu has bitten us
 *     before with non-alphanumeric flags being silently dropped).
 *
 * Wake model:
 *   The portal calls `wakeDueSnoozed()` opportunistically on every
 *   mail-page load and on every 60 s poll while the tab is foreground.
 *   That's good enough — we wake within ~1 min of the chosen time and
 *   we don't need a separate cron daemon.
 *
 * Wake target:
 *   Always INBOX, mirroring Gmail's UX.  We don't preserve the
 *   original folder because (a) Gmail-style users expect everything
 *   to land back in inbox anyway and (b) we'd need a second flag
 *   round-trip per message to remember it.
 */

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
    socketTimeout: 15000,
    greetingTimeout: 5000,
    connectionTimeout: 8000,
  });
  c.on("error", () => {
    /* swallowed — promise rejection is the source of truth */
  });
  await c.connect();
  try {
    return await fn(c);
  } finally {
    try {
      await c.logout();
    } catch {
      // ignore
    }
  }
}

async function ensureSnoozeFolder(c: ImapFlow): Promise<void> {
  // ImapFlow's `mailboxCreate` is idempotent enough — it throws on
  // ALREADYEXISTS which we silently swallow. There's no `mailboxExists`
  // helper in the public API, and a `list()` round-trip just to probe
  // for the folder is wasteful when the create itself is the same cost.
  try {
    await c.mailboxCreate(SNOOZE_FOLDER);
  } catch (e) {
    if (
      e instanceof Error &&
      /already\s*exists|TRYCREATE/i.test(e.message ?? "")
    ) {
      return;
    }
    // Some Migadu hosts surface "[ALREADYEXISTS] Mailbox exists" with
    // a slightly different code path; treat any "exists" hint as OK.
    if (e instanceof Error && /exists/i.test(e.message ?? "")) return;
    throw e;
  }
}

async function mailboxPresent(c: ImapFlow, name: string): Promise<boolean> {
  try {
    const list = await c.list();
    return list.some((entry) => entry.path === name);
  } catch {
    return false;
  }
}

/**
 * Snooze a single message. Adds the wake-time keyword on the source
 * folder first (so the move atomically carries the metadata) and then
 * moves it to `Snoozed`.
 */
export async function snoozeMessage(
  email: string,
  sourceFolder: string,
  uid: number,
  wakeAt: Date,
): Promise<void> {
  const wakeUnix = Math.floor(wakeAt.getTime() / 1000);
  if (!Number.isFinite(wakeUnix) || wakeUnix < 0) {
    throw new Error("Ungültiger Snooze-Zeitpunkt");
  }
  const flag = `${SNOOZE_FLAG_PREFIX}${wakeUnix}`;
  await withClient(email, async (c) => {
    await ensureSnoozeFolder(c);
    const lock = await c.getMailboxLock(sourceFolder);
    try {
      await c.messageFlagsAdd(String(uid), [flag], { uid: true });
      await c.messageMove(String(uid), SNOOZE_FOLDER, { uid: true });
    } finally {
      lock.release();
    }
  });
}

/**
 * Wake any snoozed message whose deadline has passed.
 *
 * Returns the count of messages woken so the UI can show a toast and
 * trigger a folder refresh — the wake happens server-side without UI
 * notification, and a silent move would otherwise leave the inbox
 * looking unchanged until the user manually refreshes.
 */
export async function wakeDueSnoozed(
  email: string,
  now: Date = new Date(),
): Promise<{ woken: number }> {
  const nowUnix = Math.floor(now.getTime() / 1000);
  return withClient(email, async (c) => {
    if (!(await mailboxPresent(c, SNOOZE_FOLDER))) return { woken: 0 };

    const lock = await c.getMailboxLock(SNOOZE_FOLDER);
    let woken = 0;
    try {
      // We can't search by keyword pattern; fetch all uids + flags and
      // filter client-side. The Snoozed folder typically holds <50
      // messages so this is fine.
      const messages: FetchMessageObject[] = [];
      for await (const m of c.fetch("1:*", { uid: true, flags: true })) {
        messages.push(m as FetchMessageObject);
      }
      const dueUids: number[] = [];
      const flagsToRemoveByUid = new Map<number, string[]>();
      for (const m of messages) {
        const flags = m.flags ? Array.from(m.flags) : [];
        const snoozeFlags = flags.filter((f) =>
          f.toLowerCase().startsWith(SNOOZE_FLAG_PREFIX),
        );
        if (snoozeFlags.length === 0) continue;
        // If multiple snoozes are layered (re-snooze edge case), wake
        // when the *earliest* deadline has passed — fits user intent.
        const deadlines = snoozeFlags
          .map((f) => Number(f.slice(SNOOZE_FLAG_PREFIX.length)))
          .filter((n) => Number.isFinite(n));
        if (deadlines.length === 0) continue;
        const min = Math.min(...deadlines);
        if (min <= nowUnix) {
          dueUids.push(m.uid);
          flagsToRemoveByUid.set(m.uid, snoozeFlags);
        }
      }
      for (const uid of dueUids) {
        const toRemove = flagsToRemoveByUid.get(uid) ?? [];
        if (toRemove.length > 0) {
          try {
            await c.messageFlagsRemove(String(uid), toRemove, { uid: true });
          } catch {
            // ignore — flags will be dropped on move anyway
          }
        }
        try {
          await c.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
        } catch {
          // ignore — non-critical
        }
        try {
          await c.messageMove(String(uid), "INBOX", { uid: true });
          woken++;
        } catch {
          // single-uid failure shouldn't abort the whole batch
        }
      }
    } finally {
      lock.release();
    }
    return { woken };
  });
}

/**
 * Inspect a folder's snoozed messages without waking them — used by
 * the dashboard "X snoozed (next: 2h)" chip.
 */
export async function listSnoozeOverview(
  email: string,
): Promise<{ count: number; nextWakeAt: string | null }> {
  return withClient(email, async (c) => {
    if (!(await mailboxPresent(c, SNOOZE_FOLDER))) {
      return { count: 0, nextWakeAt: null };
    }
    const lock = await c.getMailboxLock(SNOOZE_FOLDER);
    try {
      const wakes: number[] = [];
      for await (const m of c.fetch("1:*", { uid: true, flags: true })) {
        const flags = m.flags ? Array.from(m.flags) : [];
        for (const f of flags) {
          if (!f.toLowerCase().startsWith(SNOOZE_FLAG_PREFIX)) continue;
          const ts = Number(f.slice(SNOOZE_FLAG_PREFIX.length));
          if (Number.isFinite(ts)) wakes.push(ts);
        }
      }
      if (wakes.length === 0) return { count: 0, nextWakeAt: null };
      const next = Math.min(...wakes);
      return {
        count: wakes.length,
        nextWakeAt: new Date(next * 1000).toISOString(),
      };
    } finally {
      lock.release();
    }
  });
}
