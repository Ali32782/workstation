import type { WorkspaceId } from "./workspaces";

/** Nextcloud pro Team — gleiche Pfade, andere Origin. */
const ORIGINS: Record<WorkspaceId, string> = {
  corehub: "https://files.kineo360.work",
  medtheris: "https://files.medtheris.kineo360.work",
  kineo: "https://files.kineo.kineo360.work",
};

function joinOrigin(origin: string, path: string) {
  const base = origin.replace(/\/$/, "");
  return path.startsWith("http") ? path : `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

export type CloudNavItem = { id: string; label: string; description: string; url: string };

/**
 * Pfade der Files-App (Nextcloud 29+). „Geteilt“ nutzt die Files-Ansicht sharingin
 * (üblich; falls eure Instanz anders routet, hier anpassen).
 */
export function getFileStationNav(workspace: WorkspaceId): CloudNavItem[] {
  const o = ORIGINS[workspace];
  return [
    {
      id: "all",
      label: "Meine Ablage",
      description: "Alle Dateien & Ordner",
      url: joinOrigin(o, "/apps/files/files?dir=/"),
    },
    {
      id: "documents",
      label: "Dokumente",
      description: "Texte, Notizen, Office-Dateien",
      url: joinOrigin(o, "/apps/files/files?dir=/Documents"),
    },
    {
      id: "shared",
      label: "Geteilt mit mir",
      description: "Freigaben von Teamkolleg:innen",
      url: joinOrigin(o, "/apps/files/sharingin"),
    },
  ];
}

export function getOfficeNav(workspace: WorkspaceId): CloudNavItem[] {
  const o = ORIGINS[workspace];
  return [
    {
      id: "docs",
      label: "Dokumente",
      description: "Texte, Verträge, Protokolle",
      url: joinOrigin(o, "/apps/files/files?dir=/Documents"),
    },
    {
      id: "sheets",
      label: "Tabellen",
      description: "Kalkulation, Listen",
      url: joinOrigin(o, "/apps/files/files?dir=/Documents/Tabellen"),
    },
    {
      id: "slides",
      label: "Präsentationen",
      description: "Decks, Pitches",
      url: joinOrigin(o, "/apps/files/files?dir=/Documents/Praesentationen"),
    },
    {
      id: "all",
      label: "Alle Dateien",
      description: "Gesamter Speicher",
      url: joinOrigin(o, "/apps/files/files?dir=/"),
    },
  ];
}

export function getCloudOrigin(workspace: WorkspaceId): string {
  return ORIGINS[workspace];
}
