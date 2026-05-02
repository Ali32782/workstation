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

async function probe(
  url: string,
  timeoutMs: number,
  init?: RequestInit,
): Promise<DeepCheck> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const res = await fetch(url, {
      method: "GET",
      ...init,
      signal: ctrl.signal,
      cache: "no-store",
    });
    return {
      ok: res.status >= 200 && res.status < 500,
      status: res.status,
      ms: Date.now() - start,
    };
  } catch (e) {
    return {
      ok: false,
      ms: Date.now() - start,
      err: e instanceof Error ? e.message : String(e),
    };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Resolve the set of downstream probes from env. Each probe is best-effort —
 * if the env var isn't set we skip it rather than reporting a false failure.
 * Order matters only for readable JSON output.
 */
function buildDeepProbes(): Array<{ name: string; run: () => Promise<DeepCheck> }> {
  const probes: Array<{ name: string; run: () => Promise<DeepCheck> }> = [];

  // Keycloak — known-good URL, default works in compose network.
  const kcInternal = process.env.KEYCLOAK_INTERNAL_URL ?? "http://keycloak:8080";
  const realm = process.env.KEYCLOAK_REALM ?? "main";
  probes.push({
    name: "keycloak",
    run: () => probe(`${kcInternal}/realms/${realm}`, 1500),
  });

  // Twenty CRM — GraphQL endpoint accepts a tiny introspection-free query.
  // We just check that the server replies; auth isn't required for the /healthz
  // route in modern Twenty builds.
  const twentyInternal = process.env.TWENTY_INTERNAL_URL;
  if (twentyInternal) {
    probes.push({
      name: "twenty",
      run: () => probe(`${twentyInternal}/healthz`, 1500),
    });
  }

  // Plane — workspace API healthcheck endpoint.
  const planeInternal = process.env.PLANE_INTERNAL_URL;
  if (planeInternal) {
    probes.push({
      name: "plane",
      run: () => probe(`${planeInternal}/api/instances/`, 2000),
    });
  }

  // Mautic — public version endpoint, no auth.
  const mauticInternal = process.env.MAUTIC_INTERNAL_URL;
  if (mauticInternal) {
    probes.push({
      name: "mautic",
      run: () => probe(`${mauticInternal}/health`, 2000),
    });
  }

  // Documenso — root doc serves a 200 when up; we don't go deeper since the
  // API requires auth.
  const documensoInternal = process.env.DOCUMENSO_INTERNAL_URL;
  if (documensoInternal) {
    probes.push({
      name: "documenso",
      run: () => probe(`${documensoInternal}/api/health`, 1500),
    });
  }

  // Rocket.Chat info endpoint.
  const rcInternal = process.env.ROCKETCHAT_INTERNAL_URL;
  if (rcInternal) {
    probes.push({
      name: "rocketchat",
      run: () => probe(`${rcInternal}/api/info`, 1500),
    });
  }

  return probes;
}

export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.get("deep") === "1";

  const body: Record<string, unknown> = {
    ok: true,
    service: "portal",
    ts: new Date().toISOString(),
  };

  if (deep) {
    const probes = buildDeepProbes();
    // Run probes in parallel — deep check should never serialise the whole
    // stack; total wall-time is bounded by the slowest probe.
    const results = await Promise.all(
      probes.map(async (p) => [p.name, await p.run()] as const),
    );
    const checks: Record<string, DeepCheck> = {};
    for (const [name, res] of results) {
      checks[name] = res;
    }
    body.deep = checks;
    body.ok = Object.values(checks).every((c) => c.ok);
  }

  return NextResponse.json(body, {
    status: body.ok ? 200 : 503,
  });
}
