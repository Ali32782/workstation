import "server-only";
import { derivePassword } from "@/lib/derived-passwords";
import type { CloudEntry, CloudList } from "./types";

/**
 * Nextcloud WebDAV client used by the portal's File-Station / Office-Hub.
 * Same auth model as `lib/calendar/caldav.ts` — per-user HTTP Basic with
 * `derivePassword("nextcloud", email)`. Tries the internal Docker DNS first
 * for speed, falls back to the public host.
 */

type NCInstance = {
  internalBase: string;
  publicBase: string;
};

const NEXTCLOUDS: Record<string, NCInstance> = {
  corehub: {
    internalBase: "http://nextcloud-corehub",
    publicBase: "https://files.kineo360.work",
  },
  medtheris: {
    internalBase: "http://nextcloud-medtheris",
    publicBase: "https://files.medtheris.kineo360.work",
  },
  kineo: {
    internalBase: "http://nextcloud-corehub",
    publicBase: "https://files.kineo360.work",
  },
};

function instance(workspace: string): NCInstance {
  const i = NEXTCLOUDS[workspace];
  if (!i) throw new Error(`Unknown workspace for cloud: ${workspace}`);
  return i;
}

export function getPublicCloudBase(workspace: string): string {
  return instance(workspace).publicBase;
}

function basicAuth(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

function davRoot(user: string): string {
  return `/remote.php/dav/files/${encodeURIComponent(user)}`;
}

/**
 * Per-user Nextcloud passwords for accounts that can't use the deterministic
 * `derivePassword("nextcloud", uid)` scheme — typically OIDC-backed users
 * (`backend: user_oidc`), where NC stores no local password and we therefore
 * generate an app-token via `occ user:auth-tokens:add <uid>` and pin it here.
 *
 * The override map is sourced from the `NC_APP_TOKENS_JSON` env var, e.g.
 *   NC_APP_TOKENS_JSON='{"testuser1":"abc...","oidc-user2":"xyz..."}'
 * Lookups are case-insensitive on the keycloak username; values are used
 * verbatim as Basic-Auth passwords against NC's WebDAV endpoints.
 */
const NC_APP_TOKENS: Record<string, string> = (() => {
  try {
    const raw = process.env.NC_APP_TOKENS_JSON;
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.length > 0) out[k.toLowerCase()] = v;
    }
    return out;
  } catch {
    return {};
  }
})();

function passwordFor(user: string): string {
  const override = NC_APP_TOKENS[user.toLowerCase()];
  return override ?? derivePassword("nextcloud", user);
}

function normalizePath(p: string): string {
  if (!p || p === "/") return "/";
  let out = p.replace(/\\/g, "/");
  if (!out.startsWith("/")) out = "/" + out;
  out = out.replace(/\/{2,}/g, "/");
  if (out.length > 1 && out.endsWith("/")) out = out.slice(0, -1);
  return out;
}

function encodePath(path: string): string {
  return path
    .split("/")
    .map((seg) => (seg ? encodeURIComponent(seg) : seg))
    .join("/");
}

/**
 * Process-wide cache mapping the Keycloak-style username we receive from the
 * portal session (always lowercase) to the actual case Nextcloud has stored.
 * NC retains the case the user was created with — pre-migration accounts like
 * "Ali" would otherwise re-trigger the brute-force throttle on every request.
 */
const usernameCaseCache = new Map<string, string>(); // `${ws}:${user}` -> nc username

/**
 * Try internal NC first, fall back to public origin. Auth precedence:
 *   1. NC_APP_TOKENS_JSON override (operator-pinned app-token, used for
 *      OIDC-backed users where NC has no local password).
 *   2. derivePassword("nextcloud", uid) — for legacy DB-backed accounts.
 *
 * NC's WebDAV layer (`Sabre\DAV\Auth\Backend\AbstractBasic`) only accepts
 * Basic auth — Bearer tokens from Keycloak are silently ignored. We used to
 * try Bearer first, but every miss triggered NC's brute-force throttle, so
 * the codepath was removed.
 *
 * On 401/429 the helper retries with a Capital-cased username once, since
 * pre-migration accounts were sometimes created with a capital first letter.
 * The successful casing is cached process-wide.
 */
async function nc(
  workspace: string,
  user: string,
  davPath: string,
  init: Omit<RequestInit, "body"> & {
    body?: BodyInit | null;
    rawBody?: BodyInit | Buffer | Uint8Array | null;
    accessToken?: string;
  },
): Promise<Response> {
  const inst = instance(workspace);

  const buildHeaders = (auth: string): Headers => {
    const h = new Headers(init.headers);
    h.set("Authorization", auth);
    return h;
  };

  const tryOnce = async (base: string, asUser: string, auth: string) =>
    fetch(base + davRoot(asUser) + encodePath(davPath), {
      ...init,
      headers: buildHeaders(auth),
      body: (init.rawBody ?? init.body) as BodyInit | null | undefined,
    });

  const fetchAs = async (asUser: string, auth: string): Promise<Response> => {
    const r = await tryOnce(inst.internalBase, asUser, auth).catch(() => null);
    if (r) return r;
    return tryOnce(inst.publicBase, asUser, auth);
  };

  const buildBasic = (asUser: string) => basicAuth(asUser, passwordFor(asUser));

  const cacheKey = `${workspace}:${user.toLowerCase()}`;
  const cached = usernameCaseCache.get(cacheKey);
  if (cached) return fetchAs(cached, buildBasic(cached));

  const res = await fetchAs(user, buildBasic(user));
  if (res.status !== 401 && res.status !== 429) {
    usernameCaseCache.set(cacheKey, user);
    return res;
  }
  if (/^[a-z]/.test(user)) {
    const Capital = user[0].toUpperCase() + user.slice(1);
    const r2 = await fetchAs(Capital, buildBasic(Capital));
    if (r2.status !== 401 && r2.status !== 429) {
      usernameCaseCache.set(cacheKey, Capital);
      return r2;
    }
    return r2;
  }
  return res;
}

/* --------------------------------------------------------------------- */
/* PROPFIND – directory listing                                          */
/* --------------------------------------------------------------------- */

const PROPFIND_BODY = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns" xmlns:nc="http://nextcloud.org/ns">
  <d:prop>
    <d:displayname/>
    <d:getlastmodified/>
    <d:getcontentlength/>
    <d:getcontenttype/>
    <d:resourcetype/>
    <oc:fileid/>
    <oc:size/>
  </d:prop>
</d:propfind>`;

function pickTag(xml: string, tag: string): string | null {
  const m = xml.match(new RegExp(`<[^/>]*${tag}[^>]*>([\\s\\S]*?)</[^/>]*${tag}>`));
  return m ? m[1] : null;
}

function pickAll(xml: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(`<[^/>]*${tag}[^>]*>([\\s\\S]*?)</[^/>]*${tag}>`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1]);
  return out;
}

function parseMultistatus(xml: string, userPrefixes: string[]): {
  href: string;
  isDir: boolean;
  size: number;
  mtime: string;
  ctype: string | null;
  fileId: number | null;
}[] {
  const responses = pickAll(xml, "response");
  // We try every candidate prefix (typically the lowercase keycloak username
  // and a Capitalised variant) and use whichever matches first. Calling this
  // function twice and concatenating used to produce duplicate rows whenever
  // the second pass missed the prefix and emitted the full WebDAV path
  // verbatim — Nextcloud's UI showed "Documents" twice etc. (#bug-files-dup).
  return responses.map((r) => {
    const href = decodeURIComponent((pickTag(r, "href") ?? "").trim());
    const isDir = /<[^/>]*collection\s*\/?>/.test(r);
    const length = Number((pickTag(r, "getcontentlength") ?? "0").trim() || 0);
    const mtime = (pickTag(r, "getlastmodified") ?? "").trim();
    const ctype = (pickTag(r, "getcontenttype") ?? "").trim() || null;
    const fileIdRaw = (pickTag(r, "fileid") ?? "").trim();
    const fileId = fileIdRaw ? Number(fileIdRaw) : null;
    let path = href;
    for (const userPrefix of userPrefixes) {
      const idx = path.indexOf(userPrefix);
      if (idx >= 0) {
        path = path.slice(idx + userPrefix.length);
        break;
      }
    }
    if (!path.startsWith("/")) path = "/" + path;
    return { href: path, isDir, size: length, mtime, ctype, fileId };
  });
}

export async function listDirectory(opts: {
  workspace: string;
  user: string;
  path: string;
  accessToken?: string;
}): Promise<CloudList> {
  const cwd = normalizePath(opts.path);
  const res = await nc(opts.workspace, opts.user, cwd, {
    method: "PROPFIND",
    headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
    rawBody: PROPFIND_BODY,
    accessToken: opts.accessToken,
  });
  if (res.status === 404) {
    throw new Error(`Pfad nicht gefunden: ${cwd}`);
  }
  if (!res.ok && res.status !== 207) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nextcloud PROPFIND ${res.status}: ${body.slice(0, 200)}`);
  }
  const xml = await res.text();
  const userPrefix = davRoot(opts.user);
  const userPrefixCap = davRoot(
    opts.user[0].toUpperCase() + opts.user.slice(1),
  );
  const items = parseMultistatus(xml, [userPrefix, userPrefixCap])
    // Skip the cwd entry itself.
    .filter((it) => normalizePath(it.href) !== cwd);

  const seen = new Set<string>();
  const entries: CloudEntry[] = items
    .filter((it) => {
      const p = normalizePath(it.href);
      if (seen.has(p)) return false;
      seen.add(p);
      return true;
    })
    .map((it) => {
      const p = normalizePath(it.href);
      const name = p === "/" ? "/" : p.split("/").filter(Boolean).pop() ?? "";
      return {
        path: p,
        name,
        type: it.isDir ? ("folder" as const) : ("file" as const),
        size: it.size,
        mtime: it.mtime ? new Date(it.mtime).toISOString() : new Date(0).toISOString(),
        fileId: it.fileId,
        contentType: it.ctype,
      };
    })
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

  const parent =
    cwd === "/"
      ? null
      : normalizePath(cwd.split("/").slice(0, -1).join("/") || "/");

  return { cwd, parent, entries };
}

/* --------------------------------------------------------------------- */
/* GET / PUT / MKCOL / DELETE                                            */
/* --------------------------------------------------------------------- */

export async function downloadFile(opts: {
  workspace: string;
  user: string;
  path: string;
  accessToken?: string;
}): Promise<Response> {
  return nc(opts.workspace, opts.user, normalizePath(opts.path), {
    method: "GET",
    accessToken: opts.accessToken,
  });
}

export async function uploadFile(opts: {
  workspace: string;
  user: string;
  path: string;
  body: Buffer;
  contentType?: string;
  accessToken?: string;
}): Promise<void> {
  const headers: Record<string, string> = {
    "Content-Type": opts.contentType || "application/octet-stream",
    "Content-Length": String(opts.body.length),
  };
  const res = await nc(opts.workspace, opts.user, normalizePath(opts.path), {
    method: "PUT",
    headers,
    rawBody: new Uint8Array(opts.body.buffer, opts.body.byteOffset, opts.body.byteLength),
    accessToken: opts.accessToken,
  });
  if (!res.ok && res.status !== 201 && res.status !== 204) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nextcloud PUT ${res.status}: ${body.slice(0, 200)}`);
  }
}

export async function makeCollection(opts: {
  workspace: string;
  user: string;
  path: string;
  accessToken?: string;
}): Promise<void> {
  const res = await nc(opts.workspace, opts.user, normalizePath(opts.path), {
    method: "MKCOL",
    accessToken: opts.accessToken,
  });
  if (res.status === 405) return;
  if (!res.ok && res.status !== 201) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nextcloud MKCOL ${res.status}: ${body.slice(0, 200)}`);
  }
}

/* --------------------------------------------------------------------- */
/* SEARCH – workspace-wide filename search                                */
/* --------------------------------------------------------------------- */

/**
 * Workspace-wide file search via Nextcloud's WebDAV SEARCH method.
 *
 * Uses `<d:like>` against `displayname` so we get prefix/contains
 * matches without needing the optional `fulltextsearch` app.  Search
 * is scoped to the user's WebDAV root with `infinity` depth — NC will
 * respect the user's share permissions, so we never have to filter
 * client-side for ACLs.
 *
 * SQL `LIKE` requires `%` wildcards; we wrap the user's query so
 * "report" matches "Quarterly Report Q3.xlsx" anywhere in the name.
 * The `%` and `_` characters in the input are escaped first to avoid
 * accidental wildcard expansion.
 */

export type CloudSearchHit = {
  path: string;
  name: string;
  type: "file" | "folder";
  size: number;
  mtime: string;
  contentType: string | null;
};

function escapeLike(q: string): string {
  return q.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export async function searchFiles(opts: {
  workspace: string;
  user: string;
  query: string;
  limit?: number;
  accessToken?: string;
}): Promise<CloudSearchHit[]> {
  const q = opts.query.trim();
  if (q.length < 2) return [];

  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 250);
  const inst = instance(opts.workspace);
  const literal = `%${escapeLike(q)}%`;

  // Casing fallback identical to the rest of the helpers — try lowercase
  // first, retry with Capitalised if NC throttles. We collapse both
  // attempts behind the same nc() helper by only embedding the wildcard,
  // not the user — the SEARCH body's <d:href> is rewritten per-attempt.
  const buildBody = (asUser: string) => `<?xml version="1.0" encoding="UTF-8"?>
<d:searchrequest xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:basicsearch>
    <d:select>
      <d:prop>
        <d:displayname/>
        <d:getlastmodified/>
        <d:getcontentlength/>
        <d:getcontenttype/>
        <d:resourcetype/>
      </d:prop>
    </d:select>
    <d:from>
      <d:scope>
        <d:href>/files/${escapeXml(asUser)}</d:href>
        <d:depth>infinity</d:depth>
      </d:scope>
    </d:from>
    <d:where>
      <d:like>
        <d:prop><d:displayname/></d:prop>
        <d:literal>${escapeXml(literal)}</d:literal>
      </d:like>
    </d:where>
    <d:orderby>
      <d:order>
        <d:prop><d:getlastmodified/></d:prop>
        <d:descending/>
      </d:order>
    </d:orderby>
    <d:limit><d:nresults>${limit}</d:nresults></d:limit>
  </d:basicsearch>
</d:searchrequest>`;

  // SEARCH targets the global DAV root, not the user's files endpoint.
  const fetchSearch = async (
    base: string,
    asUser: string,
  ): Promise<Response> => {
    const auth = basicAuth(asUser, passwordFor(asUser));
    const headers = new Headers({
      Authorization: auth,
      "Content-Type": "text/xml; charset=utf-8",
      Depth: "infinity",
    });
    return fetch(base + "/remote.php/dav/", {
      method: "SEARCH",
      headers,
      body: buildBody(asUser),
    });
  };

  const tryUser = async (asUser: string): Promise<Response> => {
    const r = await fetchSearch(inst.internalBase, asUser).catch(() => null);
    if (r) return r;
    return fetchSearch(inst.publicBase, asUser);
  };

  let res = await tryUser(opts.user);
  if ((res.status === 401 || res.status === 429) && /^[a-z]/.test(opts.user)) {
    const Capital = opts.user[0].toUpperCase() + opts.user.slice(1);
    res = await tryUser(Capital);
  }
  if (!res.ok && res.status !== 207) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Nextcloud SEARCH ${res.status}: ${body.slice(0, 200)}`,
    );
  }

  const xml = await res.text();
  const userPrefix = davRoot(opts.user);
  const userPrefixCap = davRoot(
    opts.user[0].toUpperCase() + opts.user.slice(1),
  );
  const items = parseMultistatus(xml, [userPrefix, userPrefixCap]);

  return items.map((it) => {
    const p = normalizePath(it.href);
    const name = p === "/" ? "/" : p.split("/").filter(Boolean).pop() ?? "";
    return {
      path: p,
      name,
      type: it.isDir ? ("folder" as const) : ("file" as const),
      size: it.size,
      mtime: it.mtime
        ? new Date(it.mtime).toISOString()
        : new Date(0).toISOString(),
      contentType: it.ctype,
    };
  });
}

export async function deletePath(opts: {
  workspace: string;
  user: string;
  path: string;
  accessToken?: string;
}): Promise<void> {
  const res = await nc(opts.workspace, opts.user, normalizePath(opts.path), {
    method: "DELETE",
    accessToken: opts.accessToken,
  });
  if (!res.ok && res.status !== 204 && res.status !== 404) {
    const body = await res.text().catch(() => "");
    throw new Error(`Nextcloud DELETE ${res.status}: ${body.slice(0, 200)}`);
  }
}
