"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { Sidebar, type HealthSummary } from "./Sidebar";
import type { WorkspaceId } from "@/lib/workspaces";
import { cn } from "@/lib/utils";
import { useT } from "./LocaleProvider";

/**
 * Mobile-friendly wrapper around `Sidebar`.
 *
 * Layout strategy
 * ───────────────
 * - On `md` (≥768px) and up: render Sidebar inline next to <main> as before.
 * - On <768px: hide the inline sidebar, render a thumb-reachable burger
 *   FAB at bottom-right (replaces the prior bottom-left placement, which
 *   collided with action bars in Calls/Mail). Tapping it opens a
 *   slide-in drawer with the same Sidebar content.
 *
 * Polish notes
 * ────────────
 * - The drawer is always mounted and animates via `translate-x` so the
 *   opening/closing is fluid and `prefers-reduced-motion` users still get
 *   a perfectly readable instant snap (we don't disable opacity, just the
 *   transition).
 * - We auto-close the drawer when `pathname` changes — the previous
 *   "click anywhere inside the sidebar to close" trick was unreliable
 *   for `target="_blank"` external links and same-path re-clicks.
 * - The FAB is offset by `env(safe-area-inset-bottom)` so it never sits
 *   on the iOS home indicator.
 * - The drawer uses `overscroll-behavior: contain` so iOS rubber-banding
 *   doesn't drag the page behind the overlay.
 */
export function MobileShell({
  workspaceId,
  isAdmin,
  health,
  children,
}: {
  workspaceId: WorkspaceId;
  isAdmin?: boolean;
  health?: HealthSummary;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const t = useT();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="flex flex-1 min-h-0">
      <div className="hidden md:flex">
        <Sidebar workspaceId={workspaceId} isAdmin={isAdmin} health={health} />
      </div>

      <button
        aria-label={open ? t("common.menu.close") : t("common.menu.open")}
        aria-expanded={open}
        aria-controls="mobile-drawer"
        onClick={() => setOpen((v) => !v)}
        className="md:hidden fixed z-50 rounded-full bg-bg-chrome border border-stroke-1 shadow-lg w-12 h-12 flex items-center justify-center text-text-primary active:scale-95 transition-transform motion-reduce:transition-none touch-manipulation"
        style={{
          bottom: "calc(1rem + env(safe-area-inset-bottom))",
          right: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>

      <div
        id="mobile-drawer"
        aria-hidden={!open}
        className={cn(
          "fixed inset-0 z-40 md:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          onClick={() => setOpen(false)}
          aria-hidden
          className={cn(
            "absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none",
            open ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          className={cn(
            "relative h-full w-[80vw] max-w-[280px] bg-bg-chrome flex flex-col shadow-2xl transition-transform duration-200 ease-out motion-reduce:transition-none [overscroll-behavior:contain] mobile-drawer",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <button
            aria-label={t("common.menu.close")}
            onClick={() => setOpen(false)}
            className="absolute top-3 right-3 z-10 w-10 h-10 rounded-md flex items-center justify-center text-text-tertiary hover:bg-bg-elevated active:bg-bg-elevated"
          >
            <X size={18} />
          </button>
          <Sidebar
            workspaceId={workspaceId}
            isAdmin={isAdmin}
            health={health}
          />
        </div>
      </div>

      <main className="flex-1 min-w-0 min-h-0 overflow-hidden pb-[max(0px,calc(3.25rem+env(safe-area-inset-bottom)))] md:pb-0">
        {children}
      </main>
    </div>
  );
}
