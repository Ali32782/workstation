import type { CompanyDetail } from "@/lib/crm/types";

/**
 * Best-effort hostname for deep-links (Mail-Suche, Helpdesk-Hinweis). Prefers
 * the simple `domain` field, then the primary website URL on the company.
 */
export function companySiteDomain(c: CompanyDetail): string | null {
  const d = c.domain?.trim();
  if (d) {
    const host = d.replace(/^https?:\/\//i, "").split("/")[0]?.trim();
    return host || null;
  }
  const url = c.domainName?.primaryLinkUrl?.trim();
  if (url) {
    try {
      const u = new URL(url.startsWith("http") ? url : `https://${url}`);
      return u.hostname || null;
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Prefer domain for Nextcloud filename SEARCH; else company name (≥2 chars).
 * Used by Company Hub → `/files?q=…`.
 */
export function companyFilesSearchHint(
  domain: string | null,
  companyName: string,
): string | null {
  if (domain) {
    const d = domain.replace(/^www\./i, "").trim();
    if (d.length >= 2) return d.slice(0, 200);
  }
  const n = companyName.trim();
  if (n.length >= 2) return n.slice(0, 120);
  return null;
}
