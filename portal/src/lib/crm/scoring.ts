import type { CompanySummary } from "./types";

/**
 * Heuristic 0-100 lead-scoring for the Triage view.
 *
 * The points are tuned for the MedTheris funnel where the operator's job
 * is to push *contactable* leads into Mautic — so signals that mean
 * "I can actually reach this lead today" carry the most weight (email,
 * phone, owner). Reputation signals (Google rating, ICP flag) layer on
 * top once contactability is solved. Recency gets a small bump because
 * a freshly-touched record usually has the cleanest data.
 *
 * Scores group cleanly into three bands:
 *   • 0 – 39   "kalt" (rot)      → Datenpflege oder Auto-Enrichment
 *   • 40 – 69  "warm" (gelb)     → kontaktierbar, Triage lohnt
 *   • 70+      "heiß" (grün)     → direkt in den Funnel
 *
 * Implementation note: keep this function pure. The frontend uses it to
 * render colour chips during list rendering, so a stable `companyId →
 * score` mapping at every keystroke matters more than perfect accuracy.
 */
export function scoreLead(c: CompanySummary): number {
  let score = 0;
  const email = (c.generalEmail || c.ownerEmail || "").trim();
  if (email && /^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(email)) score += 25;

  const phone = (c.phone || "").trim();
  if (phone && /\d{4,}/.test(phone)) score += 20;

  if (c.ownerName && c.ownerName.trim().length > 0) score += 15;

  if (c.leadSource && c.leadSource.trim().length > 0) score += 10;

  if (typeof c.googleRating === "number" && c.googleRating >= 4.0) score += 15;
  else if (typeof c.googleRating === "number" && c.googleRating >= 3.5) score += 5;

  if (c.domain && c.domain.trim().length > 0) score += 10;

  // Recency bump — anything touched in the last 7 days is implicitly
  // "in flight" and probably worth surfacing.
  const updated = c.updatedAt ? new Date(c.updatedAt).getTime() : 0;
  if (updated > 0 && Date.now() - updated < 1000 * 60 * 60 * 24 * 7) score += 5;

  return Math.min(100, score);
}

/** Convenience tier for the chip colour. */
export function scoreTier(score: number): "cold" | "warm" | "hot" {
  if (score >= 70) return "hot";
  if (score >= 40) return "warm";
  return "cold";
}

/** Plain-language label for tooltips and ARIA text. */
export function scoreLabel(score: number): string {
  const tier = scoreTier(score);
  return tier === "hot"
    ? "heiß — direkt in den Funnel"
    : tier === "warm"
      ? "warm — Triage lohnt"
      : "kalt — Datenpflege oder Auto-Enrichment";
}
