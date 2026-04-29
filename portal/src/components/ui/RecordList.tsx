"use client";

import type { ReactNode } from "react";

export type RecordListItem = {
  id: string;
  title: string;
  subtitle?: string;
  meta?: ReactNode;
  /** Optional small left adornment, e.g. status pill or icon. */
  leading?: ReactNode;
  /** Optional small right adornment, e.g. unread badge. */
  trailing?: ReactNode;
};

/**
 * Plain list-pane primitive used as the secondary column in our 3-pane
 * Outlook-style layouts. Deliberately stateless: parents pass the items,
 * controlled selection, and an `onSelect` callback. No virtualisation yet —
 * we expect lists in the low thousands and rely on the browser's native
 * scrolling. If that becomes a hot path we can swap in `react-window` here
 * without touching any callsite.
 */
export function RecordList({
  items,
  selectedId,
  onSelect,
  emptyHint,
  loading,
  accent,
}: {
  items: RecordListItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  emptyHint?: string;
  loading?: boolean;
  accent?: string;
}) {
  if (loading) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center text-[12px] text-text-tertiary">
        Lade…
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="flex-1 min-h-0 flex items-center justify-center px-6 text-center text-[12px] text-text-tertiary">
        {emptyHint ?? "Keine Einträge."}
      </div>
    );
  }
  return (
    <ul className="flex-1 min-h-0 overflow-auto">
      {items.map((it) => {
        const isSel = it.id === selectedId;
        const rowAccent =
          isSel && accent ? { boxShadow: `inset 3px 0 0 0 ${accent}` } : undefined;
        return (
          <li key={it.id}>
            <div
              className={`group flex items-stretch border-b border-stroke-1/60 min-w-0 ${
                isSel ? "bg-bg-overlay" : "hover:bg-bg-elevated"
              }`}
              style={rowAccent}
            >
              <button
                type="button"
                onClick={() => onSelect?.(it.id)}
                className="flex-1 min-w-0 text-left px-3 py-2.5 flex items-start gap-2"
              >
                {it.leading && (
                  <div className="shrink-0 mt-[2px]">{it.leading}</div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-[12.5px] font-medium text-text-primary truncate flex-1">
                      {it.title}
                    </p>
                    {it.meta && (
                      <span className="text-[10.5px] text-text-tertiary shrink-0">
                        {it.meta}
                      </span>
                    )}
                  </div>
                  {it.subtitle && (
                    <p className="text-[11.5px] text-text-tertiary truncate mt-0.5">
                      {it.subtitle}
                    </p>
                  )}
                </div>
              </button>
              {it.trailing !== undefined && it.trailing !== null && (
                <div className="shrink-0 flex items-center justify-center px-2 self-stretch border-l border-stroke-1/40">
                  {it.trailing}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
