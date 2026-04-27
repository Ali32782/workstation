import "server-only";
import type {
  IssueLabel,
  IssuePriority,
  IssueState,
  WorkspaceMember,
} from "./types";
import { parseCsv, detectDelimiter } from "@/lib/csv/parse";

/**
 * CSV import helpers for the Projects ("Plane") app.
 *
 * Supports both **Jira** CSV exports (the column names Atlassian's "Export
 * → CSV" produces) and **Plane**-style headers, plus a couple of common
 * variations seen in third-party tools (Linear, Trello, Asana). The shape
 * of the resulting `IssueDraft` mirrors what Plane accepts on POST so the
 * caller can hand drafts straight to `createIssue` without translation.
 *
 * Why server-side instead of in the browser?
 *   - We need access to the workspace's Plane states/labels/members to
 *     resolve human-readable strings ("Done", "Bug", "j.fischer") into
 *     Plane UUIDs. That mapping lives behind the API anyway.
 *   - CSVs from Jira can easily be 5-10MB; running the parser server-side
 *     avoids ballooning the client bundle and lets us stream progress.
 */

// CSV parser + delimiter detection live in `@/lib/csv/parse` so that
// CRM, Helpdesk, etc. can share them without duplicating ~50 lines.
export { parseCsv, detectDelimiter };

/* ─── Column mapping (Jira/Linear/Plane → Plane) ──────────────────── */

/** Canonical fields the importer recognises. */
export type CanonicalField =
  | "name"
  | "description"
  | "state"
  | "priority"
  | "assignee"
  | "labels"
  | "startDate"
  | "targetDate"
  | "estimatePoint"
  | "ignore";

/**
 * Default column → field mapping for the most common CSV exports out
 * there. Lower-cased header names matched case-insensitively. The list
 * is order-irrelevant since we look up by header.
 */
const HEADER_ALIASES: Record<string, CanonicalField> = {
  // Jira
  summary: "name",
  description: "description",
  "issue type": "ignore",
  status: "state",
  priority: "priority",
  assignee: "assignee",
  reporter: "ignore",
  labels: "labels",
  "due date": "targetDate",
  "start date": "startDate",
  "story points": "estimatePoint",
  "story point estimate": "estimatePoint",
  // Linear-ish
  title: "name",
  state: "state",
  estimate: "estimatePoint",
  // Plane / generic
  name: "name",
  assignees: "assignee",
  "target date": "targetDate",
  "estimate point": "estimatePoint",
  // Trello / Asana
  card: "name",
  task: "name",
};

export function defaultMapping(headers: string[]): Record<number, CanonicalField> {
  const m: Record<number, CanonicalField> = {};
  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    m[i] = HEADER_ALIASES[key] ?? "ignore";
  });
  // If nothing got mapped to "name" yet, try the first non-empty column as
  // a heuristic — every issue must have a title.
  if (!Object.values(m).includes("name") && headers.length > 0) {
    const firstNonEmpty = headers.findIndex((h) => h.trim().length > 0);
    if (firstNonEmpty >= 0) m[firstNonEmpty] = "name";
  }
  return m;
}

/* ─── Value resolvers ─────────────────────────────────────────────── */

const PRIORITY_ALIASES: Record<string, IssuePriority> = {
  highest: "urgent",
  urgent: "urgent",
  blocker: "urgent",
  critical: "urgent",
  high: "high",
  medium: "medium",
  normal: "medium",
  low: "low",
  lowest: "low",
  trivial: "low",
  none: "none",
  "": "none",
  "no priority": "none",
};

export function resolvePriority(value: string | undefined): IssuePriority {
  const v = (value ?? "").trim().toLowerCase();
  return PRIORITY_ALIASES[v] ?? "none";
}

/**
 * Maps a free-text status (e.g. "In Progress", "Erledigt", "Done") to a
 * Plane state UUID by name match (case-insensitive). Falls back to the
 * "backlog" state if no match exists, so an import never silently drops
 * issues. Returns null when the project has no states at all.
 */
export function resolveState(
  value: string | undefined,
  states: IssueState[],
): string | null {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) {
    return states.find((s) => s.group === "backlog")?.id ?? states[0]?.id ?? null;
  }
  const exact = states.find((s) => s.name.toLowerCase() === v);
  if (exact) return exact.id;
  // Common Jira → Plane status synonyms.
  const syn: Record<string, string[]> = {
    todo: ["backlog", "unstarted"],
    "to do": ["backlog", "unstarted"],
    open: ["backlog", "unstarted"],
    "in progress": ["started"],
    "in review": ["started"],
    done: ["completed"],
    closed: ["completed"],
    erledigt: ["completed"],
    canceled: ["cancelled"],
    cancelled: ["cancelled"],
  };
  const groups = syn[v];
  if (groups) {
    const hit = states.find((s) => groups.includes(s.group));
    if (hit) return hit.id;
  }
  return states.find((s) => s.group === "backlog")?.id ?? states[0]?.id ?? null;
}

/**
 * Resolves an "Assignee" cell to a Plane member UUID. Accepts email,
 * display name, or Jira-style "John Doe (jdoe)" — picks the first match.
 * Returns `null` if the importer should leave the issue unassigned.
 */
export function resolveAssignee(
  value: string | undefined,
  members: WorkspaceMember[],
): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const lower = v.toLowerCase();
  // email match wins
  const email = members.find((m) => m.email.toLowerCase() === lower);
  if (email) return email.id;
  // try display-name exact
  const byName = members.find(
    (m) => m.displayName.toLowerCase() === lower,
  );
  if (byName) return byName.id;
  // partial match (handles "John Doe (jdoe)")
  const partial = members.find((m) =>
    lower.includes(m.email.toLowerCase()) ||
    lower.includes(m.displayName.toLowerCase()),
  );
  return partial?.id ?? null;
}

/**
 * Splits a "Labels" cell on common separators (`,`, `;`, `|`, whitespace
 * for single-token labels) and resolves each token to an existing Plane
 * label UUID. Tokens that don't match any label are returned in the
 * `unresolved` array so callers can choose to auto-create them.
 */
export function resolveLabels(
  value: string | undefined,
  labels: IssueLabel[],
): { ids: string[]; unresolved: string[] } {
  const v = (value ?? "").trim();
  if (!v) return { ids: [], unresolved: [] };
  const tokens = v
    .split(/[,;|]/)
    .flatMap((t) => t.trim().split(/\s+/))
    .map((t) => t.trim())
    .filter(Boolean);
  const ids: string[] = [];
  const unresolved: string[] = [];
  for (const t of tokens) {
    const hit = labels.find((l) => l.name.toLowerCase() === t.toLowerCase());
    if (hit) ids.push(hit.id);
    else unresolved.push(t);
  }
  return { ids: Array.from(new Set(ids)), unresolved };
}

function parseEstimate(value: string | undefined): number | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  const n = Number.parseFloat(v.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function parseDate(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v) return null;
  // Accept YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY.
  const iso = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dotted = v.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dotted) return `${dotted[3]}-${dotted[2]}-${dotted[1]}`;
  const slashed = v.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (slashed) return `${slashed[3]}-${slashed[2]}-${slashed[1]}`;
  // Fallback: pass through if it's parseable
  const t = Date.parse(v);
  if (Number.isFinite(t)) return new Date(t).toISOString().slice(0, 10);
  return null;
}

/* ─── Public API ──────────────────────────────────────────────────── */

export type IssueDraft = {
  rowIndex: number;
  name: string;
  descriptionHtml?: string;
  state?: string | null;
  priority: IssuePriority;
  assignees: string[];
  labels: string[];
  targetDate?: string | null;
  startDate?: string | null;
  estimatePoint?: number | null;
  unresolvedLabels: string[];
  warnings: string[];
};

export type ImportPreview = {
  delimiter: string;
  headers: string[];
  mapping: Record<number, CanonicalField>;
  drafts: IssueDraft[];
  totals: {
    rows: number;
    valid: number;
    skipped: number;
    unmappedLabels: number;
    unresolvedAssignees: number;
  };
};

/**
 * Build the import preview from raw CSV text + optional manual mapping
 * overrides. Returned drafts are exactly the payloads the API route will
 * post to Plane (one issue per row).
 */
export function buildImportPreview(
  text: string,
  context: {
    states: IssueState[];
    labels: IssueLabel[];
    members: WorkspaceMember[];
    mappingOverride?: Record<number, CanonicalField>;
    delimiter?: string;
  },
): ImportPreview {
  const delimiter = context.delimiter ?? detectDelimiter(text);
  const rows = parseCsv(text, delimiter);
  if (rows.length === 0) {
    return {
      delimiter,
      headers: [],
      mapping: {},
      drafts: [],
      totals: {
        rows: 0,
        valid: 0,
        skipped: 0,
        unmappedLabels: 0,
        unresolvedAssignees: 0,
      },
    };
  }
  const headers = rows[0].map((h) => h.trim());
  const mapping = { ...defaultMapping(headers), ...(context.mappingOverride ?? {}) };

  const indexOf = (field: CanonicalField): number => {
    for (const [i, f] of Object.entries(mapping)) {
      if (f === field) return Number(i);
    }
    return -1;
  };

  const drafts: IssueDraft[] = [];
  let unmappedLabelsCount = 0;
  let unresolvedAssignees = 0;
  let skipped = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const get = (idx: number): string | undefined =>
      idx < 0 ? undefined : row[idx];
    const name = (get(indexOf("name")) ?? "").trim();
    const warnings: string[] = [];
    if (!name) {
      skipped++;
      continue;
    }
    const description = get(indexOf("description"))?.trim();
    const stateValue = get(indexOf("state"));
    const stateId = resolveState(stateValue, context.states);
    if (stateValue && !stateId) {
      warnings.push(`Status "${stateValue}" konnte nicht gemappt werden`);
    }

    const priority = resolvePriority(get(indexOf("priority")));
    const assigneeValue = get(indexOf("assignee"));
    const assigneeId = resolveAssignee(assigneeValue, context.members);
    const assignees = assigneeId ? [assigneeId] : [];
    if (assigneeValue && !assigneeId) {
      unresolvedAssignees++;
      warnings.push(`Assignee "${assigneeValue}" nicht gefunden`);
    }

    const { ids: labelIds, unresolved: unresolvedLabels } = resolveLabels(
      get(indexOf("labels")),
      context.labels,
    );
    if (unresolvedLabels.length > 0) {
      unmappedLabelsCount += unresolvedLabels.length;
    }

    const startDate = parseDate(get(indexOf("startDate")));
    const targetDate = parseDate(get(indexOf("targetDate")));
    const estimatePoint = parseEstimate(get(indexOf("estimatePoint")));

    drafts.push({
      rowIndex: r,
      name,
      descriptionHtml: description
        ? `<p>${description.replace(/\n/g, "<br/>")}</p>`
        : undefined,
      state: stateId,
      priority,
      assignees,
      labels: labelIds,
      startDate,
      targetDate,
      estimatePoint,
      unresolvedLabels,
      warnings,
    });
  }

  return {
    delimiter,
    headers,
    mapping,
    drafts,
    totals: {
      rows: rows.length - 1,
      valid: drafts.length,
      skipped,
      unmappedLabels: unmappedLabelsCount,
      unresolvedAssignees,
    },
  };
}
