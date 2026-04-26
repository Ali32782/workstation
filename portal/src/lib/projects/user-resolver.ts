import "server-only";
import { listWorkspaceMembers } from "./plane";
import type { WorkspaceMember } from "./types";

/**
 * Resolve the current portal user (identified by email) to their Plane
 * workspace-member id. Plane's API uses opaque uuids everywhere, so anything
 * the portal does on behalf of a user (assign, comment author, ...) needs
 * this mapping.
 *
 * The Plane workspace-member listing is small (tens to a few hundred entries
 * even in larger orgs), so we cache the entire member list per workspace
 * for `MEMBER_TTL_MS`. A workspace-level cache is intentionally coarse — if
 * a member is added, the worst case is a one-minute lag before the portal
 * sees them.
 */

const MEMBER_TTL_MS = 60_000;

type CacheEntry = { members: WorkspaceMember[]; fetchedAt: number };
const memberCache = new Map<string, CacheEntry>();

async function getMembersCached(workspaceSlug: string): Promise<WorkspaceMember[]> {
  const hit = memberCache.get(workspaceSlug);
  if (hit && Date.now() - hit.fetchedAt < MEMBER_TTL_MS) {
    return hit.members;
  }
  const members = await listWorkspaceMembers(workspaceSlug);
  memberCache.set(workspaceSlug, { members, fetchedAt: Date.now() });
  return members;
}

export async function resolvePlaneMember(
  workspaceSlug: string,
  email: string,
): Promise<WorkspaceMember | null> {
  const lower = email.toLowerCase().trim();
  const members = await getMembersCached(workspaceSlug);
  return members.find((m) => m.email.toLowerCase() === lower) ?? null;
}

/** Lookup helper used to render assignee chips in the UI. Map id → member. */
export async function memberMap(
  workspaceSlug: string,
): Promise<Map<string, WorkspaceMember>> {
  const members = await getMembersCached(workspaceSlug);
  return new Map(members.map((m) => [m.id, m]));
}
