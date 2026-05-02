import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for the read-only smoke suite.
 *
 * Scope: post-deploy "is the portal alive and serving the right shape" probes
 * against a deployed environment. We do NOT log in, we do NOT mutate any
 * state, we do NOT touch Twenty CRM / SnappyMail / Plane. Anything that
 * needs a real session lives in a separate (yet-to-be-written) e2e suite
 * that runs against a local docker stack with seeded test data.
 *
 * Default base URL is production; override with PORTAL_E2E_BASE_URL when
 * running against staging or a local `npm run start` instance.
 */
const baseURL = process.env.PORTAL_E2E_BASE_URL ?? "https://app.kineo360.work";

export default defineConfig({
  testDir: "./tests/smoke",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  timeout: 15_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL,
    /**
     * Don't follow redirects automatically when the test cares about the
     * status code. Individual specs opt back in via `request` overrides
     * when they want the final response. The browser-driven specs (login
     * form rendering) get redirects naturally.
     */
    extraHTTPHeaders: {
      "x-smoke-test": "1",
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ignoreHTTPSErrors: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
