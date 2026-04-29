import type { CallSummary } from "./types";

/**
 * Incoming = aktiver Workspace-Call eines anderen Users, wo die aktuelle Person
 * noch nicht aktiv im Raum eingetragen ist (kein Participant mit leftAt:null).
 */

export function isIncomingCallForViewer(
  call: CallSummary,
  viewerEmail: string,
): boolean {
  if (call.endedAt != null) return false;
  const me = viewerEmail.trim().toLowerCase();
  if (!me) return false;
  if (call.createdBy.trim().toLowerCase() === me) return false;
  const activelyInCall = call.participants.some(
    (p) => p.email.trim().toLowerCase() === me && p.leftAt == null,
  );
  if (activelyInCall) return false;
  return true;
}

export function filterIncomingCallsForViewer(
  calls: CallSummary[],
  viewerEmail: string,
): CallSummary[] {
  return calls.filter((c) => isIncomingCallForViewer(c, viewerEmail));
}
