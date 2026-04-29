import "server-only";

import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Operator notes + light-weight schedule hints for the scraper (Wave 1.12).
 * A real cron still lives on the host; this stores human-readable intent.
 */

export type ScraperScheduleFile = {
  version: 1;
  updatedAt: string;
  /** Free-form notes, e.g. "Physio ZH Mo+Do 06:00 UTC" */
  notes: string;
  /** Optional per-profile hints (hours between runs, canton focus). */
  profileHints: Record<string, { intervalHours?: number; note?: string }>;
};

function dataDir(): string {
  return process.env.PORTAL_DATA_DIR?.trim() || "/data";
}

function storePath(): string {
  return path.join(dataDir(), "scraper-schedule.json");
}

let cache: { mtimeMs: number; data: ScraperScheduleFile } | null = null;

function empty(): ScraperScheduleFile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    notes: "",
    profileHints: {},
  };
}

export async function readScraperSchedule(): Promise<ScraperScheduleFile> {
  const file = storePath();
  try {
    const stat = await fs.stat(file);
    if (cache && cache.mtimeMs === stat.mtimeMs) {
      return cache.data;
    }
    const buf = await fs.readFile(file, "utf-8");
    const parsed = JSON.parse(buf) as Partial<ScraperScheduleFile>;
    const data: ScraperScheduleFile = {
      version: 1,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      notes: typeof parsed.notes === "string" ? parsed.notes : "",
      profileHints:
        parsed.profileHints && typeof parsed.profileHints === "object"
          ? (parsed.profileHints as ScraperScheduleFile["profileHints"])
          : {},
    };
    cache = { mtimeMs: stat.mtimeMs, data };
    return data;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      const z = empty();
      cache = { mtimeMs: 0, data: z };
      return z;
    }
    console.error("[scraper-schedule-store] read failed:", err);
    return empty();
  }
}

export async function writeScraperSchedule(
  data: ScraperScheduleFile,
): Promise<void> {
  const file = storePath();
  const dir = path.dirname(file);
  await fs.mkdir(dir, { recursive: true });
  const next: ScraperScheduleFile = {
    ...data,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
  await fs.rename(tmp, file);
  cache = null;
}
