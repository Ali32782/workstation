import "server-only";
import { parseCsv, detectDelimiter } from "@/lib/csv/parse";

/**
 * CSV import helpers for the Helpdesk (Zammad) app.
 *
 * One record type: **Tickets**. We support the common Zendesk/Freshdesk/Excel
 * column names so an export from the legacy system maps mostly automatically.
 *
 * The drafts intentionally carry *labels* (group / state / priority / agent
 * by name or email) instead of Zammad's numeric IDs — the executor resolves
 * those against the live workspace tenant when running the import. That way
 * the same CSV works across tenants without re-mapping IDs.
 */

export type TicketField =
  | "title"
  | "body"
  | "customerEmail"
  | "customerName"
  | "group"
  | "priority"
  | "state"
  | "owner"
  | "tags"
  | "ignore";

const TICKET_HEADER_ALIASES: Record<string, TicketField> = {
  // Zammad / Zendesk / Freshdesk / generic
  title: "title",
  subject: "title",
  betreff: "title",
  ticket: "title",
  "ticket title": "title",
  body: "body",
  description: "body",
  text: "body",
  inhalt: "body",
  "first message": "body",
  // Customer
  email: "customerEmail",
  "customer email": "customerEmail",
  "requester email": "customerEmail",
  kundenmail: "customerEmail",
  "kunden-mail": "customerEmail",
  customer: "customerName",
  "customer name": "customerName",
  "requester name": "customerName",
  kunde: "customerName",
  // Routing
  group: "group",
  team: "group",
  gruppe: "group",
  queue: "group",
  // Priority
  priority: "priority",
  prio: "priority",
  priorität: "priority",
  prioritaet: "priority",
  // State
  state: "state",
  status: "state",
  zustand: "state",
  // Agent / owner
  owner: "owner",
  agent: "owner",
  assignee: "owner",
  bearbeiter: "owner",
  "assigned to": "owner",
  // Tags
  tags: "tags",
  labels: "tags",
  schlagworte: "tags",
};

export function defaultTicketMapping(headers: string[]): Record<string, TicketField> {
  const out: Record<string, TicketField> = {};
  headers.forEach((h) => {
    const key = h.trim().toLowerCase();
    out[h] = TICKET_HEADER_ALIASES[key] ?? "ignore";
  });
  return out;
}

export type TicketDraft = {
  rowIndex: number;
  title: string;
  body: string;
  customerEmail: string;
  customerName?: string;
  group?: string;
  priority?: string;
  state?: string;
  owner?: string;
  tags?: string[];
  errors: string[];
};

export type HelpdeskImportPreview = {
  delimiter: string;
  headers: string[];
  mapping: Record<string, TicketField>;
  totals: { rows: number; valid: number; skipped: number };
  drafts: TicketDraft[];
};

function normaliseEmail(s: string): string | undefined {
  const v = s.trim().toLowerCase();
  if (!v || !/.+@.+\..+/.test(v)) return undefined;
  return v;
}

export function buildHelpdeskPreview(args: {
  text: string;
  delimiter?: string;
  mapping?: Record<string, TicketField>;
}): HelpdeskImportPreview {
  const delimiter = args.delimiter ?? detectDelimiter(args.text);
  const rows = parseCsv(args.text, delimiter);
  if (rows.length === 0) {
    return {
      delimiter,
      headers: [],
      mapping: {},
      totals: { rows: 0, valid: 0, skipped: 0 },
      drafts: [],
    };
  }
  const headers = rows[0].map((h) => h.trim());
  const mapping = args.mapping
    ? mergeMapping(headers, args.mapping)
    : defaultTicketMapping(headers);
  const fieldByIndex = headers.map((h) => mapping[h] ?? "ignore");

  const drafts: TicketDraft[] = [];
  let valid = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => !c || !c.trim())) continue;
    const draft: TicketDraft = {
      rowIndex: r,
      title: "",
      body: "",
      customerEmail: "",
      errors: [],
    };
    row.forEach((rawValue, idx) => {
      const field = fieldByIndex[idx];
      const value = (rawValue ?? "").trim();
      if (!value || field === "ignore") return;
      switch (field) {
        case "customerEmail": {
          const e = normaliseEmail(value);
          if (e) draft.customerEmail = e;
          break;
        }
        case "tags":
          draft.tags = value
            .split(/[;,|]/)
            .map((s) => s.trim())
            .filter(Boolean);
          break;
        default:
          (draft as Record<string, unknown>)[field] = value;
      }
    });
    if (!draft.title) draft.errors.push("Pflichtfeld 'Title/Subject' fehlt");
    if (!draft.customerEmail)
      draft.errors.push("Pflichtfeld 'Customer Email' fehlt");
    if (!draft.body) draft.body = draft.title;
    if (draft.errors.length === 0) valid++;
    else skipped++;
    drafts.push(draft);
  }

  return {
    delimiter,
    headers,
    mapping,
    totals: { rows: rows.length - 1, valid, skipped },
    drafts,
  };
}

function mergeMapping(
  headers: string[],
  user: Record<string, string>,
): Record<string, TicketField> {
  const out: Record<string, TicketField> = {};
  headers.forEach((h) => {
    const v = user[h] ?? user[h.toLowerCase()];
    out[h] = (v as TicketField) ?? "ignore";
  });
  return out;
}

export const TICKET_FIELD_LABELS: Record<TicketField, string> = {
  title: "Titel / Betreff",
  body: "Beschreibung",
  customerEmail: "Kunden-E-Mail",
  customerName: "Kundenname",
  group: "Gruppe",
  priority: "Priorität",
  state: "Status",
  owner: "Bearbeiter",
  tags: "Tags",
  ignore: "Ignorieren",
};
