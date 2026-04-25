// Keycloak Admin REST client — server-side only.
// Uses the master-realm `admin-cli` client with the master admin's password
// grant. Token is cached in-memory per process.
//
// Required env vars:
//   KEYCLOAK_ADMIN_BASE      e.g. https://auth.kineo360.work
//   KEYCLOAK_ADMIN_USER      e.g. ali
//   KEYCLOAK_ADMIN_PASSWORD  the master admin password

import "server-only";

const BASE = process.env.KEYCLOAK_ADMIN_BASE ?? "";
const ADMIN_USER = process.env.KEYCLOAK_ADMIN_USER ?? "";
const ADMIN_PASSWORD = process.env.KEYCLOAK_ADMIN_PASSWORD ?? "";

type CachedToken = { token: string; expiresAt: number };
let cached: CachedToken | null = null;

async function getToken(): Promise<string> {
  if (!BASE || !ADMIN_USER || !ADMIN_PASSWORD) {
    throw new Error(
      "Keycloak admin not configured (KEYCLOAK_ADMIN_BASE / _USER / _PASSWORD)",
    );
  }
  const now = Date.now();
  if (cached && cached.expiresAt > now + 30_000) return cached.token;

  const body = new URLSearchParams({
    grant_type: "password",
    client_id: "admin-cli",
    username: ADMIN_USER,
    password: ADMIN_PASSWORD,
  });
  const res = await fetch(
    `${BASE}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
      cache: "no-store",
    },
  );
  if (!res.ok) {
    throw new Error(`Keycloak token fetch failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cached = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cached.token;
}

async function kcFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  return fetch(`${BASE}/admin${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    cache: "no-store",
  });
}

export type KcUser = {
  id: string;
  username: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  enabled: boolean;
  emailVerified?: boolean;
  createdTimestamp?: number;
  attributes?: Record<string, string[]>;
};

export type KcRealm = {
  id: string;
  realm: string;
  displayName?: string;
  enabled: boolean;
};

export async function listRealms(): Promise<KcRealm[]> {
  const res = await kcFetch("/realms?briefRepresentation=true");
  if (!res.ok) throw new Error(`listRealms ${res.status}`);
  return res.json();
}

export async function listUsers(realm: string): Promise<KcUser[]> {
  const res = await kcFetch(`/realms/${encodeURIComponent(realm)}/users?max=200`);
  if (!res.ok) throw new Error(`listUsers(${realm}) ${res.status}`);
  return res.json();
}

export async function findUserByUsername(
  realm: string,
  username: string,
): Promise<KcUser | null> {
  const res = await kcFetch(
    `/realms/${encodeURIComponent(realm)}/users?username=${encodeURIComponent(username)}&exact=true`,
  );
  if (!res.ok) throw new Error(`findUser(${realm}/${username}) ${res.status}`);
  const arr = (await res.json()) as KcUser[];
  return arr[0] ?? null;
}

export type CreateUserInput = {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  temporaryPassword: string;
  requireResetAndOtp?: boolean;
};

export async function createUser(
  realm: string,
  input: CreateUserInput,
): Promise<string> {
  const requiredActions = input.requireResetAndOtp
    ? ["UPDATE_PASSWORD", "CONFIGURE_TOTP"]
    : [];
  const res = await kcFetch(`/realms/${encodeURIComponent(realm)}/users`, {
    method: "POST",
    body: JSON.stringify({
      username: input.username,
      email: input.email,
      firstName: input.firstName,
      lastName: input.lastName,
      enabled: true,
      emailVerified: true,
      requiredActions,
      credentials: [
        {
          type: "password",
          value: input.temporaryPassword,
          temporary: input.requireResetAndOtp ?? true,
        },
      ],
    }),
  });
  if (res.status === 409) {
    throw new Error(`User '${input.username}' existiert bereits in Realm '${realm}'.`);
  }
  if (!res.ok) {
    throw new Error(`createUser(${realm}/${input.username}) ${res.status} ${await res.text()}`);
  }
  // Keycloak returns Location: /admin/realms/<r>/users/<id>
  const location = res.headers.get("location") ?? "";
  const id = location.split("/").pop() ?? "";
  return id;
}

export async function updateUser(
  realm: string,
  userId: string,
  patch: Partial<{
    firstName: string;
    lastName: string;
    email: string;
    enabled: boolean;
    emailVerified: boolean;
  }>,
): Promise<void> {
  const res = await kcFetch(
    `/realms/${encodeURIComponent(realm)}/users/${userId}`,
    { method: "PUT", body: JSON.stringify(patch) },
  );
  if (!res.ok) {
    throw new Error(`updateUser(${realm}/${userId}) ${res.status} ${await res.text()}`);
  }
}

export async function setUserEnabled(
  realm: string,
  userId: string,
  enabled: boolean,
): Promise<void> {
  await updateUser(realm, userId, { enabled });
}

export async function deleteUser(realm: string, userId: string): Promise<void> {
  const res = await kcFetch(
    `/realms/${encodeURIComponent(realm)}/users/${userId}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(`deleteUser(${realm}/${userId}) ${res.status}`);
  }
}

export async function resetPassword(
  realm: string,
  userId: string,
  newPassword: string,
  temporary = true,
): Promise<void> {
  const res = await kcFetch(
    `/realms/${encodeURIComponent(realm)}/users/${userId}/reset-password`,
    {
      method: "PUT",
      body: JSON.stringify({
        type: "password",
        value: newPassword,
        temporary,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`resetPassword(${realm}/${userId}) ${res.status}`);
  }
}

// -------------------- Groups --------------------

export type KcGroup = {
  id: string;
  name: string;
  path: string;
  subGroupCount?: number;
  subGroups?: KcGroup[];
};

/**
 * Recursively walks the group tree by querying /children for each group, since
 * Keycloak's brief representation omits subGroups by default.
 */
export async function listGroupsDeep(realm: string): Promise<KcGroup[]> {
  const top = await kcFetch(`/realms/${encodeURIComponent(realm)}/groups?max=200`);
  if (!top.ok) throw new Error(`listGroups(${realm}) ${top.status}`);
  const roots = (await top.json()) as KcGroup[];
  const expand = async (g: KcGroup): Promise<KcGroup> => {
    if (!g.subGroupCount) return { ...g, subGroups: [] };
    const r = await kcFetch(
      `/realms/${encodeURIComponent(realm)}/groups/${g.id}/children?max=200`,
    );
    if (!r.ok) return { ...g, subGroups: [] };
    const kids = (await r.json()) as KcGroup[];
    const expanded = await Promise.all(kids.map(expand));
    return { ...g, subGroups: expanded };
  };
  return Promise.all(roots.map(expand));
}

export async function findGroupByPath(
  realm: string,
  path: string,
): Promise<KcGroup | null> {
  const tree = await listGroupsDeep(realm);
  const parts = path.replace(/^\/+/, "").split("/");
  let cur: KcGroup[] | undefined = tree;
  let found: KcGroup | null = null;
  for (const part of parts) {
    if (!cur) return null;
    found = cur.find((g) => g.name === part) ?? null;
    if (!found) return null;
    cur = found.subGroups;
  }
  return found;
}

export async function getUserGroups(
  realm: string,
  userId: string,
): Promise<KcGroup[]> {
  const res = await kcFetch(
    `/realms/${encodeURIComponent(realm)}/users/${userId}/groups`,
  );
  if (!res.ok) throw new Error(`getUserGroups(${realm}/${userId}) ${res.status}`);
  return res.json();
}

export async function addUserToGroup(
  realm: string,
  userId: string,
  groupId: string,
): Promise<void> {
  const res = await kcFetch(
    `/realms/${encodeURIComponent(realm)}/users/${userId}/groups/${groupId}`,
    { method: "PUT" },
  );
  if (!res.ok) {
    throw new Error(
      `addUserToGroup(${realm}/${userId}→${groupId}) ${res.status}`,
    );
  }
}

export async function removeUserFromGroup(
  realm: string,
  userId: string,
  groupId: string,
): Promise<void> {
  const res = await kcFetch(
    `/realms/${encodeURIComponent(realm)}/users/${userId}/groups/${groupId}`,
    { method: "DELETE" },
  );
  if (!res.ok && res.status !== 404) {
    throw new Error(
      `removeUserFromGroup(${realm}/${userId}↛${groupId}) ${res.status}`,
    );
  }
}
