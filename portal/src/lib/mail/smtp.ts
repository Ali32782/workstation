import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { ImapFlow } from "imapflow";
import { derivePassword } from "@/lib/derived-passwords";
import type { MailAddress } from "./types";

/**
 * Mail submission strategy.
 *
 *  • migadu  – per-user SMTP-AUTH against smtp.migadu.com:465. Each mailbox
 *              owner authenticates with their own derived password. Requires
 *              outbound port 465 to be open from this host (Hetzner blocks it
 *              by default — see SMTP_RELAY_HOST below for the alternative).
 *
 *  • relay   – use a single shared SMTP relay (e.g. Brevo, Postmark) on
 *              port 587/STARTTLS. The relay authenticates with one shared
 *              account; the per-user identity is preserved via the
 *              `From:` header. Requires that every From-domain has been
 *              verified at the relay (DKIM / Return-Path / SPF).
 *
 * Selection: if SMTP_RELAY_HOST is set we go into relay mode, otherwise
 * we fall back to direct Migadu submission.
 */

const RELAY_HOST = process.env.SMTP_RELAY_HOST ?? "";
const RELAY_PORT = Number(process.env.SMTP_RELAY_PORT ?? 587);
const RELAY_USER = process.env.SMTP_RELAY_USER ?? "";
const RELAY_PASS = process.env.SMTP_RELAY_PASS ?? "";

const MIGADU_SMTP_HOST = process.env.SMTP_HOST ?? "smtp.migadu.com";
const MIGADU_SMTP_PORT = Number(process.env.SMTP_PORT ?? 465);
const IMAP_HOST = process.env.IMAP_HOST ?? "imap.migadu.com";
const IMAP_PORT = Number(process.env.IMAP_PORT ?? 993);

function relayConfigured(): boolean {
  return Boolean(RELAY_HOST && RELAY_USER && RELAY_PASS);
}

export type SendOpts = {
  from: string;
  fromName?: string;
  to: MailAddress[];
  cc?: MailAddress[];
  bcc?: MailAddress[];
  subject: string;
  text?: string;
  html?: string;
  inReplyTo?: string;
  references?: string[];
  attachments?: Array<{
    filename: string;
    content: Buffer;
    contentType?: string;
    contentDisposition?: "attachment" | "inline";
  }>;
};

function buildTransport(opts: SendOpts): Transporter {
  if (relayConfigured()) {
    return nodemailer.createTransport({
      host: RELAY_HOST,
      port: RELAY_PORT,
      secure: RELAY_PORT === 465,
      requireTLS: RELAY_PORT !== 465,
      auth: { user: RELAY_USER, pass: RELAY_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 5_000,
      socketTimeout: 20_000,
    });
  }
  return nodemailer.createTransport({
    host: MIGADU_SMTP_HOST,
    port: MIGADU_SMTP_PORT,
    secure: MIGADU_SMTP_PORT === 465,
    requireTLS: MIGADU_SMTP_PORT !== 465,
    auth: {
      user: opts.from,
      pass: derivePassword("mail", opts.from),
    },
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 20_000,
  });
}

export async function sendMessage(opts: SendOpts): Promise<{ messageId: string }> {
  const transporter = buildTransport(opts);

  const info = await transporter.sendMail({
    from: opts.fromName
      ? { name: opts.fromName, address: opts.from }
      : opts.from,
    sender: opts.from, // explicit envelope sender for relays
    to: opts.to.map((a) => formatAddr(a)),
    cc: opts.cc?.map((a) => formatAddr(a)),
    bcc: opts.bcc?.map((a) => formatAddr(a)),
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      contentDisposition: a.contentDisposition,
    })),
  });

  // Save a copy to the user's "Sent" folder via IMAP APPEND. Most providers
  // do not auto-Bcc the sender, so we mirror Outlook here.
  try {
    await appendToSent({
      email: opts.from,
      raw: await renderRaw(opts, info.messageId ?? ""),
    });
  } catch {
    // non-fatal; the mail was sent
  }

  return { messageId: info.messageId ?? "" };
}

function formatAddr(a: MailAddress): string {
  return a.name ? `"${a.name.replace(/"/g, "")}" <${a.address}>` : a.address;
}

async function renderRaw(opts: SendOpts, messageId: string): Promise<Buffer> {
  const tmp = nodemailer.createTransport({ streamTransport: true, buffer: true });
  const result = await tmp.sendMail({
    from: opts.fromName
      ? { name: opts.fromName, address: opts.from }
      : opts.from,
    to: opts.to.map(formatAddr),
    cc: opts.cc?.map(formatAddr),
    bcc: opts.bcc?.map(formatAddr),
    subject: opts.subject,
    text: opts.text,
    html: opts.html,
    inReplyTo: opts.inReplyTo,
    references: opts.references,
    messageId: messageId || undefined,
    attachments: opts.attachments?.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
      contentDisposition: a.contentDisposition,
    })),
  });
  return result.message as Buffer;
}

async function appendToSent(opts: { email: string; raw: Buffer }): Promise<void> {
  const c = new ImapFlow({
    host: IMAP_HOST,
    port: IMAP_PORT,
    secure: true,
    auth: { user: opts.email, pass: derivePassword("mail", opts.email) },
    logger: false,
  });
  c.on("error", () => {
    /* swallowed — surfaced via the awaited promise below */
  });
  await c.connect();
  try {
    const folders = (await c.list()) as Array<{ path: string; specialUse?: string }>;
    const sent =
      folders.find((f) => (f.specialUse ?? "").toLowerCase() === "\\sent") ??
      folders.find((f) => /^sent$/i.test(f.path)) ??
      folders.find((f) => /gesendet/i.test(f.path));
    if (!sent) return;
    await c.append(sent.path, opts.raw, ["\\Seen"]);
  } finally {
    await c.logout();
  }
}
