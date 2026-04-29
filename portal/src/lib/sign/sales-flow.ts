/**
 * Portal-facing copy for the sales signing path (eSign MVP).
 * Documenso statuses: DRAFT → PENDING → COMPLETED (or REJECTED).
 */

import type { SignStatus } from "./types";

/** Prefix for Twenty / portal company id stored in Documenso `externalId`. */
export const SIGN_EXTERNAL_ID_COMPANY_PREFIX = "company:" as const;

export function formatSignExternalIdForCompany(companyId: string): string {
  return `${SIGN_EXTERNAL_ID_COMPANY_PREFIX}${companyId.trim()}`;
}

/** Returns CRM company UUID when `externalId` was set via `formatSignExternalIdForCompany`. */
export function parseCompanyIdFromSignExternalId(
  externalId: string | null | undefined,
): string | null {
  if (!externalId?.trim()) return null;
  const raw = externalId.trim();
  if (!raw.startsWith(SIGN_EXTERNAL_ID_COMPANY_PREFIX)) return null;
  const id = raw.slice(SIGN_EXTERNAL_ID_COMPANY_PREFIX.length).trim();
  return /^[0-9a-f-]{36}$/i.test(id) ? id : null;
}

export function signSalesPhaseLabelDe(status: SignStatus): string {
  switch (status) {
    case "DRAFT":
      return "Vorbereitung";
    case "PENDING":
      return "Zur Unterschrift";
    case "COMPLETED":
      return "Abgeschlossen";
    case "REJECTED":
      return "Abgelehnt";
  }
}

/** One-line operator hint — next concrete action in the MVP flow. */
export function signSalesNextStepDe(status: SignStatus): string {
  switch (status) {
    case "DRAFT":
      return "Nächster Schritt: „Felder & Empfänger im Editor“, dann zur Unterschrift senden.";
    case "PENDING":
      return "Nächster Schritt: Auf Unterschriften warten — bei Bedarf erinnern.";
    case "COMPLETED":
      return "Abgeschlossen — PDF unten als Archiv herunterladen oder in Documenso öffnen.";
    case "REJECTED":
      return "Abgelehnt — neues Dokument anlegen oder Details in Documenso prüfen.";
  }
}

/** Safe filename for signed PDF download (ASCII-heavy for Content-Disposition). */
export function signArchivePdfFilename(docTitle: string, documentId: number): string {
  const raw =
    docTitle
      .trim()
      .replace(/[/\\?%*:|"<>]/g, "_")
      .replace(/\s+/g, "_")
      .slice(0, 96) || `signiert-${documentId}`;
  const base = /^[a-zA-Z0-9._-]+$/.test(raw) ? raw : `signiert-${documentId}`;
  return base.toLowerCase().endsWith(".pdf") ? base : `${base}.pdf`;
}
