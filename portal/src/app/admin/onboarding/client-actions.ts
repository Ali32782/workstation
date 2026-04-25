"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin-allowlist";
import { listRealms } from "@/lib/keycloak-admin";

const CLIENT_REALM_PREFIX = "practice-";

export type ClientTenant = {
  slug: string;
  realm: string;
  displayName?: string;
  filesUrl: string;
  chatUrl: string;
  authUrl: string;
};

export type ClientsSnapshot = {
  tenants: ClientTenant[];
  errors: string[];
};

export async function listClientTenants(): Promise<ClientsSnapshot> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  const errors: string[] = [];
  let tenants: ClientTenant[] = [];

  try {
    const realms = await listRealms();
    tenants = realms
      .filter((r) => r.realm.startsWith(CLIENT_REALM_PREFIX))
      .map((r) => {
        const slug = r.realm.slice(CLIENT_REALM_PREFIX.length);
        return {
          slug,
          realm: r.realm,
          displayName: r.displayName,
          filesUrl: `https://files.${slug}.kineo360.work`,
          chatUrl: `https://chat.${slug}.kineo360.work`,
          authUrl: `https://auth.kineo360.work/admin/${r.realm}/console/`,
        };
      })
      .sort((a, b) => a.slug.localeCompare(b.slug));
  } catch (e) {
    errors.push(`Realm-Liste nicht abrufbar: ${(e as Error).message}`);
  }

  return { tenants, errors };
}

export type CreateClientInput = {
  slug: string;
  displayName: string;
  adminEmail: string;
};

export type CreateClientResult = {
  ok: boolean;
  slug: string;
  message: string;
  steps: string[];
};

export async function provisionClient(
  input: CreateClientInput,
): Promise<CreateClientResult> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  const slug = input.slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,30}$/.test(slug)) {
    throw new Error(
      "Slug muss mit a-z/0-9 starten und 2-31 Zeichen lang sein (a-z 0-9 -).",
    );
  }
  if (!input.displayName.trim()) throw new Error("Name fehlt.");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.adminEmail)) {
    throw new Error("Admin-Email ungültig.");
  }

  // Check that no realm exists yet via Keycloak.
  const realms = await listRealms();
  const targetRealm = `${CLIENT_REALM_PREFIX}${slug}`;
  if (realms.some((r) => r.realm === targetRealm)) {
    throw new Error(`Realm '${targetRealm}' existiert bereits.`);
  }

  // The actual provisioning script runs on the host via SSH from a
  // controller pod. Inside this Next.js container we don't have
  // host docker access, so we surface a "not yet wired" status and
  // let the user run the command themselves until we add a runner.
  return {
    ok: false,
    slug,
    message:
      "Auto-Provisioning ist noch nicht aktiv (Portal-Container hat keinen Host-Docker-Socket). Bitte aktuell noch manuell auf dem Server:",
    steps: [
      `ssh deploy@<server>`,
      `cd /opt/corelab && ./scripts/onboard-practice.sh ${slug} "${input.displayName.replace(/"/g, '\\"')}" ${input.adminEmail}`,
      `Nach Abschluss: in dieser Liste auf "Reload" klicken — der neue Realm 'practice-${slug}' erscheint.`,
    ],
  };
}

export async function refreshClients(): Promise<void> {
  await requireAdmin();
  revalidatePath("/admin/onboarding/clients");
}
