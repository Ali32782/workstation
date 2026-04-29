/**
 * Canonical CRM mail-merge tokens (client + server safe).
 * Keep in sync with `companyContext()` in `./merge.ts`.
 */

export const CRM_MERGE_SCHEMA_VERSION = 1;

export const CRM_MERGE_TOKENS: Array<{ token: string; description: string }> = [
  { token: "company.name", description: "Firmenname" },
  { token: "company.domain", description: "Webseite" },
  { token: "company.employees", description: "Anzahl Therapeut*innen" },
  { token: "company.city", description: "Ort" },
  { token: "company.country", description: "Land" },
  { token: "company.email", description: "Generelle E-Mail" },
  { token: "company.phone", description: "Telefon" },
  { token: "company.owner", description: "Owner / Kontakt im CRM" },
  { token: "company.leadSource", description: "Lead-Quelle" },
  {
    token: "company.bookingSystem",
    description: "Termin-/Praxissoftware (Booking-System)",
  },
  { token: "today", description: "Heutiges Datum (DD.MM.YYYY)" },
];
