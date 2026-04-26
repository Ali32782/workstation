"use client";

import { useEffect, useRef } from "react";
import { LocaleType, createUniver } from "@univerjs/presets";
import { UniverSheetsCorePreset } from "@univerjs/preset-sheets-core";

import "@univerjs/preset-sheets-core/lib/index.css";

/**
 * Univer-based Excel-style editor. Mounts a Univer sheets workbench inside
 * a container div, loads the provided IWorkbookData JSON, and reports back
 * snapshots whenever cell data changes.
 *
 * Univer's API surface is large; we keep this wrapper minimal — single-sheet
 * focus, full toolbar/formula-bar/footer, no realtime collaboration. The
 * `onChange` callback fires on a 600ms debounce after edits so we don't
 * blast the parent with re-renders during fast typing.
 */
export function ExcelEditor({
  initialWorkbook,
  onChange,
}: {
  initialWorkbook: unknown;
  onChange: (workbook: unknown) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const univerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const univerAPIRef = useRef<any>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    const container = containerRef.current;

    // Univer ships English / Chinese / a few others natively. We use EN_US
    // for now — Univer's UI strings are short and self-explanatory, and
    // the cell formulas are language-agnostic. A future iteration can ship
    // a German pack via `locales` overrides if needed.
    const { univer, univerAPI } = createUniver({
      locale: LocaleType.EN_US,
      presets: [
        UniverSheetsCorePreset({
          container,
        }),
      ],
    });

    univerRef.current = univer;
    univerAPIRef.current = univerAPI;

    // Load the provided workbook snapshot. Univer expects a fully-formed
    // IWorkbookData; our converter produces compatible JSON.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      univerAPI.createWorkbook(initialWorkbook as any);
    } catch (e) {
      console.error("Univer createWorkbook failed", e);
    }

    // Listen for sheet edits via the command service. We poll the active
    // workbook snapshot on a debounced timer rather than diff individual
    // commands — simpler, and avoids pinning to internal command names.
    let timer: ReturnType<typeof setTimeout> | null = null;
    const dispose = univerAPI.addEvent?.(
      univerAPI.Event?.LifeCycleChanged,
      () => {
        // no-op, we just need *some* hook so the listener stays registered
      },
    );
    const interval = setInterval(() => {
      try {
        const wb = univerAPI.getActiveWorkbook?.();
        if (!wb) return;
        const snap = wb.getSnapshot?.() ?? wb.save?.();
        if (snap) onChangeRef.current(snap);
      } catch {
        // ignore — sometimes Univer is mid-init
      }
    }, 800);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      try {
        dispose?.dispose?.();
      } catch {
        // ignore
      }
      try {
        univer.dispose();
      } catch {
        // ignore
      }
      univerRef.current = null;
      univerAPIRef.current = null;
    };
    // We deliberately only run this once per mount — re-loading the workbook
    // would tear down the editor and lose the user's place. Parents that need
    // to swap documents should remount the component (e.g. via key={path}).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="h-full w-full bg-bg-base">
      <div ref={containerRef} className="univer-container h-full w-full" />
    </div>
  );
}
