// Single source of truth that maps an internal "team" / workspace onto a
// Keycloak group path + Migadu mail domain. Safe to import from client
// components — only contains static config and a CSPRNG password generator.
//
// Architecture: ONE realm `main` for all internal staff. Per-team grouping is
// represented by Keycloak top-level groups (`/corehub`, `/medtheris`, `/kineo`).
// Adding a member to a team = membership in that top-level group; deeper roles
// (e.g. `/corehub/dev-ops`) are managed manually in Keycloak Admin for now.

export type TeamId = "corehub" | "medtheris" | "kineo";

export type TeamConfig = {
  id: TeamId;
  label: string;
  /** Top-level Keycloak group path that grants access to this workspace. */
  groupPath: string;
  /** Migadu mail domain used for default mailbox provisioning. */
  mailDomain: string;
  /** Workspace deep-link the user should land on after first login. */
  loginUrl: string;
  accent: string;
};

/** Single Keycloak realm shared by all internal staff. */
export const REALM = "main";

export const TEAMS: Record<TeamId, TeamConfig> = {
  corehub: {
    id: "corehub",
    label: "Corehub",
    groupPath: "/corehub",
    mailDomain: "corehub.kineo360.work",
    loginUrl: "https://app.kineo360.work",
    accent: "#1e4d8c",
  },
  medtheris: {
    id: "medtheris",
    label: "MedTheris",
    groupPath: "/medtheris",
    mailDomain: "medtheris.kineo360.work",
    loginUrl: "https://app.kineo360.work/medtheris/dashboard",
    accent: "#0d9488",
  },
  kineo: {
    id: "kineo",
    label: "Kineo",
    groupPath: "/kineo",
    mailDomain: "kineo.kineo360.work",
    loginUrl: "https://app.kineo360.work/kineo/dashboard",
    accent: "#7c3aed",
  },
};

export const TEAM_LIST: TeamConfig[] = [
  TEAMS.corehub,
  TEAMS.medtheris,
  TEAMS.kineo,
];

export function getTeam(id: TeamId): TeamConfig {
  return TEAMS[id];
}

export function generateTempPassword(length = 18): string {
  // Avoid ambiguous chars (0/O, 1/l/I).
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%*";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  let out = "";
  for (let i = 0; i < length; i++) {
    out += alphabet[arr[i] % alphabet.length];
  }
  return out;
}
