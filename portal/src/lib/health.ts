import "server-only";

import type { HealthSummary } from "@/components/Sidebar";

const STATUS_PAGE_BASE = "https://status.medtheris.kineo360.work";
const STATUS_PAGE_SLUG = process.env.UPTIME_KUMA_STATUS_SLUG ?? "kineo360";

type HeartbeatList = Record<string, Array<{ status: 0 | 1 | 2 | 3 }>>;
type HeartbeatPayload = { heartbeatList?: HeartbeatList };

/**
 * Fetch the Uptime Kuma public status page and reduce it to a small summary
 * we can render in the sidebar. Returns `undefined` if the fetch fails or
 * the status page slug is not configured / not yet published — the UI then
 * shows a neutral "Status unbekannt" badge.
 *
 * Revalidates every 30s so we don't hammer Uptime Kuma on every page nav.
 */
export async function fetchHealthSummary(): Promise<HealthSummary | undefined> {
  try {
    const url = `${STATUS_PAGE_BASE}/api/status-page/heartbeat/${STATUS_PAGE_SLUG}`;
    const res = await fetch(url, {
      next: { revalidate: 30 },
      headers: { accept: "application/json" },
    });
    if (!res.ok) return undefined;

    const data = (await res.json()) as HeartbeatPayload;
    const list = data.heartbeatList ?? {};

    let up = 0;
    let down = 0;
    let total = 0;
    for (const monitorId of Object.keys(list)) {
      const beats = list[monitorId];
      const last = beats?.[beats.length - 1];
      if (!last) continue;
      total += 1;
      // status: 0 = down, 1 = up, 2 = pending, 3 = maintenance
      if (last.status === 1 || last.status === 3) up += 1;
      else if (last.status === 0) down += 1;
      else up += 1; // pending counts as healthy until proven otherwise
    }

    if (total === 0) return undefined;

    return {
      total,
      up,
      down,
      fetchedAt: new Date().toISOString(),
      url: `${STATUS_PAGE_BASE}/status/${STATUS_PAGE_SLUG}`,
    };
  } catch {
    return undefined;
  }
}
