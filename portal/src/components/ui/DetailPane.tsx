"use client";

import type { ReactNode } from "react";

/**
 * Generic detail-pane scaffold used as the right column in 3-pane layouts.
 *
 *   ┌───────────────────────────┬───────────┐
 *   │ header (title + actions)              │
 *   ├───────────────────────────┼───────────┤
 *   │                           │           │
 *   │   main (scrollable)       │ rightbar  │
 *   │                           │ (props)   │
 *   │                           │           │
 *   ├───────────────────────────┴───────────┤
 *   │ optional footer (composer)            │
 *   └───────────────────────────────────────┘
 *
 * Both the right sidebar and footer are optional. When omitted the main
 * area takes the full width / height. This matches Outlook's reading-pane
 * + Teams' chat composer layout in one primitive.
 */
export function DetailPane({
  header,
  main,
  rightSidebar,
  footer,
  rightSidebarWidth = 280,
}: {
  header?: ReactNode;
  main: ReactNode;
  rightSidebar?: ReactNode;
  footer?: ReactNode;
  rightSidebarWidth?: number;
}) {
  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {header && (
        <div className="shrink-0 border-b border-stroke-1 bg-bg-chrome">
          {header}
        </div>
      )}
      <div className="flex-1 min-h-0 flex">
        <div className="flex-1 min-w-0 overflow-auto">{main}</div>
        {rightSidebar && (
          <aside
            className="shrink-0 border-l border-stroke-1 bg-bg-chrome overflow-auto"
            style={{ width: rightSidebarWidth }}
          >
            {rightSidebar}
          </aside>
        )}
      </div>
      {footer && (
        <div className="shrink-0 border-t border-stroke-1 bg-bg-chrome">
          {footer}
        </div>
      )}
    </div>
  );
}

/**
 * Properties list for the right sidebar. Keys/values render as a compact
 * label/value grid à la Notion's properties panel.
 */
export function PropertyList({
  rows,
}: {
  rows: { label: string; value: ReactNode }[];
}) {
  return (
    <dl className="px-4 py-3 grid grid-cols-[100px_1fr] gap-x-3 gap-y-2.5 text-[11.5px]">
      {rows.map((r, i) => (
        <RowFragment key={i} label={r.label} value={r.value} />
      ))}
    </dl>
  );
}

function RowFragment({ label, value }: { label: string; value: ReactNode }) {
  return (
    <>
      <dt className="text-text-tertiary pt-1">{label}</dt>
      <dd className="text-text-secondary min-w-0">{value}</dd>
    </>
  );
}

/** Section heading inside the right sidebar. */
export function SidebarSection({
  title,
  right,
  children,
}: {
  title: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-stroke-1 last:border-b-0">
      <div className="px-4 pt-3 pb-1.5 flex items-center">
        <h3 className="text-[10.5px] uppercase tracking-wide font-semibold text-text-tertiary flex-1">
          {title}
        </h3>
        {right}
      </div>
      <div className="px-4 pb-3">{children}</div>
    </section>
  );
}
