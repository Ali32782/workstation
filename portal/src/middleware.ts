// =============================================================================
// middleware.ts — Request-ID propagation
//
// Runs on the Edge runtime in front of every matched request. Cheap (a single
// header set) and idempotent: if an upstream proxy already attached an
// X-Request-Id we keep it so downstream logs correlate end-to-end.
//
// We deliberately do NOT do auth, rate-limiting, or routing here. That logic
// lives in route handlers (auth via NextAuth, rate-limit via lib/rate-limit)
// and stays close to the code it protects.
//
// The matcher excludes the Next internal asset folders so we don't eat
// allocations on every static file fetch.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

const REQ_ID_HEADER = "x-request-id";

/**
 * Generate a short-ish request id. We can't import node:crypto on the edge,
 * so we use the Web Crypto UUID (available in Edge runtime) and trim to the
 * first 16 chars — long enough to be unique within a 5-min trace window,
 * short enough to read in logs.
 */
function newRequestId(): string {
  // crypto.randomUUID is available in Edge Runtime since Next 13.
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function middleware(req: NextRequest) {
  const incoming = req.headers.get(REQ_ID_HEADER);
  const reqId = incoming?.trim() || newRequestId();

  // Forward the id to the downstream handler so server-side `log.*` calls
  // can pick it up via `req.headers.get(REQ_ID_HEADER)`.
  const fwd = new Headers(req.headers);
  fwd.set(REQ_ID_HEADER, reqId);

  const res = NextResponse.next({ request: { headers: fwd } });

  // Echo the id back to the client so a user/operator copying it from a
  // browser dev-tools network tab can grep production logs directly.
  res.headers.set(REQ_ID_HEADER, reqId);
  return res;
}

export const config = {
  // Skip Next's own internals (no point tracking RSC payloads as requests),
  // skip favicon / robots / sitemap / public/.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)).*)",
  ],
};
