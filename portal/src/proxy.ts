import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Public routes that bypass the auth-redirect entirely. Anything under
 * `/p/...` is a customer/visitor surface that authenticates via its own
 * mechanism (signed magic-link token, no session at all, …) and must
 * not bounce through `/login`.
 */
const PUBLIC_PREFIXES = ["/p/", "/api/health"];

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth;
  const isLoginRoute = nextUrl.pathname === "/login" || nextUrl.pathname.startsWith("/api/auth");
  const isPublic = PUBLIC_PREFIXES.some((p) =>
    nextUrl.pathname === p.replace(/\/$/, "") || nextUrl.pathname.startsWith(p),
  );

  if (isPublic) {
    return NextResponse.next();
  }

  if (isLoginRoute) {
    if (isAuthed && nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/corehub/dashboard", nextUrl));
    }
    return NextResponse.next();
  }

  if (!isAuthed) {
    const loginUrl = new URL("/login", nextUrl);
    loginUrl.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|branding/).*)"],
};
