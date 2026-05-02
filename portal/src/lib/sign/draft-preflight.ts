import type { FieldSummary } from "@/lib/sign/documenso";
import type { RecipientSummary } from "@/lib/sign/types";

/** Documenso `distribute` requires every SIGNER to have at least one signature-like field. */
export function draftSignatureCoveragePreflight(
  recipients: RecipientSummary[],
  fields: FieldSummary[],
): { ok: boolean; missingSignatureFor: string[] } {
  const signatureRecipientIds = new Set<number>(
    fields
      .filter((f) => {
        const t = String(f.type).toUpperCase();
        return t === "SIGNATURE" || t === "FREE_SIGNATURE";
      })
      .map((f) => Number(f.recipientId)),
  );
  const missing: string[] = [];
  for (const r of recipients) {
    if (r.role !== "SIGNER") continue;
    if (!signatureRecipientIds.has(Number(r.id))) {
      missing.push(r.name?.trim() || r.email || `Empfänger #${r.id}`);
    }
  }
  return { ok: missing.length === 0, missingSignatureFor: missing };
}
