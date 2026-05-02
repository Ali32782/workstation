import { expect, test } from "@playwright/test";

/**
 * Hitting `/` while unauthenticated must funnel into the login flow.
 * proxy.ts (formerly middleware.ts) issues a 307 to /login with the
 * original path stashed in `?callbackUrl=...` so the post-login bounce
 * lands the user back where they tried to go.
 *
 * If this regresses (e.g. someone forgets to whitelist a public path
 * and the bounce becomes circular, or NextAuth gets misconfigured),
 * the entire portal is effectively unreachable. This is the cheapest
 * possible canary for that class of break.
 */
test("/ redirects to /login with callbackUrl", async ({ request }) => {
  const res = await request.get("/", {
    maxRedirects: 0,
    timeout: 10_000,
  });

  expect(
    [301, 302, 303, 307, 308],
    `/ should issue a redirect, got ${res.status()}`,
  ).toContain(res.status());

  const location = res.headers()["location"];
  expect(location, "redirect must include a Location header").toBeTruthy();
  expect(location, "should redirect into /login").toContain("/login");
  expect(location, "callbackUrl should be preserved for post-login bounce").toContain("callbackUrl=");
});
