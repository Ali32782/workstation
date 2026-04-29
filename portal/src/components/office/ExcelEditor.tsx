"use client";

import {
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Plus,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowDownAZ,
  ArrowUpAZ,
  ChevronDown,
  RowsIcon,
  Columns3,
  Trash2,
  Sigma,
  Hash,
  Percent,
  CircleDollarSign,
  Eraser,
  Undo2,
  Redo2,
  Copy as CopyIcon,
  Scissors,
  ClipboardPaste,
  Filter,
  Lock,
  PaintBucket,
  Type as TypeIcon,
  Search,
  X,
  Palette,
} from "lucide-react";
import type {
  CellFormat,
  ConditionalRule,
  SheetData,
  SimpleWorkbook,
} from "@/lib/office/types";
import { renderCell, parseCellRef, FUNCTION_NAMES } from "@/lib/office/formula";
import {
  compileRules,
  effectiveCellFormat,
  parseA1Range,
} from "@/lib/office/conditional";

/**
 * Native, dependency-free spreadsheet editor.
 *
 * Capabilities (kept deliberately compact, easy to audit):
 *   • Excel-style grid with sticky letter columns / numeric row headers.
 *   • Click-to-select; F2 / double-click / typing starts an edit.
 *   • Tab / Shift-Tab → next/prev column; Enter / Shift-Enter → next/prev row.
 *   • Formulas: =A1+B1, =SUM(A1:A5), =IF(A1>10,"x","y") and friends —
 *     evaluated by `lib/office/formula.ts`. Cells display the result;
 *     the formula bar still shows the raw source.
 *   • Multi-sheet via the bottom tab strip; double-click to rename.
 *   • A real top toolbar grouped Datei / Start / Einfügen / Daten / Formeln
 *     with **functional** buttons:
 *       - Bold / Italic / Underline + Align L/C/R   (per-cell formatting)
 *       - Number format: Integer / Decimal / % / Currency
 *       - Insert / Delete row, Insert / Delete column at the active cell
 *       - Sort A→Z / Z→A on the selected column (rest of row stays glued)
 *       - Quick-insert =SUM / =AVERAGE / =MIN / =MAX / =COUNT
 *
 * Why a custom editor rather than Univer / SheetJS-react / luckysheet?
 *   Their bundles ship lazy chunks that didn't trace into the portal's
 *   Next.js standalone build — the editor body silently went blank.
 *   ~700 lines of plain React is cheaper to own than to debug a black-box
 *   bundle on every Next-major release.
 */
export function ExcelEditor({
  initialWorkbook,
  onChange,
}: {
  initialWorkbook: SimpleWorkbook;
  onChange: (workbook: SimpleWorkbook) => void;
}) {
  const seed = useMemo<SimpleWorkbook>(() => {
    if (
      initialWorkbook &&
      Array.isArray(initialWorkbook.sheets) &&
      initialWorkbook.sheets.length > 0
    ) {
      return { sheets: initialWorkbook.sheets.map(normaliseSheet) };
    }
    return {
      sheets: [
        {
          name: "Tabelle1",
          rows: [],
          rowCount: 50,
          columnCount: 15,
        },
      ],
    };
  }, [initialWorkbook]);

  const [workbook, setWorkbook] = useState<SimpleWorkbook>(seed);
  const [activeSheetIdx, setActiveSheetIdx] = useState(0);
  // The selection is *always* a range. A "single cell" is just a 1×1
  // range where anchor === focus. This unifies bulk + single-cell paths
  // in the toolbar and lets Shift+drag / Shift+arrow extend without a
  // mode switch. The active editing cell is always `focus`.
  const [selection, setSelection] = useState<Selection>(() => ({
    anchor: { r: 0, c: 0 },
    focus: { r: 0, c: 0 },
  }));
  const selected = selection.focus;
  const setSelected = useCallback(
    (addr: CellAddr) =>
      setSelection({ anchor: { ...addr }, focus: { ...addr } }),
    [],
  );
  const [editingValue, setEditingValue] = useState<string | null>(null);

  const sheet = workbook.sheets[activeSheetIdx] ?? workbook.sheets[0];

  // The Grid binds keyboard events at its scroll container; we share a ref
  // upwards so toolbar actions can refocus the grid after they run, keeping
  // the keyboard flow uninterrupted.
  const gridFocusRef = useRef<() => void>(() => {});

  const lastEmittedRef = useRef<string>("");
  useEffect(() => {
    const serialised = serialiseForCompare(workbook);
    if (serialised === lastEmittedRef.current) return;
    lastEmittedRef.current = serialised;
    onChange(workbook);
  }, [workbook, onChange]);

  /* ── Undo / Redo ───────────────────────────────────────────────────── */
  /**
   * History is stored in refs because it should survive re-renders
   * without triggering them — a "did mutation succeed" indicator is the
   * only thing the UI cares about, and the toolbar buttons re-derive
   * `canUndo` from the React state cycle naturally.
   *
   * Every mutation routes through `mutate(producer)`. If the producer
   * returns the same workbook, history isn't touched (idempotent
   * mutations stay free). The undo stack is capped at 100 entries.
   */
  const historyRef = useRef<{ undo: SimpleWorkbook[]; redo: SimpleWorkbook[] }>({
    undo: [],
    redo: [],
  });
  const HISTORY_LIMIT = 100;
  const [historyTick, setHistoryTick] = useState(0);

  const mutate = useCallback(
    (producer: (wb: SimpleWorkbook) => SimpleWorkbook) => {
      setWorkbook((cur) => {
        const next = producer(cur);
        if (next === cur) return cur;
        historyRef.current.undo.push(cur);
        if (historyRef.current.undo.length > HISTORY_LIMIT) {
          historyRef.current.undo.shift();
        }
        historyRef.current.redo.length = 0;
        return next;
      });
      setHistoryTick((t) => t + 1);
    },
    [],
  );

  const undo = useCallback(() => {
    setWorkbook((cur) => {
      const prev = historyRef.current.undo.pop();
      if (!prev) return cur;
      historyRef.current.redo.push(cur);
      return prev;
    });
    setHistoryTick((t) => t + 1);
  }, []);

  const redo = useCallback(() => {
    setWorkbook((cur) => {
      const next = historyRef.current.redo.pop();
      if (!next) return cur;
      historyRef.current.undo.push(cur);
      return next;
    });
    setHistoryTick((t) => t + 1);
  }, []);

  // Mention `historyTick` to keep the linter happy and pin re-renders
  // to history changes (button enabled-states).
  const canUndo = historyTick >= 0 && historyRef.current.undo.length > 0;
  const canRedo = historyTick >= 0 && historyRef.current.redo.length > 0;

  /* ── Mutations ────────────────────────────────────────────────────── */

  const setCell = useCallback(
    (sheetIdx: number, r: number, c: number, value: string) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const rows = target.rows.map((row) => row.slice());
        while (rows.length <= r) rows.push([]);
        const row = rows[r]!;
        while (row.length <= c) row.push("");
        if (row[c] === value) return wb;
        row[c] = value;
        sheets[sheetIdx] = {
          ...target,
          rows,
          rowCount: Math.max(target.rowCount, r + 1),
          columnCount: Math.max(target.columnCount, c + 1),
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const updateFormat = useCallback(
    (
      sheetIdx: number,
      r: number,
      c: number,
      mutator: (cur: CellFormat) => CellFormat | null,
    ) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const formats = { ...(target.formats ?? {}) };
        const key = `${r},${c}`;
        const cur = formats[key] ?? {};
        const next = mutator(cur);
        if (next == null || isEmptyFormat(next)) {
          delete formats[key];
        } else {
          formats[key] = next;
        }
        sheets[sheetIdx] = {
          ...target,
          formats,
          rowCount: Math.max(target.rowCount, r + 1),
          columnCount: Math.max(target.columnCount, c + 1),
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  /**
   * Bulk-apply a format mutation to every cell in a rectangle. We do
   * this in a single state update so the React reconciler only re-runs
   * once even when the user "Bolds" a 50×10 selection.
   */
  const updateFormatInRange = useCallback(
    (
      sheetIdx: number,
      rect: RangeRect,
      mutator: (cur: CellFormat) => CellFormat | null,
    ) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const formats = { ...(target.formats ?? {}) };
        for (let r = rect.r0; r <= rect.r1; r++) {
          for (let c = rect.c0; c <= rect.c1; c++) {
            const key = `${r},${c}`;
            const cur = formats[key] ?? {};
            const next = mutator(cur);
            if (next == null || isEmptyFormat(next)) {
              delete formats[key];
            } else {
              formats[key] = next;
            }
          }
        }
        sheets[sheetIdx] = {
          ...target,
          formats,
          rowCount: Math.max(target.rowCount, rect.r1 + 1),
          columnCount: Math.max(target.columnCount, rect.c1 + 1),
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  /** Clear (or set to a constant) every cell in a rectangle. */
  const setCellsInRange = useCallback(
    (sheetIdx: number, rect: RangeRect, value: string) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const rows = target.rows.map((row) => row.slice());
        for (let r = rect.r0; r <= rect.r1; r++) {
          while (rows.length <= r) rows.push([]);
          const row = rows[r]!;
          while (row.length <= rect.c1) row.push("");
          for (let c = rect.c0; c <= rect.c1; c++) {
            row[c] = value;
          }
        }
        sheets[sheetIdx] = {
          ...target,
          rows,
          rowCount: Math.max(target.rowCount, rect.r1 + 1),
          columnCount: Math.max(target.columnCount, rect.c1 + 1),
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const addSheet = useCallback(() => {
    mutate((wb) => {
      const idx = wb.sheets.length + 1;
      let name = `Tabelle${idx}`;
      let n = idx;
      while (wb.sheets.some((s) => s.name === name)) {
        n += 1;
        name = `Tabelle${n}`;
      }
      return {
        ...wb,
        sheets: [
          ...wb.sheets,
          { name, rows: [], rowCount: 50, columnCount: 15 },
        ],
      };
    });
    setActiveSheetIdx(workbook.sheets.length);
    setSelected({ r: 0, c: 0 });
  }, [mutate, setSelected, workbook.sheets.length]);

  const renameSheet = useCallback((idx: number, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    mutate((wb) => {
      if (wb.sheets.some((s, i) => i !== idx && s.name === trimmed)) return wb;
      const sheets = wb.sheets.slice();
      const target = sheets[idx];
      if (!target) return wb;
      sheets[idx] = { ...target, name: trimmed };
      return { ...wb, sheets };
    });
  }, [mutate]);

  // Delete a sheet but keep at least one — workbooks without a sheet are
  // not loadable in Excel and the editor would crash on `workbook.sheets[0]`.
  const deleteSheet = useCallback(
    (idx: number) => {
      mutate((wb) => {
        if (wb.sheets.length <= 1) return wb;
        const sheets = wb.sheets.slice();
        sheets.splice(idx, 1);
        return { ...wb, sheets };
      });
      // Adjust the active index so it stays in range after the splice.
      // If we deleted the last tab, slide one to the left.
      setActiveSheetIdx((cur) => {
        if (workbook.sheets.length <= 1) return 0;
        if (cur === idx) return Math.max(0, idx - 1);
        if (cur > idx) return cur - 1;
        return cur;
      });
      setSelected({ r: 0, c: 0 });
    },
    [mutate, setSelected, workbook.sheets.length],
  );

  // Duplicate copies rows + computed grid metadata + conditional rules so
  // formulas in the clone evaluate identically. We append a numeric suffix
  // until the new name is unique.
  const duplicateSheet = useCallback(
    (idx: number) => {
      mutate((wb) => {
        const target = wb.sheets[idx];
        if (!target) return wb;
        let n = 2;
        let name = `${target.name} (Kopie)`;
        while (wb.sheets.some((s) => s.name === name)) {
          n += 1;
          name = `${target.name} (Kopie ${n})`;
        }
        const clone: SheetData = {
          ...target,
          name,
          rows: target.rows.map((row) => [...row]),
          conditionalRules: target.conditionalRules?.map((r) => ({ ...r })),
        };
        const sheets = wb.sheets.slice();
        sheets.splice(idx + 1, 0, clone);
        return { ...wb, sheets };
      });
      setActiveSheetIdx(idx + 1);
      setSelected({ r: 0, c: 0 });
    },
    [mutate, setSelected],
  );

  // Drag-to-reorder. We keep the active sheet pointing at the *same* sheet
  // (not the same index) so a drag never silently swaps which sheet you're
  // editing.
  const moveSheet = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      mutate((wb) => {
        if (from < 0 || from >= wb.sheets.length) return wb;
        const clamped = Math.max(0, Math.min(wb.sheets.length - 1, to));
        if (clamped === from) return wb;
        const sheets = wb.sheets.slice();
        const [moved] = sheets.splice(from, 1);
        sheets.splice(clamped, 0, moved);
        return { ...wb, sheets };
      });
      setActiveSheetIdx((cur) => {
        if (cur === from) return Math.max(0, Math.min(workbook.sheets.length - 1, to));
        // Reordering across the active sheet shifts its index by one.
        if (from < cur && to >= cur) return cur - 1;
        if (from > cur && to <= cur) return cur + 1;
        return cur;
      });
    },
    [mutate, workbook.sheets.length],
  );

  const expandGrid = useCallback(
    (sheetIdx: number, extraRows: number, extraCols: number) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const rowCount = target.rowCount + extraRows;
        const columnCount = target.columnCount + extraCols;
        if (rowCount === target.rowCount && columnCount === target.columnCount)
          return wb;
        sheets[sheetIdx] = { ...target, rowCount, columnCount };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const insertRow = useCallback(
    (sheetIdx: number, atRow: number, where: "above" | "below") => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const insertAt = where === "above" ? atRow : atRow + 1;
        const rows = target.rows.map((row) => row.slice());
        while (rows.length < insertAt) rows.push([]);
        rows.splice(insertAt, 0, []);
        const formats = shiftFormats(target.formats, "row", insertAt, +1);
        sheets[sheetIdx] = {
          ...target,
          rows,
          rowCount: target.rowCount + 1,
          formats,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const deleteRow = useCallback((sheetIdx: number, atRow: number) => {
    mutate((wb) => {
      const sheets = wb.sheets.slice();
      const target = sheets[sheetIdx];
      if (!target) return wb;
      if (target.rowCount <= 1) return wb;
      const rows = target.rows.map((row) => row.slice());
      if (atRow < rows.length) rows.splice(atRow, 1);
      const formats = shiftFormats(target.formats, "row", atRow, -1);
      sheets[sheetIdx] = {
        ...target,
        rows,
        rowCount: Math.max(1, target.rowCount - 1),
        formats,
      };
      return { ...wb, sheets };
    });
  }, [mutate]);

  const insertColumn = useCallback(
    (sheetIdx: number, atCol: number, where: "left" | "right") => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const insertAt = where === "left" ? atCol : atCol + 1;
        const rows = target.rows.map((row) => {
          const r = row.slice();
          while (r.length < insertAt) r.push("");
          r.splice(insertAt, 0, "");
          return r;
        });
        const formats = shiftFormats(target.formats, "col", insertAt, +1);
        sheets[sheetIdx] = {
          ...target,
          rows,
          columnCount: target.columnCount + 1,
          formats,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const deleteColumn = useCallback((sheetIdx: number, atCol: number) => {
    mutate((wb) => {
      const sheets = wb.sheets.slice();
      const target = sheets[sheetIdx];
      if (!target) return wb;
      if (target.columnCount <= 1) return wb;
      const rows = target.rows.map((row) => {
        const r = row.slice();
        if (atCol < r.length) r.splice(atCol, 1);
        return r;
      });
      const formats = shiftFormats(target.formats, "col", atCol, -1);
      sheets[sheetIdx] = {
        ...target,
        rows,
        columnCount: Math.max(1, target.columnCount - 1),
        formats,
      };
      return { ...wb, sheets };
    });
  }, [mutate]);

  const sortByColumn = useCallback(
    (sheetIdx: number, col: number, dir: "asc" | "desc") => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        // Sort starting from row 1 — we treat row 0 as the header so the
        // operator's column titles don't get shuffled into the data. If the
        // operator wanted them sorted too, they can move data first.
        const head = (target.rows[0] ?? []).slice();
        const body = target.rows.slice(1).map((r) => r.slice());
        body.sort((a, b) => {
          const av = a[col] ?? "";
          const bv = b[col] ?? "";
          const an = Number(av.replace(",", "."));
          const bn = Number(bv.replace(",", "."));
          let cmp = 0;
          if (Number.isFinite(an) && Number.isFinite(bn) && av && bv) {
            cmp = an - bn;
          } else {
            cmp = av.localeCompare(bv, undefined, { numeric: true });
          }
          return dir === "asc" ? cmp : -cmp;
        });
        sheets[sheetIdx] = {
          ...target,
          rows: target.rows.length === 0 ? [] : [head, ...body],
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  /**
   * Insert a starter formula at the active cell. For aggregate functions
   * we try to guess a vertical range above, mirroring Excel's "AutoSum
   * detection". For non-aggregates we drop a parameterised template the
   * user can fill in, then we open the editor on it so they keep typing.
   */
  const insertFunctionAtSelection = useCallback(
    (fn: string) => {
      const aggregates = new Set(["SUM", "AVERAGE", "MIN", "MAX", "COUNT"]);
      let formula: string;
      if (aggregates.has(fn)) {
        const range = guessRangeAbove(sheet, selected);
        formula = range ? `=${fn}(${range})` : `=${fn}()`;
      } else {
        // Sensible templates that match the function signature so the
        // user gets a head-start instead of an empty `=NAME()`.
        const template: Record<string, string> = {
          IF: '=IF(A1>0,"Ja","Nein")',
          IFERROR: '=IFERROR(A1/B1,"-")',
          VLOOKUP: "=VLOOKUP(A1,B:D,2,FALSE)",
          INDEX: "=INDEX(A1:C10,2,3)",
          MATCH: "=MATCH(A1,B1:B10,0)",
          COUNTIF: '=COUNTIF(A1:A10,">0")',
          SUMIF: '=SUMIF(A1:A10,">0",B1:B10)',
          TEXT: '=TEXT(A1,"0.00")',
          DATE: "=DATE(2026,1,1)",
          ROUND: "=ROUND(A1,2)",
          CONCAT: '=CONCAT(A1," ",B1)',
          LEN: "=LEN(A1)",
        };
        formula = template[fn] ?? `=${fn}()`;
      }
      setCell(activeSheetIdx, selected.r, selected.c, formula);
    },
    [activeSheetIdx, sheet, selected, setCell],
  );

  /** Set the explicit pixel width for a column. `undefined` resets to default. */
  const setColumnWidth = useCallback(
    (sheetIdx: number, col: number, width: number | undefined) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const widths = { ...(target.columnWidths ?? {}) };
        if (width == null) delete widths[col];
        else widths[col] = Math.round(width);
        sheets[sheetIdx] = {
          ...target,
          columnWidths: Object.keys(widths).length > 0 ? widths : undefined,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const setRowHeight = useCallback(
    (sheetIdx: number, row: number, height: number | undefined) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const heights = { ...(target.rowHeights ?? {}) };
        if (height == null) delete heights[row];
        else heights[row] = Math.round(height);
        sheets[sheetIdx] = {
          ...target,
          rowHeights: Object.keys(heights).length > 0 ? heights : undefined,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const setFreeze = useCallback(
    (sheetIdx: number, frozenRows: number, frozenColumns: number) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        sheets[sheetIdx] = {
          ...target,
          frozenRows: frozenRows > 0 ? frozenRows : undefined,
          frozenColumns: frozenColumns > 0 ? frozenColumns : undefined,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  /**
   * Toggle Auto-Filter on the current sheet. When enabling, we set
   * `filterRow` to row 0 (the conventional header). When disabling,
   * we drop both the row marker and any active filters so re-enabling
   * later starts from a clean slate (Excel does the same).
   */
  const toggleAutoFilter = useCallback(
    (sheetIdx: number) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const enabled = target.filterRow != null;
        sheets[sheetIdx] = {
          ...target,
          filterRow: enabled ? undefined : 0,
          filterValues: enabled ? undefined : target.filterValues,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const setColumnFilter = useCallback(
    (sheetIdx: number, col: number, allowed: string[] | null) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const map = { ...(target.filterValues ?? {}) };
        if (allowed == null) delete map[col];
        else map[col] = allowed;
        sheets[sheetIdx] = {
          ...target,
          filterValues: Object.keys(map).length > 0 ? map : undefined,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  /**
   * Append a conditional-format rule to the active sheet. Validation of the
   * range happens at evaluation time (parseA1Range returning null silently
   * skips), so we just trust the dialog's submitted values here.
   */
  const addConditionalRule = useCallback(
    (sheetIdx: number, rule: ConditionalRule) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const rules = (target.conditionalRules ?? []).slice();
        rules.push(rule);
        sheets[sheetIdx] = { ...target, conditionalRules: rules };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  const removeConditionalRule = useCallback(
    (sheetIdx: number, ruleIdx: number) => {
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target?.conditionalRules) return wb;
        const rules = target.conditionalRules.slice();
        rules.splice(ruleIdx, 1);
        sheets[sheetIdx] = {
          ...target,
          conditionalRules: rules.length > 0 ? rules : undefined,
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  /**
   * Bulk paste a TSV grid into the worksheet starting at `at`. We grow
   * the grid to fit and write all cells in a single mutate() so the
   * paste lands as one undo entry.
   */
  const pasteAt = useCallback(
    (sheetIdx: number, at: CellAddr, grid: string[][]) => {
      if (grid.length === 0) return;
      mutate((wb) => {
        const sheets = wb.sheets.slice();
        const target = sheets[sheetIdx];
        if (!target) return wb;
        const rows = target.rows.map((row) => row.slice());
        const lastRow = at.r + grid.length - 1;
        const lastCol = at.c + Math.max(...grid.map((r) => r.length)) - 1;
        for (let dr = 0; dr < grid.length; dr++) {
          const r = at.r + dr;
          while (rows.length <= r) rows.push([]);
          const row = rows[r]!;
          const incoming = grid[dr]!;
          for (let dc = 0; dc < incoming.length; dc++) {
            const c = at.c + dc;
            while (row.length <= c) row.push("");
            row[c] = incoming[dc] ?? "";
          }
        }
        sheets[sheetIdx] = {
          ...target,
          rows,
          rowCount: Math.max(target.rowCount, lastRow + 1),
          columnCount: Math.max(target.columnCount, lastCol + 1),
        };
        return { ...wb, sheets };
      });
    },
    [mutate],
  );

  /**
   * Append a brand-new sheet built from a CSV/TSV string. Used by the
   * drop handler. The new sheet becomes active so the user sees their
   * pasted data immediately.
   */
  const importDelimited = useCallback(
    (filename: string, text: string, delimiter: "\t" | ",") => {
      const grid = parseDelimited(text, delimiter);
      if (grid.length === 0) return;
      const sheetName = filename.replace(/\.(csv|tsv|txt)$/i, "").slice(0, 31) || "Import";
      mutate((wb) => {
        let unique = sheetName;
        let n = 1;
        while (wb.sheets.some((s) => s.name === unique)) {
          n += 1;
          unique = `${sheetName} ${n}`.slice(0, 31);
        }
        const cols = Math.max(...grid.map((r) => r.length));
        const newSheet: SheetData = {
          name: unique,
          rows: grid,
          rowCount: Math.max(grid.length, 50),
          columnCount: Math.max(cols, 15),
        };
        return { ...wb, sheets: [...wb.sheets, newSheet] };
      });
      // Drop selection back to A1 of the new sheet.
      setActiveSheetIdx(workbook.sheets.length);
      setSelected({ r: 0, c: 0 });
    },
    [mutate, setSelected, workbook.sheets.length],
  );

  /* ── Selection / editing helpers ──────────────────────────────────── */

  const cellRaw = useCallback(
    (r: number, c: number): string => {
      const row = sheet.rows[r];
      if (!row) return "";
      return row[c] ?? "";
    },
    [sheet],
  );

  /**
   * Cross-sheet aware cell lookup. Without a `sheet` argument we read
   * from the active sheet (cheap fast-path that the renderer hits per
   * cell); when the formula engine resolves a `Tabelle2!A1` ref it
   * passes the qualifier and we dispatch into the matching SheetData.
   */
  const lookupForFormula = useCallback(
    (r: number, c: number, sheetName?: string): string => {
      if (sheetName == null) return cellRaw(r, c);
      const target = workbook.sheets.find((s) => s.name === sheetName);
      if (!target) return "#REF!";
      return target.rows[r]?.[c] ?? "";
    },
    [cellRaw, workbook.sheets],
  );

  const selectedRaw = cellRaw(selected.r, selected.c);
  const selectedFormat: CellFormat =
    sheet.formats?.[`${selected.r},${selected.c}`] ?? {};
  const selectionRect = useMemo(() => rangeOf(selection), [selection]);
  const selectionSize = rangeCount(selectionRect);

  const commitEdit = useCallback(
    (next: string) => {
      setCell(activeSheetIdx, selected.r, selected.c, next);
      setEditingValue(null);
    },
    [activeSheetIdx, selected.r, selected.c, setCell],
  );

  const startEdit = useCallback(
    (initial?: string) => {
      setEditingValue(initial ?? selectedRaw);
    },
    [selectedRaw],
  );

  const move = useCallback(
    (dr: number, dc: number) => {
      setSelection((cur) => {
        const r = clamp(cur.focus.r + dr, 0, sheet.rowCount - 1);
        const c = clamp(cur.focus.c + dc, 0, sheet.columnCount - 1);
        if (r === sheet.rowCount - 1 && dr > 0) {
          expandGrid(activeSheetIdx, 25, 0);
        }
        if (c === sheet.columnCount - 1 && dc > 0) {
          expandGrid(activeSheetIdx, 0, 5);
        }
        return { anchor: { r, c }, focus: { r, c } };
      });
    },
    [activeSheetIdx, expandGrid, sheet.rowCount, sheet.columnCount],
  );

  /**
   * Move the focus while keeping the anchor pinned — what Shift+Arrow
   * does in Excel: the selection rectangle grows or shrinks toward the
   * direction of motion.
   */
  const extendFocus = useCallback(
    (dr: number, dc: number) => {
      setSelection((cur) => {
        const r = clamp(cur.focus.r + dr, 0, sheet.rowCount - 1);
        const c = clamp(cur.focus.c + dc, 0, sheet.columnCount - 1);
        if (r === sheet.rowCount - 1 && dr > 0) {
          expandGrid(activeSheetIdx, 25, 0);
        }
        if (c === sheet.columnCount - 1 && dc > 0) {
          expandGrid(activeSheetIdx, 0, 5);
        }
        return { anchor: cur.anchor, focus: { r, c } };
      });
    },
    [activeSheetIdx, expandGrid, sheet.rowCount, sheet.columnCount],
  );

  /** Drag-select handler the Grid wires up. */
  const beginRangeDrag = useCallback((addr: CellAddr) => {
    setSelection({ anchor: { ...addr }, focus: { ...addr } });
  }, []);
  const extendRangeDrag = useCallback((addr: CellAddr) => {
    setSelection((cur) => ({ anchor: cur.anchor, focus: { ...addr } }));
  }, []);

  /** Select an entire column / row when the user clicks the header. */
  const selectColumn = useCallback(
    (c: number) => {
      setSelection({
        anchor: { r: 0, c },
        focus: { r: sheet.rowCount - 1, c },
      });
      gridFocusRef.current();
    },
    [sheet.rowCount],
  );
  const selectRow = useCallback(
    (r: number) => {
      setSelection({
        anchor: { r, c: 0 },
        focus: { r, c: sheet.columnCount - 1 },
      });
      gridFocusRef.current();
    },
    [sheet.columnCount],
  );

  /* ── Toolbar wiring ───────────────────────────────────────────────── */

  /**
   * Toolbar callbacks intentionally read the *current* selection rect
   * each time they run — wrapping it in deps would force a new ref on
   * every selection change and re-mount the dropdowns. We use the rect
   * captured at click time instead, which is the right semantic.
   */
  const toggleFlag = useCallback(
    (flag: "bold" | "italic" | "underline") => {
      // For range toggles we sample the anchor cell to decide the new
      // value: if the anchor is currently bold, we *unset* on every cell
      // (Excel's "consistent toggle" behaviour); otherwise we set.
      const anchorKey = `${selectionRect.r0},${selectionRect.c0}`;
      const anchorOn = !!sheet.formats?.[anchorKey]?.[flag];
      updateFormatInRange(activeSheetIdx, selectionRect, (cur) => ({
        ...cur,
        [flag]: anchorOn ? undefined : true,
      }));
      gridFocusRef.current();
    },
    [activeSheetIdx, selectionRect, sheet.formats, updateFormatInRange],
  );

  const setAlign = useCallback(
    (align: "left" | "center" | "right") => {
      const anchorKey = `${selectionRect.r0},${selectionRect.c0}`;
      const anchorAlign = sheet.formats?.[anchorKey]?.align;
      updateFormatInRange(activeSheetIdx, selectionRect, (cur) => ({
        ...cur,
        align: anchorAlign === align ? undefined : align,
      }));
      gridFocusRef.current();
    },
    [activeSheetIdx, selectionRect, sheet.formats, updateFormatInRange],
  );

  const setNumberFormat = useCallback(
    (numberFormat: NonNullable<CellFormat["numberFormat"]>) => {
      const anchorKey = `${selectionRect.r0},${selectionRect.c0}`;
      const anchorFmt = sheet.formats?.[anchorKey]?.numberFormat;
      updateFormatInRange(activeSheetIdx, selectionRect, (cur) => ({
        ...cur,
        numberFormat: anchorFmt === numberFormat ? undefined : numberFormat,
      }));
      gridFocusRef.current();
    },
    [activeSheetIdx, selectionRect, sheet.formats, updateFormatInRange],
  );

  const clearFormat = useCallback(() => {
    updateFormatInRange(activeSheetIdx, selectionRect, () => null);
    gridFocusRef.current();
  }, [activeSheetIdx, selectionRect, updateFormatInRange]);

  const clearSelectionContent = useCallback(() => {
    setCellsInRange(activeSheetIdx, selectionRect, "");
  }, [activeSheetIdx, selectionRect, setCellsInRange]);

  /**
   * Background / text colour: toolbar passes a hex string (without `#`,
   * lowercase) or `undefined` to reset. We always apply across the
   * current selection rect.
   */
  const setBgColor = useCallback(
    (color: string | undefined) => {
      updateFormatInRange(activeSheetIdx, selectionRect, (cur) => ({
        ...cur,
        bgColor: color,
      }));
      gridFocusRef.current();
    },
    [activeSheetIdx, selectionRect, updateFormatInRange],
  );
  const setTextColor = useCallback(
    (color: string | undefined) => {
      updateFormatInRange(activeSheetIdx, selectionRect, (cur) => ({
        ...cur,
        textColor: color,
      }));
      gridFocusRef.current();
    },
    [activeSheetIdx, selectionRect, updateFormatInRange],
  );

  /* ── Clipboard (intra- and inter-app via TSV) ────────────────────── */

  /**
   * Serialise the current selection rect to TSV. We use real TAB and
   * LF separators so pasting into native Excel/Numbers/Calc lands in
   * the correct cells. Cell values that contain tabs or newlines get
   * wrapped in double quotes, doubling internal quotes — that's the
   * RFC 4180 dialect every spreadsheet honours.
   */
  const serialiseSelection = useCallback((): string => {
    const lines: string[] = [];
    for (let r = selectionRect.r0; r <= selectionRect.r1; r++) {
      const cells: string[] = [];
      for (let c = selectionRect.c0; c <= selectionRect.c1; c++) {
        const v = cellRaw(r, c);
        if (/[\t\n"]/.test(v)) {
          cells.push(`"${v.replace(/"/g, '""')}"`);
        } else {
          cells.push(v);
        }
      }
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }, [cellRaw, selectionRect]);

  const copySelection = useCallback(async () => {
    const text = serialiseSelection();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for browsers without the async Clipboard API: rely on
      // the upcoming `copy` event firing on the focused grid container.
      // We attach a one-shot listener that overrides clipboardData.
      const onCopy = (ev: ClipboardEvent) => {
        ev.preventDefault();
        ev.clipboardData?.setData("text/plain", text);
      };
      document.addEventListener("copy", onCopy, { once: true });
      document.execCommand("copy");
    }
  }, [serialiseSelection]);

  const cutSelection = useCallback(async () => {
    await copySelection();
    clearSelectionContent();
  }, [copySelection, clearSelectionContent]);

  const pasteFromClipboard = useCallback(async () => {
    let text = "";
    try {
      text = await navigator.clipboard.readText();
    } catch {
      return;
    }
    if (!text) return;
    // Detect TAB vs comma. We prefer TAB because that's what Excel
    // and Numbers paste; we fall back to comma if the buffer doesn't
    // contain a tab anywhere (likely a CSV from the user's editor).
    const delim = text.includes("\t") ? "\t" : ",";
    const grid = parseDelimited(text, delim as "\t" | ",");
    if (grid.length === 0) return;
    pasteAt(activeSheetIdx, { r: selectionRect.r0, c: selectionRect.c0 }, grid);
    // Move focus to the bottom-right of what we just pasted so a
    // follow-up Cmd+V doesn't overwrite it.
    const lastR = selectionRect.r0 + grid.length - 1;
    const lastC =
      selectionRect.c0 + Math.max(...grid.map((r) => r.length)) - 1;
    setSelection({
      anchor: { r: selectionRect.r0, c: selectionRect.c0 },
      focus: { r: lastR, c: lastC },
    });
  }, [activeSheetIdx, pasteAt, selectionRect.c0, selectionRect.r0]);

  /* ── Find & Replace ──────────────────────────────────────────────── */

  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [replaceQuery, setReplaceQuery] = useState("");
  const [findCaseSensitive, setFindCaseSensitive] = useState(false);

  /* ── Conditional formatting dialog ───────────────────────────────── */

  const [cfDialogOpen, setCfDialogOpen] = useState(false);

  const findNext = useCallback(
    (direction: 1 | -1 = 1) => {
      if (!findQuery) return;
      const needle = findCaseSensitive ? findQuery : findQuery.toLowerCase();
      const total = sheet.rowCount * sheet.columnCount;
      const startIdx = selected.r * sheet.columnCount + selected.c;
      for (let step = 1; step <= total; step++) {
        const idx = (startIdx + direction * step + total) % total;
        const r = Math.floor(idx / sheet.columnCount);
        const c = idx % sheet.columnCount;
        const v = sheet.rows[r]?.[c] ?? "";
        const hay = findCaseSensitive ? v : v.toLowerCase();
        if (hay.includes(needle)) {
          setSelected({ r, c });
          gridFocusRef.current();
          return;
        }
      }
    },
    [findCaseSensitive, findQuery, selected.c, selected.r, setSelected, sheet],
  );

  const replaceCurrent = useCallback(() => {
    const v = cellRaw(selected.r, selected.c);
    const re = new RegExp(
      findQuery.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
      findCaseSensitive ? "g" : "gi",
    );
    if (!findQuery || !re.test(v)) {
      findNext(1);
      return;
    }
    setCell(activeSheetIdx, selected.r, selected.c, v.replace(re, replaceQuery));
    findNext(1);
  }, [
    activeSheetIdx,
    cellRaw,
    findCaseSensitive,
    findNext,
    findQuery,
    replaceQuery,
    selected.c,
    selected.r,
    setCell,
  ]);

  const replaceAll = useCallback(() => {
    if (!findQuery) return;
    const re = new RegExp(
      findQuery.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"),
      findCaseSensitive ? "g" : "gi",
    );
    let count = 0;
    mutate((wb) => {
      const sheets = wb.sheets.slice();
      const target = sheets[activeSheetIdx];
      if (!target) return wb;
      const rows = target.rows.map((row) => {
        return row.map((cell) => {
          if (typeof cell === "string" && re.test(cell)) {
            count += 1;
            return cell.replace(re, replaceQuery);
          }
          return cell;
        });
      });
      sheets[activeSheetIdx] = { ...target, rows };
      return { ...wb, sheets };
    });
    // Surface a small toast via the find bar's own status instead of
    // an alert — the operator stays in flow.
    if (count === 0) {
      setReplaceStatus("Keine Treffer.");
    } else {
      setReplaceStatus(`${count} Ersetzung${count === 1 ? "" : "en"}.`);
    }
  }, [activeSheetIdx, findCaseSensitive, findQuery, mutate, replaceQuery]);
  const [replaceStatus, setReplaceStatus] = useState<string>("");
  // Clear status whenever the user re-types: prevents stale "5 Ersetzungen"
  // hanging around after they start a new search.
  useEffect(() => {
    setReplaceStatus("");
  }, [findQuery, replaceQuery]);

  /* ── Render ───────────────────────────────────────────────────────── */

  return (
    <div className="h-full w-full flex flex-col bg-bg-base text-text-primary">
      <Toolbar
        format={selectedFormat}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onCopy={copySelection}
        onCut={cutSelection}
        onPaste={pasteFromClipboard}
        onToggleBold={() => toggleFlag("bold")}
        onToggleItalic={() => toggleFlag("italic")}
        onToggleUnderline={() => toggleFlag("underline")}
        onAlign={setAlign}
        onNumberFormat={setNumberFormat}
        onClearFormat={clearFormat}
        onSetBgColor={setBgColor}
        onSetTextColor={setTextColor}
        onInsertRow={(where) =>
          insertRow(activeSheetIdx, selected.r, where)
        }
        onDeleteRow={() => deleteRow(activeSheetIdx, selected.r)}
        onInsertColumn={(where) =>
          insertColumn(activeSheetIdx, selected.c, where)
        }
        onDeleteColumn={() => deleteColumn(activeSheetIdx, selected.c)}
        onSort={(dir) => sortByColumn(activeSheetIdx, selected.c, dir)}
        onToggleAutoFilter={() => toggleAutoFilter(activeSheetIdx)}
        autoFilterActive={sheet.filterRow != null}
        frozenRows={sheet.frozenRows ?? 0}
        frozenColumns={sheet.frozenColumns ?? 0}
        onFreezeFirstRow={() =>
          setFreeze(activeSheetIdx, sheet.frozenRows ? 0 : 1, sheet.frozenColumns ?? 0)
        }
        onFreezeFirstColumn={() =>
          setFreeze(activeSheetIdx, sheet.frozenRows ?? 0, sheet.frozenColumns ? 0 : 1)
        }
        onUnfreeze={() => setFreeze(activeSheetIdx, 0, 0)}
        onInsertFunction={insertFunctionAtSelection}
        onOpenFind={() => setFindOpen(true)}
        onOpenConditional={() => setCfDialogOpen(true)}
      />
      {cfDialogOpen && (
        <ConditionalFormatDialog
          rules={sheet.conditionalRules ?? []}
          defaultRange={
            selectionSize > 1
              ? `${cellAddress(selectionRect.r0, selectionRect.c0)}:${cellAddress(selectionRect.r1, selectionRect.c1)}`
              : cellAddress(selected.r, selected.c)
          }
          onAdd={(rule) => addConditionalRule(activeSheetIdx, rule)}
          onRemove={(idx) => removeConditionalRule(activeSheetIdx, idx)}
          onClose={() => setCfDialogOpen(false)}
        />
      )}
      {findOpen && (
        <FindReplaceBar
          query={findQuery}
          replace={replaceQuery}
          caseSensitive={findCaseSensitive}
          status={replaceStatus}
          onQueryChange={setFindQuery}
          onReplaceChange={setReplaceQuery}
          onCaseSensitiveChange={setFindCaseSensitive}
          onNext={() => findNext(1)}
          onPrev={() => findNext(-1)}
          onReplace={replaceCurrent}
          onReplaceAll={replaceAll}
          onClose={() => {
            setFindOpen(false);
            setReplaceStatus("");
            gridFocusRef.current();
          }}
        />
      )}
      <FormulaBar
        addr={
          selectionSize > 1
            ? `${cellAddress(selectionRect.r0, selectionRect.c0)}:${cellAddress(selectionRect.r1, selectionRect.c1)}`
            : cellAddress(selected.r, selected.c)
        }
        value={editingValue ?? selectedRaw}
        editing={editingValue != null}
        onChange={(v) => setEditingValue(v)}
        onCommit={(v) => commitEdit(v)}
        onCancel={() => setEditingValue(null)}
        onFocus={() => {
          if (editingValue == null) startEdit(selectedRaw);
        }}
      />
      <Grid
        sheet={sheet}
        sheetIdx={activeSheetIdx}
        selection={selection}
        selectionRect={selectionRect}
        editingValue={editingValue}
        lookup={lookupForFormula}
        focusRef={gridFocusRef}
        onSelect={(addr) => {
          setSelected(addr);
          setEditingValue(null);
        }}
        onBeginRangeDrag={beginRangeDrag}
        onExtendRangeDrag={extendRangeDrag}
        onSelectColumn={selectColumn}
        onSelectRow={selectRow}
        onStartEdit={(addr, initial) => {
          setSelected(addr);
          setEditingValue(initial ?? cellRaw(addr.r, addr.c));
        }}
        onCommit={(value) => commitEdit(value)}
        onMove={move}
        onExtend={extendFocus}
        onClearRange={clearSelectionContent}
        onExpand={(rows, cols) => expandGrid(activeSheetIdx, rows, cols)}
        onUndo={undo}
        onRedo={redo}
        onCopy={copySelection}
        onCut={cutSelection}
        onPaste={pasteFromClipboard}
        onOpenFind={() => setFindOpen(true)}
        onSetColumnWidth={(col, width) =>
          setColumnWidth(activeSheetIdx, col, width)
        }
        onSetRowHeight={(row, height) =>
          setRowHeight(activeSheetIdx, row, height)
        }
        onSetColumnFilter={(col, allowed) =>
          setColumnFilter(activeSheetIdx, col, allowed)
        }
        onImportDelimited={importDelimited}
      />
      <SheetTabs
        sheets={workbook.sheets}
        activeIdx={activeSheetIdx}
        onSelect={(i) => {
          setActiveSheetIdx(i);
          setSelected({ r: 0, c: 0 });
          setEditingValue(null);
        }}
        onAdd={addSheet}
        onRename={renameSheet}
        onDelete={deleteSheet}
        onDuplicate={duplicateSheet}
        onMove={moveSheet}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              helpers                                    */
/* ─────────────────────────────────────────────────────────────────────── */

type CellAddr = { r: number; c: number };

/**
 * A 2-D selection. `anchor` is the cell where the drag/extend started;
 * `focus` is the current end. The visible range spans the rectangle
 * formed by these two corners.
 */
type Selection = { anchor: CellAddr; focus: CellAddr };

type RangeRect = { r0: number; r1: number; c0: number; c1: number };

function rangeOf(sel: Selection): RangeRect {
  return {
    r0: Math.min(sel.anchor.r, sel.focus.r),
    r1: Math.max(sel.anchor.r, sel.focus.r),
    c0: Math.min(sel.anchor.c, sel.focus.c),
    c1: Math.max(sel.anchor.c, sel.focus.c),
  };
}

function rangeCount(rect: RangeRect): number {
  return (rect.r1 - rect.r0 + 1) * (rect.c1 - rect.c0 + 1);
}

function isInRange(rect: RangeRect, r: number, c: number): boolean {
  return r >= rect.r0 && r <= rect.r1 && c >= rect.c0 && c <= rect.c1;
}

/**
 * Parse RFC 4180-ish delimited text. Handles quoted fields with
 * doubled quotes and embedded newlines. Yields a 2D string grid.
 *
 * We hand-roll instead of pulling in `papaparse` because we want zero
 * extra deps for this surface-level feature, and the inputs we meet
 * (clipboard, drag-drop CSV/TSV) are uniformly shaped.
 */
function parseDelimited(text: string, delim: "\t" | ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"' && cell === "") {
      inQuotes = true;
      continue;
    }
    if (ch === delim) {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    cell += ch;
  }
  // Trailing cell / row.
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Drop a trailing empty row caused by a final newline.
  if (rows.length > 0 && rows[rows.length - 1]!.every((c) => c === "")) {
    rows.pop();
  }
  return rows;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isEmptyFormat(f: CellFormat): boolean {
  return (
    !f.bold &&
    !f.italic &&
    !f.underline &&
    !f.align &&
    (!f.numberFormat || f.numberFormat === "default")
  );
}

function normaliseSheet(s: SheetData): SheetData {
  const rows = (s.rows ?? []).map((row) =>
    Array.isArray(row) ? row.map((v) => (v == null ? "" : String(v))) : [],
  );
  return {
    name: s.name?.trim() || "Tabelle1",
    rows,
    rowCount: Math.max(s.rowCount ?? 0, rows.length, 50),
    columnCount: Math.max(
      s.columnCount ?? 0,
      ...rows.map((r) => r.length),
      15,
    ),
    formats: s.formats ? { ...s.formats } : undefined,
  };
}

function serialiseForCompare(wb: SimpleWorkbook): string {
  const out: string[] = [];
  for (const sheet of wb.sheets) {
    out.push(sheet.name);
    for (let r = 0; r < sheet.rows.length; r++) {
      const row = sheet.rows[r]!;
      for (let c = 0; c < row.length; c++) {
        const v = row[c];
        if (v) out.push(`${r},${c}:${v}`);
      }
    }
    if (sheet.formats) {
      for (const [k, v] of Object.entries(sheet.formats)) {
        out.push(`f:${k}=${JSON.stringify(v)}`);
      }
    }
    out.push("|");
  }
  return out.join("\n");
}

function colLetter(c: number): string {
  let n = c;
  let s = "";
  while (n >= 0) {
    s = String.fromCharCode((n % 26) + 65) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
}

function cellAddress(r: number, c: number): string {
  return `${colLetter(c)}${r + 1}`;
}

/**
 * Re-key every entry in a `formats` map after a row/col insert/delete.
 *
 * Rows/cols at or after `at` shift by `delta` (±1). Entries on the
 * deleted line are dropped.
 */
function shiftFormats(
  formats: Record<string, CellFormat> | undefined,
  axis: "row" | "col",
  at: number,
  delta: number,
): Record<string, CellFormat> | undefined {
  if (!formats) return formats;
  const next: Record<string, CellFormat> = {};
  for (const [key, val] of Object.entries(formats)) {
    const [rs, cs] = key.split(",");
    const r = Number(rs);
    const c = Number(cs);
    if (axis === "row") {
      if (delta < 0 && r === at) continue;
      const nr = r >= at ? r + delta : r;
      if (nr < 0) continue;
      next[`${nr},${c}`] = val;
    } else {
      if (delta < 0 && c === at) continue;
      const nc = c >= at ? c + delta : c;
      if (nc < 0) continue;
      next[`${r},${nc}`] = val;
    }
  }
  return next;
}

/**
 * If the cells immediately above the selection contain a contiguous run
 * of values, return their range as an A1-notation string (e.g. "A1:A5").
 * Used by the "insert =SUM"-style toolbar buttons so the operator gets a
 * sensible default selection without typing the range.
 */
function guessRangeAbove(sheet: SheetData, selected: CellAddr): string | null {
  if (selected.r === 0) return null;
  let r = selected.r - 1;
  while (r >= 0 && (sheet.rows[r]?.[selected.c] ?? "") !== "") r -= 1;
  const top = r + 1;
  const bottom = selected.r - 1;
  if (top > bottom) return null;
  const colL = colLetter(selected.c);
  return `${colL}${top + 1}:${colL}${bottom + 1}`;
}

/* ─── Number formatter used by the renderer ───────────────────────────── */

function formatDisplay(raw: string, computed: string, format: CellFormat): string {
  if (raw === "" && computed === "") return "";
  if (!format.numberFormat || format.numberFormat === "default")
    return computed;
  const cleaned = computed.replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return computed;
  switch (format.numberFormat) {
    case "integer":
      return Math.round(n).toLocaleString("de-CH");
    case "decimal2":
      return n.toLocaleString("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case "percent":
      return (n * 100).toLocaleString("de-CH", {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }) + " %";
    case "currency":
      return n.toLocaleString("de-CH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }) + " CHF";
    default:
      return computed;
  }
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Toolbar                                    */
/* ─────────────────────────────────────────────────────────────────────── */

function Toolbar({
  format,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  onToggleBold,
  onToggleItalic,
  onToggleUnderline,
  onAlign,
  onNumberFormat,
  onClearFormat,
  onSetBgColor,
  onSetTextColor,
  onInsertRow,
  onDeleteRow,
  onInsertColumn,
  onDeleteColumn,
  onSort,
  onToggleAutoFilter,
  autoFilterActive,
  frozenRows,
  frozenColumns,
  onFreezeFirstRow,
  onFreezeFirstColumn,
  onUnfreeze,
  onInsertFunction,
  onOpenFind,
  onOpenConditional,
}: {
  format: CellFormat;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onToggleBold: () => void;
  onToggleItalic: () => void;
  onToggleUnderline: () => void;
  onAlign: (a: "left" | "center" | "right") => void;
  onNumberFormat: (f: NonNullable<CellFormat["numberFormat"]>) => void;
  onClearFormat: () => void;
  onSetBgColor: (color: string | undefined) => void;
  onSetTextColor: (color: string | undefined) => void;
  onOpenConditional: () => void;
  onInsertRow: (where: "above" | "below") => void;
  onDeleteRow: () => void;
  onInsertColumn: (where: "left" | "right") => void;
  onDeleteColumn: () => void;
  onSort: (dir: "asc" | "desc") => void;
  onToggleAutoFilter: () => void;
  autoFilterActive: boolean;
  frozenRows: number;
  frozenColumns: number;
  onFreezeFirstRow: () => void;
  onFreezeFirstColumn: () => void;
  onUnfreeze: () => void;
  onInsertFunction: (
    fn:
      | "SUM"
      | "AVERAGE"
      | "MIN"
      | "MAX"
      | "COUNT"
      | "IF"
      | "IFERROR"
      | "VLOOKUP"
      | "INDEX"
      | "MATCH"
      | "COUNTIF"
      | "SUMIF"
      | "TEXT"
      | "DATE"
      | "ROUND"
      | "CONCAT"
      | "LEN",
  ) => void;
  onOpenFind: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close the open dropdown when the operator clicks anywhere outside the
  // toolbar — without this, the menu would stay open until they click the
  // exact same trigger again.
  useEffect(() => {
    if (!openMenu) return;
    const onDocClick = (e: MouseEvent) => {
      const el = wrapperRef.current;
      if (el && !el.contains(e.target as Node)) setOpenMenu(null);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [openMenu]);

  return (
    <div
      ref={wrapperRef}
      className="shrink-0 border-b border-stroke-1 bg-bg-chrome"
    >
      <div className="flex items-stretch gap-0 px-2 h-9 select-none overflow-x-auto">
        <Group label="Verlauf">
          <ToolBtn
            title="Rückgängig (Cmd/Ctrl+Z)"
            onClick={onUndo}
            disabled={!canUndo}
          >
            <Undo2 size={13} />
          </ToolBtn>
          <ToolBtn
            title="Wiederholen (Cmd/Ctrl+Shift+Z)"
            onClick={onRedo}
            disabled={!canRedo}
          >
            <Redo2 size={13} />
          </ToolBtn>
        </Group>

        <Group label="Zwischenablage">
          <ToolBtn title="Kopieren (Cmd/Ctrl+C)" onClick={onCopy}>
            <CopyIcon size={13} />
          </ToolBtn>
          <ToolBtn title="Ausschneiden (Cmd/Ctrl+X)" onClick={onCut}>
            <Scissors size={13} />
          </ToolBtn>
          <ToolBtn title="Einfügen (Cmd/Ctrl+V)" onClick={onPaste}>
            <ClipboardPaste size={13} />
          </ToolBtn>
        </Group>

        <Group label="Schrift">
          <ToolBtn
            title="Fett (Cmd/Ctrl+B)"
            active={!!format.bold}
            onClick={onToggleBold}
          >
            <Bold size={13} />
          </ToolBtn>
          <ToolBtn
            title="Kursiv (Cmd/Ctrl+I)"
            active={!!format.italic}
            onClick={onToggleItalic}
          >
            <Italic size={13} />
          </ToolBtn>
          <ToolBtn
            title="Unterstrichen (Cmd/Ctrl+U)"
            active={!!format.underline}
            onClick={onToggleUnderline}
          >
            <UnderlineIcon size={13} />
          </ToolBtn>
        </Group>

        <Group label="Farben">
          <ColorPickerButton
            title="Hintergrundfarbe"
            kind="bg"
            currentColor={format.bgColor}
            onPick={onSetBgColor}
            open={openMenu === "bg"}
            onOpenChange={(v) => setOpenMenu(v ? "bg" : null)}
          />
          <ColorPickerButton
            title="Textfarbe"
            kind="text"
            currentColor={format.textColor}
            onPick={onSetTextColor}
            open={openMenu === "text"}
            onOpenChange={(v) => setOpenMenu(v ? "text" : null)}
          />
        </Group>

        <Group label="Ausrichtung">
          <ToolBtn
            title="Linksbündig"
            active={format.align === "left"}
            onClick={() => onAlign("left")}
          >
            <AlignLeft size={13} />
          </ToolBtn>
          <ToolBtn
            title="Zentriert"
            active={format.align === "center"}
            onClick={() => onAlign("center")}
          >
            <AlignCenter size={13} />
          </ToolBtn>
          <ToolBtn
            title="Rechtsbündig"
            active={format.align === "right"}
            onClick={() => onAlign("right")}
          >
            <AlignRight size={13} />
          </ToolBtn>
        </Group>

        <Group label="Zahl">
          <ToolBtn
            title="Ganze Zahl"
            active={format.numberFormat === "integer"}
            onClick={() => onNumberFormat("integer")}
          >
            <Hash size={13} />
          </ToolBtn>
          <ToolBtn
            title="Dezimal (2 Stellen)"
            active={format.numberFormat === "decimal2"}
            onClick={() => onNumberFormat("decimal2")}
          >
            <span className="text-[10.5px] font-mono leading-none">0,00</span>
          </ToolBtn>
          <ToolBtn
            title="Prozent"
            active={format.numberFormat === "percent"}
            onClick={() => onNumberFormat("percent")}
          >
            <Percent size={13} />
          </ToolBtn>
          <ToolBtn
            title="Währung CHF"
            active={format.numberFormat === "currency"}
            onClick={() => onNumberFormat("currency")}
          >
            <CircleDollarSign size={13} />
          </ToolBtn>
          <ToolBtn title="Format löschen" onClick={onClearFormat}>
            <Eraser size={13} />
          </ToolBtn>
        </Group>

        <Group label="Einfügen">
          <Dropdown
            label={
              <>
                <RowsIcon size={13} />
                Zeile
                <ChevronDown size={11} className="opacity-60" />
              </>
            }
            open={openMenu === "row"}
            onOpenChange={(v) => setOpenMenu(v ? "row" : null)}
          >
            <MenuItem onClick={() => onInsertRow("above")}>
              Zeile darüber einfügen
            </MenuItem>
            <MenuItem onClick={() => onInsertRow("below")}>
              Zeile darunter einfügen
            </MenuItem>
            <MenuItem onClick={onDeleteRow} danger>
              <Trash2 size={11} className="mr-1.5" />
              Zeile löschen
            </MenuItem>
          </Dropdown>
          <Dropdown
            label={
              <>
                <Columns3 size={13} />
                Spalte
                <ChevronDown size={11} className="opacity-60" />
              </>
            }
            open={openMenu === "col"}
            onOpenChange={(v) => setOpenMenu(v ? "col" : null)}
          >
            <MenuItem onClick={() => onInsertColumn("left")}>
              Spalte links einfügen
            </MenuItem>
            <MenuItem onClick={() => onInsertColumn("right")}>
              Spalte rechts einfügen
            </MenuItem>
            <MenuItem onClick={onDeleteColumn} danger>
              <Trash2 size={11} className="mr-1.5" />
              Spalte löschen
            </MenuItem>
          </Dropdown>
        </Group>

        <Group label="Daten">
          <ToolBtn
            title="Spalte sortieren A → Z"
            onClick={() => onSort("asc")}
          >
            <ArrowDownAZ size={13} />
          </ToolBtn>
          <ToolBtn
            title="Spalte sortieren Z → A"
            onClick={() => onSort("desc")}
          >
            <ArrowUpAZ size={13} />
          </ToolBtn>
          <ToolBtn
            title="Auto-Filter (Klick aktiviert Filter-Pfeile in der Header-Zeile)"
            active={autoFilterActive}
            onClick={onToggleAutoFilter}
          >
            <Filter size={13} />
          </ToolBtn>
        </Group>

        <Group label="Ansicht">
          <Dropdown
            label={
              <>
                <Lock size={13} />
                Fixieren
                <ChevronDown size={11} className="opacity-60" />
              </>
            }
            open={openMenu === "freeze"}
            onOpenChange={(v) => setOpenMenu(v ? "freeze" : null)}
          >
            <MenuItem onClick={onFreezeFirstRow}>
              {frozenRows > 0 ? "✓ " : ""}Erste Zeile fixieren
            </MenuItem>
            <MenuItem onClick={onFreezeFirstColumn}>
              {frozenColumns > 0 ? "✓ " : ""}Erste Spalte fixieren
            </MenuItem>
            <MenuItem onClick={onUnfreeze} danger>
              Fixierung aufheben
            </MenuItem>
          </Dropdown>
          <ToolBtn title="Suchen / Ersetzen (Cmd/Ctrl+F)" onClick={onOpenFind}>
            <Search size={13} />
          </ToolBtn>
          <ToolBtn
            title="Bedingte Formatierung – Heat / Schwellwert / Farbverlauf"
            onClick={onOpenConditional}
          >
            <Palette size={13} />
          </ToolBtn>
        </Group>

        <Group label="Formeln" last>
          <Dropdown
            label={
              <>
                <Sigma size={13} />
                Funktion
                <ChevronDown size={11} className="opacity-60" />
              </>
            }
            open={openMenu === "fn"}
            onOpenChange={(v) => setOpenMenu(v ? "fn" : null)}
            wide
          >
            <MenuItem onClick={() => onInsertFunction("SUM")}>
              <code className="font-mono text-[11px]">=SUM</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Summe
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("AVERAGE")}>
              <code className="font-mono text-[11px]">=AVERAGE</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Mittelwert
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("MIN")}>
              <code className="font-mono text-[11px]">=MIN</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Minimum
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("MAX")}>
              <code className="font-mono text-[11px]">=MAX</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Maximum
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("COUNT")}>
              <code className="font-mono text-[11px]">=COUNT</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Anzahl
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("IF")}>
              <code className="font-mono text-[11px]">=IF</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Wenn-Dann
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("IFERROR")}>
              <code className="font-mono text-[11px]">=IFERROR</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Fehler abfangen
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("VLOOKUP")}>
              <code className="font-mono text-[11px]">=VLOOKUP</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Vertikale Suche
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("INDEX")}>
              <code className="font-mono text-[11px]">=INDEX</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Wert per Position
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("MATCH")}>
              <code className="font-mono text-[11px]">=MATCH</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Position finden
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("COUNTIF")}>
              <code className="font-mono text-[11px]">=COUNTIF</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Bedingte Anzahl
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("SUMIF")}>
              <code className="font-mono text-[11px]">=SUMIF</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Bedingte Summe
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("TEXT")}>
              <code className="font-mono text-[11px]">=TEXT</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Wert formatieren
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("DATE")}>
              <code className="font-mono text-[11px]">=DATE</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Datum bauen
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("ROUND")}>
              <code className="font-mono text-[11px]">=ROUND</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Runden
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("CONCAT")}>
              <code className="font-mono text-[11px]">=CONCAT</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Texte verbinden
              </span>
            </MenuItem>
            <MenuItem onClick={() => onInsertFunction("LEN")}>
              <code className="font-mono text-[11px]">=LEN</code>
              <span className="text-text-tertiary text-[10.5px] ml-2">
                Textlänge
              </span>
            </MenuItem>
          </Dropdown>
        </Group>
      </div>
    </div>
  );
}

function Group({
  label,
  children,
  last,
}: {
  label: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-stretch px-2 ${last ? "" : "border-r border-stroke-1"}`}
    >
      <div className="flex items-center gap-0.5 flex-1">{children}</div>
      <span className="text-text-quaternary text-[9px] uppercase tracking-wide leading-tight pb-0.5">
        {label}
      </span>
    </div>
  );
}

function ToolBtn({
  children,
  onClick,
  active,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      disabled={disabled}
      className={`p-1.5 rounded inline-flex items-center justify-center min-w-[26px] h-[26px] ${
        disabled
          ? "text-text-quaternary cursor-not-allowed"
          : active
            ? "bg-[#5b5fc7]/25 text-text-primary"
            : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}

function Dropdown({
  label,
  children,
  open,
  onOpenChange,
  wide,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wide?: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`px-2 h-[26px] rounded inline-flex items-center gap-1 text-[11px] ${
          open
            ? "bg-bg-overlay text-text-primary"
            : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
        }`}
      >
        {label}
      </button>
      {open && (
        <div
          className={`absolute top-full left-0 mt-1 z-30 ${wide ? "w-[220px]" : "w-[200px]"} rounded-md border border-stroke-1 bg-bg-elevated shadow-lg py-1`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-[11.5px] flex items-center hover:bg-bg-overlay ${
        danger ? "text-warning" : "text-text-secondary"
      }`}
    >
      {children}
    </button>
  );
}

/**
 * Standard 5×3 colour swatch palette plus a "no fill" option. The bar
 * underneath the icon previews the currently picked colour so the
 * operator can see at a glance which shade their range carries — same
 * pattern Excel uses on its bucket / type-colour pickers.
 */
const COLOR_PALETTE: { hex: string; label: string }[] = [
  { hex: "ffffff", label: "Weiß" },
  { hex: "000000", label: "Schwarz" },
  { hex: "f3f4f6", label: "Hellgrau" },
  { hex: "9ca3af", label: "Grau" },
  { hex: "fee2e2", label: "Hellrot" },
  { hex: "ef4444", label: "Rot" },
  { hex: "fef3c7", label: "Hellgelb" },
  { hex: "f59e0b", label: "Bernstein" },
  { hex: "d1fae5", label: "Hellgrün" },
  { hex: "10b981", label: "Grün" },
  { hex: "dbeafe", label: "Hellblau" },
  { hex: "3b82f6", label: "Blau" },
  { hex: "ede9fe", label: "Helllila" },
  { hex: "8b5cf6", label: "Lila" },
  { hex: "fce7f3", label: "Hellrosa" },
  { hex: "ec4899", label: "Pink" },
];

function ColorPickerButton({
  title,
  kind,
  currentColor,
  onPick,
  open,
  onOpenChange,
}: {
  title: string;
  kind: "bg" | "text";
  currentColor?: string;
  onPick: (color: string | undefined) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        title={title}
        className={`p-1.5 rounded inline-flex flex-col items-center justify-center min-w-[26px] h-[26px] gap-px ${
          open
            ? "bg-bg-overlay text-text-primary"
            : "text-text-secondary hover:bg-bg-overlay hover:text-text-primary"
        }`}
      >
        {kind === "bg" ? <PaintBucket size={12} /> : <TypeIcon size={12} />}
        <span
          className="block w-3.5 h-1 rounded-sm"
          style={{
            background: currentColor ? `#${currentColor}` : "transparent",
            border: currentColor
              ? "none"
              : "1px solid var(--stroke-1, #444)",
          }}
        />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 z-30 w-[180px] rounded-md border border-stroke-1 bg-bg-elevated shadow-lg p-2">
          <div className="grid grid-cols-8 gap-1">
            {COLOR_PALETTE.map((c) => (
              <button
                type="button"
                key={c.hex}
                title={c.label}
                onClick={() => {
                  onPick(c.hex);
                  onOpenChange(false);
                }}
                className={`w-5 h-5 rounded border ${
                  currentColor === c.hex
                    ? "border-[#5b5fc7] ring-1 ring-[#5b5fc7]"
                    : "border-stroke-1 hover:scale-110"
                } transition-transform`}
                style={{ background: `#${c.hex}` }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              onPick(undefined);
              onOpenChange(false);
            }}
            className="mt-2 w-full text-left px-2 py-1 text-[11px] rounded hover:bg-bg-overlay text-text-secondary inline-flex items-center gap-1"
          >
            <X size={11} />
            Keine Farbe
          </button>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                            Formula bar                                  */
/* ─────────────────────────────────────────────────────────────────────── */

function FormulaBar({
  addr,
  value,
  editing,
  onChange,
  onCommit,
  onCancel,
  onFocus,
}: {
  addr: string;
  value: string;
  editing: boolean;
  onChange: (v: string) => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
  onFocus: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-stroke-1 bg-bg-base flex items-stretch h-7">
      <div className="w-[80px] shrink-0 border-r border-stroke-1 flex items-center justify-center text-[11.5px] font-mono text-text-secondary tabular-nums">
        {addr}
      </div>
      <div className="w-7 shrink-0 border-r border-stroke-1 flex items-center justify-center text-[12px] text-text-tertiary italic">
        fx
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onCommit(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          }
        }}
        readOnly={!editing}
        placeholder="Wert oder =Formel eingeben…"
        className="flex-1 min-w-0 bg-transparent px-3 text-[12px] outline-none placeholder:text-text-quaternary font-mono"
      />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                                Grid                                     */
/* ─────────────────────────────────────────────────────────────────────── */

const ROW_HEIGHT = 22;
const ROW_HEADER_W = 38;
const COL_WIDTH = 96;
const HEADER_HEIGHT = 22;
const MIN_COL_WIDTH = 48;
const MIN_ROW_HEIGHT = 16;
const MAX_COL_WIDTH = 600;
const MAX_ROW_HEIGHT = 400;

/** Pixel width of column `c` after applying any per-sheet override. */
function getColumnWidth(sheet: SheetData, c: number): number {
  return sheet.columnWidths?.[c] ?? COL_WIDTH;
}
/** Pixel height of row `r` after applying any per-sheet override. */
function getRowHeight(sheet: SheetData, r: number): number {
  return sheet.rowHeights?.[r] ?? ROW_HEIGHT;
}
/** Cumulative left offset of column `c` (sum of widths 0..c-1). */
function columnLeft(sheet: SheetData, c: number): number {
  let x = 0;
  for (let i = 0; i < c; i++) x += getColumnWidth(sheet, i);
  return x;
}
/** Cumulative top offset of row `r` (sum of heights 0..r-1). */
function rowTop(sheet: SheetData, r: number): number {
  let y = 0;
  for (let i = 0; i < r; i++) y += getRowHeight(sheet, i);
  return y;
}
/** Total content width of the sheet. */
function totalWidth(sheet: SheetData): number {
  let x = 0;
  for (let i = 0; i < sheet.columnCount; i++) x += getColumnWidth(sheet, i);
  return x;
}
/** Total content height of the sheet. */
function totalHeight(sheet: SheetData): number {
  let y = 0;
  for (let i = 0; i < sheet.rowCount; i++) y += getRowHeight(sheet, i);
  return y;
}

/**
 * Visible-row mask after applying Auto-Filter. We pre-compute this
 * once per sheet change so the renderer can mark rows hidden in O(1).
 * Rows outside the data block (i.e. trailing empty rows) are always
 * visible — Excel does the same to avoid mysteriously missing
 * "scroll to bottom" rows when no filter would match an empty cell.
 */
function computeVisibleRows(sheet: SheetData): boolean[] {
  const visible = new Array<boolean>(sheet.rowCount).fill(true);
  if (!sheet.filterValues || sheet.filterRow == null) return visible;
  const dataStart = sheet.filterRow + 1;
  for (let r = dataStart; r < sheet.rowCount; r++) {
    const row = sheet.rows[r];
    if (!row) continue;
    let keep = true;
    for (const [colStr, allowed] of Object.entries(sheet.filterValues)) {
      if (allowed.length === 0) continue;
      const c = Number(colStr);
      const v = row[c] ?? "";
      if (!allowed.includes(v)) {
        keep = false;
        break;
      }
    }
    visible[r] = keep;
  }
  return visible;
}

function Grid({
  sheet,
  sheetIdx,
  selection,
  selectionRect,
  editingValue,
  lookup,
  focusRef,
  onSelect,
  onBeginRangeDrag,
  onExtendRangeDrag,
  onSelectColumn,
  onSelectRow,
  onStartEdit,
  onCommit,
  onMove,
  onExtend,
  onClearRange,
  onExpand,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  onOpenFind,
  onSetColumnWidth,
  onSetRowHeight,
  onSetColumnFilter,
  onImportDelimited,
}: {
  sheet: SheetData;
  sheetIdx: number;
  selection: Selection;
  selectionRect: RangeRect;
  editingValue: string | null;
  lookup: (r: number, c: number, sheet?: string) => string;
  focusRef: React.MutableRefObject<() => void>;
  onSelect: (addr: CellAddr) => void;
  onBeginRangeDrag: (addr: CellAddr) => void;
  onExtendRangeDrag: (addr: CellAddr) => void;
  onSelectColumn: (c: number) => void;
  onSelectRow: (r: number) => void;
  onStartEdit: (addr: CellAddr, initial?: string) => void;
  onCommit: (value: string) => void;
  onMove: (dr: number, dc: number) => void;
  onExtend: (dr: number, dc: number) => void;
  onClearRange: () => void;
  onExpand: (rows: number, cols: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;
  onOpenFind: () => void;
  onSetColumnWidth: (col: number, width: number | undefined) => void;
  onSetRowHeight: (row: number, height: number | undefined) => void;
  onSetColumnFilter: (col: number, allowed: string[] | null) => void;
  onImportDelimited: (filename: string, text: string, delimiter: "\t" | ",") => void;
}) {
  // sheetIdx isn't used directly here yet — but parents pass it so a
  // future per-sheet feature (e.g. column-width undo grouping) doesn't
  // need to reshuffle the prop list. Mark it as intentionally unused.
  void sheetIdx;
  const selected = selection.focus;
  const scrollRef = useRef<HTMLDivElement>(null);
  const editing = editingValue != null;
  // Track active drag-select. We use a ref instead of state to avoid
  // re-rendering on every pointer move; cell-level pointerEnter calls
  // onExtendRangeDrag which is the only state hop the user actually
  // sees.
  const dragActiveRef = useRef(false);
  /** Nach Drag-Select kommt ein zusätzliches click — würde sonst die Range wieder auf 1 Zelle zurücksetzen. */
  const suppressNextCellClickRef = useRef(false);

  const dragPointerListenersRmRef = useRef<(() => void) | null>(null);
  const lastPointerDragCellRef = useRef<string | null>(null);

  /**
   * Extend selection only while a drag gesture is active (mousedown path); keeps
   * pointerenter from extending when the user is Shift-selecting.
   */
  const guardExtendRangeDrag = useCallback(
    (addr: CellAddr) => {
      if (!dragActiveRef.current) return;
      onExtendRangeDrag(addr);
      suppressNextCellClickRef.current = true;
    },
    [onExtendRangeDrag],
  );

  /** Stops grid drag listeners attached after pointer-down (covers fast drags). */
  const clearPointerDragListeners = useCallback(() => {
    const rm = dragPointerListenersRmRef.current;
    dragPointerListenersRmRef.current = null;
    lastPointerDragCellRef.current = null;
    if (rm) rm();
  }, []);

  /**
   * `pointerenter` on each cell misses quick drags. Excel-style selection
   * tracks pointer position on window and resolves the grid cell underneath.
   */
  const attachPointerDragListeners = useCallback(() => {
    clearPointerDragListeners();
    const onMove = (ev: PointerEvent) => {
      if (!dragActiveRef.current) return;
      if ((ev.buttons & 1) === 0) return;
      const stack = document.elementsFromPoint(ev.clientX, ev.clientY);
      let host: HTMLElement | undefined;
      for (const el of stack) {
        if (el instanceof HTMLElement && el.hasAttribute("data-excel-cell")) {
          host = el;
          break;
        }
      }
      if (!host) return;
      const rr = host.dataset.cr;
      const cc = host.dataset.cc;
      if (rr == null || cc == null) return;
      const r = Number(rr);
      const c = Number(cc);
      if (!Number.isInteger(r) || !Number.isInteger(c)) return;
      const key = `${r}:${c}`;
      if (lastPointerDragCellRef.current === key) return;
      lastPointerDragCellRef.current = key;
      guardExtendRangeDrag({ r, c });
    };
    const onEnd = () => {
      clearPointerDragListeners();
      dragActiveRef.current = false;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onEnd);
    window.addEventListener("pointercancel", onEnd);
    dragPointerListenersRmRef.current = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onEnd);
      window.removeEventListener("pointercancel", onEnd);
    };
  }, [clearPointerDragListeners, guardExtendRangeDrag]);

  // Shift+extend separately (no window drag tracker).
  const shiftExtendRangeDrag = useCallback(
    (addr: CellAddr) => {
      onExtendRangeDrag(addr);
      suppressNextCellClickRef.current = true;
    },
    [onExtendRangeDrag],
  );

  // Open Auto-Filter dropdown for a given column, or null.
  const [filterOpenCol, setFilterOpenCol] = useState<number | null>(null);

  const visibleRows = useMemo(() => computeVisibleRows(sheet), [sheet]);

  // Pre-compile conditional-format rules once per render. Cheap (sparse
  // rule list) but expensive enough that we don't want to redo it for
  // every cell.
  const compiledRules = useMemo(() => compileRules(sheet), [sheet]);

  // Expose a "focus the grid" function up to the parent so toolbar
  // actions can keep keyboard input flowing back into the spreadsheet.
  useEffect(() => {
    focusRef.current = () => {
      const el = scrollRef.current;
      if (el) el.focus();
    };
  }, [focusRef]);

  const focusGrid = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.focus();
  }, []);

  // Keyboard handler bound to the scroll container. This is why we now
  // explicitly focus() it after every cell click — otherwise the keys
  // never reach this handler and the user reports "Tab doesn't work".
  const onGridKey = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (editing) return;
      const k = e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      // Cmd/Ctrl shortcuts that don't depend on which cell is active.
      if (ctrl && !e.altKey) {
        const lc = k.toLowerCase();
        if (lc === "z") {
          e.preventDefault();
          if (e.shiftKey) onRedo();
          else onUndo();
          return;
        }
        if (lc === "y") {
          e.preventDefault();
          onRedo();
          return;
        }
        if (lc === "c") {
          e.preventDefault();
          onCopy();
          return;
        }
        if (lc === "x") {
          e.preventDefault();
          onCut();
          return;
        }
        if (lc === "v") {
          e.preventDefault();
          onPaste();
          return;
        }
        if (lc === "f" || lc === "h") {
          e.preventDefault();
          onOpenFind();
          return;
        }
        if (lc === "a") {
          e.preventDefault();
          onBeginRangeDrag({ r: 0, c: 0 });
          onExtendRangeDrag({
            r: sheet.rowCount - 1,
            c: sheet.columnCount - 1,
          });
          return;
        }
      }
      if (k.startsWith("Arrow")) {
        const [dr, dc] =
          k === "ArrowUp"
            ? [-1, 0]
            : k === "ArrowDown"
              ? [1, 0]
              : k === "ArrowLeft"
                ? [0, -1]
                : [0, 1];
        e.preventDefault();
        if (e.shiftKey) onExtend(dr, dc);
        else onMove(dr, dc);
        return;
      }
      if (k === "Enter") {
        e.preventDefault();
        onMove(e.shiftKey ? -1 : 1, 0);
      } else if (k === "Tab") {
        e.preventDefault();
        onMove(0, e.shiftKey ? -1 : 1);
      } else if (k === "F2") {
        e.preventDefault();
        onStartEdit(selected);
      } else if (k === "Backspace" || k === "Delete") {
        e.preventDefault();
        // Delete operates on the current range, not just the focus cell —
        // matches Excel/Numbers/Calc behaviour the moment a range is
        // active. If the selection is collapsed the rectangle is 1x1
        // anyway, so this stays equivalent for single-cell users.
        onClearRange();
      } else if (k.length === 1 && !ctrl && !e.altKey) {
        e.preventDefault();
        onStartEdit(selected, k);
      }
    },
    [
      editing,
      onClearRange,
      onMove,
      onExtend,
      onStartEdit,
      selected,
      onBeginRangeDrag,
      onExtendRangeDrag,
      onUndo,
      onRedo,
      onCopy,
      onCut,
      onPaste,
      onOpenFind,
      sheet.rowCount,
      sheet.columnCount,
    ],
  );

  // End drag-select reliably even if the user releases outside the grid.
  useEffect(() => {
    const onUp = () => {
      dragActiveRef.current = false;
      clearPointerDragListeners();
    };
    window.addEventListener("pointerup", onUp);
    return () => window.removeEventListener("pointerup", onUp);
  }, [clearPointerDragListeners]);

  useEffect(
    () => () => {
      clearPointerDragListeners();
    },
    [clearPointerDragListeners],
  );

  // ── Column / row resizing ─────────────────────────────────────────
  const colResizeRef = useRef<{
    col: number;
    startX: number;
    startW: number;
  } | null>(null);
  // Optimistically render the new width during the drag so the operator
  // sees feedback before mutate() flushes. We commit the final width on
  // pointerup. The transient preview lives on the body element via a
  // CSS variable to avoid React re-renders mid-drag.
  const [colPreview, setColPreview] = useState<{ col: number; w: number } | null>(null);

  const startColResize = useCallback(
    (col: number, ev: React.PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      colResizeRef.current = {
        col,
        startX: ev.clientX,
        startW: getColumnWidth(sheet, col),
      };
      const onMove = (e: PointerEvent) => {
        const drag = colResizeRef.current;
        if (!drag) return;
        const next = clamp(
          drag.startW + (e.clientX - drag.startX),
          MIN_COL_WIDTH,
          MAX_COL_WIDTH,
        );
        setColPreview({ col: drag.col, w: next });
      };
      const onUp = () => {
        const drag = colResizeRef.current;
        if (drag) {
          const dx =
            (window.event as PointerEvent | undefined)?.clientX ?? drag.startX;
          const finalW = clamp(
            drag.startW + (dx - drag.startX),
            MIN_COL_WIDTH,
            MAX_COL_WIDTH,
          );
          // Use the preview width as the source of truth — `window.event`
          // doesn't always survive in modern browsers, so the preview
          // captured during the move is more reliable.
          const previewW = colPreview?.w ?? finalW;
          onSetColumnWidth(drag.col, previewW);
        }
        colResizeRef.current = null;
        setColPreview(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [colPreview?.w, onSetColumnWidth, sheet],
  );

  const rowResizeRef = useRef<{
    row: number;
    startY: number;
    startH: number;
  } | null>(null);
  const [rowPreview, setRowPreview] = useState<{ row: number; h: number } | null>(null);
  const startRowResize = useCallback(
    (row: number, ev: React.PointerEvent) => {
      ev.preventDefault();
      ev.stopPropagation();
      rowResizeRef.current = {
        row,
        startY: ev.clientY,
        startH: getRowHeight(sheet, row),
      };
      const onMove = (e: PointerEvent) => {
        const drag = rowResizeRef.current;
        if (!drag) return;
        const next = clamp(
          drag.startH + (e.clientY - drag.startY),
          MIN_ROW_HEIGHT,
          MAX_ROW_HEIGHT,
        );
        setRowPreview({ row: drag.row, h: next });
      };
      const onUp = () => {
        const drag = rowResizeRef.current;
        if (drag) {
          const previewH = rowPreview?.h ?? drag.startH;
          onSetRowHeight(drag.row, previewH);
        }
        rowResizeRef.current = null;
        setRowPreview(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [onSetRowHeight, rowPreview?.h, sheet],
  );

  // ── CSV/TSV drag-and-drop ─────────────────────────────────────────
  const [dropOver, setDropOver] = useState(false);
  const onDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes("Files")) {
      e.preventDefault();
      setDropOver(true);
    }
  }, []);
  const onDragLeave = useCallback(() => setDropOver(false), []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDropOver(false);
      const file = e.dataTransfer.files[0];
      if (!file) return;
      const lower = file.name.toLowerCase();
      const delim: "\t" | "," = lower.endsWith(".tsv") ? "\t" : ",";
      file.text().then((text) => onImportDelimited(file.name, text, delim));
    },
    [onImportDelimited],
  );

  // Auto-scroll the active cell into view when navigating with the keyboard.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const left = columnLeft(sheet, selected.c);
    const right = left + getColumnWidth(sheet, selected.c);
    const top = rowTop(sheet, selected.r);
    const bottom = top + getRowHeight(sheet, selected.r);
    const viewLeft = el.scrollLeft;
    const viewRight = viewLeft + el.clientWidth - ROW_HEADER_W;
    const viewTop = el.scrollTop;
    const viewBottom = viewTop + el.clientHeight - HEADER_HEIGHT;
    if (left < viewLeft) el.scrollLeft = left;
    else if (right > viewRight) el.scrollLeft = right - (el.clientWidth - ROW_HEADER_W);
    if (top < viewTop) el.scrollTop = top;
    else if (bottom > viewBottom)
      el.scrollTop = bottom - (el.clientHeight - HEADER_HEIGHT);
  }, [selected.r, selected.c, sheet]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const totalH = totalHeight(sheet);
    const totalW = totalWidth(sheet);
    if (el.scrollTop + el.clientHeight + 200 > totalH) {
      onExpand(25, 0);
    }
    if (el.scrollLeft + el.clientWidth + 200 > totalW) {
      onExpand(0, 5);
    }
  }, [sheet, onExpand]);

  // Pre-compute the freeze divider offsets so the renderer can cheaply
  // mark frozen cells with `position: sticky` + the matching `left/top`.
  const frozenRows = sheet.frozenRows ?? 0;
  const frozenColumns = sheet.frozenColumns ?? 0;
  const frozenColsLeft = useMemo(() => {
    const offsets: number[] = [];
    let acc = ROW_HEADER_W;
    for (let i = 0; i < frozenColumns; i++) {
      offsets.push(acc);
      acc += getColumnWidth(sheet, i);
    }
    return offsets;
  }, [frozenColumns, sheet]);
  const frozenRowsTop = useMemo(() => {
    const offsets: number[] = [];
    let acc = HEADER_HEIGHT;
    for (let i = 0; i < frozenRows; i++) {
      offsets.push(acc);
      acc += getRowHeight(sheet, i);
    }
    return offsets;
  }, [frozenRows, sheet]);

  return (
    <div
      ref={scrollRef}
      className={`flex-1 min-h-0 min-w-0 overflow-auto bg-bg-base outline-none focus:outline-none relative ${
        dropOver ? "ring-2 ring-[#5b5fc7] ring-inset" : ""
      }`}
      tabIndex={0}
      onKeyDown={onGridKey}
      onScroll={onScroll}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dropOver && (
        <div className="pointer-events-none sticky top-0 left-0 z-50 px-3 py-1 m-2 inline-block rounded bg-[#5b5fc7] text-white text-[11px] shadow-lg">
          CSV/TSV-Datei hier loslassen, um eine neue Tabelle zu importieren
        </div>
      )}
      <div
        style={{
          width: ROW_HEADER_W + totalWidth(sheet),
          minWidth: "100%",
          position: "relative",
        }}
      >
        {/* Column header row */}
        <div
          className="sticky top-0 z-20 bg-bg-chrome border-b border-stroke-1 flex"
          style={{ height: HEADER_HEIGHT }}
        >
          <div
            className="sticky left-0 z-30 bg-bg-chrome border-r border-stroke-1 shrink-0"
            style={{ width: ROW_HEADER_W }}
          />
          {Array.from({ length: sheet.columnCount }).map((_, c) => {
            const inRange = c >= selectionRect.c0 && c <= selectionRect.c1;
            const previewActive = colPreview?.col === c;
            const width = previewActive ? colPreview!.w : getColumnWidth(sheet, c);
            const isFrozenCol = c < frozenColumns;
            const stickyStyle: CSSProperties = isFrozenCol
              ? {
                  position: "sticky",
                  left: frozenColsLeft[c]!,
                  zIndex: 25,
                }
              : {};
            const filterActive =
              sheet.filterValues?.[c] != null &&
              (sheet.filterValues[c]?.length ?? 0) > 0;
            return (
              <div
                key={c}
                className={`shrink-0 border-r border-stroke-1 relative flex items-stretch ${
                  inRange
                    ? "bg-[#1c2c3c] text-text-primary"
                    : "bg-bg-chrome text-text-secondary"
                }`}
                style={{ width, height: HEADER_HEIGHT, ...stickyStyle }}
              >
                <button
                  type="button"
                  onClick={() => onSelectColumn(c)}
                  className="flex-1 min-w-0 flex items-center justify-center text-[10.5px] font-medium hover:bg-bg-overlay/40 truncate"
                  title={`Spalte ${colLetter(c)} auswählen`}
                >
                  {colLetter(c)}
                </button>
                {sheet.filterRow != null && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFilterOpenCol(filterOpenCol === c ? null : c);
                    }}
                    className={`px-0.5 inline-flex items-center justify-center hover:bg-bg-overlay text-[10px] ${
                      filterActive ? "text-[#5b5fc7]" : "text-text-tertiary"
                    }`}
                    title={
                      filterActive
                        ? "Aktiver Filter — klick zum Ändern"
                        : "Filter setzen"
                    }
                  >
                    <ChevronDown size={10} />
                  </button>
                )}
                {filterOpenCol === c && sheet.filterRow != null && (
                  <FilterPopover
                    sheet={sheet}
                    col={c}
                    onClose={() => setFilterOpenCol(null)}
                    onApply={(allowed) => {
                      onSetColumnFilter(c, allowed);
                      setFilterOpenCol(null);
                    }}
                  />
                )}
                <div
                  className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-[#5b5fc7]/40 z-10"
                  onPointerDown={(e) => startColResize(c, e)}
                  title="Breite anpassen"
                />
              </div>
            );
          })}
        </div>

        {/* Body rows */}
        {Array.from({ length: sheet.rowCount }).map((_, r) => {
          if (!visibleRows[r]) return null;
          const previewActive = rowPreview?.row === r;
          const heightOverride = previewActive ? rowPreview!.h : undefined;
          const isFrozen = r < frozenRows;
          return (
            <Row
              key={r}
              r={r}
              sheet={sheet}
              compiledRules={compiledRules}
              heightOverride={heightOverride}
              isFrozen={isFrozen}
              frozenTop={isFrozen ? frozenRowsTop[r] : undefined}
              frozenColumns={frozenColumns}
              frozenColsLeft={frozenColsLeft}
              colPreview={colPreview}
              focus={selected}
              selectionRect={selectionRect}
              editingValue={selected.r === r ? editingValue : null}
              lookup={lookup}
              onSelect={(addr) => {
                focusGrid();
                onSelect(addr);
              }}
              onSelectRow={onSelectRow}
              onBeginRangeDrag={(addr) => {
                suppressNextCellClickRef.current = false;
                dragActiveRef.current = true;
                focusGrid();
                onBeginRangeDrag(addr);
                attachPointerDragListeners();
                lastPointerDragCellRef.current = `${addr.r}:${addr.c}`;
              }}
              onExtendRangeDrag={guardExtendRangeDrag}
              suppressNextCellClickRef={suppressNextCellClickRef}
              onShiftExtendRangeDrag={shiftExtendRangeDrag}
              onStartEdit={onStartEdit}
              onCommit={onCommit}
              onStartRowResize={startRowResize}
            />
          );
        })}
      </div>
    </div>
  );
}

const Row = memo(function Row({
  r,
  sheet,
  compiledRules,
  heightOverride,
  isFrozen,
  frozenTop,
  frozenColumns,
  frozenColsLeft,
  colPreview,
  focus,
  selectionRect,
  editingValue,
  lookup,
  onSelect,
  onSelectRow,
  onBeginRangeDrag,
  onExtendRangeDrag,
  suppressNextCellClickRef,
  onShiftExtendRangeDrag,
  onStartEdit,
  onCommit,
  onStartRowResize,
}: {
  r: number;
  sheet: SheetData;
  compiledRules: ReturnType<typeof compileRules>;
  heightOverride: number | undefined;
  isFrozen: boolean;
  frozenTop: number | undefined;
  frozenColumns: number;
  frozenColsLeft: number[];
  colPreview: { col: number; w: number } | null;
  focus: CellAddr;
  selectionRect: RangeRect;
  editingValue: string | null;
  lookup: (r: number, c: number, sheet?: string) => string;
  onSelect: (addr: CellAddr) => void;
  onSelectRow: (r: number) => void;
  onBeginRangeDrag: (addr: CellAddr) => void;
  onExtendRangeDrag: (addr: CellAddr) => void;
  suppressNextCellClickRef: React.MutableRefObject<boolean>;
  onShiftExtendRangeDrag: (addr: CellAddr) => void;
  onStartEdit: (addr: CellAddr, initial?: string) => void;
  onCommit: (value: string) => void;
  onStartRowResize: (row: number, ev: React.PointerEvent) => void;
}) {
  const rowInRange = r >= selectionRect.r0 && r <= selectionRect.r1;
  const height = heightOverride ?? getRowHeight(sheet, r);
  const rowStyle: CSSProperties = isFrozen
    ? {
        height,
        position: "sticky",
        top: frozenTop,
        zIndex: 15,
      }
    : { height };
  return (
    <div className="flex" style={rowStyle}>
      <div
        className={`sticky left-0 z-10 border-r border-b border-stroke-1 relative flex items-stretch shrink-0 ${
          rowInRange
            ? "bg-[#1c2c3c] text-text-primary"
            : "bg-bg-chrome text-text-secondary"
        }`}
        style={{ width: ROW_HEADER_W, height }}
      >
        <button
          type="button"
          onClick={() => onSelectRow(r)}
          className="flex-1 flex items-center justify-center text-[10.5px] font-medium tabular-nums hover:bg-bg-overlay/40"
          title={`Zeile ${r + 1} auswählen`}
        >
          {r + 1}
        </button>
        <div
          className="absolute bottom-0 left-0 w-full h-1.5 cursor-row-resize hover:bg-[#5b5fc7]/40 z-10"
          onPointerDown={(e) => onStartRowResize(r, e)}
          title="Höhe anpassen"
        />
      </div>
      {Array.from({ length: sheet.columnCount }).map((_, c) => {
        const raw = sheet.rows[r]?.[c] ?? "";
        const isFocus = c === focus.c && r === focus.r;
        const inRange = isInRange(selectionRect, r, c);
        const isEditing = isFocus && editingValue != null;
        const baseFmt = sheet.formats?.[`${r},${c}`] ?? EMPTY_FORMAT;
        const fmt = effectiveCellFormat(
          baseFmt,
          raw,
          r,
          c,
          compiledRules,
          sheet.rowCount,
          sheet.columnCount,
        );
        const previewActive = colPreview?.col === c;
        const width = previewActive ? colPreview!.w : getColumnWidth(sheet, c);
        const isFrozenCol = c < frozenColumns;
        return (
          <Cell
            key={c}
            r={r}
            c={c}
            raw={raw}
            format={fmt}
            width={width}
            height={height}
            focus={isFocus}
            inRange={inRange}
            editing={isEditing}
            editingValue={isEditing ? editingValue : null}
            isFrozenCol={isFrozenCol}
            frozenColLeft={isFrozenCol ? frozenColsLeft[c] : undefined}
            lookup={lookup}
            onSelect={onSelect}
            onBeginRangeDrag={onBeginRangeDrag}
            onExtendRangeDrag={onExtendRangeDrag}
            suppressNextCellClickRef={suppressNextCellClickRef}
            onShiftExtendRangeDrag={onShiftExtendRangeDrag}
            onStartEdit={onStartEdit}
            onCommit={onCommit}
          />
        );
      })}
    </div>
  );
});

const EMPTY_FORMAT: CellFormat = {};

const Cell = memo(function Cell({
  r,
  c,
  raw,
  format,
  width,
  height,
  focus,
  inRange,
  editing,
  editingValue,
  isFrozenCol,
  frozenColLeft,
  lookup,
  onSelect,
  onBeginRangeDrag,
  onExtendRangeDrag,
  suppressNextCellClickRef,
  onShiftExtendRangeDrag,
  onStartEdit,
  onCommit,
}: {
  r: number;
  c: number;
  raw: string;
  format: CellFormat;
  width: number;
  height: number;
  focus: boolean;
  inRange: boolean;
  editing: boolean;
  editingValue: string | null;
  isFrozenCol: boolean;
  frozenColLeft: number | undefined;
  lookup: (r: number, c: number, sheet?: string) => string;
  onSelect: (addr: CellAddr) => void;
  onBeginRangeDrag: (addr: CellAddr) => void;
  onExtendRangeDrag: (addr: CellAddr) => void;
  suppressNextCellClickRef: React.MutableRefObject<boolean>;
  onShiftExtendRangeDrag: (addr: CellAddr) => void;
  onStartEdit: (addr: CellAddr, initial?: string) => void;
  onCommit: (value: string) => void;
}) {
  // pointerdown + pointerenter implement drag-select. We still wire
  // onClick separately so that quick taps on touch devices register as
  // selects even if no pointermove fires.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.pointerType === "mouse" && e.button !== 0) return;
      if (e.shiftKey) {
        onShiftExtendRangeDrag({ r, c });
      } else {
        onBeginRangeDrag({ r, c });
      }
    },
    [onBeginRangeDrag, onShiftExtendRangeDrag, r, c],
  );
  const handlePointerEnter = useCallback(
    () => onExtendRangeDrag({ r, c }),
    [onExtendRangeDrag, r, c],
  );
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.shiftKey) return;
      if (suppressNextCellClickRef.current) {
        suppressNextCellClickRef.current = false;
        return;
      }
      onSelect({ r, c });
    },
    [onSelect, suppressNextCellClickRef, r, c],
  );
  const handleDouble = useCallback(
    () => onStartEdit({ r, c }),
    [onStartEdit, r, c],
  );

  const baseStyle: CSSProperties = {
    width,
    height,
  };
  const stickyStyle: CSSProperties = isFrozenCol
    ? {
        position: "sticky",
        left: frozenColLeft,
        zIndex: 12,
      }
    : {};

  if (editing) {
    return (
      <div
        className="shrink-0 border-r border-b border-stroke-1 relative bg-bg-base"
        style={{ ...baseStyle, ...stickyStyle }}
      >
        <CellInput
          initial={editingValue ?? ""}
          onCommit={(v) => onCommit(v)}
          onCancel={() => onSelect({ r, c })}
        />
      </div>
    );
  }

  const rendered = renderCell(raw, lookup);
  const display = formatDisplay(raw, rendered.display, format);
  const isFormulaCell = rendered.isFormula;
  const numeric =
    !rendered.isError &&
    (rendered.isFormula || isNumericLike(raw) || format.numberFormat != null);

  // Alignment override: explicit format wins, otherwise numeric → right.
  const align = format.align ?? (numeric ? "right" : "left");
  const justify =
    align === "center"
      ? "justify-center"
      : align === "right"
        ? "justify-end"
        : "justify-start";

  const fontStyles: CSSProperties = {
    fontWeight: format.bold ? 600 : undefined,
    fontStyle: format.italic ? "italic" : undefined,
    textDecoration: format.underline ? "underline" : undefined,
    fontFamily: numeric ? "ui-monospace, SFMono-Regular, monospace" : undefined,
    color: format.textColor ? `#${format.textColor}` : undefined,
    background: format.bgColor ? `#${format.bgColor}` : undefined,
  };

  // Visual layering, top to bottom:
  //   • focus cell:   strong purple outline + overlay bg
  //   • in-range:     subtle purple tint (lighter than overlay)
  //   • idle hover:   default soft hover
  // We deliberately don't override an explicit user-set bgColor with
  // the range tint — instead the outline carries the selection signal.
  const hasUserBg = !!format.bgColor;
  const rangeClass = focus
    ? hasUserBg
      ? "outline outline-2 outline-[#5b5fc7] -outline-offset-2"
      : "outline outline-2 outline-[#5b5fc7] -outline-offset-2 bg-bg-overlay"
    : inRange
      ? hasUserBg
        ? ""
        : "bg-[#5b5fc7]/15"
      : !hasUserBg
        ? "hover:bg-bg-overlay/40"
        : "";

  return (
    <div
      role="gridcell"
      tabIndex={-1}
      data-excel-cell
      data-cr={String(r)}
      data-cc={String(c)}
      onPointerDown={handlePointerDown}
      onPointerEnter={handlePointerEnter}
      onClick={handleClick}
      onDoubleClick={handleDouble}
      className={`shrink-0 border-r border-b border-stroke-1 px-1.5 flex items-center text-[12px] truncate cursor-cell ${justify} ${rangeClass} ${
        rendered.isError ? "text-red-400" : ""
      } ${isFormulaCell && !rendered.isError ? "" : ""}`}
      style={{ ...baseStyle, ...stickyStyle, ...fontStyles }}
      title={raw || undefined}
    >
      {display}
    </div>
  );
});

function CellInput({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [acIndex, setAcIndex] = useState(0);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setValue(initial);
  }, [initial]);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const len = el.value.length;
    el.setSelectionRange(len, len);
  }, []);

  // Autocomplete: while typing a function name (e.g. `=VLO|`), surface a
  // dropdown of matching FUNCTION_NAMES. We anchor on the *last* token
  // ending at the caret so chaining like `=SUM(VLO` still triggers.
  const acMatches = useMemo(() => {
    if (!value.startsWith("=")) return [] as string[];
    const m = /([A-Za-z]+)$/.exec(value);
    if (!m) return [];
    const prefix = m[1]!.toUpperCase();
    if (prefix.length === 0) return [];
    return FUNCTION_NAMES.filter((n) => n.startsWith(prefix)).slice(0, 8);
  }, [value]);

  // Reset highlighted suggestion whenever the candidate set changes.
  useEffect(() => {
    setAcIndex(0);
  }, [acMatches]);

  const applyCompletion = useCallback(
    (name: string) => {
      const m = /([A-Za-z]+)$/.exec(value);
      if (!m) return;
      const head = value.slice(0, value.length - m[1]!.length);
      const next = `${head}${name}(`;
      setValue(next);
      // Caret at the end after applying — set on the next tick so the
      // input has the new value committed.
      requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(next.length, next.length);
      });
    },
    [value],
  );

  return (
    <>
      <input
        ref={ref}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={() => onCommit(value)}
        onKeyDown={(e) => {
          if (acMatches.length > 0 && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
            e.preventDefault();
            setAcIndex((i) =>
              e.key === "ArrowDown"
                ? (i + 1) % acMatches.length
                : (i - 1 + acMatches.length) % acMatches.length,
            );
            return;
          }
          if (e.key === "Enter") {
            e.preventDefault();
            if (acMatches.length > 0) {
              applyCompletion(acMatches[acIndex] ?? acMatches[0]!);
              return;
            }
            onCommit(value);
          } else if (e.key === "Escape") {
            e.preventDefault();
            onCancel();
          } else if (e.key === "Tab") {
            e.preventDefault();
            if (acMatches.length > 0) {
              applyCompletion(acMatches[acIndex] ?? acMatches[0]!);
              return;
            }
            // We commit and let the grid container's keydown handler advance
            // the cursor.
            onCommit(value);
          }
        }}
        className={`absolute inset-0 w-full h-full px-1.5 bg-bg-base border-2 border-[#5b5fc7] outline-none text-[12px] ${
          value.startsWith("=") ? "font-mono" : ""
        }`}
      />
      {acMatches.length > 0 && (
        <div className="absolute top-full left-0 mt-0.5 z-40 min-w-[160px] rounded-md border border-stroke-1 bg-bg-elevated shadow-lg py-1">
          {acMatches.map((name, i) => (
            <button
              type="button"
              key={name}
              onMouseDown={(e) => {
                e.preventDefault(); // don't blur the input
                applyCompletion(name);
              }}
              className={`w-full text-left px-3 py-1 text-[11px] font-mono ${
                i === acIndex
                  ? "bg-[#5b5fc7]/30 text-text-primary"
                  : "text-text-secondary hover:bg-bg-overlay"
              }`}
            >
              {name}()
            </button>
          ))}
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                          Auto-Filter popover                            */
/* ─────────────────────────────────────────────────────────────────────── */

/**
 * Per-column Auto-Filter popover. Lists every distinct value that
 * appears in the data rows of `col`, with checkboxes. Active filters
 * render as selected; toggling a checkbox builds the `allowed` whitelist
 * the parent feeds back into `setColumnFilter`. "Alle" / "Keine" are
 * convenience shortcuts. We close on Escape and on outside-click, same
 * as the format dropdowns.
 */
function FilterPopover({
  sheet,
  col,
  onClose,
  onApply,
}: {
  sheet: SheetData;
  col: number;
  onClose: () => void;
  onApply: (allowed: string[] | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const allValues = useMemo(() => {
    const start = (sheet.filterRow ?? 0) + 1;
    const set = new Set<string>();
    for (let r = start; r < sheet.rowCount; r++) {
      const v = sheet.rows[r]?.[col] ?? "";
      set.add(v);
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    );
  }, [sheet, col]);

  const initial = sheet.filterValues?.[col];
  // Selected items: if no filter is active, default to all values.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(initial && initial.length > 0 ? initial : allValues),
  );

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const filtered = useMemo(
    () =>
      search
        ? allValues.filter((v) => v.toLowerCase().includes(search.toLowerCase()))
        : allValues,
    [allValues, search],
  );

  const toggle = (v: string) => {
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };

  return (
    <div
      ref={ref}
      className="absolute top-full right-0 mt-1 z-40 w-[220px] rounded-md border border-stroke-1 bg-bg-elevated shadow-lg p-2"
    >
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Werte filtern…"
        className="w-full px-2 py-1 text-[11px] bg-bg-base border border-stroke-1 rounded outline-none mb-2"
      />
      <div className="flex gap-1 mb-1 text-[10px]">
        <button
          type="button"
          onClick={() => setSelected(new Set(allValues))}
          className="px-2 py-0.5 rounded bg-bg-base hover:bg-bg-overlay text-text-secondary"
        >
          Alle
        </button>
        <button
          type="button"
          onClick={() => setSelected(new Set())}
          className="px-2 py-0.5 rounded bg-bg-base hover:bg-bg-overlay text-text-secondary"
        >
          Keine
        </button>
      </div>
      <div className="max-h-[180px] overflow-y-auto border border-stroke-1 rounded mb-2">
        {filtered.length === 0 ? (
          <div className="px-2 py-1 text-[10.5px] text-text-tertiary">
            Keine Werte
          </div>
        ) : (
          filtered.map((v) => (
            <label
              key={v}
              className="flex items-center gap-2 px-2 py-1 text-[11px] hover:bg-bg-overlay cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(v)}
                onChange={() => toggle(v)}
                className="accent-[#5b5fc7]"
              />
              <span className="truncate text-text-secondary">{v || "(leer)"}</span>
            </label>
          ))
        )}
      </div>
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => {
            // If everything is selected → clear the filter; otherwise
            // emit the explicit allowlist.
            if (selected.size === allValues.length) onApply(null);
            else onApply(Array.from(selected));
          }}
          className="flex-1 px-2 py-1 rounded bg-[#5b5fc7] text-white text-[11px] hover:opacity-90"
        >
          Anwenden
        </button>
        <button
          type="button"
          onClick={() => {
            onApply(null);
            onClose();
          }}
          className="flex-1 px-2 py-1 rounded bg-bg-base text-text-secondary text-[11px] hover:bg-bg-overlay"
        >
          Zurücksetzen
        </button>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                           Find & Replace bar                            */
/* ─────────────────────────────────────────────────────────────────────── */

function FindReplaceBar({
  query,
  replace,
  caseSensitive,
  status,
  onQueryChange,
  onReplaceChange,
  onCaseSensitiveChange,
  onNext,
  onPrev,
  onReplace,
  onReplaceAll,
  onClose,
}: {
  query: string;
  replace: string;
  caseSensitive: boolean;
  status: string;
  onQueryChange: (q: string) => void;
  onReplaceChange: (q: string) => void;
  onCaseSensitiveChange: (v: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);
  return (
    <div className="shrink-0 border-b border-stroke-1 bg-bg-chrome flex items-center gap-2 px-3 py-1.5">
      <Search size={13} className="text-text-tertiary" />
      <input
        ref={inputRef}
        type="text"
        value={query}
        placeholder="Suchen…"
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) onPrev();
            else onNext();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="px-2 py-1 text-[11.5px] bg-bg-base border border-stroke-1 rounded outline-none w-[180px]"
      />
      <input
        type="text"
        value={replace}
        placeholder="Ersetzen durch…"
        onChange={(e) => onReplaceChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            onReplace();
          } else if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        }}
        className="px-2 py-1 text-[11.5px] bg-bg-base border border-stroke-1 rounded outline-none w-[180px]"
      />
      <label className="flex items-center gap-1 text-[10.5px] text-text-tertiary cursor-pointer">
        <input
          type="checkbox"
          checked={caseSensitive}
          onChange={(e) => onCaseSensitiveChange(e.target.checked)}
          className="accent-[#5b5fc7]"
        />
        Aa
      </label>
      <div className="flex items-center gap-0.5 ml-1">
        <button
          type="button"
          onClick={onPrev}
          title="Vorheriger Treffer (Shift+Enter)"
          className="px-1.5 py-1 rounded text-text-secondary hover:bg-bg-overlay text-[10.5px]"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={onNext}
          title="Nächster Treffer (Enter)"
          className="px-1.5 py-1 rounded text-text-secondary hover:bg-bg-overlay text-[10.5px]"
        >
          ↓
        </button>
      </div>
      <button
        type="button"
        onClick={onReplace}
        className="px-2 py-1 rounded text-[11px] bg-bg-base hover:bg-bg-overlay text-text-secondary"
      >
        Ersetzen
      </button>
      <button
        type="button"
        onClick={onReplaceAll}
        className="px-2 py-1 rounded text-[11px] bg-[#5b5fc7] text-white hover:opacity-90"
      >
        Alle ersetzen
      </button>
      {status && (
        <span className="text-[10.5px] text-text-tertiary">{status}</span>
      )}
      <button
        type="button"
        onClick={onClose}
        title="Schließen (Esc)"
        className="ml-auto p-1 rounded text-text-tertiary hover:bg-bg-overlay"
      >
        <X size={13} />
      </button>
    </div>
  );
}

function isNumericLike(value: string): boolean {
  if (!value) return false;
  return /^-?\d+([.,]\d+)?$/.test(value.trim());
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                              Sheet tabs                                 */
/* ─────────────────────────────────────────────────────────────────────── */

function SheetTabs({
  sheets,
  activeIdx,
  onSelect,
  onAdd,
  onRename,
  onDelete,
  onDuplicate,
  onMove,
}: {
  sheets: SheetData[];
  activeIdx: number;
  onSelect: (i: number) => void;
  onAdd: () => void;
  onRename: (i: number, name: string) => void;
  onDelete: (i: number) => void;
  onDuplicate: (i: number) => void;
  onMove: (from: number, to: number) => void;
}) {
  // Right-click context menu state — single instance shared across tabs.
  // Position is in viewport coordinates; we render via a fixed-positioned
  // backdrop so the menu escapes the overflow:auto strip.
  const [menu, setMenu] = useState<{ idx: number; x: number; y: number } | null>(null);
  // Drag-and-drop hover index. Visualises the insertion point with a
  // 2-pixel left/right border so the user knows where the tab will land.
  const [dragOver, setDragOver] = useState<number | null>(null);

  return (
    <div className="shrink-0 border-t border-stroke-1 bg-bg-chrome flex items-stretch h-7 relative">
      <button
        type="button"
        onClick={onAdd}
        className="w-7 border-r border-stroke-1 flex items-center justify-center text-text-tertiary hover:text-text-primary"
        title="Neue Tabelle"
      >
        <Plus size={13} />
      </button>
      <div className="flex items-stretch overflow-x-auto">
        {sheets.map((s, i) => (
          <SheetTab
            key={`${s.name}-${i}`}
            name={s.name}
            active={i === activeIdx}
            dragOver={dragOver === i}
            tabIdx={i}
            canDelete={sheets.length > 1}
            onSelect={() => onSelect(i)}
            onRename={(name) => onRename(i, name)}
            onContextMenu={(e) => {
              e.preventDefault();
              setMenu({ idx: i, x: e.clientX, y: e.clientY });
            }}
            onDragStart={(e) => {
              e.dataTransfer.setData("text/x-sheet-idx", String(i));
              e.dataTransfer.effectAllowed = "move";
            }}
            onDragOver={(e) => {
              if (e.dataTransfer.types.includes("text/x-sheet-idx")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOver(i);
              }
            }}
            onDragLeave={() => {
              setDragOver((cur) => (cur === i ? null : cur));
            }}
            onDrop={(e) => {
              e.preventDefault();
              const raw = e.dataTransfer.getData("text/x-sheet-idx");
              const from = Number(raw);
              setDragOver(null);
              if (Number.isInteger(from) && from !== i) onMove(from, i);
            }}
          />
        ))}
      </div>
      <div className="ml-auto px-3 flex items-center text-[10.5px] text-text-tertiary tabular-nums">
        Tabellen: {sheets.length}
      </div>
      {menu && (
        <SheetTabMenu
          x={menu.x}
          y={menu.y}
          canDelete={sheets.length > 1}
          onRename={() => {
            // The rename happens inside SheetTab; we just close. The user
            // can press F2 / double-click — which the menu Item triggers
            // by dispatching a synthetic dblclick on the active tab.
            const target = document.querySelector<HTMLButtonElement>(
              `[data-sheet-tab="${menu.idx}"]`,
            );
            target?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
            setMenu(null);
          }}
          onDuplicate={() => {
            onDuplicate(menu.idx);
            setMenu(null);
          }}
          onDelete={() => {
            onDelete(menu.idx);
            setMenu(null);
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

function SheetTabMenu({
  x,
  y,
  canDelete,
  onRename,
  onDuplicate,
  onDelete,
  onClose,
}: {
  x: number;
  y: number;
  canDelete: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  // Auto-close on any outside click or ESC. Listening on `pointerdown`
  // (not `click`) makes the menu close before the underlying button
  // handles its own click — which is the convention native menus follow.
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("[data-sheet-tab-menu]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);
  return (
    <div
      data-sheet-tab-menu
      className="fixed z-50 min-w-[160px] rounded-md border border-stroke-1 bg-bg-elevated shadow-xl py-1 text-[12px] text-text-primary"
      style={{ left: x, top: y }}
      role="menu"
    >
      <button
        type="button"
        onClick={onRename}
        className="w-full text-left px-3 py-1.5 hover:bg-bg-overlay"
        role="menuitem"
      >
        Umbenennen
      </button>
      <button
        type="button"
        onClick={onDuplicate}
        className="w-full text-left px-3 py-1.5 hover:bg-bg-overlay"
        role="menuitem"
      >
        Duplizieren
      </button>
      <div className="my-1 h-px bg-stroke-1" />
      <button
        type="button"
        onClick={onDelete}
        disabled={!canDelete}
        className="w-full text-left px-3 py-1.5 text-rose-400 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
        role="menuitem"
      >
        Löschen
      </button>
    </div>
  );
}

function SheetTab({
  name,
  active,
  dragOver,
  tabIdx,
  canDelete: _canDelete,
  onSelect,
  onRename,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  name: string;
  active: boolean;
  dragOver: boolean;
  tabIdx: number;
  canDelete: boolean;
  onSelect: () => void;
  onRename: (name: string) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    if (!renaming) setDraft(name);
  }, [name, renaming]);

  if (renaming) {
    return (
      <div
        className={`px-2 border-r border-stroke-1 flex items-center text-[11.5px] ${
          active ? "bg-bg-base text-text-primary" : "text-text-secondary"
        }`}
      >
        <input
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setRenaming(false);
            onRename(draft);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              setRenaming(false);
              onRename(draft);
            } else if (e.key === "Escape") {
              setRenaming(false);
              setDraft(name);
            }
          }}
          className="bg-transparent outline-none border-b border-[#5b5fc7] text-[11.5px] w-[120px]"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      draggable
      data-sheet-tab={tabIdx}
      onClick={onSelect}
      onDoubleClick={() => setRenaming(true)}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`px-3 border-r border-stroke-1 flex items-center text-[11.5px] cursor-grab active:cursor-grabbing ${
        active
          ? "bg-bg-base text-text-primary border-b-2 border-b-[#5b5fc7]"
          : "text-text-secondary hover:bg-bg-overlay/50"
      } ${dragOver ? "ring-1 ring-[#5b5fc7] ring-inset" : ""}`}
      title="Doppelklick: umbenennen · Rechtsklick: Menü · Ziehen zum Umsortieren"
    >
      {name}
    </button>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */
/*                       Conditional Formatting Dialog                     */
/* ─────────────────────────────────────────────────────────────────────── */

const CF_PRESETS: {
  key: string;
  label: string;
  hint: string;
  build: (range: string) => ConditionalRule;
}[] = [
  {
    key: "scale",
    label: "Heat-Map (rot → grün)",
    hint: "Niedrige Werte rot, mittlere gelb, hohe grün.",
    build: (range) => ({
      kind: "color-scale",
      range,
      lowColor: "f97373",
      midColor: "fde68a",
      highColor: "86efac",
    }),
  },
  {
    key: "scale-cool",
    label: "Heat-Map (kalt → warm)",
    hint: "Blau für niedrig, weiß mittig, orange für hoch.",
    build: (range) => ({
      kind: "color-scale",
      range,
      lowColor: "60a5fa",
      midColor: "f3f4f6",
      highColor: "fb923c",
    }),
  },
  {
    key: "gt0-green",
    label: "Positive Werte grün",
    hint: "Markiert Zellen > 0 in Grün.",
    build: (range) => ({
      kind: "greater",
      range,
      value: 0,
      bgColor: "bbf7d0",
    }),
  },
  {
    key: "lt0-red",
    label: "Negative Werte rot",
    hint: "Markiert Zellen < 0 in Rot.",
    build: (range) => ({
      kind: "less",
      range,
      value: 0,
      bgColor: "fecaca",
    }),
  },
];

function ConditionalFormatDialog({
  rules,
  defaultRange,
  onAdd,
  onRemove,
  onClose,
}: {
  rules: ConditionalRule[];
  defaultRange: string;
  onAdd: (rule: ConditionalRule) => void;
  onRemove: (idx: number) => void;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<
    "preset" | "greater" | "less" | "between" | "equals"
  >("preset");
  const [range, setRange] = useState(defaultRange);
  const [value, setValue] = useState("0");
  const [valueMin, setValueMin] = useState("0");
  const [valueMax, setValueMax] = useState("100");
  const [text, setText] = useState("");
  const [bgColor, setBgColor] = useState("fde68a");
  const rangeValid = parseA1Range(range) !== null;

  const buildCustom = (): ConditionalRule | null => {
    if (!rangeValid) return null;
    if (mode === "greater") {
      const v = Number(value.replace(",", "."));
      if (!Number.isFinite(v)) return null;
      return { kind: "greater", range, value: v, bgColor };
    }
    if (mode === "less") {
      const v = Number(value.replace(",", "."));
      if (!Number.isFinite(v)) return null;
      return { kind: "less", range, value: v, bgColor };
    }
    if (mode === "between") {
      const lo = Number(valueMin.replace(",", "."));
      const hi = Number(valueMax.replace(",", "."));
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
      return { kind: "between", range, min: lo, max: hi, bgColor };
    }
    if (mode === "equals") {
      if (!text) return null;
      return { kind: "equals", range, text, bgColor };
    }
    return null;
  };

  const SWATCHES = [
    "bbf7d0",
    "fde68a",
    "fecaca",
    "bae6fd",
    "fbcfe8",
    "ddd6fe",
    "f5d0fe",
    "fed7aa",
    "e5e7eb",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-lg border border-stroke-1 bg-bg-elevated shadow-xl">
        <header className="flex items-center justify-between border-b border-stroke-1 px-4 py-2.5">
          <h3 className="text-sm font-semibold text-text-primary">
            Bedingte Formatierung
          </h3>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text-primary"
            aria-label="Schließen"
          >
            <X size={14} />
          </button>
        </header>

        <div className="px-4 py-3 space-y-3 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-[11px] font-medium text-text-tertiary mb-1">
              Bereich (z.B. B2:B10 oder C:C)
            </label>
            <input
              type="text"
              value={range}
              onChange={(e) => setRange(e.target.value)}
              className={`w-full rounded border bg-bg-base px-2 py-1.5 text-[12px] font-mono outline-none focus:border-[#5b5fc7] ${
                rangeValid ? "border-stroke-1" : "border-red-500/60"
              }`}
            />
            {!rangeValid && (
              <p className="text-[10px] text-red-300 mt-0.5">
                Bereich kann nicht interpretiert werden.
              </p>
            )}
          </div>

          <div className="flex gap-1 flex-wrap">
            {[
              { id: "preset", label: "Vorlagen" },
              { id: "greater", label: "Wert >" },
              { id: "less", label: "Wert <" },
              { id: "between", label: "Zwischen" },
              { id: "equals", label: "Text =" },
            ].map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => setMode(o.id as typeof mode)}
                className={`px-2 h-6 rounded border text-[11px] transition-colors ${
                  mode === o.id
                    ? "bg-[#5b5fc7]/20 border-[#5b5fc7]/50 text-text-primary"
                    : "border-stroke-1 text-text-secondary hover:text-text-primary"
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>

          {mode === "preset" && (
            <ul className="space-y-1.5">
              {CF_PRESETS.map((p) => (
                <li key={p.key}>
                  <button
                    type="button"
                    disabled={!rangeValid}
                    onClick={() => {
                      onAdd(p.build(range));
                      onClose();
                    }}
                    className="w-full rounded border border-stroke-1 bg-bg-base px-3 py-2 text-left transition-colors hover:border-[#5b5fc7]/50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <div className="text-[12.5px] text-text-primary">
                      {p.label}
                    </div>
                    <div className="text-[11px] text-text-tertiary">
                      {p.hint}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}

          {(mode === "greater" || mode === "less") && (
            <div>
              <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                Schwellwert
              </label>
              <input
                type="text"
                inputMode="decimal"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full rounded border border-stroke-1 bg-bg-base px-2 py-1.5 text-[12px] outline-none focus:border-[#5b5fc7]"
              />
            </div>
          )}

          {mode === "between" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                  Min
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valueMin}
                  onChange={(e) => setValueMin(e.target.value)}
                  className="w-full rounded border border-stroke-1 bg-bg-base px-2 py-1.5 text-[12px] outline-none focus:border-[#5b5fc7]"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                  Max
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={valueMax}
                  onChange={(e) => setValueMax(e.target.value)}
                  className="w-full rounded border border-stroke-1 bg-bg-base px-2 py-1.5 text-[12px] outline-none focus:border-[#5b5fc7]"
                />
              </div>
            </div>
          )}

          {mode === "equals" && (
            <div>
              <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                Text (exakter Vergleich)
              </label>
              <input
                type="text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="z.B. Erledigt"
                className="w-full rounded border border-stroke-1 bg-bg-base px-2 py-1.5 text-[12px] outline-none focus:border-[#5b5fc7]"
              />
            </div>
          )}

          {mode !== "preset" && (
            <div>
              <label className="block text-[11px] font-medium text-text-tertiary mb-1">
                Hintergrund
              </label>
              <div className="flex gap-1.5 flex-wrap">
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setBgColor(c)}
                    className={`w-6 h-6 rounded border-2 transition-all ${
                      bgColor === c
                        ? "border-[#5b5fc7] scale-110"
                        : "border-transparent hover:border-stroke-2"
                    }`}
                    style={{ backgroundColor: `#${c}` }}
                    title={`#${c}`}
                  />
                ))}
              </div>
            </div>
          )}

          {mode !== "preset" && (
            <button
              type="button"
              disabled={!rangeValid || !buildCustom()}
              onClick={() => {
                const r = buildCustom();
                if (r) {
                  onAdd(r);
                  onClose();
                }
              }}
              className="w-full rounded bg-[#5b5fc7] px-3 py-2 text-[12px] font-medium text-white transition-colors hover:bg-[#4f52b2] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Regel hinzufügen
            </button>
          )}

          {rules.length > 0 && (
            <div className="border-t border-stroke-1 pt-3">
              <h4 className="text-[11px] font-medium text-text-tertiary mb-1.5">
                Aktive Regeln ({rules.length})
              </h4>
              <ul className="space-y-1">
                {rules.map((r, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-2 rounded border border-stroke-1 bg-bg-base px-2 py-1.5"
                  >
                    {r.kind !== "color-scale" && (
                      <span
                        className="w-3 h-3 rounded shrink-0"
                        style={{ backgroundColor: `#${r.bgColor}` }}
                      />
                    )}
                    {r.kind === "color-scale" && (
                      <span
                        className="w-3 h-3 rounded shrink-0"
                        style={{
                          background: `linear-gradient(90deg,#${r.lowColor},#${r.midColor},#${r.highColor})`,
                        }}
                      />
                    )}
                    <span className="text-[11.5px] text-text-secondary flex-1 truncate">
                      <code className="font-mono text-text-tertiary">
                        {r.range}
                      </code>{" "}
                      {describeRule(r)}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemove(i)}
                      className="p-0.5 rounded text-text-tertiary hover:text-red-300"
                      title="Regel entfernen"
                    >
                      <Trash2 size={11} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function describeRule(r: ConditionalRule): string {
  switch (r.kind) {
    case "greater":
      return `> ${r.value}`;
    case "less":
      return `< ${r.value}`;
    case "between":
      return `${r.min}–${r.max}`;
    case "equals":
      return `= "${r.text}"`;
    case "color-scale":
      return "Heat-Map";
  }
}

// Re-export the formula's name list for any caller that wants its own
// autocomplete UI (e.g. an inline formula bar). Plus the cell-ref parser
// for completeness — keeps the public surface explicit.
export { parseCellRef, FUNCTION_NAMES };
