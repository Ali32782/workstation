import "server-only";
import crypto from "crypto";

/**
 * Deterministically derive a per-user password for an external app that
 * doesn't speak OIDC, so the portal can sign the user in transparently
 * via a bridge endpoint.
 *
 * Properties:
 *   - the same email always yields the same password (idempotent provisioning)
 *   - different apps for the same user get different passwords (no shared secret)
 *   - random-looking but always satisfies common policies
 *     (mixed case, digits, special char, ≥ 12 chars).
 *
 * Security model:
 *   - the secret never leaves the portal — Migadu / SnappyMail / Plane only
 *     ever see the derived password, not the input.
 *   - if the secret leaks, all derived passwords must be rotated. Schedule
 *     a rotation: change the env var, then re-run provisioning to update
 *     downstream apps via their admin APIs.
 */

const SECRET = process.env.DERIVED_PASSWORD_SECRET ?? "";

function ensureSecret(): string {
  if (!SECRET || SECRET.length < 16) {
    throw new Error(
      "DERIVED_PASSWORD_SECRET is not set or too short (need ≥16 chars).",
    );
  }
  return SECRET;
}

/**
 * Derive a deterministic password.
 *
 * @param namespace e.g. "mail", "plane", "twenty" — keeps app passwords disjoint.
 * @param email     the user's primary email (case-insensitive).
 */
export function derivePassword(namespace: string, email: string): string {
  const mac = crypto
    .createHmac("sha256", ensureSecret())
    .update(`${namespace}:${email.toLowerCase().trim()}`)
    .digest("base64url");
  // Format: A!a + 28 base64url chars + #9 → 32 chars total, satisfies any
  // reasonable password policy (uppercase, lowercase, digit, special).
  return `A!a${mac.slice(0, 28)}#9`;
}

/**
 * Backwards-compat shim used by lib/plane.ts.
 * Existing Plane accounts were created with the old `Plane!` prefix —
 * we keep that to avoid breaking already-provisioned users. New apps
 * should use `derivePassword("appname", email)` instead.
 */
export function derivePlanePasswordLegacy(email: string): string {
  const legacySecret = process.env.PLANE_BRIDGE_PASSWORD_SECRET ?? "";
  if (!legacySecret) throw new Error("PLANE_BRIDGE_PASSWORD_SECRET is not set");
  const mac = crypto
    .createHmac("sha256", legacySecret)
    .update(email.toLowerCase().trim())
    .digest("base64url");
  return `Plane!${mac.slice(0, 30)}_K9`;
}
