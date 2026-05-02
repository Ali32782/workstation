/**
 * Date helpers shared by helpdesk + CRM + calls views.
 *
 * `groupKey` returns a bucket label for grouping (today / yesterday /
 * weekday name / locale-formatted date) — aligned with Outlook / Slack-style feeds.
 */

export type RelativeDayLabels = {
  unknown: string;
  today: string;
  yesterday: string;
};

export function groupKey(
  iso: string | Date,
  localeTag: string,
  labels: RelativeDayLabels,
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return labels.unknown;

  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

  const today = startOfDay(now);
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays === 0) return labels.today;
  if (diffDays === 1) return labels.yesterday;
  if (diffDays < 7) {
    return d.toLocaleDateString(localeTag, { weekday: "long" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString(localeTag, { day: "2-digit", month: "long" });
  }
  return d.toLocaleDateString(localeTag, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function shortTime(iso: string | Date, localeTag: string): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(localeTag, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Group an array of items by their date field, preserving the original order
 * inside each group. Returns groups in the order they first appear.
 */
export function groupByDate<T>(
  items: T[],
  pickIso: (item: T) => string | Date,
  localeTag: string,
  labels: RelativeDayLabels,
): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  const idx: Record<string, number> = {};
  for (const it of items) {
    const k = groupKey(pickIso(it), localeTag, labels);
    if (!(k in idx)) {
      idx[k] = out.length;
      out.push({ label: k, items: [] });
    }
    out[idx[k]].items.push(it);
  }
  return out;
}
