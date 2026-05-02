import { localeTag, type Locale, type Messages } from "@/lib/i18n/messages";

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
