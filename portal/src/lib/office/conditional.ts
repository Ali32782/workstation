import type { CellFormat, ConditionalRule, SheetData } from "./types";
import { parseCellRef } from "./formula";

/**
 * Conditional-formatting evaluator. Lives next to the Excel types so the
 * editor and any future converter share the same rule semantics.
 *
 * Design points:
 *   • Pure: no React, no DOM. The editor calls `effectiveCellFormat()`
 *     once per cell on render — this stays cheap because each rule does
 *     a single range-membership check + a numeric comparison.
 *   • Range syntax matches the formula engine ("B2:B10", "C:C", "B2"
 *     for a single cell). Cross-sheet refs are not supported.
 *   • Color-scale rules require pre-computing per-rule min/max; we
 *     cache that on a `RuleStats` map so a 500-cell range doesn't get
 *     scanned 500× per render.
 */

export type RangeRect = {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
};

/**
 * Parse "B2:B10", "C:C", "1:3", "B5" into a normalised rect.
 * Returns null on syntax errors.
 *
 * Whole-column refs ("C:C") return -1 for the row span; the caller
 * substitutes the sheet's actual row count. Same for whole-row refs.
 */
export function parseA1Range(
  input: string,
): RangeRect | null {
  const trimmed = input.trim().toUpperCase();
  if (!trimmed) return null;

  if (trimmed.includes(":")) {
    const [a, b] = trimmed.split(":", 2) as [string, string];
    return mergeEndpoints(parseEndpoint(a), parseEndpoint(b));
  }
  const single = parseEndpoint(trimmed);
  if (!single) return null;
  return {
    r0: single.r ?? 0,
    r1: single.r ?? -1,
    c0: single.c ?? 0,
    c1: single.c ?? -1,
  };
}

/** Endpoint: A1 (full cell), A (whole-column), 1 (whole-row). */
function parseEndpoint(
  s: string,
): { r: number | null; c: number | null } | null {
  const cellMatch = /^([A-Z]+)(\d+)$/.exec(s);
  if (cellMatch) {
    const ref = parseCellRef(s);
    if (!ref) return null;
    return { r: ref.r, c: ref.c };
  }
  const colOnly = /^([A-Z]+)$/.exec(s);
  if (colOnly) {
    const ref = parseCellRef(`${colOnly[1]}1`);
    if (!ref) return null;
    return { r: null, c: ref.c };
  }
  const rowOnly = /^(\d+)$/.exec(s);
  if (rowOnly) {
    const r = Number(rowOnly[1]) - 1;
    if (!Number.isFinite(r) || r < 0) return null;
    return { r, c: null };
  }
  return null;
}

function mergeEndpoints(
  a: { r: number | null; c: number | null } | null,
  b: { r: number | null; c: number | null } | null,
): RangeRect | null {
  if (!a || !b) return null;
  // Whole columns / rows: -1 means "stretch to sheet bounds", filled in
  // by isInRange when the sheet dimensions are known.
  const r0 = a.r === null || b.r === null ? -1 : Math.min(a.r, b.r);
  const r1 = a.r === null || b.r === null ? -1 : Math.max(a.r, b.r);
  const c0 = a.c === null || b.c === null ? -1 : Math.min(a.c, b.c);
  const c1 = a.c === null || b.c === null ? -1 : Math.max(a.c, b.c);
  return { r0, r1, c0, c1 };
}

export function isCellInRange(
  rect: RangeRect,
  r: number,
  c: number,
  sheetRows: number,
  sheetCols: number,
): boolean {
  const r0 = rect.r0 === -1 ? 0 : rect.r0;
  const r1 = rect.r1 === -1 ? sheetRows - 1 : rect.r1;
  const c0 = rect.c0 === -1 ? 0 : rect.c0;
  const c1 = rect.c1 === -1 ? sheetCols - 1 : rect.c1;
  return r >= r0 && r <= r1 && c >= c0 && c <= c1;
}

/** Numeric parse with comma-decimal tolerance ("1.234,56" → 1234.56). */
function toNumber(raw: string): number | null {
  if (!raw) return null;
  const s = raw.replace(/\s/g, "");
  // German thousands sep (".") + decimal (",") — try this first.
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
    const n = Number(s.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  // Plain "1234,56".
  if (/^-?\d+(,\d+)?$/.test(s)) {
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  // ASCII number.
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type RuleStats = {
  /** Min numeric value seen in the range (color-scale only). */
  min: number;
  /** Max numeric value seen in the range (color-scale only). */
  max: number;
};

type CompiledRule = {
  rule: ConditionalRule;
  rect: RangeRect;
  stats: RuleStats | null;
};

/**
 * Pre-compile rules: parse ranges once, scan the data once for
 * color-scale min/max. The editor calls this on every render — cheap
 * thanks to the sparse rule list (typically 0-3 rules total).
 */
export function compileRules(sheet: SheetData): CompiledRule[] {
  const rules = sheet.conditionalRules ?? [];
  if (rules.length === 0) return [];

  const out: CompiledRule[] = [];
  for (const rule of rules) {
    const rect = parseA1Range(rule.range);
    if (!rect) continue;
    let stats: RuleStats | null = null;
    if (rule.kind === "color-scale") {
      let min = Infinity;
      let max = -Infinity;
      const r0 = rect.r0 === -1 ? 0 : rect.r0;
      const r1 = rect.r1 === -1 ? sheet.rowCount - 1 : rect.r1;
      const c0 = rect.c0 === -1 ? 0 : rect.c0;
      const c1 = rect.c1 === -1 ? sheet.columnCount - 1 : rect.c1;
      for (let r = r0; r <= r1; r += 1) {
        for (let c = c0; c <= c1; c += 1) {
          const n = toNumber(sheet.rows[r]?.[c] ?? "");
          if (n === null) continue;
          if (n < min) min = n;
          if (n > max) max = n;
        }
      }
      if (min !== Infinity && max !== -Infinity) {
        stats = { min, max };
      }
    }
    out.push({ rule, rect, stats });
  }
  return out;
}

/**
 * Linear interpolate two hex colours (no leading #). `t` clamps to [0,1].
 */
function lerpHex(a: string, b: string, t: number): string {
  const tt = Math.max(0, Math.min(1, t));
  const ar = parseInt(a.slice(0, 2), 16);
  const ag = parseInt(a.slice(2, 4), 16);
  const ab = parseInt(a.slice(4, 6), 16);
  const br = parseInt(b.slice(0, 2), 16);
  const bg = parseInt(b.slice(2, 4), 16);
  const bb = parseInt(b.slice(4, 6), 16);
  const r = Math.round(ar + (br - ar) * tt);
  const g = Math.round(ag + (bg - ag) * tt);
  const bl = Math.round(ab + (bb - ab) * tt);
  return [r, g, bl]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}

function colorScaleColor(
  rule: Extract<ConditionalRule, { kind: "color-scale" }>,
  stats: RuleStats,
  value: number,
): string {
  const span = stats.max - stats.min;
  if (span <= 0) return rule.midColor;
  const t = (value - stats.min) / span;
  if (t <= 0.5) {
    return lerpHex(rule.lowColor, rule.midColor, t * 2);
  }
  return lerpHex(rule.midColor, rule.highColor, (t - 0.5) * 2);
}

/**
 * Compute the effective format for a cell — explicit format merged
 * with any matching conditional-format rule. Rules later in the array
 * override earlier ones (Excel semantics: most recent rule wins).
 *
 * `compiled` is the cached output of compileRules(); pass the same
 * array for every cell on a single render to keep this O(1) per cell.
 */
export function effectiveCellFormat(
  base: CellFormat,
  rawValue: string,
  r: number,
  c: number,
  compiled: CompiledRule[],
  sheetRows: number,
  sheetCols: number,
): CellFormat {
  if (compiled.length === 0) return base;

  let merged: CellFormat = base;
  for (const cr of compiled) {
    if (!isCellInRange(cr.rect, r, c, sheetRows, sheetCols)) continue;
    const rule = cr.rule;

    if (rule.kind === "equals") {
      if (rawValue !== rule.text) continue;
      merged = {
        ...merged,
        bgColor: rule.bgColor,
        textColor: rule.textColor ?? merged.textColor,
      };
      continue;
    }

    // All numeric rules need a numeric cell value.
    const n = toNumber(rawValue);
    if (n === null) continue;

    if (rule.kind === "greater" && n > rule.value) {
      merged = {
        ...merged,
        bgColor: rule.bgColor,
        textColor: rule.textColor ?? merged.textColor,
      };
    } else if (rule.kind === "less" && n < rule.value) {
      merged = {
        ...merged,
        bgColor: rule.bgColor,
        textColor: rule.textColor ?? merged.textColor,
      };
    } else if (
      rule.kind === "between" &&
      n >= rule.min &&
      n <= rule.max
    ) {
      merged = {
        ...merged,
        bgColor: rule.bgColor,
        textColor: rule.textColor ?? merged.textColor,
      };
    } else if (rule.kind === "color-scale" && cr.stats) {
      merged = {
        ...merged,
        bgColor: colorScaleColor(rule, cr.stats, n),
      };
    }
  }
  return merged;
}
