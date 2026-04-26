/**
 * Date helpers shared by helpdesk + CRM views.
 *
 * `groupKey` returns one of: "Heute" | "Gestern" | "Diese Woche" | weekday |
 * absolute date — perfect for grouping conversation messages or activity feeds
 * the way Outlook / Slack / Linear do it.
 */

export function groupKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "Unbekannt";

  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

  const today = startOfDay(now);
  const day = startOfDay(d);
  const diffDays = Math.round((today - day) / 86_400_000);

  if (diffDays === 0) return "Heute";
  if (diffDays === 1) return "Gestern";
  if (diffDays < 7) {
    return d.toLocaleDateString("de-DE", { weekday: "long" });
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString("de-DE", { day: "2-digit", month: "long" });
  }
  return d.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function shortTime(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

/**
 * Group an array of items by their date field, preserving the original order
 * inside each group. Returns groups in the order they first appear.
 */
export function groupByDate<T>(
  items: T[],
  pickIso: (item: T) => string | Date,
): { label: string; items: T[] }[] {
  const out: { label: string; items: T[] }[] = [];
  const idx: Record<string, number> = {};
  for (const it of items) {
    const k = groupKey(pickIso(it));
    if (!(k in idx)) {
      idx[k] = out.length;
      out.push({ label: k, items: [] });
    }
    out[idx[k]].items.push(it);
  }
  return out;
}
