import "server-only";

/**
 * Shared fetch helper for the portal's native app integrations
 * (Plane / Twenty / Zammad / Gitea).
 *
 * The same pattern as `lib/cloud/webdav.ts`: try the internal Docker DNS
 * name first (no proxy hop, no TLS handshake), then fall back to the public
 * hostname when the container DNS isn't reachable. This makes both local
 * development (where only the public URL works) and the production stack
 * (where the internal name is fastest) work without any conditional code.
 *
 * Errors are normalised to `AppApiError` with status, body, and the URL we
 * actually tried — that single source of truth dramatically simplifies API
 * route error handling and surfaces useful debug info in the browser.
 */

export type AppOrigins = {
  /** Internal docker DNS, e.g. "http://twenty:3000". May be omitted. */
  internal?: string;
  /** Public origin, e.g. "https://crm.kineo360.work". Required as fallback. */
  public: string;
};

export class AppApiError extends Error {
  constructor(
    public readonly app: string,
    public readonly status: number,
    public readonly url: string,
    public readonly body: string,
  ) {
    super(`${app}: HTTP ${status} on ${url} — ${body.slice(0, 240)}`);
    this.name = "AppApiError";
  }
}

export type AppFetchInit = Omit<RequestInit, "body"> & {
  body?: BodyInit | null;
  /** JSON shorthand: stringified + content-type set automatically. */
  json?: unknown;
  /** Header overrides applied after json/auth defaults. */
  headers?: HeadersInit;
};

/**
 * Build a fetcher bound to one app's origins + auth token. Auth is applied
 * via a callback so per-request headers (e.g. `Sudo`, `X-On-Behalf-Of`)
 * compose cleanly on top of the static auth header.
 */
export function createAppFetch(opts: {
  app: string;
  origins: AppOrigins;
  /**
   * Returns the headers required to authenticate the request. Called per
   * request so callers can rotate / refresh tokens transparently.
   */
  authHeaders: () => HeadersInit;
}): (path: string, init?: AppFetchInit) => Promise<Response> {
  const { app, origins, authHeaders } = opts;

  return async function fetchOnce(
    path: string,
    init: AppFetchInit = {},
  ): Promise<Response> {
    const headers = new Headers(authHeaders());
    if (init.json !== undefined) {
      headers.set("content-type", "application/json");
    }
    const overrides = new Headers(init.headers);
    overrides.forEach((v, k) => headers.set(k, v));

    const body =
      init.json !== undefined ? JSON.stringify(init.json) : init.body ?? null;

    const tryOnce = async (origin: string): Promise<Response> => {
      const url = origin.replace(/\/+$/, "") + (path.startsWith("/") ? path : `/${path}`);
      return fetch(url, {
        ...init,
        headers,
        body,
        cache: "no-store",
      });
    };

    if (origins.internal) {
      const r = await tryOnce(origins.internal).catch(() => null);
      if (r) return r;
    }
    return tryOnce(origins.public);
  };
}

/**
 * Convenience wrapper that throws `AppApiError` on non-2xx, parses JSON,
 * and returns a typed result. Use for any "must succeed" call where 4xx/5xx
 * means we should bail out.
 */
export async function fetchJson<T>(
  fetchFn: (path: string, init?: AppFetchInit) => Promise<Response>,
  app: string,
  path: string,
  init?: AppFetchInit,
): Promise<T> {
  const r = await fetchFn(path, init);
  if (!r.ok) {
    const body = await r.text().catch(() => "");
    throw new AppApiError(app, r.status, path, body);
  }
  if (r.status === 204) return undefined as T;
  const text = await r.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppApiError(app, r.status, path, `non-JSON body: ${text.slice(0, 240)}`);
  }
}
