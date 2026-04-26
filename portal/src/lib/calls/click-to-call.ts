import type { CallContext } from "./types";

/**
 * Build a click-to-call URL pointing at the workspace's native Calls page,
 * with the new-call composer pre-opened and the context filled in. Used by
 * CRM/Helpdesk/Chat to launch a Jitsi meeting tied to the originating record.
 *
 * The Calls page reads `start=1` and the context query params and opens the
 * composer modal so the user can confirm/edit the subject before starting.
 */
export function clickToCallUrl(opts: {
  workspaceId: string;
  subject?: string;
  context: CallContext;
}): string {
  const params = new URLSearchParams({ start: "1" });
  if (opts.subject) params.set("subject", opts.subject);
  const c = opts.context;
  params.set("kind", c.kind);
  if (c.kind === "crm") {
    if (c.companyId) params.set("companyId", c.companyId);
    if (c.personId) params.set("personId", c.personId);
    if (c.label) params.set("label", c.label);
  } else if (c.kind === "helpdesk") {
    params.set("ticketId", c.ticketId);
    if (c.label) params.set("label", c.label);
  } else if (c.kind === "chat") {
    params.set("roomId", c.roomId);
    if (c.label) params.set("label", c.label);
  } else if (c.kind === "projects") {
    if (c.projectId) params.set("projectId", c.projectId);
    if (c.issueId) params.set("issueId", c.issueId);
    if (c.label) params.set("label", c.label);
  }
  return `/${opts.workspaceId}/calls?${params.toString()}`;
}
