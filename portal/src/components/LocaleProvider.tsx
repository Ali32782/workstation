"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
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

function persistLocaleCookie(next: Locale) {
  if (typeof document === "undefined") return;
  document.cookie = `${STORAGE_KEY}=${next}; path=/; max-age=31536000; SameSite=Lax`;
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  /** SSR-resolved locale (read from `corehub:locale` cookie). */
  initialLocale?: Locale;
}) {
  const ssrLocale = initialLocale ?? DEFAULT_LOCALE;
  const router = useRouter();
  const refreshedRef = useRef(false);
  const [locale, setLocaleState] = useState<Locale>(ssrLocale);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    let resolved: Locale = ssrLocale;
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null;
      if (stored === "de" || stored === "en") {
        resolved = stored;
      } else if (typeof navigator !== "undefined") {
        resolved = detectLocale(navigator.language);
      }
    } catch {
      // ignore — keep default
    }
    setLocaleState(resolved);
    setMounted(true);
    if (typeof document !== "undefined") {
      document.documentElement.lang = resolved;
      persistLocaleCookie(resolved);
    }
    // SSR rendered with `ssrLocale` (cookie). If the client has a different
    // preference (older localStorage value, or first visit with `navigator
    // .language=de` and no cookie yet), the server-side strings on this
    // page are out of sync. A single router.refresh() re-runs the server
    // components with the now-aligned cookie so everything matches.
    if (resolved !== ssrLocale && !refreshedRef.current) {
      refreshedRef.current = true;
      router.refresh();
    }
  }, [ssrLocale, router]);

  const setLocale = useCallback(
    (next: Locale) => {
      setLocaleState(next);
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        /* ignore */
      }
      if (typeof document !== "undefined") {
        document.documentElement.lang = next;
        persistLocaleCookie(next);
      }
      router.refresh();
    },
    [router],
  );

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
