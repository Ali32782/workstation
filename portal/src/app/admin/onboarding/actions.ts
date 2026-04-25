"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/admin-allowlist";
import {
  addUserToGroup,
  createUser,
  deleteUser,
  findGroupByPath,
  findUserByUsername,
  getUserGroups,
  listUsers,
  removeUserFromGroup,
  resetPassword,
  setUserEnabled,
  updateUser,
} from "@/lib/keycloak-admin";
import {
  createMailbox,
  deleteMailbox,
  isMigaduConfigured,
  listMailboxes,
  type MigaduMailbox,
} from "@/lib/migadu";
import {
  REALM,
  TEAMS,
  TEAM_LIST,
  generateTempPassword,
  type TeamId,
} from "@/lib/onboarding-config";
import { derivePassword } from "@/lib/derived-passwords";

export type MemberRow = {
  username: string;
  firstName: string;
  lastName: string;
  enabled: boolean;
  primaryEmail: string;
  /** Top-level teams the user belongs to (resolved from group memberships). */
  teams: { team: TeamId; mailbox: { email: string; exists: boolean | "unknown" } }[];
  /** Full Keycloak group paths the user is a member of (incl. sub-groups). */
  groupPaths: string[];
};

export type MembersSnapshot = {
  members: MemberRow[];
  migaduConfigured: boolean;
  errors: string[];
};

function teamForGroupPath(path: string): TeamId | null {
  for (const t of TEAM_LIST) {
    if (path === t.groupPath || path.startsWith(`${t.groupPath}/`)) return t.id;
  }
  return null;
}

export async function loadMembers(): Promise<MembersSnapshot> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  const errors: string[] = [];

  let users;
  try {
    users = await listUsers(REALM);
  } catch (e) {
    return {
      members: [],
      migaduConfigured: isMigaduConfigured(),
      errors: [`Realm '${REALM}' nicht abrufbar: ${(e as Error).message}`],
    };
  }

  // Per-domain mailbox lookups (one batch per domain → reused across users).
  const mailboxesByDomain = new Map<string, MigaduMailbox[] | "error">();
  if (isMigaduConfigured()) {
    for (const t of TEAM_LIST) {
      const r = await listMailboxes(t.mailDomain);
      if (r.ok) mailboxesByDomain.set(t.mailDomain, r.data.mailboxes ?? []);
      else if (!r.skipped) {
        mailboxesByDomain.set(t.mailDomain, "error");
        errors.push(
          `Migadu ${t.mailDomain} (${r.status}): ${r.reason.slice(0, 120)}`,
        );
      }
    }
  }

  const rows: MemberRow[] = [];
  for (const u of users) {
    let groups: string[] = [];
    try {
      const gs = await getUserGroups(REALM, u.id);
      groups = gs.map((g) => g.path);
    } catch (e) {
      errors.push(`Gruppen für ${u.username} nicht abrufbar: ${(e as Error).message}`);
    }

    const teamIds = Array.from(
      new Set(
        groups
          .map(teamForGroupPath)
          .filter((t): t is TeamId => t !== null),
      ),
    );

    const teams = teamIds.map((id) => {
      const team = TEAMS[id];
      const expectedEmail = `${u.username}@${team.mailDomain}`;
      const mboxes = mailboxesByDomain.get(team.mailDomain);
      let exists: boolean | "unknown" = "unknown";
      if (Array.isArray(mboxes)) {
        exists = mboxes.some(
          (m) => m.address.toLowerCase() === expectedEmail.toLowerCase(),
        );
      }
      return { team: id, mailbox: { email: expectedEmail, exists } };
    });

    rows.push({
      username: u.username,
      firstName: u.firstName ?? "",
      lastName: u.lastName ?? "",
      enabled: u.enabled,
      primaryEmail: u.email ?? `${u.username}@${TEAMS.corehub.mailDomain}`,
      teams,
      groupPaths: groups,
    });
  }

  return {
    members: rows.sort((a, b) => a.username.localeCompare(b.username)),
    migaduConfigured: isMigaduConfigured(),
    errors,
  };
}

export type CreateMemberInput = {
  username: string;
  firstName: string;
  lastName: string;
  /** Top-level teams to assign — user is added to those Keycloak groups. */
  teams: TeamId[];
  /** Domain used for the user's primary email address. */
  primaryDomainTeam: TeamId;
  createMailboxes: boolean;
  requireResetAndOtp: boolean;
};

export type CreateMemberStep = {
  step: string;
  ok: boolean;
  detail: string;
};

export type CreateMemberResult = {
  username: string;
  primaryEmail: string;
  temporaryPassword: string;
  steps: CreateMemberStep[];
  loginUrl: string;
};

function validateUsername(u: string): void {
  if (!/^[a-z][a-z0-9._-]{1,31}$/.test(u)) {
    throw new Error(
      "Username muss klein, mit Buchstabe starten und 2-32 Zeichen lang sein (a-z, 0-9, . _ -).",
    );
  }
}

export async function createMember(
  input: CreateMemberInput,
): Promise<CreateMemberResult> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  validateUsername(input.username.trim().toLowerCase());
  if (!input.firstName.trim()) throw new Error("Vorname fehlt.");
  if (!input.lastName.trim()) throw new Error("Nachname fehlt.");
  if (input.teams.length === 0)
    throw new Error("Mindestens ein Workspace muss gewählt werden.");
  if (!input.teams.includes(input.primaryDomainTeam)) {
    throw new Error("Primäre Mail-Domain muss zu einem gewählten Workspace gehören.");
  }

  const username = input.username.trim().toLowerCase();
  const firstName = input.firstName.trim();
  const lastName = input.lastName.trim();
  const tempPassword = generateTempPassword();
  const steps: CreateMemberStep[] = [];
  const primaryDomain = TEAMS[input.primaryDomainTeam].mailDomain;
  const primaryEmail = `${username}@${primaryDomain}`;

  let userId: string;
  try {
    const existing = await findUserByUsername(REALM, username);
    if (existing) {
      userId = existing.id;
      steps.push({
        step: "Keycloak User",
        ok: true,
        detail: `existierte schon (id ${existing.id.slice(0, 8)}…) — verwende vorhandenen User`,
      });
    } else {
      userId = await createUser(REALM, {
        username,
        email: primaryEmail,
        firstName,
        lastName,
        temporaryPassword: tempPassword,
        requireResetAndOtp: input.requireResetAndOtp,
      });
      steps.push({
        step: "Keycloak User",
        ok: true,
        detail: `User angelegt (id ${userId.slice(0, 8)}…) · ${primaryEmail}`,
      });
    }
  } catch (e) {
    throw new Error(`Keycloak: ${(e as Error).message}`);
  }

  for (const teamId of input.teams) {
    const team = TEAMS[teamId];
    try {
      const grp = await findGroupByPath(REALM, team.groupPath);
      if (!grp) {
        steps.push({
          step: `Group ${team.groupPath}`,
          ok: false,
          detail: "Group nicht gefunden — Keycloak-Setup prüfen",
        });
        continue;
      }
      await addUserToGroup(REALM, userId, grp.id);
      steps.push({
        step: `Group ${team.groupPath}`,
        ok: true,
        detail: `Mitglied hinzugefügt (workspace '${team.label}' sichtbar)`,
      });
    } catch (e) {
      steps.push({
        step: `Group ${team.groupPath}`,
        ok: false,
        detail: (e as Error).message,
      });
    }

    if (input.createMailboxes) {
      const email = `${username}@${team.mailDomain}`;
      if (!isMigaduConfigured()) {
        steps.push({
          step: `Migadu ${team.mailDomain}`,
          ok: false,
          detail:
            "Migadu API nicht konfiguriert — Mailbox bitte manuell anlegen oder MIGADU_ADMIN_USER / MIGADU_API_KEY setzen.",
        });
      } else {
        // The mailbox password is derived deterministically from the email
        // address (HMAC). The user never sees it: the portal's webmail SSO
        // bridge derives the same value at login time and submits it via
        // SnappyMail's ?Sso&hash flow. This removes "I forgot my mail
        // password" entirely as a class of problem.
        const mailPassword = derivePassword("mail", email);
        const r = await createMailbox({
          domain: team.mailDomain,
          localPart: username,
          name: `${firstName} ${lastName}`,
          password: mailPassword,
        });
        if (r.ok) {
          steps.push({
            step: `Migadu ${team.mailDomain}`,
            ok: true,
            detail: `Mailbox ${email} angelegt`,
          });
        } else if ("skipped" in r && r.skipped) {
          steps.push({
            step: `Migadu ${team.mailDomain}`,
            ok: false,
            detail: r.reason,
          });
        } else {
          steps.push({
            step: `Migadu ${team.mailDomain}`,
            ok: false,
            detail: `HTTP ${r.status}: ${r.reason.slice(0, 200)}`,
          });
        }
      }
    }
  }

  revalidatePath("/admin/onboarding");
  revalidatePath("/admin/onboarding/members");

  return {
    username,
    primaryEmail,
    temporaryPassword: tempPassword,
    steps,
    loginUrl: TEAMS[input.primaryDomainTeam].loginUrl,
  };
}

export type DisableMemberInput = {
  username: string;
  enable: boolean;
};

export async function setMemberEnabled(input: DisableMemberInput): Promise<{
  username: string;
  steps: CreateMemberStep[];
}> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  const steps: CreateMemberStep[] = [];
  try {
    const u = await findUserByUsername(REALM, input.username);
    if (!u) throw new Error("User nicht gefunden");
    await setUserEnabled(REALM, u.id, input.enable);
    steps.push({
      step: "Keycloak",
      ok: true,
      detail: input.enable ? "aktiviert" : "deaktiviert",
    });
  } catch (e) {
    steps.push({ step: "Keycloak", ok: false, detail: (e as Error).message });
  }

  revalidatePath("/admin/onboarding/members");
  return { username: input.username, steps };
}

export type DeleteMemberInput = {
  username: string;
  alsoDeleteMailboxes: boolean;
};

export async function deleteMember(input: DeleteMemberInput): Promise<{
  username: string;
  steps: CreateMemberStep[];
}> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  if (input.username === guard.username) {
    throw new Error("Du kannst dich nicht selbst löschen.");
  }

  const steps: CreateMemberStep[] = [];

  // Determine which teams the user belongs to (so we know which mailboxes to delete)
  const memberTeams: TeamId[] = [];
  let userId: string | null = null;
  try {
    const u = await findUserByUsername(REALM, input.username);
    if (u) {
      userId = u.id;
      const groups = await getUserGroups(REALM, u.id);
      memberTeams.push(
        ...Array.from(
          new Set(
            groups
              .map((g) => teamForGroupPath(g.path))
              .filter((t): t is TeamId => t !== null),
          ),
        ),
      );
    }
  } catch (e) {
    steps.push({ step: "Keycloak Lookup", ok: false, detail: (e as Error).message });
  }

  if (userId) {
    try {
      await deleteUser(REALM, userId);
      steps.push({ step: "Keycloak", ok: true, detail: "User gelöscht" });
    } catch (e) {
      steps.push({ step: "Keycloak", ok: false, detail: (e as Error).message });
    }
  } else {
    steps.push({
      step: "Keycloak",
      ok: false,
      detail: "User existiert nicht im Realm — übersprungen",
    });
  }

  if (input.alsoDeleteMailboxes) {
    if (!isMigaduConfigured()) {
      steps.push({
        step: "Migadu",
        ok: false,
        detail: "Migadu API nicht konfiguriert.",
      });
    } else {
      for (const teamId of memberTeams) {
        const team = TEAMS[teamId];
        const r = await deleteMailbox(team.mailDomain, input.username);
        if (r.ok) {
          steps.push({
            step: `Migadu ${team.mailDomain}`,
            ok: true,
            detail: `Mailbox ${input.username}@${team.mailDomain} gelöscht`,
          });
        } else if ("skipped" in r && r.skipped) {
          steps.push({
            step: `Migadu ${team.mailDomain}`,
            ok: false,
            detail: r.reason,
          });
        } else {
          steps.push({
            step: `Migadu ${team.mailDomain}`,
            ok: false,
            detail: `HTTP ${r.status}: ${r.reason.slice(0, 200)}`,
          });
        }
      }
    }
  }

  revalidatePath("/admin/onboarding/members");
  return { username: input.username, steps };
}

export type ResetPasswordInput = {
  username: string;
};

export async function resetMemberPassword(
  input: ResetPasswordInput,
): Promise<{ username: string; temporaryPassword: string; steps: CreateMemberStep[] }> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  const tempPassword = generateTempPassword();
  const steps: CreateMemberStep[] = [];

  try {
    const u = await findUserByUsername(REALM, input.username);
    if (!u) throw new Error("User nicht gefunden");
    await resetPassword(REALM, u.id, tempPassword, true);
    await updateUser(REALM, u.id, { enabled: true });
    steps.push({
      step: "Keycloak",
      ok: true,
      detail: "Passwort zurückgesetzt (temp, force-reset bei Login)",
    });
  } catch (e) {
    steps.push({ step: "Keycloak", ok: false, detail: (e as Error).message });
  }

  return { username: input.username, temporaryPassword: tempPassword, steps };
}

export type AssignTeamInput = {
  username: string;
  teamId: TeamId;
  /** When true, add user to team. When false, remove from team. */
  add: boolean;
};

export async function assignMemberTeam(
  input: AssignTeamInput,
): Promise<{ steps: CreateMemberStep[] }> {
  const guard = await requireAdmin();
  if (!guard.ok) throw new Error("forbidden");

  const steps: CreateMemberStep[] = [];
  const team = TEAMS[input.teamId];
  try {
    const u = await findUserByUsername(REALM, input.username);
    if (!u) throw new Error("User nicht gefunden");
    const grp = await findGroupByPath(REALM, team.groupPath);
    if (!grp) throw new Error(`Group ${team.groupPath} nicht gefunden`);
    if (input.add) {
      await addUserToGroup(REALM, u.id, grp.id);
      steps.push({
        step: `Group ${team.groupPath}`,
        ok: true,
        detail: `Mitglied hinzugefügt`,
      });
    } else {
      await removeUserFromGroup(REALM, u.id, grp.id);
      steps.push({
        step: `Group ${team.groupPath}`,
        ok: true,
        detail: `Mitglied entfernt`,
      });
    }
  } catch (e) {
    steps.push({
      step: `Group ${team.groupPath}`,
      ok: false,
      detail: (e as Error).message,
    });
  }

  revalidatePath("/admin/onboarding/members");
  return { steps };
}
