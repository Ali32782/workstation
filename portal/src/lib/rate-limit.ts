// =============================================================================
// rate-limit.ts — in-memory sliding-window limiter for public API endpoints
//
// Why in-memory and not Redis?
//   - The portal currently runs as a single replica behind NPM. Redis would
//     just add another moving part for limited gain.
//   - When we eventually horizontally scale, swap this module's
//     implementation for an upstash/redis variant. The public API
//     (rateLimit / rateLimitResponse) is stable and won't change.
//
// Algorithm: fixed-window with sub-bucket smoothing — for each (key, window)
// we keep a ring of timestamps trimmed by the window length on every access.
// O(n) per call, but n is bounded by the configured limit.
// =============================================================================

import { NextRequest, NextResponse } from "next/server";

type Bucket = number[]; // timestamps (ms)

const STORE = new Map<string, Bucket>();

// Light periodic cleanup so a forgotten key doesn't leak forever. Triggered
// lazily on every check (cheap walk, no setInterval / no cron).
let lastSweep = 0;
const SWEEP_INTERVAL_MS = 60_000;
function sweepIfDue(now: number, maxKeepMs: number) {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [k, ts] of STORE) {
    const filtered = ts.filter((t) => now - t <= maxKeepMs);
    if (filtered.length === 0) {
      STORE.delete(k);
    } else if (filtered.length !== ts.length) {
      STORE.set(k, filtered);
    }
  }
}

export type RateLimitOptions = {
  /** Bucket name (combined with key to scope different routes separately). */
  scope: string;
  /** Window length in milliseconds. */
  windowMs: number;
  /** Max allowed requests inside the window. */
  max: number;
};

export type RateLimitResult = {
  ok: boolean;
  remaining: number;
  resetMs: number; // ms until the oldest hit falls out of the window
  limit: number;
};

/**
 * Pure check. Returns ok=false if the caller already exceeded `max` within
 * `windowMs` — does NOT throw. The caller decides how to respond.
 *
 * `key` is whatever scopes one bucket from another (typically client IP, or
 * IP + token for tenant-scoped endpoints).
 */
export function rateLimit(key: string, opts: RateLimitOptions): RateLimitResult {
  const now = Date.now();
  sweepIfDue(now, opts.windowMs);

  const compoundKey = `${opts.scope}:${key}`;
  const ts = STORE.get(compoundKey) ?? [];
  // Drop entries that fell out of the window.
  const fresh = ts.filter((t) => now - t < opts.windowMs);

  if (fresh.length >= opts.max) {
    const oldest = fresh[0];
    const resetMs = Math.max(0, opts.windowMs - (now - oldest));
    STORE.set(compoundKey, fresh);
    return { ok: false, remaining: 0, resetMs, limit: opts.max };
  }

  fresh.push(now);
  STORE.set(compoundKey, fresh);
  return {
    ok: true,
    remaining: opts.max - fresh.length,
    resetMs: opts.windowMs,
    limit: opts.max,
  };
}

/**
 * Best-effort caller IP extraction. Trusts X-Forwarded-For when set
 * (we're always behind NPM in production), falls back to the immediate
 * connection address. Returns "unknown" only if nothing usable is present.
 */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    // First entry is the original client (NPM appends, doesn't replace).
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

/**
 * Convenience: run the check and, on overage, return a ready-to-return
 * 429 response with Retry-After + RateLimit-* headers (RFC 6585 + draft-ietf).
 * On success, returns null and the caller proceeds normally.
 *
 * Typical usage in a route handler:
 *
 *   const limited = rateLimitResponse(req, { scope: "public-lead", windowMs: 60_000, max: 5 });
 *   if (limited) return limited;
 *
 */
export function rateLimitResponse(
  req: NextRequest,
  opts: RateLimitOptions,
  keyOverride?: string,
): NextResponse | null {
  const key = keyOverride ?? clientIp(req);
  const r = rateLimit(key, opts);
  if (r.ok) return null;
  const retryAfterSec = Math.ceil(r.resetMs / 1000);
  return NextResponse.json(
    { error: "rate_limited", retryAfter: retryAfterSec },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        "RateLimit-Limit": String(r.limit),
        "RateLimit-Remaining": "0",
        "RateLimit-Reset": String(retryAfterSec),
      },
    },
  );
}
