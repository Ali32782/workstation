import "server-only";
import crypto from "crypto";

const PLANE_BASE_URL = process.env.PLANE_BASE_URL ?? "https://plane.kineo360.work";
const ADMIN_TOKEN = process.env.PLANE_BRIDGE_API_TOKEN ?? "";
const PASSWORD_SECRET = process.env.PLANE_BRIDGE_PASSWORD_SECRET ?? "";

/** Map of corehub workspace id → plane workspace slug. Plane has its own slug
 *  namespace; we mirror corehub IDs 1:1 for now. */
export const PLANE_WORKSPACE_SLUG_BY_CORE: Record<string, string> = {
  corehub: "corehub",
  medtheris: "medtheris",
  kineo: "kineo",
};

export type PlaneWorkspaceMember = {
  id: string;
  email: string;
  display_name?: string;
  first_name?: string;
  last_name?: string;
  role: number;
};

/**
 * Deterministically derive the user's Plane password from their email.
 *
 * Plane has no SSO on the Community Edition, so we control the password
 * ourselves: the portal generates it via HMAC and uses it programmatically
 * (the user never types it). Falling back to the user-visible "forgot
 * password" / magic-link flow always works because SMTP is configured.
 */
export function derivePlanePassword(email: string): string {
  if (!PASSWORD_SECRET) {
    throw new Error("PLANE_BRIDGE_PASSWORD_SECRET is not set");
  }
  // Plane requires len >= 8, mixed letters, digits, and special chars; we
  // build a 32-char base64-ish string and prepend a known suffix to satisfy
  // every reasonable password policy without leaking secret material.
  const mac = crypto
    .createHmac("sha256", PASSWORD_SECRET)
    .update(email.toLowerCase().trim())
    .digest("base64url");
  return `Plane!${mac.slice(0, 30)}_K9`;
}

async function planeFetch(path: string, init?: RequestInit): Promise<Response> {
  if (!ADMIN_TOKEN) throw new Error("PLANE_BRIDGE_API_TOKEN is not set");
  const headers = new Headers(init?.headers);
  headers.set("X-API-Key", ADMIN_TOKEN);
  if (init?.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(`${PLANE_BASE_URL}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

/** Look up workspace members; returns the membership for `email` if any. */
export async function findWorkspaceMember(
  workspaceSlug: string,
  email: string,
): Promise<PlaneWorkspaceMember | null> {
  const res = await planeFetch(`/api/v1/workspaces/${workspaceSlug}/members/`);
  if (!res.ok) {
    throw new Error(
      `Plane: list members failed (${res.status}) for workspace ${workspaceSlug}`,
    );
  }
  const data = (await res.json()) as { results?: PlaneWorkspaceMember[] } | PlaneWorkspaceMember[];
  const list = Array.isArray(data) ? data : (data.results ?? []);
  const lower = email.toLowerCase();
  return list.find((m) => m.email?.toLowerCase() === lower) ?? null;
}

/** Invite a user to a workspace. Plane will auto-add the user if they exist
 *  by email; if not, it issues an email invite (but our bridge will create
 *  the account itself first via the public sign-up flow). */
export async function inviteToWorkspace(
  workspaceSlug: string,
  email: string,
  role: number = 15,
): Promise<void> {
  const res = await planeFetch(
    `/api/v1/workspaces/${workspaceSlug}/invitations/`,
    {
      method: "POST",
      body: JSON.stringify({
        email: email.toLowerCase(),
        role,
      }),
    },
  );
  // 201 = created; 200 = already invited; 400 sometimes means "already a member" or duplicate invite
  if (!res.ok && res.status !== 400) {
    const text = await res.text();
    throw new Error(
      `Plane: invite to ${workspaceSlug} for ${email} failed (${res.status}): ${text.slice(0, 200)}`,
    );
  }
}

/** Ensure the user is a member of the workspace; if not, send invite. */
export async function ensureWorkspaceMembership(
  workspaceSlug: string,
  email: string,
): Promise<{ alreadyMember: boolean }> {
  const existing = await findWorkspaceMember(workspaceSlug, email);
  if (existing) return { alreadyMember: true };
  await inviteToWorkspace(workspaceSlug, email);
  return { alreadyMember: false };
}

/**
 * Resolve which Plane workspace the given keycloak group paths grant
 * access to. Currently we mirror /corehub → corehub, /medtheris → medtheris,
 * /kineo → kineo.
 */
export function planeWorkspaceForGroups(
  preferredCoreWorkspace: string | undefined,
  groupPaths: string[],
): string | null {
  // Prefer the workspace the user is currently in if they're entitled.
  const slug = preferredCoreWorkspace
    ? PLANE_WORKSPACE_SLUG_BY_CORE[preferredCoreWorkspace]
    : undefined;
  if (slug) {
    const allowed = groupPaths.some(
      (g) => g === `/${preferredCoreWorkspace}` || g.startsWith(`/${preferredCoreWorkspace}/`),
    );
    if (allowed) return slug;
  }
  // Otherwise pick the first matching one.
  for (const [coreId, planeSlug] of Object.entries(PLANE_WORKSPACE_SLUG_BY_CORE)) {
    const allowed = groupPaths.some(
      (g) => g === `/${coreId}` || g.startsWith(`/${coreId}/`),
    );
    if (allowed) return planeSlug;
  }
  return null;
}

export const PLANE_PUBLIC_BASE = PLANE_BASE_URL;
