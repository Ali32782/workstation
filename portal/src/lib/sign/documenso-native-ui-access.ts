import "server-only";

import { parseUsernameList } from "@/lib/access-helpers";
import { isAdminUsername } from "@/lib/admin-allowlist";

/**
 * Who may see CoreLab UI links into the Documenso web app (document list,
 * native editor, team settings). Requires **both**:
 *   • portal admin (`PORTAL_ADMIN_USERNAMES`), and
 *   • membership in this comma-separated list (`SIGN_DOCUMENSO_NATIVE_USERNAMES`,
 *     default `ali`).
 *
 * Everyone else uses CoreLab Sign only (incl. portal-private list filtering).
 * This does not change Documenso RBAC: still configure teams there so only
 * trusted accounts see HR documents if they open Documenso directly.
 */
const NATIVE_UI_USERS = parseUsernameList(
  process.env.SIGN_DOCUMENSO_NATIVE_USERNAMES,
  "ali",
);

export function userMayOpenDocumensoNativeUi(
  username: string | undefined | null,
): boolean {
  if (!username) return false;
  const u = username.trim().toLowerCase();
  if (!isAdminUsername(u)) return false;
  return NATIVE_UI_USERS.includes(u);
}
