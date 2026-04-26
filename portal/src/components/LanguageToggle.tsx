"use client";

import { Languages } from "lucide-react";
import { useLocale } from "./LocaleProvider";
import type { Locale } from "@/lib/i18n/messages";

const ITEMS: { id: Locale; label: string; sub: string }[] = [
  { id: "de", label: "DE", sub: "Deutsch" },
  { id: "en", label: "EN", sub: "English" },
];

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale } = useLocale();

  return (
    <div
      role="radiogroup"
      aria-label="Language"
      className={
        compact
          ? "inline-flex items-center gap-0.5 rounded-full border border-stroke-1 bg-bg-overlay/40 p-0.5"
          : "inline-flex items-center gap-0.5 rounded-full border border-stroke-1 bg-bg-overlay/40 p-1"
      }
    >
      {!compact && (
        <span className="px-1.5 text-text-tertiary inline-flex items-center">
          <Languages size={13} />
        </span>
      )}
      {ITEMS.map(({ id, label, sub }) => {
        const active = locale === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setLocale(id)}
            title={sub}
            className={
              "inline-flex items-center justify-center rounded-full transition-colors px-2 " +
              (compact ? "h-6 text-[10px]" : "h-7 text-[11px]") +
              " font-medium " +
              (active
                ? "bg-bg-elevated text-text-primary shadow-[inset_0_0_0_1px_var(--color-stroke-2)]"
                : "text-text-tertiary hover:text-text-primary")
            }
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
