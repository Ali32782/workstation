"use client";

import { useEffect, useState } from "react";

/** Tailwind `md` breakpoint — below this we use stacked / full-bleed mobile layouts. */
export const MD_BREAKPOINT_PX = 768;

/**
 * True when viewport width is below `md` (narrow phone / small tablet).
 * Safe after mount; first SSR paint uses `false`.
 */
export function useIsNarrowScreen(breakpoint = MD_BREAKPOINT_PX): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    const apply = () => setNarrow(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [breakpoint]);

  return narrow;
}
