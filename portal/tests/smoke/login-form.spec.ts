import { expect, test } from "@playwright/test";

/**
 * /login must render the login surface (200, HTML), and that surface
 * must offer at least one auth path. We accept either:
 *
 *  - the "Sign in with Keycloak" SSO button (current production shape), OR
 *  - the username/password form (fallback / staging without SSO wired)
 *
 * Both are valid live states. What is NOT valid is /login serving an
 * empty page or 5xx — both indicate NextAuth or Keycloak is broken.
 */
test("/login renders an auth surface", async ({ page }) => {
  const response = await page.goto("/login", { timeout: 15_000 });

  expect(response, "page.goto should return a response").not.toBeNull();
  expect(response!.status(), "/login should respond 200").toBe(200);

  // Wait until something interactive on the login page is visible.
  // The selector list is intentionally permissive so future redesigns
  // don't break this smoke test on cosmetic changes.
  const loginAffordance = page.locator(
    [
      'button:has-text("Keycloak")',
      'button:has-text("Anmelden")',
      'button:has-text("Sign in")',
      'button:has-text("Login")',
      'a[href*="/api/auth/signin"]',
      'input[name="email"]',
      'input[name="username"]',
      'input[type="password"]',
    ].join(", "),
  );

  await expect(
    loginAffordance.first(),
    "/login must offer at least one sign-in affordance",
  ).toBeVisible({ timeout: 8_000 });
});
