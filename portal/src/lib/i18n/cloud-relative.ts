import { localeTag, type Locale, type Messages } from "@/lib/i18n/messages";

/**
 * Formats a Date into 24h "HH:mm" regardless of the user's browser locale.
 *
 * Why this exists: `toLocaleTimeString(tag)` defaults to the locale's
 * "regional" format. For en-US that's 12h with AM/PM, even when the user has
 * picked English-as-Lingua-Franca on a Swiss-German operations dashboard
 * full of 24h timestamps everywhere else. We standardise on 24h portal-wide.
 */
export function formatTime24(d: Date | string | number, locale: Locale): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleTimeString(localeTag(locale), {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Date + 24h time on a single line, e.g. "02.05.2026, 23:48". */
export function formatDateTime24(d: Date | string | number, locale: Locale): string {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(localeTag(locale), {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function cloudRelative(
  iso: string,
  locale: Locale,
  t: (key: keyof Messages, fb?: string) => string,
): string {
  const tag = localeTag(locale);
  const ms = new Date(iso).getTime();
  if (!ms) return "—";
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return t("common.relative.justNow");
  if (diff < 3600)
    return t("common.relative.minutesAgo").replace("{n}", String(Math.floor(diff / 60)));
  if (diff < 86400)
    return t("common.relative.hoursAgo").replace("{n}", String(Math.floor(diff / 3600)));
  const days = Math.floor(diff / 86400);
  if (diff < 86400 * 7) {
    return days === 1
      ? t("common.relative.daysAgoOne")
      : t("common.relative.daysAgoMany").replace("{n}", String(days));
  }
  return new Date(iso).toLocaleDateString(tag, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
