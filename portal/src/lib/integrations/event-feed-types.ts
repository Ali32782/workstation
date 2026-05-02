/**
 * Cross-hub integration events — canonical envelope for future webhook
 * processors, Rocket.Chat bots, Pulse, and Cmd+K “recent activity”.
 *
 * Phase 0 envelope + optional JSONL persistence (`event-feed-store`) and webhook.
 * @see docs/cross-hub-roadmap.md
 */

export type IntegrationHub =
  | "crm"
  | "projects"
  | "helpdesk"
  | "sign"
  | "office"
  | "calendar"
  | "communication";

/** Upstream product that emitted the event (logical source system). */
export type IntegrationOriginSystem =
  | "twenty"
  | "plane"
  | "zammad"
  | "documenso"
  | "rocketchat"
  | "nextcloud"
  | "portal";

export type IntegrationActorKind = "system" | "user" | "integration";

export interface IntegrationActor {
  kind: IntegrationActorKind;
  id?: string;
  email?: string;
  displayName?: string;
}

/**
 * Normalised envelope — keep `eventType` names slash-namespaced
 * (e.g. `crm.opportunity.stage_changed`).
 */
export interface IntegrationEventEnvelope<TPayload = unknown> {
  /** UUID v4 or ULID recommended once persisted */
  id: string;
  emittedAt: string;
  /** Portal workspace slug */
  workspaceId: string;
  sourceHub: IntegrationHub;
  sourceSystem: IntegrationOriginSystem;
  eventType: string;
  actor?: IntegrationActor;
  correlationId?: string;
  payload: TPayload;
}

/** Minimal CRM payloads (extend as integrations land). */
export type CrmOpportunityStagePayload = {
  opportunityId: string;
  companyId?: string;
  /** Twenty pipeline stage id or label */
  stage?: string;
};

export type HelpdeskTicketCreatedPayload = {
  ticketId: string;
  title?: string;
  priority?: string;
};

export type SignEnvelopeCompletedPayload = {
  documentId: string;
  externalId?: string;
  /** Present when mapped from Documenso webhook payload. */
  title?: string;
};

export type ProjectIssueStatePayload = {
  issueId: string;
  projectId?: string;
  state?: string;
};
