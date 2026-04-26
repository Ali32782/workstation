import "server-only";
import { ImapFlow, type FetchMessageObject, type ListResponse } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";
import sanitizeHtml from "sanitize-html";
import { derivePassword } from "@/lib/derived-passwords";
import {
  detectFolderRole,
  type MailAddress,
  type MailFolder,
  type MailFull,
  type MailListItem,
} from "./types";

const HOST = process.env.IMAP_HOST ?? "imap.migadu.com";
const PORT = Number(process.env.IMAP_PORT ?? 993);

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
  // ImapFlow re-emits socket failures as 'error' events; if nothing is
  // listening, Node escalates them to uncaughtException and crashes the whole
  // Next.js server. A noop listener keeps the promise rejection (which we
  // already handle) as the single source of truth.
  c.on("error", () => {
    /* swallowed — surfaced via the await below */
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

/* ------------------------------------------------------------------------- */
/*                                FOLDERS                                    */
/* ------------------------------------------------------------------------- */

const ROLE_ORDER: Record<MailFolder["role"], number> = {
  inbox: 0,
  drafts: 1,
  sent: 2,
  archive: 3,
  junk: 4,
  trash: 5,
  custom: 6,
};

export async function listFolders(email: string): Promise<MailFolder[]> {
  return withClient(email, async (c) => {
    const list = (await c.list()) as ListResponse[];
    const result: MailFolder[] = [];
    for (const entry of list) {
      // Skip non-selectable groupings (Gmail's "[Gmail]" etc).
      if (entry.flags?.has("\\Noselect")) continue;
      try {
        const status = await c.status(entry.path, { messages: true, unseen: true });
        const su =
          (entry.specialUse as string | undefined) ??
          (entry.flags &&
            Array.from(entry.flags).find((f) =>
              ["\\Sent", "\\Drafts", "\\Trash", "\\Junk", "\\Archive", "\\Inbox"].includes(
                f,
              ),
            )) ??
          undefined;
        result.push({
          path: entry.path,
          name: entry.name,
          role: detectFolderRole(entry.path, su),
          unread: status.unseen ?? 0,
          total: status.messages ?? 0,
        });
      } catch {
        // ignore folders that fail STATUS (some shared-folder setups)
      }
    }
    result.sort((a, b) => {
      const r = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (r !== 0) return r;
      return a.path.localeCompare(b.path);
    });
    return result;
  });
}

/* ------------------------------------------------------------------------- */
/*                              MESSAGE LIST                                 */
/* ------------------------------------------------------------------------- */

export type ListMessagesOpts = {
  folder: string;
  page?: number;
  perPage?: number;
};

function addrFrom(a: AddressObject | AddressObject[] | undefined): MailAddress[] {
  if (!a) return [];
  const arr = Array.isArray(a) ? a : [a];
  const out: MailAddress[] = [];
  for (const ao of arr) {
    for (const v of ao.value || []) {
      if (v.address) out.push({ name: v.name, address: v.address });
    }
  }
  return out;
}

function pickFromEnvelope(env: FetchMessageObject["envelope"]): {
  from: MailAddress | null;
  to: MailAddress[];
} {
  const from = env?.from?.[0]
    ? { name: env.from[0].name ?? undefined, address: env.from[0].address ?? "" }
    : null;
  const to = (env?.to ?? []).map((a) => ({
    name: a.name ?? undefined,
    address: a.address ?? "",
  }));
  return { from, to };
}

export async function listMessages(
  email: string,
  opts: ListMessagesOpts,
): Promise<{ items: MailListItem[]; total: number; page: number; perPage: number }> {
  const perPage = opts.perPage ?? 50;
  const page = Math.max(0, opts.page ?? 0);

  return withClient(email, async (c) => {
    const lock = await c.getMailboxLock(opts.folder);
    try {
      const mb = c.mailbox as { exists?: number };
      const total = mb.exists ?? 0;
      if (total === 0) return { items: [], total: 0, page, perPage };

      // We want newest first. UIDs aren't necessarily sorted — but seq numbers are.
      const startSeq = Math.max(1, total - (page + 1) * perPage + 1);
      const endSeq = total - page * perPage;
      if (endSeq < 1) return { items: [], total, page, perPage };

      const range = `${startSeq}:${endSeq}`;
      const items: MailListItem[] = [];
      for await (const msg of c.fetch(
        range,
        {
          uid: true,
          envelope: true,
          flags: true,
          internalDate: true,
          size: true,
          bodyStructure: true,
        },
        { uid: false },
      )) {
        const { from, to } = pickFromEnvelope(msg.envelope);
        const flagSet =
          msg.flags instanceof Set
            ? Array.from(msg.flags)
            : ((msg.flags as unknown as string[] | undefined) ?? []);
        const hasAttach = bodyHasAttachments(msg.bodyStructure as BodyNode | undefined);
        items.push({
          uid: msg.uid,
          folder: opts.folder,
          subject: msg.envelope?.subject ?? "(kein Betreff)",
          from,
          to,
          date: new Date(
            msg.envelope?.date ?? msg.internalDate ?? Date.now(),
          ).toISOString(),
          preview: "", // filled below
          flags: flagSet,
          hasAttachments: hasAttach,
          size: (msg.size as number) ?? 0,
        });
      }
      items.sort((a, b) => (a.date < b.date ? 1 : -1));
      return { items, total, page, perPage };
    } finally {
      lock.release();
    }
  });
}

type BodyNode = {
  type?: string;
  disposition?: string;
  childNodes?: BodyNode[];
};

function bodyHasAttachments(node: BodyNode | undefined): boolean {
  if (!node) return false;
  if (
    node.disposition === "attachment" ||
    (node.type === "application" && (node.disposition ?? "") !== "inline")
  ) {
    return true;
  }
  return (node.childNodes ?? []).some(bodyHasAttachments);
}

/* ------------------------------------------------------------------------- */
/*                              SINGLE MESSAGE                               */
/* ------------------------------------------------------------------------- */

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    "img",
    "style",
    "h1",
    "h2",
    "table",
    "thead",
    "tbody",
    "tr",
    "td",
    "th",
    "font",
    "center",
  ],
  allowedAttributes: {
    "*": ["style", "class", "align", "width", "height", "color", "bgcolor", "border"],
    a: ["href", "name", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    table: ["cellspacing", "cellpadding", "border", "width", "align"],
    td: ["colspan", "rowspan"],
    th: ["colspan", "rowspan"],
    font: ["face", "size", "color"],
  },
  allowedSchemes: ["http", "https", "mailto", "data", "cid"],
  // Always open links in a new tab and prevent referer leak.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      target: "_blank",
      rel: "noopener noreferrer",
    }),
    // Strip any blocked-content (remote images) tracking by replacing src with placeholder.
    // Keep cid: refs (inline images we'll later resolve from attachments).
  },
};

export async function getMessage(
  email: string,
  folder: string,
  uid: number,
): Promise<MailFull | null> {
  return withClient(email, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const result = await c.fetchOne(
        String(uid),
        {
          uid: true,
          envelope: true,
          flags: true,
          source: true,
        },
        { uid: true },
      );
      if (!result || !result.source) return null;

      const parsed = await simpleParser(result.source as Buffer);
      const flagSet =
        result.flags instanceof Set
          ? Array.from(result.flags)
          : ((result.flags as unknown as string[] | undefined) ?? []);

      // Mark as seen on read (Outlook behavior).
      try {
        await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } catch {
        // Read-only mailbox or permission issue — non-fatal.
      }

      const html = parsed.html
        ? sanitizeHtml(parsed.html, SANITIZE_OPTIONS)
        : null;

      const attachments = (parsed.attachments ?? []).map((a, i) => ({
        partId: String(i),
        filename: a.filename ?? `attachment-${i}`,
        contentType: a.contentType ?? "application/octet-stream",
        size: a.size,
        contentId: a.contentId ?? undefined,
        inline: (a.contentDisposition ?? "attachment") === "inline",
      }));

      return {
        uid,
        folder,
        subject: parsed.subject ?? "(kein Betreff)",
        from: parsed.from?.value?.[0]
          ? {
              name: parsed.from.value[0].name,
              address: parsed.from.value[0].address ?? "",
            }
          : null,
        to: addrFrom(parsed.to),
        cc: addrFrom(parsed.cc),
        bcc: addrFrom(parsed.bcc),
        replyTo: addrFrom(parsed.replyTo),
        date: (parsed.date ?? new Date()).toISOString(),
        flags: flagSet,
        bodyHtml: html,
        bodyText: parsed.text ?? null,
        attachments,
        messageId: parsed.messageId ?? null,
        inReplyTo:
          (Array.isArray(parsed.inReplyTo)
            ? parsed.inReplyTo[0]
            : parsed.inReplyTo) ?? null,
        references: Array.isArray(parsed.references)
          ? parsed.references
          : parsed.references
            ? [parsed.references]
            : [],
      };
    } finally {
      lock.release();
    }
  });
}

/* ------------------------------------------------------------------------- */
/*                                ACTIONS                                    */
/* ------------------------------------------------------------------------- */

export async function setSeen(
  email: string,
  folder: string,
  uid: number,
  seen: boolean,
): Promise<void> {
  await withClient(email, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      if (seen) {
        await c.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
      } else {
        await c.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
      }
    } finally {
      lock.release();
    }
  });
}

export async function moveMessage(
  email: string,
  folder: string,
  uid: number,
  target: string,
): Promise<void> {
  await withClient(email, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      await c.messageMove(String(uid), target, { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function deleteMessage(
  email: string,
  folder: string,
  uid: number,
): Promise<void> {
  // Outlook semantics: move to Trash unless we're already there, then expunge.
  const folders = await listFolders(email);
  const trash = folders.find((f) => f.role === "trash");
  if (trash && trash.path !== folder) {
    await moveMessage(email, folder, uid, trash.path);
    return;
  }
  await withClient(email, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      await c.messageFlagsAdd(String(uid), ["\\Deleted"], { uid: true });
      await c.messageDelete(String(uid), { uid: true });
    } finally {
      lock.release();
    }
  });
}

export async function getAttachment(
  email: string,
  folder: string,
  uid: number,
  partId: string,
): Promise<{ filename: string; contentType: string; data: Buffer } | null> {
  return withClient(email, async (c) => {
    const lock = await c.getMailboxLock(folder);
    try {
      const result = await c.fetchOne(
        String(uid),
        { uid: true, source: true },
        { uid: true },
      );
      if (result === false || !result) return null;
      const source = (result as FetchMessageObject).source;
      if (!source) return null;
      const parsed = await simpleParser(source as Buffer);
      const att = (parsed.attachments ?? []).find(
        (_, i) => String(i) === partId,
      );
      if (!att) return null;
      return {
        filename: att.filename ?? `attachment-${partId}`,
        contentType: att.contentType ?? "application/octet-stream",
        data: att.content as Buffer,
      };
    } finally {
      lock.release();
    }
  });
}
