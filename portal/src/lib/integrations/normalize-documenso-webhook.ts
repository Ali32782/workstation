import type { IntegrationEventEnvelope } from "@/lib/integrations/event-feed-types";

type DocumensoWebhookBody = {
  event?: string;
  payload?: {
    id?: number | string;
    externalId?: string | null;
    title?: string | null;
    status?: string | null;
    completedAt?: string | null;
  };
  createdAt?: string;
};

function documensoLooksLike(body: unknown): body is DocumensoWebhookBody {
  return (
    typeof body === "object" &&
    body !== null &&
    typeof (body as DocumensoWebhookBody).event === "string" &&
    /^DOCUMENT_/i.test(String((body as DocumensoWebhookBody).event))
  );
}

/**
 * Maps Documenso webhook POST (`DOCUMENT_COMPLETED`, …) to our envelope.
 * Workspace defaults from env until multi-team routing exists.
 */
export function envelopeFromDocumensoWebhook(
  body: unknown,
): IntegrationEventEnvelope | null {
  if (!documensoLooksLike(body)) return null;
  const ev = body.event!.toUpperCase();
  const p = body.payload ?? {};
  const workspaceId =
    process.env.INTEGRATION_FEED_DEFAULT_WORKSPACE?.trim() || "corehub";

  const basePayload = {
    documentId: String(p.id ?? ""),
    externalId: p.externalId ?? undefined,
    title: p.title ?? undefined,
    status: p.status ?? undefined,
    completedAt: p.completedAt ?? undefined,
  };

  if (ev === "DOCUMENT_COMPLETED") {
    return {
      id: crypto.randomUUID(),
      emittedAt: body.createdAt ?? new Date().toISOString(),
      workspaceId,
      sourceHub: "sign",
      sourceSystem: "documenso",
      eventType: "sign.document.completed",
      payload: {
        documentId: basePayload.documentId,
        externalId: basePayload.externalId ?? undefined,
        title: p.title ?? undefined,
      },
      correlationId: `documenso:${basePayload.documentId}:${ev}`,
    };
  }

  return {
    id: crypto.randomUUID(),
    emittedAt: body.createdAt ?? new Date().toISOString(),
    workspaceId,
    sourceHub: "sign",
    sourceSystem: "documenso",
    eventType: `sign.documenso.${ev.toLowerCase()}`,
    payload: basePayload,
    correlationId: `documenso:${basePayload.documentId}:${ev}`,
  };
}

export type NormalizedIntegrationWebhookBody = {
  workspaceId: string;
  eventType: string;
  sourceSystem?: IntegrationEventEnvelope["sourceSystem"];
  sourceHub?: IntegrationEventEnvelope["sourceHub"];
  payload?: unknown;
};

/** Portal-normal JSON (`INTEGRATION_FEED_WEBHOOK_SECRET`). */
export function envelopeFromNormalizedBody(
  body: unknown,
): IntegrationEventEnvelope | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as NormalizedIntegrationWebhookBody;
  if (
    typeof o.workspaceId !== "string" ||
    typeof o.eventType !== "string" ||
    !o.workspaceId.trim()
  ) {
    return null;
  }
  const payload =
    o.payload !== undefined && o.payload !== null ? o.payload : {};
  const hub =
    o.sourceHub ??
    inferHubFromEventType(o.eventType);
  const sys =
    o.sourceSystem ??
    inferSystemFromEventType(o.eventType);

  return {
    id: crypto.randomUUID(),
    emittedAt: new Date().toISOString(),
    workspaceId: o.workspaceId.trim(),
    sourceHub: hub,
    sourceSystem: sys,
    eventType: o.eventType.trim(),
    payload,
  };
}

function inferHubFromEventType(
  eventType: string,
): IntegrationEventEnvelope["sourceHub"] {
  const x = eventType.toLowerCase();
  if (x.startsWith("sign.") || x.startsWith("documenso.")) return "sign";
  if (x.startsWith("helpdesk.") || x.startsWith("zammad.")) return "helpdesk";
  if (x.startsWith("crm.") || x.startsWith("twenty.")) return "crm";
  if (x.startsWith("project.") || x.startsWith("plane.")) return "projects";
  return "communication";
}

function inferSystemFromEventType(
  eventType: string,
): IntegrationEventEnvelope["sourceSystem"] {
  const x = eventType.toLowerCase();
  if (x.includes("documenso") || x.startsWith("sign.")) return "documenso";
  if (x.includes("zammad") || x.startsWith("helpdesk.")) return "zammad";
  if (x.includes("twenty") || x.startsWith("crm.")) return "twenty";
  if (x.includes("plane")) return "plane";
  return "portal";
}
