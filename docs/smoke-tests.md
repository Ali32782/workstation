# Smoke-Tests (Portal)

Read-only Playwright suite that probes the deployed portal from the
outside. The intent is **not** to be a thorough end-to-end test — it's a
60-second canary that catches the kinds of break that turn the entire
portal unreachable in production. Anything that needs a logged-in
session belongs in the (still-to-be-built) e2e suite that runs against
a local docker stack with seeded test data.

## What it covers

| Spec                         | What breaks if it fails                                           |
| ---------------------------- | ----------------------------------------------------------------- |
| `health.spec.ts`             | Next.js process is dead, or its health probe broke (DB lost, …). |
| `version.spec.ts`            | Build/deploy fingerprint endpoint is gone — ops can't tell what's running. |
| `root-redirect.spec.ts`      | proxy.ts auth-redirect regressed; portal is effectively unreachable. |
| `login-form.spec.ts`         | NextAuth / Keycloak misconfigured; users can't sign in.          |
| `public-helpdesk.spec.ts`    | Customer-facing magic-link routes either redirect through /login (= public bypass broken, every customer link breaks) or leak ticket data (= validation broken). |

## What it deliberately does NOT cover

- Logging in as `ali` or anyone else.
- Creating a CRM lead / sending a mail / booking a slot.
- Anything that mutates Twenty CRM, SnappyMail, Plane, Documenso, or Mautic.
- Browser visual diffs.

These belong in the e2e suite. The smoke suite is intentionally
"is the front door open" only — narrow, fast, no flake from upstream
SaaS hiccups.

## Running locally

```bash
cd portal
npm run smoke:install      # one-time: Chromium 96 MB
npm run smoke              # against production (default)
```

Override the target with the `PORTAL_E2E_BASE_URL` env var:

```bash
PORTAL_E2E_BASE_URL=http://localhost:3000 npm run smoke
PORTAL_E2E_BASE_URL=https://staging.kineo360.work npm run smoke
```

`npm run smoke:headed` drops the browser into a visible window so you
can watch what the test sees.

## CI

- `.github/workflows/smoke.yml` runs:
  - on every push to `main` (catch a broken deploy)
  - on every PR (gate before merging)
  - every 30 min via cron (catch upstream breakage between deploys —
    Nginx Proxy Manager config wipes, Keycloak realm corruption,
    cert-renewal hiccups all manifest as smoke-suite regressions).

- Override the production URL for a one-off run:
  GitHub → Actions → smoke → "Run workflow" → enter `base_url`.

- For a permanent staging URL, set the **repository variable**
  `PORTAL_E2E_BASE_URL` (Settings → Secrets and variables → Actions →
  Variables) — it overrides the production default for cron runs.

## When a smoke fails

1. Check the artifact attached to the failing GH Actions job —
   `smoke-trace-N` contains the Playwright trace + screenshot. Open
   it locally with `npx playwright show-trace path/to/trace.zip`.
2. Reproduce: `PORTAL_E2E_BASE_URL=https://app.kineo360.work npm run smoke`.
3. If the page genuinely changed (e.g. login button was relabelled),
   widen the selector in the spec — don't disable the test.
4. If a real production issue: fix it, re-deploy, re-run the smoke.
   Most-recent example: `/api/version` was hidden behind the auth
   redirect because the route wasn't in `PUBLIC_PREFIXES` in
   `portal/src/proxy.ts`. The smoke suite caught that on day one.

## Adding a new smoke

Two rules:

- **No mutations.** GET only. If you need to POST, you're writing an
  e2e test, not a smoke.
- **Tolerant assertions.** Pin the security property, not the cosmetic.
  If the next i18n redesign rewords "Anmelden" to "Sign in", the smoke
  must still pass.
