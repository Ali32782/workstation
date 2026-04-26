"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";

/**
 * Outlook-style three-pane layout used by all native portal apps
 * (Projekte, CRM, Helpdesk, Code, Sign, …).
 *
 *   ┌────────────┬──────────────┬───────────────────────────────┐
 *   │  primary   │   secondary  │   detail                      │
 *   │  rail or   │   list       │   reading-pane                │
 *   │  drawer    │   (records)  │   (item content)              │
 *   └────────────┴──────────────┴───────────────────────────────┘
 *
 * v2 (Apr 2026) features:
 *   - Drag-resize splitters between primary↔secondary and secondary↔detail.
 *     Widths are clamped to sensible min/max and persisted to localStorage
 *     keyed by `storageKey` so each app remembers its layout.
 *   - The primary pane can collapse to a thin 52px rail (icon-only). Pass
 *     `primaryRail` for the compact representation; clicking the rail
 *     re-expands. If you don't supply a rail, a small chevron in the splitter
 *     toggles full collapse (zero width).
 *   - On viewports below md (~768px) the layout becomes a stack: only one
 *     pane is visible at a time. With `hasSelection` the parent declares
 *     whether the detail or the list/primary should be on top, and the
 *     detail header shows a back button via `onMobileBack`.
 *   - The detail pane gets a CSS max-content-width so reading material
 *     doesn't stretch to 4K monitor edges.
 */
const DEFAULT_PRIMARY = 240;
const DEFAULT_SECONDARY = 360;
const PRIMARY_MIN = 180;
const PRIMARY_MAX = 360;
const SECONDARY_MIN = 280;
const SECONDARY_MAX = 560;
const RAIL_WIDTH = 52;
const SPLITTER_WIDTH = 6; // visual thickness of the drag handle

type StoredLayout = {
  primary: number;
  secondary: number;
  /** "rail" | "expanded" | "hidden" — only the primary pane has these states. */
  primaryMode: "expanded" | "rail" | "hidden";
};

function readStored(key: string | undefined): Partial<StoredLayout> {
  if (!key || typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(`layout:${key}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<StoredLayout>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStored(key: string | undefined, layout: StoredLayout) {
  if (!key || typeof window === "undefined") return;
  try {
    localStorage.setItem(`layout:${key}`, JSON.stringify(layout));
  } catch {
    // private mode / quota
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function ThreePaneLayout({
  primary,
  primaryRail,
  secondary,
  detail,
  primaryWidth = DEFAULT_PRIMARY,
  secondaryWidth = DEFAULT_SECONDARY,
  storageKey,
  hasSelection,
  onMobileBack,
  hidePrimary,
}: {
  primary: ReactNode;
  /**
   * Optional compact representation of `primary` (icons only).
   * When provided, the primary pane can collapse to a 52px rail instead
   * of disappearing entirely.
   */
  primaryRail?: ReactNode;
  secondary: ReactNode;
  detail: ReactNode;
  primaryWidth?: number;
  secondaryWidth?: number;
  /**
   * Per-app key for persisting widths/collapse state. If omitted the layout
   * still works but won't remember user adjustments.
   */
  storageKey?: string;
  /**
   * Whether something is selected (drives mobile stack behaviour: with a
   * selection the detail pane is foregrounded; without it the list is).
   */
  hasSelection?: boolean;
  /** Back-button handler shown in the mobile detail header. */
  onMobileBack?: () => void;
  /**
   * Hide the primary pane entirely — useful for apps that don't have
   * folder-style nav and only need list+detail.
   */
  hidePrimary?: boolean;
}) {
  // ── Persisted widths + primary mode ─────────────────────────────────────
  const initialStored = useMemo(() => readStored(storageKey), [storageKey]);
  const [primaryW, setPrimaryW] = useState<number>(
    () => clamp(initialStored.primary ?? primaryWidth, PRIMARY_MIN, PRIMARY_MAX),
  );
  const [secondaryW, setSecondaryW] = useState<number>(
    () =>
      clamp(initialStored.secondary ?? secondaryWidth, SECONDARY_MIN, SECONDARY_MAX),
  );
  const [primaryMode, setPrimaryMode] = useState<StoredLayout["primaryMode"]>(
    () => initialStored.primaryMode ?? "expanded",
  );

  // Persist on change.
  useEffect(() => {
    writeStored(storageKey, {
      primary: primaryW,
      secondary: secondaryW,
      primaryMode,
    });
  }, [primaryW, secondaryW, primaryMode, storageKey]);

  // ── Viewport tracking (mobile/tablet adaptations) ──────────────────────
  const [viewport, setViewport] = useState<"mobile" | "tablet" | "desktop">(
    "desktop",
  );
  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const mqMobile = window.matchMedia("(max-width: 767px)");
    const mqTablet = window.matchMedia("(max-width: 1199px)");
    const update = () => {
      if (mqMobile.matches) setViewport("mobile");
      else if (mqTablet.matches) setViewport("tablet");
      else setViewport("desktop");
    };
    update();
    mqMobile.addEventListener("change", update);
    mqTablet.addEventListener("change", update);
    return () => {
      mqMobile.removeEventListener("change", update);
      mqTablet.removeEventListener("change", update);
    };
  }, []);

  // On tablet, default to rail if user never explicitly expanded.
  // We don't override the user's choice; we only flip when a stored value
  // is missing. That's why this runs once on mount.
  useEffect(() => {
    if (initialStored.primaryMode) return;
    if (viewport === "tablet" && primaryRail) {
      setPrimaryMode("rail");
    }
    // intentional: only run on initial mount/viewport detection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport]);

  // ── Drag handles ───────────────────────────────────────────────────────
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    target: "primary" | "secondary";
    startX: number;
    startWidth: number;
  } | null>(null);

  const onDragMove = useCallback((ev: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = ev.clientX - drag.startX;
    if (drag.target === "primary") {
      setPrimaryW(clamp(drag.startWidth + dx, PRIMARY_MIN, PRIMARY_MAX));
    } else {
      setSecondaryW(clamp(drag.startWidth + dx, SECONDARY_MIN, SECONDARY_MAX));
    }
  }, []);

  const onDragEnd = useCallback(() => {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", onDragMove);
    window.removeEventListener("pointerup", onDragEnd);
  }, [onDragMove]);

  const startDrag = useCallback(
    (target: "primary" | "secondary") => (ev: React.PointerEvent) => {
      ev.preventDefault();
      dragRef.current = {
        target,
        startX: ev.clientX,
        startWidth: target === "primary" ? primaryW : secondaryW,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", onDragMove);
      window.addEventListener("pointerup", onDragEnd);
    },
    [primaryW, secondaryW, onDragMove, onDragEnd],
  );

  useEffect(() => {
    return () => {
      // safety: cleanup if unmounted mid-drag
      window.removeEventListener("pointermove", onDragMove);
      window.removeEventListener("pointerup", onDragEnd);
    };
  }, [onDragMove, onDragEnd]);

  // ── Render: mobile stack ───────────────────────────────────────────────
  if (viewport === "mobile") {
    if (hasSelection) {
      return (
        <div className="flex h-full min-h-0 bg-bg-base text-text-primary text-[13px]">
          <section className="flex-1 min-w-0 bg-bg-base flex flex-col min-h-0">
            {onMobileBack && (
              <button
                onClick={onMobileBack}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-stroke-1 bg-bg-chrome text-[12px] text-text-secondary hover:text-text-primary"
              >
                <ArrowLeft size={14} />
                Zurück zur Liste
              </button>
            )}
            <div className="flex-1 min-h-0 overflow-auto">{detail}</div>
          </section>
        </div>
      );
    }
    return (
      <div className="flex flex-col h-full min-h-0 bg-bg-base text-text-primary text-[13px]">
        {!hidePrimary && primary && (
          <div className="shrink-0 max-h-[35vh] overflow-auto border-b border-stroke-1 bg-bg-chrome">
            {primary}
          </div>
        )}
        <div className="flex-1 min-h-0 bg-bg-base flex flex-col">{secondary}</div>
      </div>
    );
  }

  // ── Render: desktop / tablet (3-pane with splitters) ───────────────────
  const showPrimary = !hidePrimary && primaryMode !== "hidden";
  const isRail = showPrimary && primaryMode === "rail" && !!primaryRail;
  const effectivePrimaryW = isRail ? RAIL_WIDTH : primaryW;

  return (
    <div
      ref={containerRef}
      className="flex h-full min-h-0 bg-bg-base text-text-primary text-[13px] relative"
    >
      {/* Primary */}
      {showPrimary && (
        <aside
          className="shrink-0 border-r border-stroke-1 bg-bg-chrome flex flex-col min-h-0 relative"
          style={{ width: effectivePrimaryW }}
        >
          {/* Toggle button — top-right of the primary pane */}
          {primaryRail && (
            <button
              type="button"
              onClick={() =>
                setPrimaryMode(primaryMode === "rail" ? "expanded" : "rail")
              }
              className="absolute top-1.5 right-1 z-10 p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-overlay"
              title={
                primaryMode === "rail" ? "Seitenleiste ausklappen" : "Seitenleiste einklappen"
              }
              aria-label="Seitenleiste umschalten"
            >
              {primaryMode === "rail" ? (
                <ChevronRight size={13} />
              ) : (
                <ChevronLeft size={13} />
              )}
            </button>
          )}
          <div className="flex-1 min-h-0 overflow-auto">
            {isRail ? primaryRail : primary}
          </div>
        </aside>
      )}

      {/* Splitter primary↔secondary */}
      {showPrimary && !isRail && (
        <Splitter onPointerDown={startDrag("primary")} title="Breite anpassen" />
      )}

      {/* Secondary */}
      <section
        className="shrink-0 border-r border-stroke-1 bg-bg-base flex flex-col min-h-0"
        style={{ width: secondaryW }}
      >
        {/* If primary is fully hidden, surface a small toggle to bring it back */}
        {hidePrimary !== true && primaryMode === "hidden" && (
          <button
            type="button"
            onClick={() => setPrimaryMode(primaryRail ? "rail" : "expanded")}
            className="absolute top-1.5 left-1 z-10 p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-bg-overlay"
            title="Seitenleiste einblenden"
            aria-label="Seitenleiste einblenden"
          >
            <PanelLeft size={13} />
          </button>
        )}
        {secondary}
      </section>

      {/* Splitter secondary↔detail */}
      <Splitter onPointerDown={startDrag("secondary")} title="Breite anpassen" />

      {/* Detail */}
      <section className="flex-1 min-w-0 bg-bg-base flex flex-col min-h-0">
        {detail}
      </section>
    </div>
  );
}

function Splitter({
  onPointerDown,
  title,
}: {
  onPointerDown: (ev: React.PointerEvent) => void;
  title?: string;
}) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      title={title}
      className="shrink-0 relative cursor-col-resize group"
      style={{ width: SPLITTER_WIDTH, marginLeft: -SPLITTER_WIDTH / 2, marginRight: -SPLITTER_WIDTH / 2 }}
    >
      {/* The visible 1px hairline that aligns with the pane border */}
      <div className="absolute inset-y-0 left-1/2 w-px bg-stroke-1 group-hover:bg-[#5b5fc7]/50 transition-colors" />
    </div>
  );
}

/**
 * Small reusable pane header with title + optional actions/toolbar.
 * Matches the visual chrome of the file station header for consistency.
 */
export function PaneHeader({
  title,
  subtitle,
  accent,
  icon,
  right,
  children,
}: {
  title?: string;
  subtitle?: string;
  accent?: string;
  icon?: ReactNode;
  right?: ReactNode;
  /** Optional second row (e.g. tab strip, breadcrumbs). */
  children?: ReactNode;
}) {
  return (
    <header
      className="shrink-0 px-3 py-2 border-b border-stroke-1 bg-bg-chrome"
      style={accent ? { boxShadow: `inset 0 -1px 0 0 ${accent}30` } : undefined}
    >
      <div className="flex items-center gap-2">
        {icon && (
          <div
            className="w-7 h-7 rounded flex items-center justify-center shrink-0"
            style={accent ? { background: `${accent}18` } : undefined}
          >
            {icon}
          </div>
        )}
        {(title || subtitle) && (
          <div className="min-w-0 flex-1">
            {title && (
              <h1 className="text-[12.5px] font-semibold leading-tight truncate">
                {title}
              </h1>
            )}
            {subtitle && (
              <p className="text-[10.5px] text-text-tertiary truncate">{subtitle}</p>
            )}
          </div>
        )}
        {right && <div className="ml-auto flex items-center gap-1">{right}</div>}
      </div>
      {children && <div className="mt-2">{children}</div>}
    </header>
  );
}

/** Empty-state placeholder used inside any pane. */
export function PaneEmptyState({
  title,
  hint,
  icon,
}: {
  title: string;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center px-6 py-12 gap-2 text-text-tertiary">
      {icon && <div className="text-text-quaternary">{icon}</div>}
      <p className="text-[12.5px] font-medium text-text-secondary">{title}</p>
      {hint && <p className="text-[11.5px] text-text-tertiary max-w-xs">{hint}</p>}
    </div>
  );
}

/**
 * Helper: wraps a detail pane's "main" content in a centred reading column
 * so it doesn't stretch to 4K-wide monitors.
 *
 * Use as: `<DetailPane main={<ReadingColumn>{content}</ReadingColumn>} ... />`
 */
export function ReadingColumn({
  children,
  maxWidth = 880,
}: {
  children: ReactNode;
  maxWidth?: number;
}) {
  return (
    <div className="mx-auto w-full" style={{ maxWidth }}>
      {children}
    </div>
  );
}
