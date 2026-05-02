import { expect, test } from "@playwright/test";

/**
 * /p/helpdesk/<token> is the customer-facing surface that bypasses the
 * auth-redirect (see PUBLIC_PREFIXES in proxy.ts). The two security
 * properties this smoke encodes:
 *
 *   1. Public bypass works: a bogus token must NOT redirect through /login.
 *      If proxy.ts ever forgets the /p/ prefix, every customer link
 *      breaks at once — this is the cheapest way to catch that.
 *
 *   2. Bogus tokens don't leak ticket data: the page may render with
 *      HTTP 200 (the page.tsx renders an `<ExpiredOrInvalid>` error
 *      component for invalid claims, which is UX-correct — endusers get
 *      a friendly explanation rather than a raw 4xx), but the body must
 *      visibly say "Link ungültig" / "abgelaufen". A 4xx is also
 *      acceptable in case the page contract evolves.
 *
 * What is NOT tested: the happy path with a real token. That requires
 * minting a signed token via lib/helpdesk/portal-token, which lives in
 * the deferred e2e suite.
 */
test("public helpdesk route rejects bogus tokens without leaking data", async ({ page, request }) => {
  // First, the bare HTTP shape: must not redirect into /login.
  const headRes = await request.get("/p/helpdesk/this-is-not-a-real-token-and-must-be-rejected", {
    maxRedirects: 0,
    timeout: 10_000,
  });

  expect(
    headRes.headers()["location"] ?? "",
    "public helpdesk route must not redirect into /login",
  ).not.toContain("/login");

  const status = headRes.status();
  expect(
    [200, 400, 401, 403, 404, 410],
    `bogus token should yield 200 (with error UI) or 4xx, got ${status}`,
  ).toContain(status);

  // If the server chose the friendly 200 + error-UI path (current
  // production shape), the rendered page must visibly call out that
  // the link is invalid. Otherwise the 4xx already signals rejection.
  if (status === 200) {
    await page.goto("/p/helpdesk/this-is-not-a-real-token-and-must-be-rejected", {
      timeout: 15_000,
    });
    const body = page.locator("body");
    await expect(
      body,
      "200 response on a bogus token must visibly say the link is invalid/expired",
    ).toContainText(/ungültig|abgelaufen|invalid|expired|nicht erreichbar/i);
  }
});
