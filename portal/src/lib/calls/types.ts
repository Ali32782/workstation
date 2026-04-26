/**
 * Domain types for the native Calls feature. Calls are durable records
 * stored in Mongo (`portal.calls`) describing a Jitsi meeting room — its
 * subject, host, participants, and lifecycle (active vs ended).
 *
 * The fields here cross the network boundary (server → API → client) so
 * keep them serialisable: no Date objects, no Mongo ObjectIds.
 */

export type CallContext =
  /** A call linked to a CRM contact (person/company). */
  | { kind: "crm"; companyId?: string; personId?: string; label?: string }
  /** A call linked to a Helpdesk ticket. */
  | { kind: "helpdesk"; ticketId: string; label?: string }
  /** A call linked to a Chat DM/room. */
  | { kind: "chat"; roomId: string; label?: string }
  /** A call linked to a project/issue. */
  | { kind: "projects"; projectId?: string; issueId?: string; label?: string }
  /** No structured link — ad-hoc room. */
  | { kind: "adhoc"; label?: string };

export type CallParticipant = {
  email: string;
  displayName: string;
  joinedAt: string;
  leftAt: string | null;
};

export type CallSummary = {
  id: string;
  /** Slug used as the Jitsi room name. URL-safe, opaque. */
  roomName: string;
  subject: string;
  workspaceId: string;
  /** Email of who started the call. */
  createdBy: string;
  createdByName: string;
  startedAt: string;
  /** null while the call is still active. */
  endedAt: string | null;
  /** Total wall-clock duration in seconds; only meaningful when ended. */
  durationSeconds: number | null;
  participants: CallParticipant[];
  context: CallContext;
  /** Optional jitsi meeting URL (computed server-side, may be public). */
  joinUrl: string;
};
