import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isAuthed = !!req.auth;
  const isLoginRoute = nextUrl.pathname === "/login" || nextUrl.pathname.startsWith("/api/auth");

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
