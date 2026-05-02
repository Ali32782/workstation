import { expect, test } from "@playwright/test";

/**
 * /api/version is the build/runtime fingerprint — git sha, build time,
 * node version. Used by ops to confirm "the deploy I just pushed is the
 * one running" without SSH'ing into the container.
 *
 * We require the endpoint to respond 200 with a JSON body, but stay
 * loose on the exact field set: as long as at least one of the typical
 * fingerprint keys is present, the deploy is considered identifiable.
 */
test("/api/version returns 200 with a build fingerprint", async ({ request }) => {
  const res = await request.get("/api/version", { timeout: 10_000 });

  expect(res.status(), "version endpoint should respond 200").toBe(200);

  const body = await res.json();
  expect(body, "version body should be an object").toEqual(expect.any(Object));

  const fingerprintKeys = ["sha", "commit", "build", "version", "buildTime", "buildDate", "node"];
  const hasFingerprint = fingerprintKeys.some((k) => k in body);
  expect(
    hasFingerprint,
    `version body should expose at least one of: ${fingerprintKeys.join(", ")}. Got: ${JSON.stringify(body)}`,
  ).toBe(true);
});
