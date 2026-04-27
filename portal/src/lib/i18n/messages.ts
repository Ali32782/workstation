/**
 * Lightweight i18n dictionary.
 *
 * Two locales: `de` (default) + `en`. Adding more locales = add a key under
 * each `Messages` object below. Keys that aren't translated for a locale
 * fall back to the German string at runtime via `t()`.
 *
 * Wiring: `LocaleProvider` wraps the app and exposes `useT()`. Server
 * components don't have access to the live locale, so they keep using
 * German strings for now (login page, etc., still have hardcoded German
 * — the toggle effects only render after the client mounts).
 */

export type Locale = "de" | "en";

export const SUPPORTED_LOCALES: Locale[] = ["de", "en"];
export const DEFAULT_LOCALE: Locale = "de";

export type Messages = {
  // ─── Common ──────────────────────────────────────────────────────────
  "common.loading": string;
  "common.save": string;
  "common.cancel": string;
  "common.delete": string;
  "common.edit": string;
  "common.close": string;
  "common.search": string;
  "common.refresh": string;
  "common.open": string;
  "common.back": string;

  // ─── Login ───────────────────────────────────────────────────────────
  "login.heading": string;
  "login.subtitle": string;
  "login.cta": string;
  "login.divider": string;
  "login.help": string;
  "login.problems": string;
  "login.subline": string;

  // ─── Sidebar / Apps ──────────────────────────────────────────────────
  "nav.dashboard": string;
  "nav.mail": string;
  "nav.chat": string;
  "nav.calendar": string;
  "nav.calls": string;
  "nav.files": string;
  "nav.office": string;
  "nav.crm": string;
  "nav.helpdesk": string;
  "nav.projects": string;
  "nav.sign": string;
  "nav.code": string;
  "nav.status": string;
  "nav.identity": string;
  "nav.proxy": string;
  "nav.admin": string;
  "nav.onboarding": string;
  "nav.marketing": string;
  "nav.dashboard.short": string;

  "section.overview": string;
  "section.communication": string;
  "section.work": string;
  "section.system": string;

  // ─── User menu ───────────────────────────────────────────────────────
  "menu.signedInAs": string;
  "menu.account": string;
  "menu.theme": string;
  "menu.language": string;
  "menu.refresh": string;
  "menu.logout": string;

  // ─── Workspace switcher ──────────────────────────────────────────────
  "workspace.switcher": string;
  "workspace.search": string;

  // ─── Calendar ────────────────────────────────────────────────────────
  "calendar.newEvent": string;
  "calendar.title": string;
  "calendar.start": string;
  "calendar.end": string;
  "calendar.location": string;
  "calendar.description": string;
  "calendar.allDay": string;
  "calendar.today": string;
  "calendar.month": string;
  "calendar.week": string;
  "calendar.day": string;
  "calendar.video.add": string;
  "calendar.video.remove": string;
  "calendar.video.label": string;
  "calendar.video.hint": string;
  "calendar.video.join": string;

  // ─── Theme ──────────────────────────────────────────────────────────
  "theme.light": string;
  "theme.dark": string;
  "theme.system": string;
};

const de: Messages = {
  "common.loading": "Wird geladen …",
  "common.save": "Speichern",
  "common.cancel": "Abbrechen",
  "common.delete": "Löschen",
  "common.edit": "Bearbeiten",
  "common.close": "Schließen",
  "common.search": "Suchen",
  "common.refresh": "Aktualisieren",
  "common.open": "Öffnen",
  "common.back": "Zurück",

  "login.heading": "Corehub Workstation",
  "login.subtitle":
    "Eine Anmeldung. Alle Tools. Ein Arbeitsplatz für Corehub, MedTheris und Kineo.",
  "login.cta": "Mit Kineo360 SSO anmelden",
  "login.divider": "Sicher via Keycloak",
  "login.help": "Über deinen Kineo360 SSO Account.",
  "login.problems": "Probleme beim Login? Schreib an",
  "login.subline": "Eine Anmeldung. Alle Tools.",

  "nav.dashboard": "Dashboard",
  "nav.mail": "Mail",
  "nav.chat": "Chat",
  "nav.calendar": "Kalender",
  "nav.calls": "Calls",
  "nav.files": "Dateien",
  "nav.office": "Office",
  "nav.crm": "CRM",
  "nav.helpdesk": "Helpdesk",
  "nav.projects": "Projekte",
  "nav.sign": "Sign",
  "nav.code": "Code",
  "nav.status": "Status",
  "nav.identity": "Identity",
  "nav.proxy": "Reverse Proxy",
  "nav.admin": "Admin",
  "nav.onboarding": "Onboarding",
  "nav.marketing": "Marketing",
  "nav.dashboard.short": "Übersicht",

  "section.overview": "Übersicht",
  "section.communication": "Kommunikation",
  "section.work": "Arbeit",
  "section.system": "System",

  "menu.signedInAs": "Angemeldet als",
  "menu.account": "Konto",
  "menu.theme": "Design",
  "menu.language": "Sprache",
  "menu.refresh": "Sitzung aktualisieren",
  "menu.logout": "Abmelden",

  "workspace.switcher": "Workspace wechseln",
  "workspace.search": "Workspace suchen …",

  "calendar.newEvent": "Neuer Termin",
  "calendar.title": "Titel",
  "calendar.start": "Start",
  "calendar.end": "Ende",
  "calendar.location": "Ort",
  "calendar.description": "Beschreibung",
  "calendar.allDay": "Ganztägig",
  "calendar.today": "Heute",
  "calendar.month": "Monat",
  "calendar.week": "Woche",
  "calendar.day": "Tag",
  "calendar.video.add": "Video-Call hinzufügen",
  "calendar.video.remove": "Video-Call entfernen",
  "calendar.video.label": "Video-Konferenz",
  "calendar.video.hint":
    "Erzeugt einen Jitsi-Raum und legt den Link in den Termin (Outlook-/Teams-Stil).",
  "calendar.video.join": "Jetzt beitreten",

  "theme.light": "Hell",
  "theme.dark": "Dunkel",
  "theme.system": "System",
};

const en: Messages = {
  "common.loading": "Loading …",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.close": "Close",
  "common.search": "Search",
  "common.refresh": "Refresh",
  "common.open": "Open",
  "common.back": "Back",

  "login.heading": "Corehub Workstation",
  "login.subtitle":
    "One sign-in. Every tool. A workspace for Corehub, MedTheris and Kineo.",
  "login.cta": "Sign in with Kineo360 SSO",
  "login.divider": "Secured via Keycloak",
  "login.help": "Use your Kineo360 SSO account.",
  "login.problems": "Trouble signing in? Reach out to",
  "login.subline": "One sign-in. Every tool.",

  "nav.dashboard": "Dashboard",
  "nav.mail": "Mail",
  "nav.chat": "Chat",
  "nav.calendar": "Calendar",
  "nav.calls": "Calls",
  "nav.files": "Files",
  "nav.office": "Office",
  "nav.crm": "CRM",
  "nav.helpdesk": "Helpdesk",
  "nav.projects": "Projects",
  "nav.sign": "Sign",
  "nav.code": "Code",
  "nav.status": "Status",
  "nav.identity": "Identity",
  "nav.proxy": "Reverse Proxy",
  "nav.admin": "Admin",
  "nav.onboarding": "Onboarding",
  "nav.marketing": "Marketing",
  "nav.dashboard.short": "Overview",

  "section.overview": "Overview",
  "section.communication": "Communication",
  "section.work": "Work",
  "section.system": "System",

  "menu.signedInAs": "Signed in as",
  "menu.account": "Account",
  "menu.theme": "Theme",
  "menu.language": "Language",
  "menu.refresh": "Refresh session",
  "menu.logout": "Sign out",

  "workspace.switcher": "Switch workspace",
  "workspace.search": "Search workspaces …",

  "calendar.newEvent": "New event",
  "calendar.title": "Title",
  "calendar.start": "Start",
  "calendar.end": "End",
  "calendar.location": "Location",
  "calendar.description": "Description",
  "calendar.allDay": "All-day",
  "calendar.today": "Today",
  "calendar.month": "Month",
  "calendar.week": "Week",
  "calendar.day": "Day",
  "calendar.video.add": "Add video call",
  "calendar.video.remove": "Remove video call",
  "calendar.video.label": "Video conference",
  "calendar.video.hint":
    "Generates a Jitsi room and embeds the link in the event (Outlook / Teams style).",
  "calendar.video.join": "Join now",

  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",
};

const DICT: Record<Locale, Messages> = { de, en };

/** Resolve a locale from any input string (e.g. `navigator.language`). */
export function detectLocale(input: string | undefined | null): Locale {
  if (!input) return DEFAULT_LOCALE;
  const head = input.toLowerCase().slice(0, 2);
  return (SUPPORTED_LOCALES as string[]).includes(head)
    ? (head as Locale)
    : DEFAULT_LOCALE;
}

export function tFor(
  locale: Locale,
  key: keyof Messages,
  fallback?: string,
): string {
  const dict = DICT[locale] ?? DICT[DEFAULT_LOCALE];
  return dict[key] ?? DICT[DEFAULT_LOCALE][key] ?? fallback ?? String(key);
}

export { DICT };
