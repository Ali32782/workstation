import "server-only";
import { parseCsv, detectDelimiter } from "@/lib/csv/parse";

/**
 * CSV import helpers for the CRM ("Twenty") app.
 *
 * Two record types in one file:
 *   - **Companies** (organisations / accounts)
 *   - **People**   (contacts / leads)
 *
 * Why two types? The most common imports out there — HubSpot, Pipedrive,
 * Salesforce, plain Excel exports — are structured around People with
 * an embedded company column. To make round-trips simple we accept either:
 *
 *   (a) a "people" CSV with `firstName`, `lastName`, `email`, `company` —
 *       the company column is upserted by name; the person is linked.
 *   (b) a pure "company" CSV with `name`, `domainName`, `industry`, etc.
 *
 * The caller selects the mode in the UI; the auto-mapping below tries
 * to detect it from the header row when possible.
 */

/* ─── Canonical fields ─────────────────────────────────────────────── */

export type CompanyField =
  | "name"
  | "domainName"
  | "industry"
  | "phone"
  | "address"
  | "city"
  | "country"
  | "annualRecurringRevenue"
  | "employees"
  | "linkedinUrl"
  | "xUrl"
  | "notes"
  | "ignore";

export type PersonField =
  | "firstName"
  | "lastName"
  | "fullName"
  | "email"
  | "phone"
  | "jobTitle"
  | "city"
  | "country"
  | "linkedinUrl"
  | "xUrl"
  | "company"
  | "notes"
  | "ignore";

export type CrmEntity = "companies" | "people";

/* ─── Default header → field mapping ───────────────────────────────── */

const COMPANY_HEADER_ALIASES: Record<string, CompanyField> = {
  name: "name",
  company: "name",
  "company name": "name",
  organisation: "name",
  organization: "name",
  domain: "domainName",
  domainname: "domainName",
  "domain name": "domainName",
  website: "domainName",
  url: "domainName",
  industry: "industry",
  branche: "industry",
  phone: "phone",
  telephone: "phone",
  telefon: "phone",
  address: "address",
  street: "address",
  strasse: "address",
  city: "city",
  stadt: "city",
  ort: "city",
  country: "country",
  land: "country",
  arr: "annualRecurringRevenue",
  revenue: "annualRecurringRevenue",
  umsatz: "annualRecurringRevenue",
  employees: "employees",
  mitarbeiter: "employees",
  "company size": "employees",
  linkedin: "linkedinUrl",
  "linkedin url": "linkedinUrl",
  twitter: "xUrl",
  "twitter url": "xUrl",
  x: "xUrl",
  notes: "notes",
  notizen: "notes",
};

const PERSON_HEADER_ALIASES: Record<string, PersonField> = {
  firstname: "firstName",
  "first name": "firstName",
  vorname: "firstName",
  lastname: "lastName",
  "last name": "lastName",
  surname: "lastName",
  nachname: "lastName",
  fullname: "fullName",
  "full name": "fullName",
  name: "fullName",
  email: "email",
  "e-mail": "email",
  mail: "email",
  emailaddress: "email",
  phone: "phone",
  telephone: "phone",
  telefon: "phone",
  mobile: "phone",
  "mobile phone": "phone",
  jobtitle: "jobTitle",
  "job title": "jobTitle",
  title: "jobTitle",
  position: "jobTitle",
  rolle: "jobTitle",
  city: "city",
  stadt: "city",
  country: "country",
  land: "country",
  linkedin: "linkedinUrl",
  "linkedin url": "linkedinUrl",
  twitter: "xUrl",
  "twitter url": "xUrl",
  x: "xUrl",
  company: "company",
  "company name": "company",
  organisation: "company",
  organization: "company",
  account: "company",
  notes: "notes",
  notizen: "notes",
};

export function defaultMappingFor(
  entity: CrmEntity,
  headers: string[],
): Record<string, string> {
  const aliases =
    entity === "companies" ? COMPANY_HEADER_ALIASES : PERSON_HEADER_ALIASES;
  const out: Record<string, string> = {};
  headers.forEach((h) => {
    const key = h.trim().toLowerCase();
    out[h] = aliases[key] ?? "ignore";
  });
  return out;
}

/* ─── Drafts ──────────────────────────────────────────────────────── */

export type CompanyDraft = {
  rowIndex: number;
  name: string;
  domainName?: string;
  industry?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  annualRecurringRevenue?: number;
  employees?: number;
  linkedinUrl?: string;
  xUrl?: string;
  notes?: string;
  errors: string[];
};

export type PersonDraft = {
  rowIndex: number;
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  jobTitle?: string;
  city?: string;
  country?: string;
  linkedinUrl?: string;
  xUrl?: string;
  company?: string;
  notes?: string;
  errors: string[];
};

export type CrmImportPreview = {
  entity: CrmEntity;
  headers: string[];
  delimiter: string;
  totals: { rows: number; valid: number; skipped: number };
  companies: CompanyDraft[];
  people: PersonDraft[];
  mapping: Record<string, string>;
};

/* ─── Helpers ─────────────────────────────────────────────────────── */

function normaliseEmail(s: string): string | undefined {
  const v = s.trim().toLowerCase();
  if (!v || !/.+@.+\..+/.test(v)) return undefined;
  return v;
}

function splitFullName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function toNumber(s: string): number | undefined {
  if (!s) return undefined;
  // Tolerant: "1.234,56" → 1234.56, "1,234,567" → 1234567, "EUR 12 500" → 12500
  const cleaned = s.replace(/[^\d.,-]/g, "");
  if (!cleaned) return undefined;
  // German number? has comma as decimal and dot as thousands.
  const hasComma = cleaned.includes(",");
  const hasDot = cleaned.includes(".");
  let n: number;
  if (hasComma && hasDot) {
    if (cleaned.lastIndexOf(",") > cleaned.lastIndexOf(".")) {
      // German
      n = Number(cleaned.replace(/\./g, "").replace(",", "."));
    } else {
      // English
      n = Number(cleaned.replace(/,/g, ""));
    }
  } else if (hasComma) {
    // Could be thousands or decimal. If only one comma and ≤2 digits after → decimal.
    const partsRight = cleaned.split(",")[1] ?? "";
    n = partsRight.length <= 2
      ? Number(cleaned.replace(",", "."))
      : Number(cleaned.replace(/,/g, ""));
  } else {
    n = Number(cleaned);
  }
  return Number.isFinite(n) ? n : undefined;
}

function domainFromUrl(s: string): string | undefined {
  const v = s.trim();
  if (!v) return undefined;
  try {
    const url = new URL(v.startsWith("http") ? v : `https://${v}`);
    return url.hostname.replace(/^www\./, "") || undefined;
  } catch {
    return v.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] ||
      undefined;
  }
}

/* ─── Preview ─────────────────────────────────────────────────────── */

export function buildCrmPreview(args: {
  text: string;
  entity: CrmEntity;
  delimiter?: string;
  mapping?: Record<string, string>;
}): CrmImportPreview {
  const delimiter = args.delimiter ?? detectDelimiter(args.text);
  const rows = parseCsv(args.text, delimiter);
  if (rows.length === 0) {
    return {
      entity: args.entity,
      headers: [],
      delimiter,
      totals: { rows: 0, valid: 0, skipped: 0 },
      companies: [],
      people: [],
      mapping: {},
    };
  }

  const headers = rows[0].map((h) => h.trim());
  const mapping = args.mapping ?? defaultMappingFor(args.entity, headers);

  // Build header → mapped-field lookup (lower-cased keys come from defaultMappingFor;
  // user-supplied mapping uses the original header names, so we accept both).
  const fieldByIndex = headers.map(
    (h) => (mapping[h] ?? mapping[h.toLowerCase()] ?? "ignore"),
  );

  const companies: CompanyDraft[] = [];
  const people: PersonDraft[] = [];
  let valid = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.every((c) => !c || !c.trim())) continue;

    if (args.entity === "companies") {
      const draft: CompanyDraft = { rowIndex: r, name: "", errors: [] };
      row.forEach((rawValue, idx) => {
        const field = fieldByIndex[idx] as CompanyField;
        const value = (rawValue ?? "").trim();
        if (!value || field === "ignore") return;
        switch (field) {
          case "name":
            draft.name = value;
            break;
          case "domainName":
            draft.domainName = domainFromUrl(value);
            break;
          case "annualRecurringRevenue": {
            const n = toNumber(value);
            if (n != null) draft.annualRecurringRevenue = n;
            break;
          }
          case "employees": {
            const n = toNumber(value);
            if (n != null) draft.employees = Math.round(n);
            break;
          }
          default:
            (draft as Record<string, unknown>)[field] = value;
        }
      });
      if (!draft.name) {
        draft.errors.push("Pflichtfeld 'Name' fehlt");
        skipped++;
      } else {
        valid++;
      }
      companies.push(draft);
    } else {
      const draft: PersonDraft = { rowIndex: r, errors: [] };
      row.forEach((rawValue, idx) => {
        const field = fieldByIndex[idx] as PersonField;
        const value = (rawValue ?? "").trim();
        if (!value || field === "ignore") return;
        switch (field) {
          case "email":
            draft.email = normaliseEmail(value);
            break;
          case "fullName":
            draft.fullName = value;
            break;
          default:
            (draft as Record<string, unknown>)[field] = value;
        }
      });
      // Derive missing names from fullName when needed.
      if (!draft.firstName && !draft.lastName && draft.fullName) {
        const parts = splitFullName(draft.fullName);
        draft.firstName = parts.firstName;
        draft.lastName = parts.lastName;
      }
      if (!draft.firstName && !draft.lastName && !draft.email) {
        draft.errors.push("Mindestens Name oder E-Mail erforderlich");
        skipped++;
      } else {
        valid++;
      }
      people.push(draft);
    }
  }

  return {
    entity: args.entity,
    headers,
    delimiter,
    totals: { rows: rows.length - 1, valid, skipped },
    companies,
    people,
    mapping: Object.fromEntries(headers.map((h, i) => [h, fieldByIndex[i]])),
  };
}

/* ─── Field choices for the UI ────────────────────────────────────── */

export const COMPANY_FIELD_LABELS: Record<CompanyField, string> = {
  name: "Name",
  domainName: "Domain",
  industry: "Branche",
  phone: "Telefon",
  address: "Adresse",
  city: "Stadt",
  country: "Land",
  annualRecurringRevenue: "Umsatz (ARR)",
  employees: "Mitarbeiter",
  linkedinUrl: "LinkedIn",
  xUrl: "Twitter / X",
  notes: "Notizen",
  ignore: "Ignorieren",
};

export const PERSON_FIELD_LABELS: Record<PersonField, string> = {
  firstName: "Vorname",
  lastName: "Nachname",
  fullName: "Voller Name",
  email: "E-Mail",
  phone: "Telefon",
  jobTitle: "Position",
  city: "Stadt",
  country: "Land",
  linkedinUrl: "LinkedIn",
  xUrl: "Twitter / X",
  company: "Firma",
  notes: "Notizen",
  ignore: "Ignorieren",
};
