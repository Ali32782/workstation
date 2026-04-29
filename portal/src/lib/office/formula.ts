/**
 * Tiny spreadsheet formula evaluator.
 *
 * Supports the subset of Excel formulas the portal-Office actually needs:
 *
 *   • Cell refs:          A1, B12, AA9
 *   • Cross-sheet refs:   Tabelle2!A1, 'Sheet with spaces'!B7
 *   • Ranges:             A1:A10, B2:D5, Tabelle2!A1:A10  (inside function args)
 *   • Numeric literals:   42, -3.14, 1e6
 *   • String literals:    "hello"
 *   • Operators:          + - * / ^   and  ( )
 *   • Unary minus:        =-A1
 *   • Functions:          SUM, AVG, AVERAGE, MIN, MAX, COUNT, COUNTA,
 *                         ROUND, ABS, IF, CONCAT, LEN, LOWER, UPPER, TRIM
 *
 * Things deliberately not supported (yet):
 *   • Boolean operators / comparison (=, <, > …) — only IF takes a
 *     pre-computed boolean from a comparison-style argument we evaluate
 *     directly with =, <, >, <=, >=, <>.
 *   • 3-D refs (Sheet1:Sheet3!A1) — niche enough that we wait for an
 *     actual user request.
 *
 * Architectural notes
 *   • The evaluator is *pure* and *stateless*; the caller passes in a
 *     `lookup(r,c, sheet?)` that returns the raw cell value. The optional
 *     `sheet` argument is only set for cross-sheet refs — the caller
 *     resolves it to a different SheetData. This keeps the engine
 *     decoupled from React state, easy to unit-test, and trivial to
 *     swap if we ever migrate to a heavier engine like HyperFormula.
 *   • Recursion is depth-bounded (CIRCULAR_GUARD) so a self-referencing
 *     formula returns "#CIRCULAR!" instead of overflowing the stack.
 *   • All errors return one of the well-known sentinel strings so the
 *     UI can colour-code them: #ERROR!, #CIRCULAR!, #REF!, #DIV/0!,
 *     #VALUE!, #NAME?.
 */

/**
 * `sheet` is undefined for refs on the active sheet; cross-sheet refs
 * carry the sheet name so the caller can dispatch to the right grid.
 */
export type CellLookup = (r: number, c: number, sheet?: string) => string;

const CIRCULAR_GUARD = 64;

/** Map A→0, Z→25, AA→26, AB→27, … */
function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Parse "A1" → { r:0, c:0 }, "B12" → { r:11, c:1 }. */
export function parseCellRef(ref: string): { r: number; c: number } | null {
  const m = /^([A-Za-z]+)(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { c: colIndex(m[1]!), r: Number(m[2]) - 1 };
}

/* ─── Tokeniser ─────────────────────────────────────────────────────── */

type TokKind =
  | "NUM"
  | "STR"
  | "REF"
  | "RANGE"
  | "IDENT"
  | "OP"
  | "LPAREN"
  | "RPAREN"
  | "COMMA";

/**
 * For REF / RANGE tokens, `sheet` is the qualifier when the user wrote
 * `Tabelle2!A1`; otherwise undefined. We attach it here so the parser
 * doesn't have to peek ahead for the `!` operator.
 */
type Tok = { kind: TokKind; value: string; sheet?: string };

function tokenise(input: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;

  /**
   * Scan a cell-ref/range starting at `from`, with optional sheet prefix
   * already resolved by the caller. Returns the next index to continue
   * tokenising from, plus pushes the resulting REF or RANGE onto `toks`.
   * Returns null if `from` doesn't actually start with a cell-ref pattern,
   * letting the caller fall back to other token shapes.
   */
  const scanRefOrRange = (from: number, sheet: string | undefined): number | null => {
    let j = from;
    while (
      j < input.length &&
      ((input[j]! >= "A" && input[j]! <= "Z") ||
        (input[j]! >= "a" && input[j]! <= "z"))
    ) {
      j += 1;
    }
    const lettersEnd = j;
    while (j < input.length && input[j]! >= "0" && input[j]! <= "9") {
      j += 1;
    }
    if (lettersEnd === from || j === lettersEnd) return null;
    const first = input.slice(from, j);
    if (!parseCellRef(first)) return null;
    if (input[j] === ":") {
      let k = j + 1;
      while (
        k < input.length &&
        ((input[k]! >= "A" && input[k]! <= "Z") ||
          (input[k]! >= "a" && input[k]! <= "z"))
      ) {
        k += 1;
      }
      while (k < input.length && input[k]! >= "0" && input[k]! <= "9") {
        k += 1;
      }
      const second = input.slice(j + 1, k);
      if (parseCellRef(second)) {
        toks.push({ kind: "RANGE", value: `${first}:${second}`, sheet });
        return k;
      }
    }
    toks.push({ kind: "REF", value: first, sheet });
    return j;
  };

  while (i < input.length) {
    const ch = input[i]!;
    if (ch === " " || ch === "\t" || ch === "\n") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      toks.push({ kind: "LPAREN", value: "(" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      toks.push({ kind: "RPAREN", value: ")" });
      i += 1;
      continue;
    }
    if (ch === ",") {
      toks.push({ kind: "COMMA", value: "," });
      i += 1;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let s = "";
      while (j < input.length && input[j] !== '"') {
        if (input[j] === "\\" && j + 1 < input.length) {
          s += input[j + 1];
          j += 2;
        } else {
          s += input[j];
          j += 1;
        }
      }
      toks.push({ kind: "STR", value: s });
      i = j + 1;
      continue;
    }
    // Quoted sheet name: 'Sheet with spaces'!A1 — Excel allows the
    // whole sheet name to be wrapped in single quotes, escaping inner
    // quotes by doubling them ('It''s data'!A1). We follow that contract.
    if (ch === "'") {
      let j = i + 1;
      let name = "";
      while (j < input.length) {
        if (input[j] === "'") {
          if (input[j + 1] === "'") {
            name += "'";
            j += 2;
            continue;
          }
          break;
        }
        name += input[j];
        j += 1;
      }
      if (input[j] !== "'") {
        throw new FormulaError("#NAME?", "unterminated sheet quote");
      }
      j += 1; // consume the closing quote
      if (input[j] !== "!") {
        throw new FormulaError("#NAME?", "expected ! after sheet name");
      }
      j += 1; // consume the bang
      const after = scanRefOrRange(j, name);
      if (after == null) throw new FormulaError("#NAME?", `bad ref after ${name}!`);
      i = after;
      continue;
    }
    if (
      ch === "+" ||
      ch === "-" ||
      ch === "*" ||
      ch === "/" ||
      ch === "^" ||
      ch === "%" ||
      ch === "=" ||
      ch === "<" ||
      ch === ">"
    ) {
      let v = ch;
      if (
        (ch === "<" || ch === ">") &&
        (input[i + 1] === "=" || input[i + 1] === ">")
      ) {
        v = ch + input[i + 1]!;
        i += 1;
      }
      toks.push({ kind: "OP", value: v });
      i += 1;
      continue;
    }
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      let j = i;
      let saw = false;
      while (
        j < input.length &&
        ((input[j]! >= "0" && input[j]! <= "9") ||
          input[j] === "." ||
          (input[j]?.toLowerCase() === "e" &&
            (input[j + 1] === "+" ||
              input[j + 1] === "-" ||
              (input[j + 1]! >= "0" && input[j + 1]! <= "9"))))
      ) {
        if (input[j]?.toLowerCase() === "e") {
          if (saw) break;
          saw = true;
          j += 1;
          if (input[j] === "+" || input[j] === "-") j += 1;
          continue;
        }
        j += 1;
      }
      toks.push({ kind: "NUM", value: input.slice(i, j) });
      i = j;
      continue;
    }
    if ((ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z") || ch === "_") {
      let j = i;
      while (
        j < input.length &&
        ((input[j]! >= "A" && input[j]! <= "Z") ||
          (input[j]! >= "a" && input[j]! <= "z") ||
          (input[j]! >= "0" && input[j]! <= "9") ||
          input[j] === "_")
      ) {
        j += 1;
      }
      const word = input.slice(i, j);
      // Cross-sheet ref: Tabelle1!A1, Tabelle1!A1:B5. Sheet name comes
      // first, then `!`, then a cell ref or range. We only commit to
      // this branch if the *next* characters actually parse as a ref —
      // otherwise the bang might be a stray operator and we fall back
      // to plain IDENT (e.g. function name) handling.
      if (input[j] === "!" && !parseCellRef(word)) {
        const after = scanRefOrRange(j + 1, word);
        if (after != null) {
          i = after;
          continue;
        }
      }
      // RANGE: e.g. A1:B5 — peek for ":" + cell-ref
      if (input[j] === ":") {
        let k = j + 1;
        while (
          k < input.length &&
          ((input[k]! >= "A" && input[k]! <= "Z") ||
            (input[k]! >= "a" && input[k]! <= "z"))
        ) {
          k += 1;
        }
        while (k < input.length && input[k]! >= "0" && input[k]! <= "9") {
          k += 1;
        }
        const second = input.slice(j + 1, k);
        if (parseCellRef(word) && parseCellRef(second)) {
          toks.push({ kind: "RANGE", value: `${word}:${second}` });
          i = k;
          continue;
        }
      }
      // CELL ref vs. identifier: A1 vs SUM
      if (parseCellRef(word)) {
        toks.push({ kind: "REF", value: word });
      } else {
        toks.push({ kind: "IDENT", value: word });
      }
      i = j;
      continue;
    }
    // Unknown character — surface as parse error by inserting a poison token.
    throw new FormulaError("#NAME?", `unexpected '${ch}'`);
  }
  return toks;
}

/* ─── Parser (recursive descent, precedence-climbing) ─────────────────── */

type Node =
  | { type: "num"; value: number }
  | { type: "str"; value: string }
  | { type: "ref"; ref: string; sheet?: string }
  | { type: "range"; ref: string; sheet?: string }
  | { type: "neg"; expr: Node }
  | { type: "binop"; op: string; left: Node; right: Node }
  | { type: "call"; name: string; args: Node[] };

class FormulaError extends Error {
  sentinel: string;
  constructor(sentinel: string, msg?: string) {
    super(msg || sentinel);
    this.sentinel = sentinel;
  }
}

class Parser {
  i = 0;
  constructor(private toks: Tok[]) {}

  peek(): Tok | undefined {
    return this.toks[this.i];
  }
  eat(): Tok {
    const t = this.toks[this.i];
    if (!t) throw new FormulaError("#ERROR!", "unexpected end");
    this.i += 1;
    return t;
  }
  expect(kind: TokKind, value?: string): Tok {
    const t = this.eat();
    if (t.kind !== kind || (value != null && t.value !== value)) {
      throw new FormulaError("#ERROR!", `expected ${kind} ${value ?? ""}`);
    }
    return t;
  }

  parse(): Node {
    const expr = this.parseExpr(0);
    if (this.peek()) {
      throw new FormulaError("#ERROR!", `unexpected ${this.peek()!.value}`);
    }
    return expr;
  }

  // Operator precedence:
  //   0: = < > <= >= <>     (comparison, lowest)
  //   1: + -                 (additive)
  //   2: * /                 (multiplicative)
  //   3: ^                   (power, right-assoc)
  parseExpr(minPrec: number): Node {
    let left = this.parseUnary();
    while (true) {
      const t = this.peek();
      if (!t || t.kind !== "OP") break;
      const prec = OP_PRECEDENCE[t.value];
      if (prec == null || prec < minPrec) break;
      const op = t.value;
      this.eat();
      const rightMinPrec = op === "^" ? prec : prec + 1;
      const right = this.parseExpr(rightMinPrec);
      left = { type: "binop", op, left, right };
    }
    return left;
  }

  parseUnary(): Node {
    const t = this.peek();
    if (t?.kind === "OP" && (t.value === "-" || t.value === "+")) {
      this.eat();
      const inner = this.parseUnary();
      return t.value === "-" ? { type: "neg", expr: inner } : inner;
    }
    return this.parsePrimary();
  }

  parsePrimary(): Node {
    const t = this.eat();
    if (t.kind === "NUM") {
      const n = Number(t.value);
      if (!Number.isFinite(n))
        throw new FormulaError("#VALUE!", `bad number ${t.value}`);
      return { type: "num", value: n };
    }
    if (t.kind === "STR") return { type: "str", value: t.value };
    if (t.kind === "REF") return { type: "ref", ref: t.value, sheet: t.sheet };
    if (t.kind === "RANGE") return { type: "range", ref: t.value, sheet: t.sheet };
    if (t.kind === "LPAREN") {
      const expr = this.parseExpr(0);
      this.expect("RPAREN");
      return expr;
    }
    if (t.kind === "IDENT") {
      this.expect("LPAREN");
      const args: Node[] = [];
      if (this.peek()?.kind !== "RPAREN") {
        args.push(this.parseExpr(0));
        while (this.peek()?.kind === "COMMA") {
          this.eat();
          args.push(this.parseExpr(0));
        }
      }
      this.expect("RPAREN");
      return { type: "call", name: t.value.toUpperCase(), args };
    }
    throw new FormulaError("#ERROR!", `unexpected ${t.kind}`);
  }
}

const OP_PRECEDENCE: Record<string, number> = {
  "=": 0,
  "<": 0,
  ">": 0,
  "<=": 0,
  ">=": 0,
  "<>": 0,
  "+": 1,
  "-": 1,
  "*": 2,
  "/": 2,
  "^": 3,
};

/* ─── Evaluator ───────────────────────────────────────────────────────── */

type FormulaValue = number | string | boolean;

/**
 * Resolve a "A1:C5" range to a 2D-aware argument. Functions that only
 * need a flat list (SUM, AVG, …) use `flatten()` on the result;
 * functions that need 2D access (VLOOKUP, INDEX, …) read `values` as
 * row-major with `rows × cols`.
 */
function evalRange(
  ref: string,
  lookup: CellLookup,
  depth: number,
  sheet: string | undefined,
): RangeArg {
  const [a, b] = ref.split(":");
  const start = parseCellRef(a!);
  const end = parseCellRef(b!);
  if (!start || !end) throw new FormulaError("#REF!");
  const r0 = Math.min(start.r, end.r);
  const r1 = Math.max(start.r, end.r);
  const c0 = Math.min(start.c, end.c);
  const c1 = Math.max(start.c, end.c);
  const rows = r1 - r0 + 1;
  const cols = c1 - c0 + 1;
  const values: FormulaValue[] = [];
  for (let r = r0; r <= r1; r++) {
    for (let c = c0; c <= c1; c++) {
      values.push(coerce(lookup, r, c, depth + 1, sheet));
    }
  }
  return { kind: "range", rows, cols, values };
}

function coerce(
  lookup: CellLookup,
  r: number,
  c: number,
  depth: number,
  sheet: string | undefined,
): FormulaValue {
  if (depth > CIRCULAR_GUARD) throw new FormulaError("#CIRCULAR!");
  const raw = lookup(r, c, sheet);
  if (raw == null || raw === "") return "";
  if (raw.startsWith("=")) {
    // Recursing across sheets follows the natural semantics: the formula
    // string we just fetched belongs to `sheet`, so unqualified refs in
    // it should resolve there. We pass `sheet` as the new "active" sheet
    // by wrapping `lookup` — but since CellLookup already takes an
    // explicit sheet on each call, we just rebind via a closure.
    const subLookup: CellLookup =
      sheet == null
        ? lookup
        : (rr, cc, sh) => lookup(rr, cc, sh ?? sheet);
    return evaluate(raw, subLookup, depth + 1);
  }
  // Try numeric coercion. We keep "12,5" → 12.5 because the German
  // locale uses comma decimals, but only for purely numeric strings.
  const cleaned = raw.replace(",", ".");
  const n = Number(cleaned);
  if (cleaned !== "" && Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(cleaned)) {
    return n;
  }
  return raw;
}

function asNumber(v: FormulaValue): number {
  if (typeof v === "number") return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (v === "") return 0;
  const cleaned = String(v).replace(",", ".");
  const n = Number(cleaned);
  if (!Number.isFinite(n)) throw new FormulaError("#VALUE!");
  return n;
}

function asBool(v: FormulaValue): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return v !== "" && v !== "0" && v.toLowerCase() !== "false";
}

function evalNode(
  node: Node,
  lookup: CellLookup,
  depth: number,
): FormulaValue {
  if (depth > CIRCULAR_GUARD) throw new FormulaError("#CIRCULAR!");
  switch (node.type) {
    case "num":
      return node.value;
    case "str":
      return node.value;
    case "ref": {
      const addr = parseCellRef(node.ref);
      if (!addr) throw new FormulaError("#REF!");
      return coerce(lookup, addr.r, addr.c, depth + 1, node.sheet);
    }
    case "range":
      // A bare range as a value is meaningless in Excel; we coerce to
      // 0 so misuse like =A1:A5 still renders something rather than
      // exploding. Functions explicitly handle ranges via flattenRange.
      throw new FormulaError("#VALUE!", "range not allowed here");
    case "neg":
      return -asNumber(evalNode(node.expr, lookup, depth + 1));
    case "binop": {
      const l = evalNode(node.left, lookup, depth + 1);
      const r = evalNode(node.right, lookup, depth + 1);
      switch (node.op) {
        case "+":
          return asNumber(l) + asNumber(r);
        case "-":
          return asNumber(l) - asNumber(r);
        case "*":
          return asNumber(l) * asNumber(r);
        case "/": {
          const denom = asNumber(r);
          if (denom === 0) throw new FormulaError("#DIV/0!");
          return asNumber(l) / denom;
        }
        case "^":
          return Math.pow(asNumber(l), asNumber(r));
        case "=":
          return l === r || asNumber(l) === asNumber(r);
        case "<>":
          return !(l === r || asNumber(l) === asNumber(r));
        case "<":
          return asNumber(l) < asNumber(r);
        case ">":
          return asNumber(l) > asNumber(r);
        case "<=":
          return asNumber(l) <= asNumber(r);
        case ">=":
          return asNumber(l) >= asNumber(r);
        default:
          throw new FormulaError("#ERROR!", `op ${node.op}`);
      }
    }
    case "call": {
      const fn = FUNCTIONS[node.name];
      if (!fn) throw new FormulaError("#NAME?", node.name);
      // Resolve args. Functions decide whether they want a value or
      // accept ranges directly (SUM, AVG, …). Cross-sheet ranges thread
      // their qualifier through `evalRange`.
      const evaledArgs: EvaluatedArg[] = node.args.map((a) => {
        if (a.type === "range") {
          return evalRange(a.ref, lookup, depth + 1, a.sheet);
        }
        return { kind: "value" as const, value: evalNode(a, lookup, depth + 1) };
      });
      return fn(evaledArgs);
    }
  }
}

type RangeArg = {
  kind: "range";
  rows: number;
  cols: number;
  /** Row-major: cell at (row, col) is `values[row * cols + col]`. */
  values: FormulaValue[];
};

type EvaluatedArg = { kind: "value"; value: FormulaValue } | RangeArg;

function flatten(args: EvaluatedArg[]): FormulaValue[] {
  const out: FormulaValue[] = [];
  for (const a of args) {
    if (a.kind === "value") out.push(a.value);
    else out.push(...a.values);
  }
  return out;
}

/**
 * Match Excel's "criteria" mini-DSL used by COUNTIF/SUMIF: a string that
 * is either a literal value (`"apple"`, `"42"`) or a comparison
 * (`">100"`, `"<>0"`, `">=2026-01-01"`). Returns true if the cell value
 * passes. We reproduce Excel's coercion: numeric comparisons coerce
 * both sides to numbers; equality stays string-strict if either side
 * isn't numeric.
 */
function makeCriteriaPredicate(criteria: FormulaValue): (v: FormulaValue) => boolean {
  if (typeof criteria === "number" || typeof criteria === "boolean") {
    return (v) => v === criteria || asNumber(v) === asNumber(criteria);
  }
  const s = String(criteria).trim();
  const m = /^(<>|>=|<=|<|>|=)(.*)$/.exec(s);
  if (m) {
    const op = m[1]!;
    const rhsRaw = m[2]!.trim();
    const rhsN = Number(rhsRaw.replace(",", "."));
    const numeric = Number.isFinite(rhsN) && rhsRaw !== "";
    return (v) => {
      if (numeric) {
        const lhs = asNumber(v);
        switch (op) {
          case "=":
            return lhs === rhsN;
          case "<>":
            return lhs !== rhsN;
          case ">":
            return lhs > rhsN;
          case "<":
            return lhs < rhsN;
          case ">=":
            return lhs >= rhsN;
          case "<=":
            return lhs <= rhsN;
        }
      }
      const lhs = String(v);
      switch (op) {
        case "=":
          return lhs === rhsRaw;
        case "<>":
          return lhs !== rhsRaw;
        case ">":
          return lhs > rhsRaw;
        case "<":
          return lhs < rhsRaw;
        case ">=":
          return lhs >= rhsRaw;
        case "<=":
          return lhs <= rhsRaw;
      }
      return false;
    };
  }
  // Plain literal: equality with light coercion.
  return (v) => {
    if (typeof v === "number" || typeof v === "boolean") {
      const n = Number(s.replace(",", "."));
      if (Number.isFinite(n)) return asNumber(v) === n;
      return String(v) === s;
    }
    return String(v) === s;
  };
}

/**
 * Excel's `TEXT(value, format)` — we only support the most common
 * patterns (decimal placeholders, percent suffix, currency suffix, ISO
 * dates). Anything richer falls back to the raw value so the formula
 * still produces something sensible.
 */
function applyTextFormat(value: FormulaValue, fmt: string): string {
  const code = fmt.trim();
  // Integer / thousands.
  if (code === "0") return String(Math.round(asNumber(value)));
  if (code === "#,##0")
    return Math.round(asNumber(value)).toLocaleString("de-CH");
  // Decimal places: "0.00", "0.0000".
  const decM = /^0\.(0+)$/.exec(code);
  if (decM) {
    const places = decM[1]!.length;
    return asNumber(value).toLocaleString("de-CH", {
      minimumFractionDigits: places,
      maximumFractionDigits: places,
    });
  }
  // Percent: "0%", "0.00%".
  if (/^0+(\.0+)?%$/.test(code)) {
    const places = code.includes(".") ? code.split(".")[1]!.replace("%", "").length : 0;
    return (
      (asNumber(value) * 100).toLocaleString("de-CH", {
        minimumFractionDigits: places,
        maximumFractionDigits: places,
      }) + " %"
    );
  }
  // ISO dates: "yyyy-mm-dd".
  if (code.toLowerCase() === "yyyy-mm-dd") {
    const d = parseDateValue(value);
    if (d) return d.toISOString().slice(0, 10);
  }
  if (code.toLowerCase() === "dd.mm.yyyy") {
    const d = parseDateValue(value);
    if (d) {
      const dd = String(d.getUTCDate()).padStart(2, "0");
      const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
      return `${dd}.${mm}.${d.getUTCFullYear()}`;
    }
  }
  return String(value);
}

/**
 * Coerce a FormulaValue into a JS Date (UTC). Accepts ISO strings,
 * "dd.mm.yyyy", and Excel serial numbers (days since 1899-12-30).
 */
function parseDateValue(v: FormulaValue): Date | null {
  if (typeof v === "number") {
    return new Date((v - 25569) * 86400 * 1000);
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s + "T00:00:00Z");
    if (!Number.isNaN(d.getTime())) return d;
  }
  const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2,4})/.exec(s);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]) - 1;
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    return new Date(Date.UTC(year, month, day));
  }
  return null;
}

const FUNCTIONS: Record<string, (args: EvaluatedArg[]) => FormulaValue> = {
  SUM: (args) =>
    flatten(args)
      .filter((v) => v !== "")
      .reduce<number>((a, v) => a + asNumber(v), 0),
  AVG: (args) => {
    const nums = flatten(args).filter((v) => v !== "");
    if (!nums.length) return 0;
    return nums.reduce<number>((a, v) => a + asNumber(v), 0) / nums.length;
  },
  AVERAGE: (args) => FUNCTIONS.AVG!(args),
  MIN: (args) => {
    const nums = flatten(args).filter((v) => v !== "").map(asNumber);
    if (!nums.length) return 0;
    return Math.min(...nums);
  },
  MAX: (args) => {
    const nums = flatten(args).filter((v) => v !== "").map(asNumber);
    if (!nums.length) return 0;
    return Math.max(...nums);
  },
  COUNT: (args) => flatten(args).filter((v) => typeof v === "number").length,
  COUNTA: (args) => flatten(args).filter((v) => v !== "" && v != null).length,
  ROUND: (args) => {
    const vals = flatten(args);
    const n = asNumber(vals[0] ?? 0);
    const d = vals.length > 1 ? Math.floor(asNumber(vals[1]!)) : 0;
    const f = Math.pow(10, d);
    return Math.round(n * f) / f;
  },
  ABS: (args) => Math.abs(asNumber(flatten(args)[0] ?? 0)),
  IF: (args) => {
    const flat = flatten(args);
    if (flat.length < 2) throw new FormulaError("#VALUE!", "IF needs 2-3 args");
    return asBool(flat[0]!) ? flat[1]! : (flat[2] ?? false);
  },
  IFERROR: (args) => {
    // The interesting bit: by the time we get here, the inner formula
    // has already been evaluated. We detect Excel's sentinel error
    // strings and substitute the fallback value.
    const flat = flatten(args);
    const v = flat[0] ?? "";
    if (typeof v === "string" && /^#[A-Z!?\/]+!?$/.test(v)) {
      return flat[1] ?? "";
    }
    return v;
  },
  CONCAT: (args) =>
    flatten(args)
      .map((v) => (v == null ? "" : String(v)))
      .join(""),
  CONCATENATE: (args) => FUNCTIONS.CONCAT!(args),
  LEN: (args) => String(flatten(args)[0] ?? "").length,
  LOWER: (args) => String(flatten(args)[0] ?? "").toLowerCase(),
  UPPER: (args) => String(flatten(args)[0] ?? "").toUpperCase(),
  TRIM: (args) => String(flatten(args)[0] ?? "").trim(),
  TODAY: () => new Date().toISOString().slice(0, 10),
  NOW: () => new Date().toLocaleString(),
  TEXT: (args) => {
    const flat = flatten(args);
    if (flat.length < 2) throw new FormulaError("#VALUE!", "TEXT needs 2 args");
    return applyTextFormat(flat[0]!, String(flat[1] ?? ""));
  },
  DATE: (args) => {
    const flat = flatten(args);
    const y = Math.floor(asNumber(flat[0] ?? 0));
    const m = Math.floor(asNumber(flat[1] ?? 1));
    const d = Math.floor(asNumber(flat[2] ?? 1));
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.toISOString().slice(0, 10);
  },
  YEAR: (args) => {
    const d = parseDateValue(flatten(args)[0] ?? "");
    if (!d) throw new FormulaError("#VALUE!", "YEAR: bad date");
    return d.getUTCFullYear();
  },
  MONTH: (args) => {
    const d = parseDateValue(flatten(args)[0] ?? "");
    if (!d) throw new FormulaError("#VALUE!", "MONTH: bad date");
    return d.getUTCMonth() + 1;
  },
  DAY: (args) => {
    const d = parseDateValue(flatten(args)[0] ?? "");
    if (!d) throw new FormulaError("#VALUE!", "DAY: bad date");
    return d.getUTCDate();
  },
  /**
   * VLOOKUP(needle, table, col_index, [exact_match=FALSE])
   * The fourth arg only flips between exact (FALSE/0) and approx
   * (TRUE/1, the Excel default). We default to exact because nothing
   * burns a ledger faster than a silently-wrong approximate match.
   */
  VLOOKUP: (args) => {
    if (args.length < 3) throw new FormulaError("#VALUE!", "VLOOKUP needs 3+ args");
    const needle = args[0]!.kind === "value" ? args[0]!.value : "";
    const table = args[1];
    if (table?.kind !== "range") throw new FormulaError("#VALUE!", "VLOOKUP table");
    const colArg = args[2]!.kind === "value" ? args[2]!.value : 0;
    const colIdx = Math.floor(asNumber(colArg)) - 1;
    if (colIdx < 0 || colIdx >= table.cols) return "#REF!";
    const exact =
      args[3]?.kind === "value" ? !asBool(args[3].value) : true;
    for (let r = 0; r < table.rows; r++) {
      const cell = table.values[r * table.cols] ?? "";
      const match = exact
        ? cell === needle ||
          (typeof cell !== "string" && asNumber(cell) === asNumber(needle)) ||
          String(cell) === String(needle)
        : asNumber(cell) <= asNumber(needle);
      if (match) {
        return table.values[r * table.cols + colIdx] ?? "";
      }
    }
    return "#N/A";
  },
  /**
   * INDEX(table, row, [col]) — 1-indexed in both axes. If `col` is
   * omitted and the table has more than one column, return the whole
   * row's first value (Excel falls back to the first column in that
   * case).
   */
  INDEX: (args) => {
    if (args.length < 2) throw new FormulaError("#VALUE!", "INDEX needs 2+ args");
    const table = args[0];
    if (table?.kind !== "range") throw new FormulaError("#VALUE!", "INDEX table");
    const rowArg = args[1]!.kind === "value" ? args[1]!.value : 0;
    const colArg = args[2]?.kind === "value" ? args[2].value : 1;
    const r = Math.floor(asNumber(rowArg)) - 1;
    const c = Math.floor(asNumber(colArg)) - 1;
    if (r < 0 || r >= table.rows || c < 0 || c >= table.cols) return "#REF!";
    return table.values[r * table.cols + c] ?? "";
  },
  /**
   * MATCH(needle, range, [match_type]) — defaults to exact (0); 1 is
   * "largest <= needle" (sorted ascending), -1 is "smallest >= needle"
   * (sorted descending). Returns the 1-indexed position.
   */
  MATCH: (args) => {
    if (args.length < 2) throw new FormulaError("#VALUE!", "MATCH needs 2+ args");
    const needle = args[0]!.kind === "value" ? args[0]!.value : "";
    const range = args[1];
    if (range?.kind !== "range") throw new FormulaError("#VALUE!", "MATCH range");
    const mt =
      args[2]?.kind === "value" ? Math.sign(asNumber(args[2].value)) : 0;
    for (let i = 0; i < range.values.length; i++) {
      const v = range.values[i]!;
      if (mt === 0) {
        if (v === needle || String(v) === String(needle)) return i + 1;
      } else if (mt === 1) {
        if (asNumber(v) > asNumber(needle))
          return i === 0 ? "#N/A" : i;
      } else {
        if (asNumber(v) < asNumber(needle))
          return i === 0 ? "#N/A" : i;
      }
    }
    return mt === 0 ? "#N/A" : range.values.length;
  },
  /**
   * COUNTIF(range, criteria) — criteria is a string DSL ("=", ">100",
   * "abc"). For 1:1 parallel-array semantics use SUMIF.
   */
  COUNTIF: (args) => {
    if (args.length < 2) throw new FormulaError("#VALUE!", "COUNTIF needs 2 args");
    const range = args[0];
    if (range?.kind !== "range") throw new FormulaError("#VALUE!", "COUNTIF range");
    const criteria = args[1]!.kind === "value" ? args[1]!.value : "";
    const pred = makeCriteriaPredicate(criteria);
    let n = 0;
    for (const v of range.values) if (v !== "" && pred(v)) n += 1;
    return n;
  },
  /**
   * SUMIF(range, criteria, [sum_range]). When sum_range is given, we
   * sum its parallel cells; otherwise we sum the matching cells in
   * `range` directly. If sum_range and range have different sizes we
   * align by index (Excel does the same — it doesn't require identical
   * shapes, just identical position).
   */
  SUMIF: (args) => {
    if (args.length < 2) throw new FormulaError("#VALUE!", "SUMIF needs 2+ args");
    const range = args[0];
    if (range?.kind !== "range") throw new FormulaError("#VALUE!", "SUMIF range");
    const criteria = args[1]!.kind === "value" ? args[1]!.value : "";
    const sumRange = args[2]?.kind === "range" ? args[2] : range;
    const pred = makeCriteriaPredicate(criteria);
    let total = 0;
    for (let i = 0; i < range.values.length; i++) {
      if (pred(range.values[i]!)) {
        const sv = sumRange.values[i] ?? "";
        if (sv !== "") total += asNumber(sv);
      }
    }
    return total;
  },
};

/**
 * Public list of supported function names — used by the editor for
 * autocomplete. Sorted alphabetically so the dropdown looks tidy
 * without re-sorting on every keystroke.
 */
export const FUNCTION_NAMES: string[] = Object.keys(FUNCTIONS).sort();

/**
 * Evaluate a formula string against a lookup. The leading "=" is
 * optional. Always returns a string for direct rendering. Errors are
 * returned as their sentinel value (e.g. "#DIV/0!") so the caller can
 * style them red.
 */
export function evaluate(
  raw: string,
  lookup: CellLookup,
  depth = 0,
): FormulaValue {
  if (depth > CIRCULAR_GUARD) throw new FormulaError("#CIRCULAR!");
  const expr = raw.startsWith("=") ? raw.slice(1).trim() : raw.trim();
  if (!expr) return "";
  try {
    const toks = tokenise(expr);
    const node = new Parser(toks).parse();
    return evalNode(node, lookup, depth);
  } catch (e) {
    if (e instanceof FormulaError) return e.sentinel;
    return "#ERROR!";
  }
}

/** Format an evaluator result for display in the cell. */
export function formatResult(v: FormulaValue): string {
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "#VALUE!";
    // Up to 10 significant digits, drop trailing zeros — feels Excel-ish
    // without locking to a fixed precision.
    if (Number.isInteger(v)) return String(v);
    return Number(v.toFixed(10)).toString();
  }
  if (typeof v === "boolean") return v ? "WAHR" : "FALSCH";
  return String(v);
}

/**
 * Convenience for renderers: takes the raw cell content and returns
 * { display, isFormula, isError } so the UI can colour error cells
 * and show formula-ish styling.
 */
export function renderCell(
  raw: string,
  lookup: CellLookup,
): { display: string; isFormula: boolean; isError: boolean } {
  if (raw == null || raw === "") return { display: "", isFormula: false, isError: false };
  if (!raw.startsWith("=")) return { display: raw, isFormula: false, isError: false };
  const v = evaluate(raw, lookup);
  const display = formatResult(v);
  const isError = typeof display === "string" && /^#[A-Z!?\/]+!?$/.test(display);
  return { display, isFormula: true, isError };
}
