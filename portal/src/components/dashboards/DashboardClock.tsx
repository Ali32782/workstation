"use client";

import { useEffect, useState } from "react";
import { useLocale } from "@/components/LocaleProvider";
import { localeTag } from "@/lib/i18n/messages";

/**
 * Live wall-clock for the dashboard header. Updates every 30s — we only
 * show hours+minutes so a 1Hz tick would be wasteful. The component is
 * intentionally tiny and renders nothing until mounted to avoid an SSR
 * value flashing into a slightly different client value at hydration.
 */
export function DashboardClock({ className }: { className?: string }) {
  const { locale } = useLocale();
  const tag = localeTag(locale);
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) {
    return (
      <span className={className} aria-hidden>
        &nbsp;
      </span>
    );
  }

  const time = new Intl.DateTimeFormat(tag, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);

  return (
    <time
      dateTime={now.toISOString()}
      className={className}
      suppressHydrationWarning
    >
      {time}
    </time>
  );
}
