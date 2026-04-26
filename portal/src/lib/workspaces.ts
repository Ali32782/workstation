import {
  LayoutDashboard,
  Mail,
  MessageSquare,
  Calendar,
  FolderOpen,
  FileText,
  Users,
  Code2,
  Kanban,
  Activity,
  ShieldCheck,
  Globe2,
  HeadphonesIcon,
  Video,
  PenLine,
  Megaphone,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceId = "corehub" | "medtheris" | "kineo";

export type AppSection = "Übersicht" | "Kommunikation" | "Arbeit" | "System";

export type AppBadge = {
  label: string;
  tone: "info" | "warning" | "success";
};

export type AppEmbedMode = "iframe" | "newtab" | "native";

export type App = {
  id: string;
  name: string;
  section: AppSection;
  description: string;
  url: string;
  icon: LucideIcon;
  embed: AppEmbedMode;
  badge?: AppBadge;
  /** Only visible to platform admins (kc-admins). */
  adminOnly?: boolean;
};

export type Workspace = {
  id: WorkspaceId;
  name: string;
  tagline: string;
  accent: string;
  brandLogo: string;
  /** Keycloak group paths whose members may see this workspace. */
  groupPaths: string[];
  apps: App[];
};

export const WORKSPACES: Record<WorkspaceId, Workspace> = {
  corehub: {
    id: "corehub",
    name: "Corehub",
    tagline: "Engineering · Corehub Technologies",
    accent: "#1e4d8c",
    brandLogo: "/branding/corehub-mark.svg",
    groupPaths: ["/corehub"],
    apps: [
      {
        id: "dashboard",
        name: "Dashboard",
        section: "Übersicht",
        description: "Heute · Builds, Deploys, Alerts, Active PRs",
        url: "/corehub/dashboard",
        icon: LayoutDashboard,
        embed: "native",
      },
      {
        id: "mail",
        name: "Mail",
        section: "Kommunikation",
        description: "Outlook-Style Mail · vorname@corehub.kineo360.work",
        url: "/corehub/mail",
        icon: Mail,
        embed: "native",
      },
      {
        id: "chat",
        name: "Chat",
        section: "Kommunikation",
        description: "Teams-Style Chat + Video-Anruf · #engineering, #ops",
        url: "/corehub/chat",
        icon: MessageSquare,
        embed: "native",
      },
      {
        id: "calendar",
        name: "Kalender",
        section: "Kommunikation",
        description: "Outlook-Style Kalender · Engineering-Termine",
        url: "/corehub/calendar",
        icon: Calendar,
        embed: "native",
      },
      {
        id: "files",
        name: "Files",
        section: "Arbeit",
        description: "Datei-Station · Nextcloud, navigation wie Explorer",
        url: "/corehub/files",
        icon: FolderOpen,
        embed: "native",
      },
      {
        id: "office",
        name: "Office",
        section: "Arbeit",
        description: "Office-Hub · Dokumente, Tabellen, Folien in Nextcloud",
        url: "/corehub/office",
        icon: FileText,
        embed: "native",
      },
      {
        id: "crm",
        name: "CRM",
        section: "Arbeit",
        description: "Twenty · Engineering-CRM",
        url: "/corehub/crm",
        icon: Users,
        embed: "native",
        badge: { label: "bald", tone: "info" },
      },
      {
        id: "code",
        name: "Code",
        section: "Arbeit",
        description: "Gitea · Repositories & CI",
        url: "https://git.kineo360.work",
        icon: Code2,
        embed: "iframe",
      },
      {
        id: "projects",
        name: "Projekte",
        section: "Arbeit",
        description: "Plane · Engineering Issues, Cycles, Roadmap",
        url: "/corehub/projects",
        icon: Kanban,
        embed: "native",
      },
      {
        id: "sign",
        name: "Sign",
        section: "Arbeit",
        description: "Documenso · Verträge, NDAs, Offer-Letters",
        url: "/corehub/sign",
        icon: PenLine,
        embed: "native",
      },
      {
        id: "calls",
        name: "Calls",
        section: "Kommunikation",
        description: "Spontan-Calls, Räume & Anruf-Historie",
        url: "/medtheris/calls",
        icon: Video,
        embed: "native",
      },
      {
        id: "status",
        name: "Status",
        section: "System",
        description: "Uptime Kuma · alle Services",
        url: "https://status.medtheris.kineo360.work",
        icon: Activity,
        embed: "iframe",
        adminOnly: true,
      },
      {
        id: "identity",
        name: "Identity",
        section: "System",
        description: "Keycloak Admin · Realm main (alle Teams)",
        url: "https://auth.kineo360.work/admin/main/console/",
        icon: ShieldCheck,
        embed: "iframe",
        adminOnly: true,
      },
      {
        id: "proxy",
        name: "Reverse Proxy",
        section: "System",
        description: "Nginx Proxy Manager · nur via SSH-Tunnel (http://localhost:81)",
        url: "http://localhost:81",
        icon: Globe2,
        embed: "newtab",
        adminOnly: true,
      },
    ],
  },
  medtheris: {
    id: "medtheris",
    name: "MedTheris",
    tagline: "Praxis Management Software · Sales",
    accent: "#059669",
    brandLogo: "/branding/medtheris-mark.svg",
    groupPaths: ["/medtheris"],
    apps: [
      {
        id: "dashboard",
        name: "Dashboard",
        section: "Übersicht",
        description: "Heute · neue Leads, offene Tickets, Demos",
        url: "/medtheris/dashboard",
        icon: LayoutDashboard,
        embed: "native",
      },
      {
        id: "mail",
        name: "Mail",
        section: "Kommunikation",
        description: "Outlook-Style Mail · sales@medtheris.kineo360.work",
        url: "/medtheris/mail",
        icon: Mail,
        embed: "native",
      },
      {
        id: "chat",
        name: "Chat",
        section: "Kommunikation",
        description: "Teams-Style Chat + Video-Anruf · #sales, #leads",
        url: "/medtheris/chat",
        icon: MessageSquare,
        embed: "native",
      },
      {
        id: "calendar",
        name: "Kalender",
        section: "Kommunikation",
        description: "Outlook-Style Kalender · Demos, Follow-ups",
        url: "/medtheris/calendar",
        icon: Calendar,
        embed: "native",
      },
      {
        id: "files",
        name: "Files",
        section: "Arbeit",
        description: "Datei-Station · Nextcloud, navigation wie Explorer",
        url: "/medtheris/files",
        icon: FolderOpen,
        embed: "native",
      },
      {
        id: "office",
        name: "Office",
        section: "Arbeit",
        description: "Office-Hub · Dokumente, Tabellen, Folien in Nextcloud",
        url: "/medtheris/office",
        icon: FileText,
        embed: "native",
      },
      {
        id: "crm",
        name: "CRM",
        section: "Arbeit",
        description: "Twenty · Sales-Pipeline & Leads",
        url: "/medtheris/crm",
        icon: Users,
        embed: "native",
        badge: { label: "bald", tone: "info" },
      },
      {
        id: "marketing",
        name: "Marketing",
        section: "Arbeit",
        description: "Mautic · Drip-Kampagnen, Newsletter, Lead-Tracking",
        url: "/medtheris/marketing",
        icon: Megaphone,
        embed: "native",
      },
      {
        id: "helpdesk",
        name: "Helpdesk",
        section: "Arbeit",
        description: "Zammad · eingehende Kundenanfragen",
        url: "/medtheris/helpdesk",
        icon: HeadphonesIcon,
        embed: "native",
      },
      {
        id: "sign",
        name: "Sign",
        section: "Arbeit",
        description: "Documenso · Angebote, Verträge, AVV mit Praxen",
        url: "/medtheris/sign",
        icon: PenLine,
        embed: "native",
      },
      {
        id: "calls",
        name: "Calls",
        section: "Kommunikation",
        description: "Demo-Calls, Sales-Räume & Anruf-Historie",
        url: "/corehub/calls",
        icon: Video,
        embed: "native",
      },
      {
        id: "status",
        name: "Status",
        section: "System",
        description: "Uptime Kuma · Sales-Stack",
        url: "https://status.medtheris.kineo360.work",
        icon: Activity,
        embed: "iframe",
        adminOnly: true,
      },
      {
        id: "identity",
        name: "Identity",
        section: "System",
        description: "Keycloak Admin · Realm main (alle Teams)",
        url: "https://auth.kineo360.work/admin/main/console/",
        icon: ShieldCheck,
        embed: "iframe",
        adminOnly: true,
      },
    ],
  },
  kineo: {
    id: "kineo",
    name: "Kineo",
    tagline: "Kineo Group · Operations & Strategy",
    accent: "#7c3aed",
    brandLogo: "/branding/kineo-mark.svg",
    groupPaths: ["/kineo"],
    apps: [
      {
        id: "dashboard",
        name: "Dashboard",
        section: "Übersicht",
        description: "Heute · KPIs, offene Themen, Team-Aktivität",
        url: "/kineo/dashboard",
        icon: LayoutDashboard,
        embed: "native",
      },
      {
        id: "mail",
        name: "Mail",
        section: "Kommunikation",
        description: "Outlook-Style Mail · ali@kineo360.work",
        url: "/kineo/mail",
        icon: Mail,
        embed: "native",
      },
      {
        id: "chat",
        name: "Chat",
        section: "Kommunikation",
        description: "Teams-Style Chat + Video-Anruf · #kineo, #leadership",
        url: "/kineo/chat",
        icon: MessageSquare,
        embed: "native",
      },
      {
        id: "calls",
        name: "Calls",
        section: "Kommunikation",
        description: "1:1s, Workshops, Strategie-Calls & Anruf-Historie",
        url: "/kineo/calls",
        icon: Video,
        embed: "native",
      },
      {
        id: "calendar",
        name: "Kalender",
        section: "Kommunikation",
        description: "Outlook-Style Kalender · Group-Termine",
        url: "/kineo/calendar",
        icon: Calendar,
        embed: "native",
      },
      {
        id: "files",
        name: "Files",
        section: "Arbeit",
        description: "Datei-Station · Nextcloud, navigation wie Explorer",
        url: "/kineo/files",
        icon: FolderOpen,
        embed: "native",
      },
      {
        id: "office",
        name: "Office",
        section: "Arbeit",
        description: "Office-Hub · Dokumente, Tabellen, Folien in Nextcloud",
        url: "/kineo/office",
        icon: FileText,
        embed: "native",
      },
      {
        id: "crm",
        name: "CRM",
        section: "Arbeit",
        description: "Twenty · Investor- & Partner-Pipeline",
        url: "/kineo/crm",
        icon: Users,
        embed: "native",
      },
      {
        id: "helpdesk",
        name: "Helpdesk",
        section: "Arbeit",
        description: "Zammad · interne Tickets & Vendor-Support",
        url: "https://support.kineo.kineo360.work",
        icon: HeadphonesIcon,
        embed: "iframe",
        badge: { label: "bald", tone: "info" },
      },
      {
        id: "projects",
        name: "Projekte",
        section: "Arbeit",
        description: "Plane · Initiativen, OKRs, Cross-Workstream",
        url: "/kineo/projects",
        icon: Kanban,
        embed: "native",
      },
      {
        id: "sign",
        name: "Sign",
        section: "Arbeit",
        description: "Documenso · Group-Verträge, Investorenpapiere",
        url: "/kineo/sign",
        icon: PenLine,
        embed: "native",
      },
      {
        id: "status",
        name: "Status",
        section: "System",
        description: "Uptime Kuma · alle Services",
        url: "https://status.medtheris.kineo360.work",
        icon: Activity,
        embed: "iframe",
        adminOnly: true,
      },
      {
        id: "identity",
        name: "Identity",
        section: "System",
        description: "Keycloak Admin · Realm main (alle Teams)",
        url: "https://auth.kineo360.work/admin/main/console/",
        icon: ShieldCheck,
        embed: "iframe",
        adminOnly: true,
      },
    ],
  },
};

export const SECTIONS: AppSection[] = ["Übersicht", "Kommunikation", "Arbeit", "System"];

export function getWorkspace(id: string): Workspace | null {
  return id === "corehub" || id === "medtheris" || id === "kineo"
    ? WORKSPACES[id]
    : null;
}

export function getApp(workspaceId: string, appId: string): App | null {
  const ws = getWorkspace(workspaceId);
  if (!ws) return null;
  return ws.apps.find((a) => a.id === appId) ?? null;
}

/**
 * A user can see a workspace if any of their Keycloak groups (paths) starts with
 * one of the workspace's `groupPaths`. This means membership in any sub-group
 * (e.g. `/corehub/dev-ops`) grants visibility for the corresponding workspace.
 */
export function visibleWorkspacesForGroups(groupPaths: string[]): WorkspaceId[] {
  return (Object.keys(WORKSPACES) as WorkspaceId[]).filter((id) =>
    WORKSPACES[id].groupPaths.some((wsPath) =>
      groupPaths.some((gp) => gp === wsPath || gp.startsWith(`${wsPath}/`)),
    ),
  );
}
