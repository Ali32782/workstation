/**
 * Post-Keycloak-logout landing. Keycloak redirects here after its
 * end-session endpoint cleared the SSO session. We then clear NextAuth's
 * own session cookie and bounce back to /login.
 */
import "server-only";
import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  await signOut({ redirect: false });
  return NextResponse.redirect(
    new URL("/login?reset=1", process.env.AUTH_URL ?? "https://app.kineo360.work"),
  );
}
