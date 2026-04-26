import "server-only";

/**
 * Workspace-aware group membership check.
 *
 * Returns true if the user's group paths grant access via any of the
 * configured workspace prefixes. Each prefix is normalised so that:
 *
 *   • a top-level membership (e.g. `/corehub`) matches a prefix `/corehub`
 *     OR `/corehub/`
 *   • a sub-group membership (e.g. `/corehub/dev-ops`) matches the same
 *     prefix
 *   • we never match across workspace boundaries (e.g. `/corehub-foo`
 *     does NOT match `/corehub`).
 *
 * `prefixes` accepts the `*_ALLOWED_GROUPS` env values directly: a comma list
 * of either `/kineo`, `/kineo/`, or even legacy `kineo-staff`. Trailing
 * slashes are stripped before comparison.
 */
export function isMemberOfAnyAllowedGroup(
  groupPaths: readonly string[],
  prefixes: readonly string[],
): boolean {
  const norm = prefixes
    .map((p) => p.trim().toLowerCase().replace(/\/+$/, ""))
    .filter(Boolean);
  return groupPaths.some((g) => {
    const lg = g.toLowerCase();
    return norm.some((p) => {
      if (!p.startsWith("/")) {
        // legacy/substring style (e.g. "kineo-staff")
        return lg.includes(p);
      }
      return lg === p || lg.startsWith(p + "/");
    });
  });
}

/**
 * Per-workspace gate: is the user authorised for the *specific* tenant
 * `workspace` (e.g. "kineo")?  True if the user is in `/workspace` itself
 * or any sub-group below it.
 */
export function userHasWorkspaceAccess(
  workspace: string,
  groupPaths: readonly string[],
  isAdmin = false,
): boolean {
  if (isAdmin) return true;
  const ws = workspace.toLowerCase();
  return groupPaths.some((g) => {
    const lg = g.toLowerCase();
    return lg === `/${ws}` || lg.startsWith(`/${ws}/`);
  });
}

/**
 * Parse a comma-separated env value into a deduped list of usernames
 * (lowercased, trimmed).  Used for `PORTAL_ADMIN_USERNAMES` and friends.
 */
export function parseUsernameList(value: string | undefined, fallback: string): string[] {
  return (value ?? fallback)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
