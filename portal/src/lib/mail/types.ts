import "server-only";

export type MailAddress = { name?: string; address: string };

export type MailFolder = {
  /** IMAP path (used for API calls). */
  path: string;
  /** Display name (last path segment). */
  name: string;
  /** Outlook-equivalent semantic role, used for icon + sort. */
  role: "inbox" | "sent" | "drafts" | "trash" | "junk" | "archive" | "custom";
  unread: number;
  total: number;
};

export type MailListItem = {
  uid: number;
  folder: string;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  date: string; // ISO
  preview: string; // first ~120 chars of body
  flags: string[]; // \\Seen, \\Flagged, \\Answered, …
  hasAttachments: boolean;
  size: number;
  /**
   * Message-ID header, normalised (no brackets, lowercase) — used only for threading.
   * May be null on very old parsers / missing header.
   */
  messageId: string | null;
  /** In-Reply-To, normalised; null if absent. */
  inReplyTo: string | null;
};

export type MailAttachment = {
  partId: string;
  filename: string;
  contentType: string;
  size: number;
  contentId?: string;
  inline: boolean;
};

export type MailFull = {
  uid: number;
  folder: string;
  subject: string;
  from: MailAddress | null;
  to: MailAddress[];
  cc: MailAddress[];
  bcc: MailAddress[];
  replyTo: MailAddress[];
  date: string;
  flags: string[];
  bodyHtml: string | null; // sanitized
  bodyText: string | null;
  attachments: MailAttachment[];
  messageId: string | null;
  inReplyTo: string | null;
  references: string[];
};

export type MailFolderRole = MailFolder["role"];

/** Standard role detection from IMAP folder names + special-use flags. */
export function detectFolderRole(
  path: string,
  specialUse?: string,
): MailFolderRole {
  const su = (specialUse ?? "").toLowerCase();
  if (su === "\\sent") return "sent";
  if (su === "\\drafts") return "drafts";
  if (su === "\\trash") return "trash";
  if (su === "\\junk") return "junk";
  if (su === "\\archive") return "archive";
  if (su === "\\inbox") return "inbox";

  const lower = path.toLowerCase();
  if (lower === "inbox") return "inbox";
  if (lower.includes("sent") || lower.includes("gesendet")) return "sent";
  if (lower.includes("draft") || lower.includes("entw")) return "drafts";
  if (lower.includes("trash") || lower.includes("papier") || lower.includes("deleted"))
    return "trash";
  if (lower.includes("junk") || lower.includes("spam")) return "junk";
  if (lower.includes("archiv")) return "archive";
  return "custom";
}
