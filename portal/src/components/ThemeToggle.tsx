"use client";

import { useEffect, useState } from "react";
import { Moon, Sun, Monitor } from "lucide-react";

/**
 * Theme switcher with three modes:
 *   light   - force light palette
 *   dark    - force dark palette
 *   system  - follow OS preference (prefers-color-scheme)
 *
 * The actual CSS-variable swap lives in `globals.css` under
 * `[data-theme="light"]`. This component only flips
 * `document.documentElement.dataset.theme` — Tailwind utilities pick up
 * the new var values automatically.
 *
 * To prevent flash-of-wrong-theme on first render the matching init script
 * runs synchronously inside <head> (see `app/layout.tsx`); this component
 * just hydrates the same state afterwards.
 */
type Mode = "light" | "dark" | "system";

const STORAGE_KEY = "corehub:theme";

function applyMode(mode: Mode) {
  if (typeof document === "undefined") return;
  const resolved =
    mode === "system"
      ? window.matchMedia("(prefers-color-scheme: light)").matches
        ? "light"
        : "dark"
      : mode;
  document.documentElement.dataset.theme = resolved;
}

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [mode, setMode] = useState<Mode>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Mode | null) ?? "dark";
    setMode(stored);
    setMounted(true);

    if (stored === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: light)");
      const onChange = () => applyMode("system");
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
  }, []);

  function pick(next: Mode) {
    setMode(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyMode(next);
  }

  // Render a stable placeholder until hydration so SSR + first client render
  // match (avoids a hydration mismatch around the active button).
  if (!mounted) {
    return (
      <div
        className={
          compact
            ? "h-7 w-[80px] rounded-full bg-bg-overlay/40"
            : "h-8 w-[110px] rounded-full bg-bg-overlay/40"
        }
        aria-hidden
      />
    );
  }

  const items: { id: Mode; icon: typeof Sun; label: string }[] = [
    { id: "light", icon: Sun, label: "Hell" },
    { id: "system", icon: Monitor, label: "System" },
    { id: "dark", icon: Moon, label: "Dunkel" },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Farbthema"
      className={
        compact
          ? "inline-flex items-center gap-0.5 rounded-full border border-stroke-1 bg-bg-overlay/40 p-0.5"
          : "inline-flex items-center gap-0.5 rounded-full border border-stroke-1 bg-bg-overlay/40 p-1"
      }
    >
      {items.map(({ id, icon: Icon, label }) => {
        const active = mode === id;
        return (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => pick(id)}
            title={label}
            className={
              "inline-flex items-center justify-center rounded-full transition-colors " +
              (compact ? "h-6 w-6" : "h-7 w-7 sm:px-2 sm:w-auto sm:gap-1.5") +
              " " +
              (active
                ? "bg-bg-elevated text-text-primary shadow-[inset_0_0_0_1px_var(--color-stroke-2)]"
                : "text-text-tertiary hover:text-text-primary")
            }
          >
            <Icon size={compact ? 12 : 13} />
            {!compact && (
              <span className="hidden sm:inline text-[11px] font-medium">
                {label}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
