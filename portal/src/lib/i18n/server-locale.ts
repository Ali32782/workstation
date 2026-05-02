import { cookies } from "next/headers";
import type { Locale } from "@/lib/i18n/messages";

/** Reads `corehub:locale` cookie set by `LocaleProvider` (SSR dashboards / pulse). */
export async function localeFromCookies(): Promise<Locale> {
  try {
    const jar = await cookies();
    const v = jar.get("corehub:locale")?.value;
    return v === "en" ? "en" : "de";
  } catch {
    return "de";
  }
}
