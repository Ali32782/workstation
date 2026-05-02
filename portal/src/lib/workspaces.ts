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
  ClipboardList,
  BarChart3,
  Bot,
  Film,
  Share2,
  type LucideIcon,
} from "lucide-react";

export type WorkspaceId = "corehub" | "medtheris" | "kineo";

/** @see docs/PRODUCT-VISION.md — Strategische Hauptsäulen */
export type AppSection =
  | "Übersicht"
  | "Kommunikation"
  | "Office-Hub"
  | "Projekt-Hub"
  | "System";

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

/**
 * Optional iframe targets for the **Kineo** workspace (reporting stack on Hetzner /
 * Streamlit / internal dashboards / chatbot). Omit env vars to hide entries from the sidebar.
 *
 * - `NEXT_PUBLIC_KINEO_GAP_REPORT_URL` — Gap-filling / reporting UI (e.g. hosted report app).
 * - `NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL` — Operations dashboard (e.g. Streamlit upload pipeline from `Kineo_Dashboard`).
 * - `NEXT_PUBLIC_KINEO_CHATBOT_URL` — Public Kineo360 chatbot UI (Sales/Support assistant).
 *
 * All must be **HTTPS** origins trusted by NPM (`frame-ancestors` for `app.kineo360.work`).
 * Streamlit defaults often block iframes — use `newtab` via "open in new tab" in AppFrame or set
 * `server.enableCORS` / `server.enableXsrfProtection` per Streamlit docs on the host.
 *
 * Per-app embed override (rare — only when a tool refuses iframe embedding entirely):
 *
 * - `NEXT_PUBLIC_KINEO_CHATBOT_EMBED=newtab` — open the chatbot in a new tab instead.
 *   Same flag exists for the dashboard / gap-report (`*_EMBED=newtab`).
 */
function envEmbedMode(key: string, fallback: AppEmbedMode = "iframe"): AppEmbedMode {
  const v = process.env[key]?.trim().toLowerCase();
  if (v === "newtab" || v === "iframe" || v === "native") return v;
  return fallback;
}

function kineoEnvApps(): App[] {
  const out: App[] = [];
  const gap = process.env.NEXT_PUBLIC_KINEO_GAP_REPORT_URL?.trim();
  if (gap) {
    out.push({
      id: "gap-report",
      name: "Gap Report",
      section: "Projekt-Hub",
      description:
        "Reporting · Lückenfüller & KPIs (angebunden über NEXT_PUBLIC_KINEO_GAP_REPORT_URL)",
      url: gap,
      icon: ClipboardList,
      embed: envEmbedMode("NEXT_PUBLIC_KINEO_GAP_REPORT_EMBED"),
    });
  }
  const ops = process.env.NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL?.trim();
  if (ops) {
    out.push({
      id: "ops-dashboard",
      name: "Operations Dashboard",
      section: "Übersicht",
      description:
        "Hyrox / KPI-Pipeline · Upload & Auswertung (NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL)",
      url: ops,
      icon: BarChart3,
      embed: envEmbedMode("NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_EMBED"),
    });
  }
  const chatbot = process.env.NEXT_PUBLIC_KINEO_CHATBOT_URL?.trim();
  if (chatbot) {
    out.push({
      id: "chatbot",
      name: "Kineo Assistent",
      section: "Kommunikation",
      description:
        "Kineo360 Raumplanungs- & Support-Assistent (NEXT_PUBLIC_KINEO_CHATBOT_URL)",
      url: chatbot,
      icon: Bot,
      embed: envEmbedMode("NEXT_PUBLIC_KINEO_CHATBOT_EMBED"),
    });
  }
  return out;
}

/**
 * Marketing-Hub apps that are tenant-agnostic — i.e. the same OpenCut /
 * Postiz instance serves both medtheris and kineo. We expose them via the
 * normal sidebar in BOTH workspaces (Marketing teams in both tenants
 * share the asset library / posting calendar).
 *
 * - `NEXT_PUBLIC_OPENCUT_URL` — in-browser video editor (CapCut alt). Embeds
 *   cleanly via iframe; videos stay client-side, no upload to the server.
 * - `NEXT_PUBLIC_POSTIZ_URL`  — social-media scheduler (Buffer alt). Posts'
 *   OAuth tokens live in Postiz' own DB; the iframe embeds the calendar.
 *
 * Both are HTTPS origins behind NPM with `frame-ancestors app.kineo360.work`
 * so the AppFrame iframe doesn't get blocked by CSP. If a tool ever changes
 * its CSP and refuses iframe embedding, set its embed mode to "newtab".
 */
function marketingEnvApps(): App[] {
  const out: App[] = [];
  const opencut = process.env.NEXT_PUBLIC_OPENCUT_URL?.trim();
  if (opencut) {
    out.push({
      id: "video-editor",
      name: "Video Editor",
      section: "Office-Hub",
      description:
        "Reels & Shorts schneiden (OpenCut · 100% browser-side, keine Uploads)",
      url: opencut,
      icon: Film,
      embed: "iframe",
    });
  }
  const postiz = process.env.NEXT_PUBLIC_POSTIZ_URL?.trim();
  if (postiz) {
    out.push({
      id: "social-scheduler",
      name: "Social Scheduler",
      section: "Office-Hub",
      description:
        "Posts planen & veröffentlichen (Postiz · 30+ Plattformen, AI-Copilot)",
      url: postiz,
      icon: Share2,
      embed: "iframe",
    });
  }
  return out;
}

/** Workspace catalog plus env-driven optional apps (Kineo reporting + shared Marketing-Hub). */
export function resolveWorkspace(id: WorkspaceId): Workspace {
  const base = WORKSPACES[id];
  // Marketing tools (OpenCut + Postiz) appear in MedTheris and Kineo. They're
  // not pinned to one tenant because the same install serves both teams.
  const marketing = id === "corehub" ? [] : marketingEnvApps();
  if (id !== "kineo") {
    return marketing.length ? { ...base, apps: [...base.apps, ...marketing] } : base;
  }
  return { ...base, apps: [...base.apps, ...kineoEnvApps(), ...marketing] };
}

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
        section: "Office-Hub",
        description: "Datei-Station · Nextcloud, navigation wie Explorer",
        url: "/corehub/files",
        icon: FolderOpen,
        embed: "native",
      },
      {
        id: "office",
        name: "Office",
        section: "Office-Hub",
        description: "Office-Hub · Word/Excel im Portal, Folien mit OpenOffice in Nextcloud",
        url: "/corehub/office",
        icon: FileText,
        embed: "native",
      },
      {
        id: "crm",
        name: "CRM",
        section: "Office-Hub",
        description: "Twenty · Engineering-CRM",
        url: "/corehub/crm",
        icon: Users,
        embed: "native",
        badge: { label: "bald", tone: "info" },
      },
      {
        id: "code",
        name: "Code",
        section: "Projekt-Hub",
        description: "Gitea · Repositories & CI",
        url: "https://git.kineo360.work",
        icon: Code2,
        embed: "iframe",
      },
      {
        id: "projects",
        name: "Projekte",
        section: "Projekt-Hub",
        description: "Plane · Engineering Issues, Cycles, Roadmap",
        url: "/corehub/projects",
        icon: Kanban,
        embed: "native",
      },
      {
        id: "sign",
        name: "Sign",
        section: "Office-Hub",
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
        section: "Office-Hub",
        description: "Datei-Station · Nextcloud, navigation wie Explorer",
        url: "/medtheris/files",
        icon: FolderOpen,
        embed: "native",
      },
      {
        id: "office",
        name: "Office",
        section: "Office-Hub",
        description: "Office-Hub · Word/Excel im Portal, Folien mit OpenOffice in Nextcloud",
        url: "/medtheris/office",
        icon: FileText,
        embed: "native",
      },
      {
        id: "crm",
        name: "CRM",
        section: "Office-Hub",
        description: "Twenty · Sales-Pipeline & Leads",
        url: "/medtheris/crm",
        icon: Users,
        embed: "native",
        badge: { label: "bald", tone: "info" },
      },
      {
        id: "marketing",
        name: "Marketing",
        section: "Office-Hub",
        description: "Mautic · Drip-Kampagnen, Newsletter, Lead-Tracking",
        url: "/medtheris/marketing",
        icon: Megaphone,
        embed: "native",
      },
      {
        id: "helpdesk",
        name: "Helpdesk",
        section: "Kommunikation",
        description: "Zammad · eingehende Kundenanfragen",
        url: "/medtheris/helpdesk",
        icon: HeadphonesIcon,
        embed: "native",
      },
      {
        id: "sign",
        name: "Sign",
        section: "Office-Hub",
        description: "Documenso · Angebote, Verträge, AVV mit Praxen",
        url: "/medtheris/sign",
        icon: PenLine,
        embed: "native",
      },
      {
        id: "projects",
        name: "Projekte",
        section: "Projekt-Hub",
        description: "Plane · Delivery, Zyklen & Issues",
        url: "/medtheris/projects",
        icon: Kanban,
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
        section: "Office-Hub",
        description: "Datei-Station · Nextcloud, navigation wie Explorer",
        url: "/kineo/files",
        icon: FolderOpen,
        embed: "native",
      },
      {
        id: "office",
        name: "Office",
        section: "Office-Hub",
        description: "Office-Hub · Word/Excel im Portal, Folien mit OpenOffice in Nextcloud",
        url: "/kineo/office",
        icon: FileText,
        embed: "native",
      },
      {
        id: "crm",
        name: "CRM",
        section: "Office-Hub",
        description: "Twenty · Investor- & Partner-Pipeline",
        url: "/kineo/crm",
        icon: Users,
        embed: "native",
      },
      {
        id: "helpdesk",
        name: "Helpdesk",
        section: "Kommunikation",
        description: "Zammad · interne Tickets & Vendor-Support",
        url: "/kineo/helpdesk",
        icon: HeadphonesIcon,
        embed: "native",
      },
      {
        id: "projects",
        name: "Projekte",
        section: "Projekt-Hub",
        description: "Plane · Initiativen, OKRs, Cross-Workstream",
        url: "/kineo/projects",
        icon: Kanban,
        embed: "native",
      },
      {
        id: "sign",
        name: "Sign",
        section: "Office-Hub",
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

export const SECTIONS: AppSection[] = [
  "Übersicht",
  "Kommunikation",
  "Office-Hub",
  "Projekt-Hub",
  "System",
];

export function getWorkspace(id: string): Workspace | null {
  if (id !== "corehub" && id !== "medtheris" && id !== "kineo") return null;
  return resolveWorkspace(id);
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
