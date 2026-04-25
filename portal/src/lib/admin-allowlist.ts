import "server-only";

import { auth } from "@/lib/auth";

const ADMIN_USERNAMES = (process.env.PORTAL_ADMIN_USERNAMES ?? "ali,johannes")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

export type AdminGuardResult =
  | { ok: true; username: string }
  | { ok: false; reason: "unauthenticated" | "forbidden"; username?: string };

export async function requireAdmin(): Promise<AdminGuardResult> {
  const session = await auth();
  const username = session?.user?.username?.toLowerCase();
  if (!username) return { ok: false, reason: "unauthenticated" };
  if (!ADMIN_USERNAMES.includes(username)) {
    return { ok: false, reason: "forbidden", username };
  }
  return { ok: true, username };
}

export function isAdminUsername(username: string | undefined | null): boolean {
  if (!username) return false;
  return ADMIN_USERNAMES.includes(username.toLowerCase());
}

export function adminAllowlist(): string[] {
  return [...ADMIN_USERNAMES];
}
