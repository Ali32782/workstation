/**
 * UTM / landing attribution (Welle 3). Stored portal-side until Twenty
 * exposes stable custom fields for all tenants.
 */

export type UtmTouchPayload = {
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  utm_term?: string | null;
  utm_content?: string | null;
  /** document.referrer or Referer header */
  referrer?: string | null;
  /** path + query, e.g. /angebot?utm_… */
  landingPath?: string | null;
  /** ISO timestamp when the touch was captured */
  capturedAt: string;
};

export type CompanyAttributionRecord = {
  companyId: string;
  workspace: string;
  firstTouch?: UtmTouchPayload;
  lastTouch?: UtmTouchPayload;
  updatedAt: string;
};

/** Normalise query string or URLSearchParams into UTM fields. */
export function utmFromSearchParams(
  sp: URLSearchParams,
): Omit<UtmTouchPayload, "capturedAt" | "referrer" | "landingPath"> {
  const g = (k: string) => {
    const v = sp.get(k);
    return v != null && v.trim() !== "" ? v.trim() : null;
  };
  return {
    utm_source: g("utm_source"),
    utm_medium: g("utm_medium"),
    utm_campaign: g("utm_campaign"),
    utm_term: g("utm_term"),
    utm_content: g("utm_content"),
  };
}

export function hasAnyUtm(
  p: Partial<Pick<UtmTouchPayload, keyof Omit<UtmTouchPayload, "capturedAt">>>,
): boolean {
  return Boolean(
    p.utm_source ||
      p.utm_medium ||
      p.utm_campaign ||
      p.utm_term ||
      p.utm_content ||
      p.referrer ||
      p.landingPath,
  );
}
