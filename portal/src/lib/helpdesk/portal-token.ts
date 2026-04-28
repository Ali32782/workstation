import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed magic-link tokens for the public Helpdesk customer portal.
 *
 * Token layout (URL-safe base64, dot-separated):
 *
 *     payload.signature
 *
 * where `payload` = base64url(JSON({ w: workspace, t: ticketId, e: expSeconds }))
 * and `signature` = base64url(HMAC-SHA256(secret, payload)).
 *
 * The token is fully self-contained — no DB lookup needed. Revocation works
 * by rotating the secret (kicks all outstanding magic links).
 */

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

function getSecret(): string {
  const candidate =
    process.env.HELPDESK_PORTAL_SECRET ||
    process.env.AUTH_SECRET ||
    process.env.NEXTAUTH_SECRET ||
    "";
  if (!candidate) {
    throw new Error(
      "[helpdesk/portal-token] no secret configured (set HELPDESK_PORTAL_SECRET or AUTH_SECRET).",
    );
  }
  return candidate;
}

function b64urlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/u, "");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  return Buffer.from(input.replace(/-/g, "+").replace(/_/g, "/") + pad, "base64");
}

export type PortalTokenPayload = {
  workspace: string;
  ticketId: number;
  expiresAt: number; // unix seconds
};

export function signPortalToken(
  workspace: string,
  ticketId: number,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + Math.max(60, ttlSeconds);
  const payload = { w: workspace, t: ticketId, e: expiresAt };
  const payloadB64 = b64urlEncode(JSON.stringify(payload));
  const sig = createHmac("sha256", getSecret()).update(payloadB64).digest();
  return `${payloadB64}.${b64urlEncode(sig)}`;
}

export function verifyPortalToken(token: string): PortalTokenPayload | null {
  if (typeof token !== "string" || !token.includes(".")) return null;
  const [payloadB64, sigB64] = token.split(".", 2);
  if (!payloadB64 || !sigB64) return null;
  let expected: Buffer;
  try {
    expected = createHmac("sha256", getSecret()).update(payloadB64).digest();
  } catch {
    return null;
  }
  let provided: Buffer;
  try {
    provided = b64urlDecode(sigB64);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  let parsed: { w?: unknown; t?: unknown; e?: unknown };
  try {
    parsed = JSON.parse(b64urlDecode(payloadB64).toString("utf8")) as typeof parsed;
  } catch {
    return null;
  }
  const workspace = typeof parsed.w === "string" ? parsed.w : null;
  const ticketId = typeof parsed.t === "number" ? parsed.t : null;
  const expiresAt = typeof parsed.e === "number" ? parsed.e : null;
  if (!workspace || ticketId == null || expiresAt == null) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;
  return { workspace, ticketId, expiresAt };
}
