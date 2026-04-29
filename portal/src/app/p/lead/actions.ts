"use server";

import { submitPublicLead } from "@/lib/crm/public-lead";

export type PublicLeadFormState =
  | { ok: true }
  | { ok: false; message: string };

/**
 * Server-side form handler for the public `/p/lead` page. No bearer token:
 * submission is only possible through this action (same-origin). Spammers
 * hitting `/api/public/lead` directly still need `PUBLIC_LEAD_FORM_SECRET`.
 */
export async function submitPublicLeadFromPage(
  _prevState: PublicLeadFormState | undefined,
  formData: FormData,
): Promise<PublicLeadFormState> {
  const honeypot = formData.get("website");
  if (honeypot != null && String(honeypot).trim() !== "") {
    return { ok: true };
  }

  const companyName = String(formData.get("companyName") ?? "").trim();
  const nameRaw = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const phone = String(formData.get("phone") ?? "").trim();
  const message = String(formData.get("message") ?? "").trim();
  const pageUrl = String(formData.get("pageUrl") ?? "").trim();

  const parts = nameRaw.split(/\s+/).filter(Boolean);
  const firstName = parts[0] ?? "";
  const lastName =
    parts.length > 1 ? parts.slice(1).join(" ") : firstName ? "Kontakt" : "";

  if (!companyName || !firstName || !email) {
    return {
      ok: false,
      message: "Bitte Firma, Name und E-Mail ausfüllen.",
    };
  }

  const workspaceField = String(formData.get("workspace") ?? "").trim();
  const defaultWs = process.env.PUBLIC_LEAD_DEFAULT_WORKSPACE?.trim().toLowerCase();
  const workspace = (workspaceField || defaultWs || "").toLowerCase();

  const result = await submitPublicLead({
    workspace: workspace || undefined,
    companyName,
    firstName,
    lastName,
    email,
    phone: phone || undefined,
    message: message || undefined,
    pageUrl: pageUrl || undefined,
  });

  if (!result.ok) {
    const msg =
      result.code === "validation"
        ? "Bitte Eingaben prüfen (Name, Firma, gültige E-Mail)."
        : result.code === "workspace_required"
          ? "Workspace nicht konfiguriert (PUBLIC_LEAD_DEFAULT_WORKSPACE)."
          : result.code === "crm_not_configured"
            ? "CRM für diesen Workspace ist nicht eingerichtet."
            : "Senden fehlgeschlagen. Bitte später erneut versuchen.";
    return { ok: false, message: msg };
  }

  return { ok: true };
}
