import "server-only";
import { createAppFetch, fetchJson, AppApiError } from "@/lib/app-clients/base";
import type { SignTenantConfig } from "./config";
import type {
  DocumentDetail,
  DocumentSummary,
  RecipientSummary,
  SignStatus,
  SignTotals,
} from "./types";

/**
 * Native Documenso v2 client — multi-tenant, team-scoped.
 *
 * Documenso v2 ships an OpenAPI-described REST surface at
 * https://sign.kineo360.work/api/v2/openapi.json. We hit it directly with the
 * team's API token; every team has its own token and the tokens never see
 * other teams' data, so multi-tenancy is enforced at the server side.
 */

const PUBLIC = process.env.DOCUMENSO_URL ?? "https://sign.kineo360.work";
const INTERNAL = process.env.DOCUMENSO_INTERNAL_URL ?? "http://documenso:3000";

function tenantFetch(tenant: SignTenantConfig) {
  return createAppFetch({
    app: "documenso",
    origins: { internal: INTERNAL, public: PUBLIC },
    authHeaders: () => ({ Authorization: `Bearer ${tenant.apiToken}` }),
  });
}

type RawRecipient = {
  id: number;
  email: string;
  name: string;
  role: RecipientSummary["role"];
  signingOrder: number | null;
  signingStatus: RecipientSummary["signingStatus"];
  readStatus: RecipientSummary["readStatus"];
  sendStatus: RecipientSummary["sendStatus"];
  signedAt: string | null;
  rejectionReason: string | null;
  token: string;
};

type RawDocument = {
  id: number;
  title: string;
  status: SignStatus;
  source: DocumentSummary["source"];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  envelopeId: string;
  teamId: number;
  externalId: string | null;
  visibility: DocumentDetail["visibility"];
  user?: { id: number; name: string | null; email: string };
  recipients?: RawRecipient[];
  team?: { id: number; url: string } | null;
};

type FindResponse = {
  data: RawDocument[];
  count: number;
  currentPage: number;
  perPage: number;
  totalPages: number;
};

function mapRecipient(r: RawRecipient): RecipientSummary {
  return {
    id: r.id,
    email: r.email,
    name: r.name || r.email,
    role: r.role,
    signingOrder: r.signingOrder,
    signingStatus: r.signingStatus,
    readStatus: r.readStatus,
    sendStatus: r.sendStatus,
    signedAt: r.signedAt,
    rejectionReason: r.rejectionReason,
    token: r.token,
  };
}

function mapDocument(d: RawDocument): DocumentSummary {
  const recipients = (d.recipients ?? []).map(mapRecipient);
  return {
    id: d.id,
    title: d.title || "(ohne Titel)",
    status: d.status,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    completedAt: d.completedAt,
    source: d.source,
    recipients,
    ownerEmail: d.user?.email ?? null,
    pendingSigners: recipients.filter(
      (r) => r.role === "SIGNER" && r.signingStatus === "NOT_SIGNED",
    ).length,
  };
}

function mapDocumentDetail(
  d: RawDocument,
  tenantTeamUrl?: string | null,
): DocumentDetail {
  // Documenso v2 stopped serialising `team.url` for single-document GETs in
  // recent builds — the field comes back undefined even though `teamId` is
  // populated. Fall back to the team URL from our tenant config so deep
  // links keep working ("/t/<team>/documents/<id>" instead of the unsupported
  // "/documents/<id>" route).
  return {
    ...mapDocument(d),
    envelopeId: d.envelopeId,
    visibility: d.visibility,
    externalId: d.externalId,
    teamId: d.teamId,
    teamUrl: d.team?.url ?? tenantTeamUrl ?? null,
  };
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                Documents                                */
/* ─────────────────────────────────────────────────────────────────────── */

export type DocumentListInput = {
  query?: string;
  status?: SignStatus;
  page?: number;
  perPage?: number;
};

export async function listDocuments(
  tenant: SignTenantConfig,
  input: DocumentListInput = {},
): Promise<{
  items: DocumentSummary[];
  totalPages: number;
  currentPage: number;
  count: number;
}> {
  const fetcher = tenantFetch(tenant);
  const qs = new URLSearchParams();
  if (input.query) qs.set("query", input.query);
  if (input.status) qs.set("status", input.status);
  qs.set("page", String(input.page ?? 1));
  qs.set("perPage", String(Math.min(100, input.perPage ?? 50)));
  qs.set("orderByColumn", "createdAt");
  qs.set("orderByDirection", "desc");

  const r = await fetchJson<FindResponse>(
    fetcher,
    "documenso",
    `/api/v2/document?${qs.toString()}`,
  );
  return {
    items: (r?.data ?? []).map(mapDocument),
    totalPages: r?.totalPages ?? 1,
    currentPage: r?.currentPage ?? 1,
    count: r?.count ?? 0,
  };
}

/**
 * Lädt eine PDF-Datei nach Documenso hoch und legt eine neue Document-Resource
 * an. Verwendet `/api/v2/document/create` (multipart: `payload` JSON + `file`
 * Binary). Documenso hängt den Upload an ein neues, leeres Document an;
 * Empfänger und Felder können danach im Documenso-Editor zugeordnet werden.
 *
 * Empfänger können optional schon hier mitgegeben werden (für Fälle ohne
 * Editor-Zwischenschritt).
 */
export async function createDocumentFromPdf(
  tenant: SignTenantConfig,
  input: {
    title: string;
    pdf: Buffer;
    filename: string;
    recipients?: Array<{
      email: string;
      name?: string;
      role?: "SIGNER" | "VIEWER" | "APPROVER" | "CC" | "ASSISTANT";
      signingOrder?: number;
    }>;
    externalId?: string;
  },
): Promise<{ documentId: number }> {
  const fd = new FormData();
  const payload: Record<string, unknown> = { title: input.title };
  if (input.externalId) payload.externalId = input.externalId;
  if (input.recipients?.length) payload.recipients = input.recipients;
  fd.append("payload", JSON.stringify(payload));
  fd.append(
    "file",
    new Blob([new Uint8Array(input.pdf)], { type: "application/pdf" }),
    input.filename,
  );

  // Documenso-Upload muss am internen Origin landen (gleiche Logik wie alle
  // anderen Calls), aber Authorization-Header und Endpoint setzen wir manuell,
  // weil createAppFetch JSON-Bodies erwartet und wir hier multipart senden.
  const url = `${INTERNAL}/api/v2/document/create`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${tenant.apiToken}` },
    body: fd,
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppApiError(
      "documenso",
      res.status,
      "/api/v2/document/create",
      body,
    );
  }
  // Documenso v2 antwortet mit dem vollständigen RawDocument.
  const json = (await res.json()) as RawDocument | { document?: RawDocument };
  const doc =
    "id" in (json as RawDocument)
      ? (json as RawDocument)
      : ((json as { document?: RawDocument }).document ?? null);
  if (!doc?.id) {
    throw new AppApiError(
      "documenso",
      res.status,
      "/api/v2/document/create",
      `unerwartete Antwort: ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return { documentId: doc.id };
}

export async function getDocument(
  tenant: SignTenantConfig,
  documentId: number,
): Promise<DocumentDetail> {
  const fetcher = tenantFetch(tenant);
  const r = await fetchJson<RawDocument>(
    fetcher,
    "documenso",
    `/api/v2/document/${documentId}`,
  );
  return mapDocumentDetail(r, tenant.teamUrl);
}

export async function getTotals(tenant: SignTenantConfig): Promise<SignTotals> {
  // Documenso doesn't expose a single "counts" endpoint — issue four cheap
  // perPage=1 calls in parallel, which still fits in a few hundred ms.
  const statuses: SignStatus[] = ["DRAFT", "PENDING", "COMPLETED", "REJECTED"];
  const counts = await Promise.all(
    statuses.map((status) =>
      listDocuments(tenant, { status, perPage: 1 }).then((r) => r.count),
    ),
  );
  return {
    draft: counts[0],
    pending: counts[1],
    completed: counts[2],
    rejected: counts[3],
  };
}

export async function deleteDocument(
  tenant: SignTenantConfig,
  documentId: number,
): Promise<void> {
  const fetcher = tenantFetch(tenant);
  const r = await fetcher(`/api/v2/document/delete`, {
    method: "POST",
    json: { documentId },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new AppApiError("documenso", r.status, "/api/v2/document/delete", body);
  }
}

/**
 * Optional sender-customisation that the Documenso v2 endpoints accept on
 * the same `meta` envelope. We expose the two fields admins actually tweak
 * per-send (subject + message), and let Documenso fall back to its
 * defaults for everything else.
 */
export type DistributeMeta = {
  subject?: string;
  message?: string;
};

function buildMeta(
  meta: DistributeMeta | undefined,
): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  if (meta.subject?.trim()) out.subject = meta.subject.trim();
  if (meta.message?.trim()) out.message = meta.message.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

export async function distributeDocument(
  tenant: SignTenantConfig,
  documentId: number,
  meta?: DistributeMeta,
): Promise<void> {
  const fetcher = tenantFetch(tenant);
  const payload: Record<string, unknown> = { documentId };
  const m = buildMeta(meta);
  if (m) payload.meta = m;
  const r = await fetcher(`/api/v2/document/distribute`, {
    method: "POST",
    json: payload,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new AppApiError(
      "documenso",
      r.status,
      "/api/v2/document/distribute",
      body,
    );
  }
}

export async function redistributeDocument(
  tenant: SignTenantConfig,
  documentId: number,
  recipients?: number[],
  meta?: DistributeMeta,
): Promise<void> {
  const fetcher = tenantFetch(tenant);
  const payload: Record<string, unknown> = { documentId };
  if (recipients?.length) payload.recipients = recipients;
  const m = buildMeta(meta);
  if (m) payload.meta = m;
  const r = await fetcher(`/api/v2/document/redistribute`, {
    method: "POST",
    json: payload,
  });
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new AppApiError(
      "documenso",
      r.status,
      "/api/v2/document/redistribute",
      body,
    );
  }
}

/**
 * "Repeat" workflow: take an existing (typically completed/rejected) document
 * and create a fresh draft from it. We re-upload the rendered PDF and
 * carry over the recipients (without the signing-state) so the user lands
 * in the editor with everything wired up except the field positions —
 * which they'll need to redo since the source bytes already include the
 * signatures from the previous run.
 *
 * Returns the new document id; status is DRAFT until the caller calls
 * `distributeDocument` (or hits "Senden" in the UI).
 */
export async function repeatDocument(
  tenant: SignTenantConfig,
  sourceDocumentId: number,
): Promise<{ documentId: number }> {
  const source = await getDocument(tenant, sourceDocumentId);
  const pdf = await downloadDocumentPdf(tenant, sourceDocumentId);

  const recipients = source.recipients
    .filter((r) => r.role !== "CC")
    .map((r) => ({
      email: r.email,
      name: r.name,
      role: r.role,
      signingOrder: r.signingOrder ?? undefined,
    }));

  const newTitle = source.title.startsWith("Wiederholung: ")
    ? source.title
    : `Wiederholung: ${source.title}`;

  return createDocumentFromPdf(tenant, {
    title: newTitle,
    pdf,
    filename: `${source.title.replace(/[^a-z0-9-_]+/gi, "_") || "document"}.pdf`,
    recipients,
    externalId: source.externalId
      ? `${source.externalId}.repeat.${Date.now()}`
      : undefined,
  });
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                Recipients                               */
/* ─────────────────────────────────────────────────────────────────────── */

export type RecipientUpsertInput = {
  email: string;
  name: string;
  role?: "SIGNER" | "VIEWER" | "APPROVER" | "CC" | "ASSISTANT";
  signingOrder?: number;
};

type RawRecipientCreated = {
  id: number;
  email: string;
  name: string;
  role: RecipientSummary["role"];
  signingOrder: number | null;
  signingStatus: RecipientSummary["signingStatus"];
  readStatus: RecipientSummary["readStatus"];
  sendStatus: RecipientSummary["sendStatus"];
  signedAt: string | null;
  rejectionReason: string | null;
  token: string;
};

/**
 * Replace the entire recipient list of a draft document with `inputs`.
 * Documenso v2 exposes per-recipient endpoints, but we want a single atomic
 * call from the UI standpoint, so we delete all current recipients first
 * (those that aren't in `inputs` by email) and then `create-many` for the
 * net-new ones plus `update-many` for those that already existed.
 */
export async function replaceRecipients(
  tenant: SignTenantConfig,
  documentId: number,
  inputs: RecipientUpsertInput[],
): Promise<RecipientSummary[]> {
  const fetcher = tenantFetch(tenant);

  // Look up the current set so we can diff. Documenso returns a full
  // RawDocument with `recipients` populated.
  const current = await fetchJson<RawDocument>(
    fetcher,
    "documenso",
    `/api/v2/document/${documentId}`,
  );
  const existing = current?.recipients ?? [];
  const existingByEmail = new Map(
    existing.map((r) => [r.email.toLowerCase(), r]),
  );
  const wantedEmails = new Set(inputs.map((r) => r.email.toLowerCase()));

  // 1) Delete recipients that are no longer wanted.
  await Promise.all(
    existing
      .filter((r) => !wantedEmails.has(r.email.toLowerCase()))
      .map(async (r) => {
        const res = await fetcher(`/api/v2/recipient/delete`, {
          method: "POST",
          json: { recipientId: r.id },
        });
        if (!res.ok) {
          throw new AppApiError(
            "documenso",
            res.status,
            "/api/v2/recipient/delete",
            await res.text().catch(() => ""),
          );
        }
      }),
  );

  // 2) Update existing recipients that overlap by email (role / order changed).
  const toUpdate = inputs
    .map((i) => {
      const ex = existingByEmail.get(i.email.toLowerCase());
      if (!ex) return null;
      return { ex, i };
    })
    .filter((x): x is { ex: RawRecipient; i: RecipientUpsertInput } => x !== null);
  if (toUpdate.length > 0) {
    const res = await fetcher(`/api/v2/recipient/update-many`, {
      method: "POST",
      json: {
        documentId,
        recipients: toUpdate.map(({ ex, i }) => ({
          id: ex.id,
          name: i.name,
          role: i.role ?? "SIGNER",
          signingOrder: i.signingOrder ?? null,
        })),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AppApiError(
        "documenso",
        res.status,
        "/api/v2/recipient/update-many",
        body,
      );
    }
  }

  // 3) Create the net-new recipients.
  const toCreate = inputs.filter(
    (i) => !existingByEmail.has(i.email.toLowerCase()),
  );
  if (toCreate.length > 0) {
    const res = await fetcher(`/api/v2/recipient/create-many`, {
      method: "POST",
      json: {
        documentId,
        recipients: toCreate.map((i) => ({
          email: i.email,
          name: i.name,
          role: i.role ?? "SIGNER",
          signingOrder: i.signingOrder,
        })),
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new AppApiError(
        "documenso",
        res.status,
        "/api/v2/recipient/create-many",
        body,
      );
    }
  }

  // 4) Re-fetch and return canonical shape.
  const after = await getDocument(tenant, documentId);
  return after.recipients;
}

export async function deleteRecipient(
  tenant: SignTenantConfig,
  recipientId: number,
): Promise<void> {
  const fetcher = tenantFetch(tenant);
  const res = await fetcher(`/api/v2/recipient/delete`, {
    method: "POST",
    json: { recipientId },
  });
  if (!res.ok) {
    throw new AppApiError(
      "documenso",
      res.status,
      "/api/v2/recipient/delete",
      await res.text().catch(() => ""),
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                  Fields                                 */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Documenso field types. We expose the four the UI offers (signature, date,
 * initials, free text) but the rest survive untouched if they were created
 * by Documenso's native editor, since `listFields` returns them as-is.
 */
export type FieldType =
  | "SIGNATURE"
  | "DATE"
  | "INITIALS"
  | "TEXT"
  | "EMAIL"
  | "NAME"
  | "CHECKBOX";

export type FieldSummary = {
  id: number;
  recipientId: number;
  type: FieldType;
  /** 1-indexed page. */
  page: number;
  /** All four are percentages (0..100) of the page width / height. */
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
  /** Optional label (TEXT/CHECKBOX). */
  label?: string;
};

type RawField = {
  id: number;
  recipientId: number;
  type: FieldType;
  page: number;
  positionX: number;
  positionY: number;
  width: number;
  height: number;
  fieldMeta?: { label?: string } | null;
};

function mapField(f: RawField): FieldSummary {
  return {
    id: f.id,
    recipientId: f.recipientId,
    type: f.type,
    page: f.page,
    pageX: f.positionX,
    pageY: f.positionY,
    pageWidth: f.width,
    pageHeight: f.height,
    label: f.fieldMeta?.label ?? undefined,
  };
}

export async function listFields(
  tenant: SignTenantConfig,
  documentId: number,
): Promise<FieldSummary[]> {
  const fetcher = tenantFetch(tenant);
  // Documenso v2 returns an array of fields when the doc has any.
  const r = await fetchJson<{ fields?: RawField[] } | RawField[]>(
    fetcher,
    "documenso",
    `/api/v2/document/${documentId}/fields`,
  );
  const list = Array.isArray(r) ? r : (r?.fields ?? []);
  return list.map(mapField);
}

export type FieldCreateInput = {
  type: FieldType;
  recipientId: number;
  page: number;
  pageX: number;
  pageY: number;
  pageWidth: number;
  pageHeight: number;
  label?: string;
};

export async function createFields(
  tenant: SignTenantConfig,
  documentId: number,
  fields: FieldCreateInput[],
): Promise<FieldSummary[]> {
  if (fields.length === 0) return [];
  const fetcher = tenantFetch(tenant);
  const res = await fetcher(`/api/v2/envelope/field/create-many`, {
    method: "POST",
    json: {
      documentId,
      fields: fields.map((f) => ({
        type: f.type,
        recipientId: f.recipientId,
        pageNumber: f.page,
        pageX: f.pageX,
        pageY: f.pageY,
        width: f.pageWidth,
        height: f.pageHeight,
        fieldMeta: f.label ? { type: "text", label: f.label } : undefined,
      })),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new AppApiError(
      "documenso",
      res.status,
      "/api/v2/envelope/field/create-many",
      body,
    );
  }
  // Servers vary in how they shape the response; just re-fetch.
  return listFields(tenant, documentId);
}

export async function deleteField(
  tenant: SignTenantConfig,
  fieldId: number,
): Promise<void> {
  const fetcher = tenantFetch(tenant);
  const res = await fetcher(`/api/v2/envelope/field/delete`, {
    method: "POST",
    json: { fieldId },
  });
  if (!res.ok) {
    throw new AppApiError(
      "documenso",
      res.status,
      "/api/v2/envelope/field/delete",
      await res.text().catch(() => ""),
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                  Files                                  */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Stream the document's PDF file via `/api/v2/document/{id}/download`.
 *
 * Documenso behaviour observed in the wild:
 *   - newer self-hosted builds return the PDF bytes directly (Content-Type
 *     `application/pdf`, body starts with `%PDF-`)
 *   - some older / cloud builds return a JSON envelope `{ downloadUrl: "..." }`
 *     pointing at a signed S3 URL
 *
 * We handle both: peek at the response, and either pass the bytes through
 * or follow the signed URL once. We always proxy through the portal API
 * because the signed URL has tight expiration / IP allow-lists that would
 * break in the browser.
 */
export async function downloadDocumentPdf(
  tenant: SignTenantConfig,
  documentId: number,
): Promise<Buffer> {
  const fetcher = tenantFetch(tenant);
  const path = `/api/v2/document/${documentId}/download`;

  const res = await fetcher(path, {
    method: "GET",
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) {
    throw new AppApiError(
      "documenso",
      res.status,
      path,
      await res.text().catch(() => ""),
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());

  // Direct PDF (newer self-hosted Documenso): magic header `%PDF`.
  if (buf.length >= 4 && buf.slice(0, 4).toString("ascii") === "%PDF") {
    return buf;
  }

  // JSON envelope variant — body is `{ downloadUrl: "..." }`.
  let envelope: { downloadUrl?: string } | null = null;
  try {
    envelope = JSON.parse(buf.toString("utf-8"));
  } catch {
    /* fall through to error below */
  }
  const url = envelope?.downloadUrl;
  if (!url) {
    throw new AppApiError(
      "documenso",
      502,
      path,
      "expected PDF bytes or { downloadUrl }, got: " +
        buf.slice(0, 200).toString("utf-8"),
    );
  }

  const signed = await fetch(url, { signal: AbortSignal.timeout(60_000) });
  if (!signed.ok) {
    throw new AppApiError(
      "documenso",
      signed.status,
      url,
      await signed.text().catch(() => ""),
    );
  }
  return Buffer.from(await signed.arrayBuffer());
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Deep links                                 */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Build a Documenso deep link to open a document in their UI for editing or
 * adding fields. Falls back to the "documents" list when no team URL is
 * available (the public app then routes the user to the right team after
 * SSO login).
 */
export function documensoDocumentUrl(
  documentId: number,
  teamUrl: string | null | undefined,
): string {
  if (teamUrl) {
    return `${PUBLIC}/t/${teamUrl}/documents/${documentId}`;
  }
  return `${PUBLIC}/documents/${documentId}`;
}

/** Public per-recipient signing URL (the link Documenso emails out). */
export function documensoSignUrl(token: string): string {
  return `${PUBLIC}/sign/${token}`;
}
