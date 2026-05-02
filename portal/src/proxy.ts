// =============================================================================
// proxy.ts — Edge gate combining auth-redirect + request-id propagation.
//
// Next 16 renamed `middleware.ts` to `proxy.ts` and refuses to build when both
// exist. We had two concerns previously split across the two files:
//
//   - auth: gate non-public routes behind a NextAuth session, redirect to
//     /login while preserving the original callback url.
//   - observability: stamp every request with an `x-request-id` (reuse the
//     incoming one if a load balancer already attached one) so server logs
//     correlate end-to-end and a user copying the header from dev-tools can
//     grep production logs directly.
//
// Both run on the Edge runtime, both want a single response object, so they
// belong in the same gate. Order matters: we resolve the request id first
// (cheap, no I/O), then let auth() decide on redirect vs. pass-through, and
// finally stamp the id back onto whatever response auth chose.
// =============================================================================

import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

const REQ_ID_HEADER = "x-request-id";

/**
 * Public routes that bypass the auth-redirect entirely. Anything under
 * `/p/...` is a customer/visitor surface that authenticates via its own
 * mechanism (signed magic-link token, no session at all, …) and must
 * not bounce through `/login`. `/api/health` stays open so uptime probes
 * don't pin a synthetic session.
 */
const PUBLIC_PREFIXES = ["/p/", "/api/health"];

/**
 * Generate a short request id. crypto.randomUUID is available in Edge runtime
 * since Next 13; we trim to 16 hex chars — long enough to be unique within a
 * 5-minute trace window, short enough to read in a log line.
 */
function newRequestId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export default auth((req) => {
  const { nextUrl } = req;
  const reqId = req.headers.get(REQ_ID_HEADER)?.trim() || newRequestId();

  const isAuthed = !!req.auth;
  const isLoginRoute =
    nextUrl.pathname === "/login" || nextUrl.pathname.startsWith("/api/auth");
  const isPublic = PUBLIC_PREFIXES.some(
    (p) => nextUrl.pathname === p.replace(/\/$/, "") || nextUrl.pathname.startsWith(p),
  );

  /**
   * Helper: forward the request with the request-id header propagated to the
   * downstream handler, AND echo it back on the outgoing response. Two
   * separate header collections — request headers are read-only.
   */
  const forwardWithId = () => {
    const fwd = new Headers(req.headers);
    fwd.set(REQ_ID_HEADER, reqId);
    const res = NextResponse.next({ request: { headers: fwd } });
    res.headers.set(REQ_ID_HEADER, reqId);
    return res;
  };

  const redirectWithId = (url: URL) => {
    const res = NextResponse.redirect(url);
    res.headers.set(REQ_ID_HEADER, reqId);
    return res;
  };

  if (isPublic) {
    return forwardWithId();
  }

  if (isLoginRoute) {
    if (isAuthed && nextUrl.pathname === "/login") {
      return redirectWithId(new URL("/corehub/dashboard", nextUrl));
    }
    return forwardWithId();
  }

  if (!isAuthed) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return redirectWithId(loginUrl);
  }

  return forwardWithId();
});

export const config = {
  /**
   * Match everything except Next internals and static assets. Combines the
   * coverage of the old middleware (which excluded image extensions) with the
   * old proxy matcher (which excluded the /branding/ folder).
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|robots\\.txt|sitemap\\.xml|branding/|.*\\.(?:png|jpg|jpeg|svg|webp|avif|ico)).*)",
  ],
};
