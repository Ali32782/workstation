/**
 * Type definitions for the native Zammad Helpdesk integration. Only the
 * subset of fields the portal UI needs — Zammad's full payload is much
 * richer (escalations, SLA, channels, …) but we surface those on demand.
 */

export type TicketState = {
  id: number;
  name: string;
  stateTypeId: number;
  active: boolean;
};

export type TicketPriority = {
  id: number;
  name: string;
  uiColor: string | null;
  uiIcon: string | null;
};

export type TicketGroup = {
  id: number;
  name: string;
  active: boolean;
};

export type TicketUser = {
  id: number;
  login: string;
  email: string;
  firstName: string;
  lastName: string;
  fullName: string;
  image: string | null;
};

export type TicketSummary = {
  id: number;
  number: string;
  title: string;
  stateId: number;
  stateName: string;
  priorityId: number;
  priorityName: string;
  groupId: number;
  groupName: string;
  customerId: number;
  customerName: string;
  ownerId: number;
  ownerName: string;
  createdAt: string;
  updatedAt: string;
  lastContactAt: string | null;
  articleCount: number;
  /**
   * SLA timestamps. Zammad fills these only when an SLA is attached to the
   * ticket. The detail/header pill computes the displayed countdown from
   * these — `null` means "kein SLA" or "schon erfüllt".
   */
  firstResponseEscalationAt: string | null;
  firstResponseInMin: number | null;
  closeEscalationAt: string | null;
  closeInMin: number | null;
  escalationAt: string | null;
  /** Free-form labels (Zammad Tags). Optional — list endpoint omits these
   *  for performance, detail endpoint hydrates them. */
  tags?: string[];
};

export type TicketArticle = {
  id: number;
  ticketId: number;
  fromName: string;
  to: string | null;
  cc: string | null;
  subject: string | null;
  bodyHtml: string;
  internal: boolean;
  senderName: string; // "Customer" | "Agent" | "System"
  type: string; // "note" | "email" | "phone" | …
  contentType: string;
  createdAt: string;
  attachments: TicketAttachment[];
};

export type TicketAttachment = {
  id: number;
  filename: string;
  size: number;
  contentType: string;
};

export type TicketDetail = TicketSummary & {
  note: string | null;
  customerEmail: string;
  articles: TicketArticle[];
  tags: string[];
};

export type TicketMeta = {
  states: TicketState[];
  priorities: TicketPriority[];
  groups: TicketGroup[];
  agents: TicketUser[];
  macros: MacroSummary[];
  overviews: OverviewSummary[];
};

/**
 * Zammad Macro = batch of pre-defined ticket field changes + optional new
 * article. We mirror only the metadata; the actual `perform` logic stays
 * server-side so a forged macroId can't run arbitrary patches.
 */
export type MacroSummary = {
  id: number;
  name: string;
  active: boolean;
  /** UI-affordance hints — e.g. ["next_state", "priority"] so the UI can
   *  decorate the macro button (Zammad doesn't expose this richly, so we
   *  derive it heuristically from `perform`). */
  affects: string[];
};

/**
 * Zammad Overview = saved filter (e.g. "Mein Team · Offen", "Eskaliert").
 * Surfaced in the portal as additional scope-tabs above the ticket list.
 */
export type OverviewSummary = {
  id: number;
  name: string;
  link: string;
  /** number of tickets currently matching this view (Zammad caches this) */
  ticketCount: number | null;
};

/**
 * Compact tag descriptor used by the autocomplete in the tag editor.
 * Zammad's tag suggestions endpoint returns just names — count comes from
 * a separate aggregation.
 */
export type TagSuggestion = {
  name: string;
  count?: number;
};
