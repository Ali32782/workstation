import "server-only";

import type { IntegrationEventEnvelope } from "@/lib/integrations/event-feed-types";

/** CmdK / search palette row for a persisted integration envelope. */
export type IntegrationCmdKHit = {
  type: "integration";
  id: string;
  label: string;
  sublabel?: string;
  href: string;
};

function payloadObj(
  env: IntegrationEventEnvelope,
): Record<string, unknown> {
  const p = env.payload;
  if (p && typeof p === "object" && !Array.isArray(p)) {
    return p as Record<string, unknown>;
  }
  return {};
}

/** Deep link for Pulse tiles and Cmd+K rows. */
export function integrationEventHref(
  workspaceId: string,
  env: IntegrationEventEnvelope,
): string {
  const p = payloadObj(env);
  const docId =
    typeof p.documentId === "string"
      ? p.documentId
      : typeof p.document_id === "string"
        ? p.document_id
        : "";
  if (
    docId &&
    (env.eventType.startsWith("sign.") || env.sourceHub === "sign")
  ) {
    return `/${workspaceId}/sign?doc=${encodeURIComponent(docId)}`;
  }
  const ticketId =
    typeof p.ticketId === "string"
      ? p.ticketId
      : typeof p.ticket_id === "string"
        ? p.ticket_id
        : "";
  if (
    ticketId &&
    (env.eventType.includes("helpdesk") ||
      env.eventType.includes("ticket") ||
      env.sourceHub === "helpdesk")
  ) {
    return `/${workspaceId}/helpdesk?ticket=${encodeURIComponent(ticketId)}`;
  }
  const companyId =
    typeof p.companyId === "string"
      ? p.companyId
      : typeof p.company_id === "string"
        ? p.company_id
        : "";
  if (companyId && (env.sourceHub === "crm" || env.eventType.startsWith("crm."))) {
    return `/${workspaceId}/crm?company=${encodeURIComponent(companyId)}`;
  }
  const opportunityId =
    typeof p.opportunityId === "string"
      ? p.opportunityId
      : typeof p.opportunity_id === "string"
        ? p.opportunity_id
        : "";
  if (opportunityId && env.eventType.includes("opportunity")) {
    const cid =
      typeof p.companyId === "string"
        ? p.companyId
        : typeof p.company_id === "string"
          ? p.company_id
          : "";
    return cid
      ? `/${workspaceId}/crm?company=${encodeURIComponent(cid)}&deal=${encodeURIComponent(opportunityId)}`
      : `/${workspaceId}/crm/pipeline?deal=${encodeURIComponent(opportunityId)}`;
  }
  const issueId =
    typeof p.issueId === "string"
      ? p.issueId
      : typeof p.issue_id === "string"
        ? p.issue_id
        : "";
  const projectId =
    typeof p.projectId === "string"
      ? p.projectId
      : typeof p.project_id === "string"
        ? p.project_id
        : "";
  if (issueId && projectId && env.sourceHub === "projects") {
    return `/${workspaceId}/projects?project=${encodeURIComponent(projectId)}&issue=${encodeURIComponent(issueId)}`;
  }
  return `/${workspaceId}/dashboard`;
}

function titleFromPayload(env: IntegrationEventEnvelope): string {
  const p = payloadObj(env);
  const t =
    typeof p.title === "string"
      ? p.title
      : typeof p.name === "string"
        ? p.name
        : "";
  return t ? t.slice(0, 80) : "";
}

/**
 * Primary row title for Cmd+K — technical type plus optional payload title.
 */
export function integrationCmdKLabel(env: IntegrationEventEnvelope): string {
  const title = titleFromPayload(env);
  if (title) return `${env.eventType} · ${title}`;
  return env.eventType;
}

/** Secondary line: UTC time + origin system (locale-neutral). */
export function integrationCmdKSublabel(env: IntegrationEventEnvelope): string {
  const iso = env.emittedAt?.slice(0, 19).replace("T", " ") ?? "";
  return `${iso} UTC · ${env.sourceSystem}`;
}

export function toIntegrationCmdKHit(
  workspaceId: string,
  env: IntegrationEventEnvelope,
): IntegrationCmdKHit {
  return {
    type: "integration",
    id: env.id,
    label: integrationCmdKLabel(env),
    sublabel: integrationCmdKSublabel(env),
    href: integrationEventHref(workspaceId, env),
  };
}

export function integrationHitMatchesQuery(
  hit: IntegrationCmdKHit,
  q: string,
): boolean {
  const qq = q.trim().toLowerCase();
  if (!qq) return true;
  return (
    hit.label.toLowerCase().includes(qq) ||
    (hit.sublabel?.toLowerCase().includes(qq) ?? false)
  );
}
