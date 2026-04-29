"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

/**
 * Tiny "Outlook-ish" resizable column primitives shared by Chat and Mail.
 *
 * The big sibling `ThreePaneLayout` already does this for CRM/Calls/Helpdesk
 * etc., but those apps have a strict three-pane shape. Chat and Mail have
 * four/two columns plus optional overlays, so they need a thinner helper:
 *
 *   - `useResizableWidth` returns `{ width, startDrag }` and persists the
 *     last value to `localStorage` under `ui:width:<key>`.
 *   - `<ResizeHandle />` renders the 6px-wide drag region with the
 *     hairline that the layout uses.
 *
 * Why not reuse `ThreePaneLayout` directly?
 *   Chat has a sidebar + main + (optional) Jitsi call panel — the call panel
 *   is conditional and lives on the *right*, while ThreePaneLayout's
 *   "primary" column is on the left. Bending it into Chat would require
 *   refactoring ~2 000 lines for a ~50 line win. This helper keeps the
 *   change surgical.
 */

const STORAGE_PREFIX = "ui:width:";

function readWidth(key: string | undefined): number | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function writeWidth(key: string | undefined, w: number) {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_PREFIX + key, String(Math.round(w)));
  } catch {
    // private mode / quota
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export type ResizableSide = "left" | "right";

/**
 * Returns a width state hooked to a drag handler. The returned `startDrag`
 * is meant to be wired to `<ResizeHandle onPointerDown={...} />`.
 *
 * `side="left"` means "the column whose RIGHT edge is being dragged" — i.e.
 * the splitter pulls the column wider when the user drags right. This is
 * the natural behaviour for sidebars.
 *
 * `side="right"` flips the math — useful for columns docked to the right
 * (chat call panel, mail compose drawer) where dragging LEFT widens.
 */
export function useResizableWidth(opts: {
  storageKey?: string;
  defaultWidth: number;
  min: number;
  max: number;
  side?: ResizableSide;
}) {
  const { storageKey, defaultWidth, min, max, side = "left" } = opts;

  const [width, setWidth] = useState<number>(() => {
    const stored = readWidth(storageKey);
    return clamp(stored ?? defaultWidth, min, max);
  });

  // Keep storage in sync without re-running on every render.
  useEffect(() => {
    writeWidth(storageKey, width);
  }, [storageKey, width]);

  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const onMove = useCallback(
    (ev: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = ev.clientX - drag.startX;
      const next = side === "left" ? drag.startWidth + dx : drag.startWidth - dx;
      setWidth(clamp(next, min, max));
    },
    [min, max, side],
  );

  const onUp = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
  }, [onMove]);

  const startDrag = useCallback(
    (ev: React.PointerEvent) => {
      ev.preventDefault();
      dragRef.current = { startX: ev.clientX, startWidth: width };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onMove, onUp, width],
  );

  // Safety: if the consumer unmounts mid-drag, drop our window listeners.
  useEffect(() => {
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onMove, onUp]);

  return { width, setWidth, startDrag };
}

/**
 * 6px-wide drag handle with a 1px hairline that matches the column border.
 * Designed to be placed *between* two flex children. Apply negative margins
 * via the wrapper: the handle takes 6px but visually only the hairline is
 * meaningful, so the surrounding columns shouldn't get a gap.
 */
export function ResizeHandle({
  onPointerDown,
  title = "Breite anpassen",
  ariaLabel,
  className,
  style,
}: {
  onPointerDown: (ev: React.PointerEvent) => void;
  title?: string;
  ariaLabel?: string;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel ?? title}
      title={title}
      onPointerDown={onPointerDown}
      className={[
        "shrink-0 relative cursor-col-resize group select-none",
        className ?? "",
      ].join(" ")}
      style={{
        width: 6,
        marginLeft: -3,
        marginRight: -3,
        ...style,
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px bg-stroke-1 group-hover:bg-[#5b5fc7]/60 transition-colors" />
    </div>
  );
}
