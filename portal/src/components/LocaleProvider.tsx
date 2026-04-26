"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  DEFAULT_LOCALE,
  detectLocale,
  tFor,
  type Locale,
  type Messages,
} from "@/lib/i18n/messages";

type LocaleCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: keyof Messages, fallback?: string) => string;
};

const Ctx = createContext<LocaleCtx>({
  locale: DEFAULT_LOCALE,
  setLocale: () => {},
  t: (k) => String(k),
});

const STORAGE_KEY = "corehub:locale";

export function LocaleProvider({ children }: { children: ReactNode }) {
  // SSR / first paint: render with the default locale to avoid hydration
  // mismatches. The `<html lang>` attribute is updated client-side after
  // we know the resolved locale.
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let resolved: Locale = DEFAULT_LOCALE;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored === "de" || stored === "en") {
        resolved = stored;
      } else {
        resolved = detectLocale(navigator.language);
      }
    } catch {
      // ignore — keep default
    }
    setLocaleState(resolved);
    setMounted(true);
    if (typeof document !== "undefined") {
      document.documentElement.lang = resolved;
    }
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = next;
    }
  }, []);

  const value = useMemo<LocaleCtx>(
    () => ({
      locale,
      setLocale,
      t: (key, fallback) => tFor(locale, key, fallback),
    }),
    [locale, setLocale],
  );

  // While we're still resolving the locale on first hydration we render
  // children but with the SSR default — this keeps the tree visible and
  // mostly correct (German strings) and the right locale flips in <16ms
  // once useEffect fires.
  void mounted;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLocale(): LocaleCtx {
  return useContext(Ctx);
}

export function useT(): LocaleCtx["t"] {
  return useContext(Ctx).t;
}
