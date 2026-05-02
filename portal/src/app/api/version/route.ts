// =============================================================================
// /api/version — build & runtime fingerprint
//
// Tells you "is the box actually running the code I think it is?". Useful
// during deploys, smoke-checks, and when comparing the running portal to
// a developer's local checkout.
//
// Response shape:
//   {
//     "name": "portal",
//     "version": "0.1.0",
//     "git": { "sha": "<full or short>", "ref": "main" },
//     "buildTime": "2026-05-02T03:17:42Z",
//     "node": "v20.x",
//     "uptimeSec": 1234.56,
//     "ts": "<now>"
//   }
//
// Sources:
//   - PORTAL_VERSION  (deploy script writes this)
//   - PORTAL_GIT_SHA  (deploy script writes this)
//   - PORTAL_BUILD_TIME (deploy script writes this)
// Falls back to "unknown" when not set so /api/version never errors.
//
// This endpoint is intentionally PUBLIC — the data it exposes is the same
// info you'd get by inspecting the standalone build artifact. Nothing
// secret here. If you'd rather gate it, wrap with the same Bearer check as
// /api/metrics.
// =============================================================================

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STARTED_AT_MS = Date.now();

export async function GET() {
  const body = {
    name: "portal",
    version: process.env.PORTAL_VERSION ?? "0.1.0",
    git: {
      sha: process.env.PORTAL_GIT_SHA ?? "unknown",
      ref: process.env.PORTAL_GIT_REF ?? "unknown",
    },
    buildTime: process.env.PORTAL_BUILD_TIME ?? "unknown",
    node: process.version,
    uptimeSec: Number(((Date.now() - STARTED_AT_MS) / 1000).toFixed(2)),
    ts: new Date().toISOString(),
  };
  return NextResponse.json(body, {
    headers: {
      // Always-fresh; the response is cheap and the data does change after a deploy.
      "Cache-Control": "no-store",
    },
  });
}
