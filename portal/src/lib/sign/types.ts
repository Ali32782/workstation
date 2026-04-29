/**
 * Documenso (Sign) domain types.
 *
 * The portal exposes a flat, framework-agnostic shape so the UI never has
 * to know about Documenso's underlying envelope/document/recipient split.
 * Mapping happens in `documenso.ts` based on the v2 OpenAPI schema:
 * https://sign.kineo360.work/api/v2/openapi.json
 */

export type SignStatus = "DRAFT" | "PENDING" | "COMPLETED" | "REJECTED";

export type SignRole =
  | "SIGNER"
  | "APPROVER"
  | "VIEWER"
  | "CC"
  | "ASSISTANT";

export type SignSigningStatus = "NOT_SIGNED" | "SIGNED" | "REJECTED";
export type SignReadStatus = "NOT_OPENED" | "OPENED";
export type SignSendStatus = "NOT_SENT" | "SENT";

export type RecipientSummary = {
  id: number;
  email: string;
  name: string;
  role: SignRole;
  signingOrder: number | null;
  signingStatus: SignSigningStatus;
  readStatus: SignReadStatus;
  sendStatus: SignSendStatus;
  signedAt: string | null;
  rejectionReason: string | null;
  /** Per-recipient signing URL token (used to deep-link into Documenso). */
  token: string;
};

export type DocumentSummary = {
  id: number;
  title: string;
  status: SignStatus;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  source: "DOCUMENT" | "TEMPLATE" | "TEMPLATE_DIRECT_LINK";
  recipients: RecipientSummary[];
  /** The bridge user that owns the doc (we use a single bridge user). */
  ownerEmail: string | null;
  /** Convenience: count of NOT_SIGNED + SIGNER recipients. */
  pendingSigners: number;
  /**
   * When true, this document was marked portal-private (portal layer); other
   * team members won't see it in the CoreLab Sign list unless they are portal admins.
   */
  portalPrivate?: boolean;
};

export type DocumentDetail = DocumentSummary & {
  envelopeId: string;
  visibility: "EVERYONE" | "MANAGER_AND_ABOVE" | "ADMIN";
  externalId: string | null;
  teamId: number;
  teamUrl: string | null;
  /** True when this document was first created via a portal upload (authoritative for privacy toggles). */
  uploadedViaPortal?: boolean;
};

export type SignTotals = {
  draft: number;
  pending: number;
  completed: number;
  rejected: number;
};
