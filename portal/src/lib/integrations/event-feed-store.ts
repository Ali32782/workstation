import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { IntegrationEventEnvelope } from "@/lib/integrations/event-feed-types";

const DEFAULT_DIR = "/data/integration-events";

let cachedDir: string | null = null;

async function getDir(): Promise<string> {
  if (cachedDir) return cachedDir;
  const base =
    process.env.PORTAL_DATA_DIR?.trim() || process.env.AUDIT_LOG_DIR?.trim();
  const dir = base
    ? path.join(base, "integration-events")
    : process.env.INTEGRATION_EVENT_LOG_DIR?.trim() || DEFAULT_DIR;
  try {
    await fs.mkdir(dir, { recursive: true });
    cachedDir = dir;
    return dir;
  } catch {
    const tmp = path.join("/tmp", "integration-events");
    await fs.mkdir(tmp, { recursive: true }).catch(() => {});
    cachedDir = tmp;
    return tmp;
  }
}

function fileNameFor(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `integration-events-${y}-${m}-${d}.jsonl`;
}

/** Persist envelope for Pulse / future Cmd+K — failures logged only. */
export async function appendIntegrationEvent(
  envelope: IntegrationEventEnvelope,
): Promise<void> {
  try {
    const dir = await getDir();
    const file = path.join(dir, fileNameFor(new Date()));
    await fs.appendFile(file, JSON.stringify(envelope) + "\n", "utf-8");
  } catch (e) {
    console.warn(
      "[integration-events] append failed:",
      e instanceof Error ? e.message : e,
    );
  }
}

/** Newest first for this workspace (tenant slug matches envelope.workspaceId). */
export async function readRecentIntegrationEvents(
  workspaceId: string,
  limit = 20,
): Promise<IntegrationEventEnvelope[]> {
  try {
    const dir = await getDir();
    const out: IntegrationEventEnvelope[] = [];
    let date = new Date();
    for (let i = 0; i < 7 && out.length < limit; i++) {
      const file = path.join(dir, fileNameFor(date));
      try {
        const raw = await fs.readFile(file, "utf-8");
        const lines = raw.trim().split("\n").filter(Boolean).reverse();
        for (const line of lines) {
          try {
            const row = JSON.parse(line) as IntegrationEventEnvelope;
            if (row.workspaceId === workspaceId) out.push(row);
            if (out.length >= limit) break;
          } catch {
            /* skip malformed */
          }
        }
      } catch {
        /* missing day file */
      }
      date = new Date(date.getTime() - 24 * 60 * 60 * 1000);
    }
    return out;
  } catch (e) {
    console.warn(
      "[integration-events] read failed:",
      e instanceof Error ? e.message : e,
    );
    return [];
  }
}
