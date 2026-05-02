import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public smoke / LB probe — no auth. Use with `scripts/smoke-portal.sh`.
 *
 * Modes:
 *   GET /api/health             → { ok: true, service: "portal", ts }
 *   GET /api/health?deep=1      → also probes Keycloak's /realms/main
 *                                  endpoint (~30 ms latency budget) and
 *                                  reports whether SSO is reachable from
 *                                  the portal container. Useful in CI to
 *                                  detect "Keycloak down but portal up"
 *                                  faster than waiting for users to fail.
 *
 * Why not always probe? A 200 from the public LB should not depend on
 * downstream services — otherwise a Keycloak hiccup takes the whole
 * portal out of the LB pool.
 */

type DeepCheck = { ok: boolean; status?: number; ms?: number; err?: string };

async function probe(url: string, timeoutMs: number): Promise<DeepCheck> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: ctrl.signal,
      cache: "no-store",
    });
    return { ok: res.status >= 200 && res.status < 500, status: res.status, ms: Date.now() - start };
  } catch (e) {
    return { ok: false, ms: Date.now() - start, err: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get("deep") === "1";

  const body: Record<string, unknown> = {
    ok: true,
    service: "portal",
    ts: new Date().toISOString(),
  };

  if (deep) {
    const kcInternal = process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:8080";
    const realm = process.env.KEYCLOAK_REALM ?? "main";
    const checks: Record<string, DeepCheck> = {
      keycloak: await probe(`${kcInternal}/realms/${realm}`, 1500),
    };
    body.deep = checks;
    body.ok = Object.values(checks).every((c) => c.ok);
  }

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
  });
}
