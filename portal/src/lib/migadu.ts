// Migadu Admin API client.
// Docs: https://www.migadu.com/api/
//
// Auth is HTTP Basic with the admin user's email + an API key generated in
// the Migadu admin panel. Keys are domain-scoped (one per managed domain),
// so we fall back to a single global key — which works if the admin owns
// all domains.
//
// Required env vars:
//   MIGADU_ADMIN_USER  e.g. ali.peters@kineo.swiss
//   MIGADU_API_KEY     long random string
//
// All functions degrade gracefully: if creds are missing they return
// `{ ok: false, skipped: true, reason }` so the onboarding flow can continue
// and the UI can surface a "manual mailbox setup needed" hint.

import "server-only";

const BASE = "https://api.migadu.com/v1";
const ADMIN_USER = process.env.MIGADU_ADMIN_USER ?? "";
const API_KEY = process.env.MIGADU_API_KEY ?? "";

export type MigaduResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; status: number; reason: string };

function authHeader(): string {
  const raw = `${ADMIN_USER}:${API_KEY}`;
  return "Basic " + Buffer.from(raw).toString("base64");
}

function configured(): boolean {
  return Boolean(ADMIN_USER && API_KEY);
}

async function call<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<MigaduResult<T>> {
  if (!configured()) {
    return {
      ok: false,
      skipped: true,
      reason: "Migadu API nicht konfiguriert (MIGADU_ADMIN_USER / MIGADU_API_KEY).",
    };
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: authHeader(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    return {
      ok: false,
      skipped: false,
      status: res.status,
      reason: (await res.text()) || res.statusText,
    };
  }
  // DELETE returns 204
  if (res.status === 204) return { ok: true, data: undefined as T };
  return { ok: true, data: (await res.json()) as T };
}

export type MigaduMailbox = {
  local_part: string;
  domain_name: string;
  address: string;
  name: string;
  is_internal?: boolean;
  may_send?: boolean;
  may_receive?: boolean;
  may_access_imap?: boolean;
  may_access_pop3?: boolean;
  may_access_managesieve?: boolean;
};

export function isMigaduConfigured(): boolean {
  return configured();
}

export async function listMailboxes(domain: string): Promise<MigaduResult<{ mailboxes: MigaduMailbox[] }>> {
  return call<{ mailboxes: MigaduMailbox[] }>(
    "GET",
    `/domains/${encodeURIComponent(domain)}/mailboxes`,
  );
}

export type CreateMailboxInput = {
  domain: string;
  localPart: string;
  name: string;
  password: string;
};

export async function createMailbox(
  input: CreateMailboxInput,
): Promise<MigaduResult<MigaduMailbox>> {
  return call<MigaduMailbox>(
    "POST",
    `/domains/${encodeURIComponent(input.domain)}/mailboxes`,
    {
      local_part: input.localPart,
      name: input.name,
      password: input.password,
      is_internal: false,
      may_send: true,
      may_receive: true,
      may_access_imap: true,
      may_access_pop3: false,
      may_access_managesieve: true,
    },
  );
}

export async function deleteMailbox(
  domain: string,
  localPart: string,
): Promise<MigaduResult<unknown>> {
  return call(
    "DELETE",
    `/domains/${encodeURIComponent(domain)}/mailboxes/${encodeURIComponent(localPart)}`,
  );
}
