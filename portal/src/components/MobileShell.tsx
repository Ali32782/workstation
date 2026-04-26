"use client";

import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar, type HealthSummary } from "./Sidebar";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * Mobile-friendly wrapper around `Sidebar`.
 *
 * Layout strategy
 * ───────────────
 * - On `md` (≥768px) and up: render Sidebar inline next to <main> as before.
 * - On <768px: hide the inline sidebar, render a sticky burger button that
 *   opens a slide-in drawer with the same Sidebar content. Tapping outside
 *   or hitting Esc closes it. Auto-closes on path change.
 *
 * The wrapper also passes through `health` and `isAdmin` to Sidebar.
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
        aria-label="Menü öffnen"
        onClick={() => setOpen(true)}
        className="md:hidden fixed bottom-4 left-4 z-30 rounded-full bg-bg-chrome border border-stroke-1 shadow-lg w-12 h-12 flex items-center justify-center text-text-primary"
      >
        <Menu size={20} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <div className="relative h-full w-[80vw] max-w-[280px] bg-bg-chrome flex flex-col shadow-xl">
            <button
              aria-label="Menü schließen"
              onClick={() => setOpen(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 rounded-md flex items-center justify-center text-text-tertiary hover:bg-bg-elevated"
            >
              <X size={16} />
            </button>
            <div onClick={() => setOpen(false)} className="contents">
              <Sidebar
                workspaceId={workspaceId}
                isAdmin={isAdmin}
                health={health}
              />
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 min-w-0 overflow-hidden">{children}</main>
    </div>
  );
}
