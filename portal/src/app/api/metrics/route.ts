// =============================================================================
// /api/metrics — Prometheus exposition endpoint
//
// Protected by a shared bearer token (METRICS_TOKEN env). NEVER expose this
// without a token — counters can leak operational signals (failed-login
// counts, internal-route names) that aren't meant for the public.
//
// Scrape from your prometheus.yml:
//   scrape_configs:
//     - job_name: portal
//       authorization:
//         credentials_file: /etc/prom/portal_token
//       metrics_path: /api/metrics
//       static_configs:
//         - targets: ["portal.kineo360.work"]
//       scheme: https
// =============================================================================

import { NextRequest, NextResponse } from "next/server";
import { counters } from "@/lib/metrics";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function authorized(req: NextRequest): boolean {
  const expected = process.env.METRICS_TOKEN?.trim();
  if (!expected) return false; // refuse without an explicit token
  const auth = req.headers.get("authorization") ?? "";
  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim() === expected;
  }
  // Fallback: ?token=… for tools that can't set headers easily.
  const qs = req.nextUrl.searchParams.get("token");
  return qs === expected;
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return new NextResponse("unauthorized", { status: 401 });
  }
  const body = counters.render();
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
      // Tell every cache the body is per-request and never reusable.
      "Cache-Control": "no-store",
    },
  });
}
