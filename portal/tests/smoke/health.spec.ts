import { expect, test } from "@playwright/test";

/**
 * /api/health is the canonical "is the next.js app process alive AND can it
 * reach its dependencies" probe. We accept either a 200 with a JSON body
 * containing `ok: true` (current shape) or — for forward compat — a 200
 * with any JSON-parseable body. The smoke suite deliberately doesn't
 * pin the exact shape because that field set is allowed to grow.
 */
test("/api/health returns 200 with JSON", async ({ request }) => {
  const res = await request.get("/api/health", { timeout: 10_000 });

  expect(res.status(), "health endpoint should respond 200").toBe(200);

  const contentType = res.headers()["content-type"] ?? "";
  expect(contentType, "health response should be JSON").toContain("application/json");

  const body = await res.json();
  expect(body, "health body should be an object").toEqual(expect.any(Object));

  // If `ok` is present, it must be true. Older / newer shapes that omit it
  // entirely don't fail this smoke — that's an explicit non-pin.
  if ("ok" in body) {
    expect(body.ok, "health.ok must be true when present").toBe(true);
  }
});
