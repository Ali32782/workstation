import "server-only";

import { derivePassword } from "./derived-passwords";

const BRIDGE_INTERNAL_URL =
  process.env.SNAPPYMAIL_BRIDGE_INTERNAL_URL ?? "http://snappymail:8888/sso-bridge.php";
const BRIDGE_PUBLIC_BASE =
  process.env.SNAPPYMAIL_PUBLIC_BASE ?? "https://webmail.kineo360.work";
const BRIDGE_TOKEN = process.env.SNAPPYMAIL_BRIDGE_TOKEN ?? "";

export type SnappyMailSsoResult = {
  /** Public URL the user should be redirected to (one-shot, expires after 10 s). */
  publicRedirectUrl: string;
  /** Raw hash for diagnostics. */
  hash: string;
};

/**
 * Mint a one-shot SnappyMail SSO hash for the given mailbox using the
 * deterministic per-user mail password.
 *
 * Throws if the bridge token isn't configured or the bridge replies non-2xx.
 */
export async function createSnappyMailSso(opts: {
  email: string;
}): Promise<SnappyMailSsoResult> {
  if (!BRIDGE_TOKEN) {
    throw new Error(
      "SNAPPYMAIL_BRIDGE_TOKEN is not set on the portal — cannot mint SSO hashes.",
    );
  }
  const password = derivePassword("mail", opts.email);

  const res = await fetch(BRIDGE_INTERNAL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${BRIDGE_TOKEN}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({ email: opts.email, password }),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(
      `SnappyMail bridge replied ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  const data = (await res.json()) as { hash?: string; error?: string };
  if (!data.hash) {
    throw new Error(
      `SnappyMail bridge returned no hash: ${data.error ?? JSON.stringify(data)}`,
    );
  }
  return {
    hash: data.hash,
    publicRedirectUrl: `${BRIDGE_PUBLIC_BASE}/?Sso&hash=${encodeURIComponent(data.hash)}`,
  };
}

export const SNAPPYMAIL_PUBLIC_BASE = BRIDGE_PUBLIC_BASE;
