import "server-only";
import { promises as fs } from "fs";
import path from "path";

/**
 * Append-only audit log foundation.
 *
 * We log meaningful mutations (CRM patches, deletes, Mautic pushes, AI
 * calls, mail-sends, …) to a JSONL file under /data/audit so we can
 * answer "wer hat wann was geändert?" without spinning up an extra
 * database. JSONL is intentional: it's append-friendly, survives
 * partial writes, and `jq` makes it queryable in production.
 *
 * Storage: `process.env.AUDIT_LOG_DIR` (default `/data/audit`). The
 * portal Docker volume already mounts `/data` so files persist across
 * deployments. Rotation happens daily — files are named
 * `audit-YYYY-MM-DD.jsonl`. There's no automatic cleanup yet; in Welle
 * 7's RBAC pass we'll add a retention setting.
 *
 * Privacy: payloads are caller-supplied JSON; the caller is responsible
 * for redacting sensitive values (auth tokens, raw credentials) before
 * logging. Email addresses + names are deliberately *kept* — they're
 * the most useful audit-trail signal for support questions.
 */

const DEFAULT_DIR = "/data/audit";

export type AuditEntry = {
  ts: string;
  kind: string;
  actorEmail?: string | null;
  actorName?: string | null;
  workspace?: string | null;
  /** Stable resource identifier, e.g. `crm.company.<id>`. */
  resource?: string | null;
  /** Free-form action verb, e.g. `update`, `delete`, `push_to_mautic`. */
  action: string;
  /** Caller-supplied details. Keep small and JSON-serialisable. */
  details?: unknown;
};

let cachedDir: string | null = null;
async function getDir(): Promise<string> {
  if (cachedDir) return cachedDir;
  const dir = process.env.AUDIT_LOG_DIR ?? DEFAULT_DIR;
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // Directory creation can fail in read-only test environments;
    // fall back to /tmp so the write call below still succeeds.
    const tmp = path.join("/tmp", "audit");
    await fs.mkdir(tmp, { recursive: true }).catch(() => {});
    cachedDir = tmp;
    return tmp;
  }
  cachedDir = dir;
  return dir;
}

function fileNameFor(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `audit-${y}-${m}-${d}.jsonl`;
}

/**
 * Append a single audit entry. Errors are swallowed — audit-write
 * failure must never break the user's request — but they're logged to
 * stderr so SRE can spot a broken volume mount.
 */
export async function audit(entry: Omit<AuditEntry, "ts">): Promise<void> {
  try {
    const dir = await getDir();
    const file = path.join(dir, fileNameFor(new Date()));
    const full: AuditEntry = {
      ts: new Date().toISOString(),
      ...entry,
    };
    await fs.appendFile(file, JSON.stringify(full) + "\n", { encoding: "utf-8" });
  } catch (e) {
    console.warn("[audit] write failed:", e instanceof Error ? e.message : e);
  }
}

/**
 * Read the most recent N entries (default 200). For the dashboard
 * Audit-Log viewer; never use this on hot paths.
 */
export async function readRecent(limit = 200): Promise<AuditEntry[]> {
  try {
    const dir = await getDir();
    const today = fileNameFor(new Date());
    // Read today first, then yesterday, until we have `limit` entries.
    const out: AuditEntry[] = [];
    let date = new Date();
    for (let i = 0; i < 7 && out.length < limit; i++) {
      const file = path.join(dir, fileNameFor(date));
      try {
        const raw = await fs.readFile(file, "utf-8");
        const lines = raw.trim().split("\n").reverse();
        for (const line of lines) {
          if (!line) continue;
          try {
            out.push(JSON.parse(line) as AuditEntry);
            if (out.length >= limit) break;
          } catch {
            // Skip malformed lines without aborting.
          }
        }
      } catch {
        // File for that day might not exist — that's fine, just keep going.
      }
      void today;
      date = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    }
    return out;
  } catch (e) {
    console.warn("[audit] read failed:", e instanceof Error ? e.message : e);
    return [];
  }
}
