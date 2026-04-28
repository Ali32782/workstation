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
  "common.new": string;
  "common.send": string;
  "common.reply": string;
  "common.replyAll": string;
  "common.forward": string;
  "common.settings": string;
  "common.filter": string;
  "common.more": string;
  "common.all": string;
  "common.none": string;
  "common.empty": string;
  "common.noResults": string;
  "common.error": string;
  "common.retry": string;
  "common.upload": string;
  "common.download": string;
  "common.copy": string;
  "common.copied": string;
  "common.create": string;
  "common.add": string;
  "common.remove": string;
  "common.confirm": string;
  "common.yes": string;
  "common.no": string;
  "common.from": string;
  "common.to": string;
  "common.subject": string;
  "common.date": string;
  "common.status": string;
  "common.priority": string;
  "common.assignee": string;
  "common.author": string;
  "common.title": string;
  "common.description": string;
  "common.notes": string;
  "common.attachments": string;
  "common.activity": string;
  "common.details": string;
  "common.today": string;
  "common.thisWeek": string;

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

  // ─── Mail ───────────────────────────────────────────────────────────
  "mail.folder.inbox": string;
  "mail.folder.sent": string;
  "mail.folder.drafts": string;
  "mail.folder.spam": string;
  "mail.folder.trash": string;
  "mail.folder.archive": string;
  "mail.compose": string;
  "mail.compose.to": string;
  "mail.compose.cc": string;
  "mail.compose.bcc": string;
  "mail.compose.subject": string;
  "mail.compose.body": string;
  "mail.compose.send": string;
  "mail.compose.saveDraft": string;
  "mail.empty.list": string;
  "mail.empty.noSelection": string;
  "mail.markRead": string;
  "mail.markUnread": string;
  "mail.delete": string;
  "mail.moveTo": string;
  "mail.settings": string;

  // ─── CRM ────────────────────────────────────────────────────────────
  "crm.companies": string;
  "crm.people": string;
  "crm.deals": string;
  "crm.notes": string;
  "crm.tab.activity": string;
  "crm.tab.people": string;
  "crm.tab.deals": string;
  "crm.tab.details": string;
  "crm.empty.companies": string;
  "crm.empty.people": string;
  "crm.empty.activity": string;
  "crm.empty.selection": string;
  "crm.placeholder.companyName": string;
  "crm.placeholder.search": string;
  "crm.scraper": string;
  "crm.settings": string;

  // ─── Helpdesk ───────────────────────────────────────────────────────
  "helpdesk.tickets": string;
  "helpdesk.scope.all": string;
  "helpdesk.scope.mine": string;
  "helpdesk.scope.unassigned": string;
  "helpdesk.filter.open": string;
  "helpdesk.filter.closed": string;
  "helpdesk.filter.all": string;
  "helpdesk.status.new": string;
  "helpdesk.status.open": string;
  "helpdesk.status.pending": string;
  "helpdesk.status.closed": string;
  "helpdesk.status.merged": string;
  "helpdesk.priority.low": string;
  "helpdesk.priority.normal": string;
  "helpdesk.priority.high": string;
  "helpdesk.priority.urgent": string;
  "helpdesk.empty.mine": string;
  "helpdesk.empty.allAssigned": string;
  "helpdesk.empty.open": string;
  "helpdesk.empty.generic": string;
  "helpdesk.newTicket": string;
  "helpdesk.reply": string;
  "helpdesk.internalNote": string;
  "helpdesk.assignee": string;
  "helpdesk.group": string;
  "helpdesk.settings": string;
  "helpdesk.slaRisk": string;
  "helpdesk.slaRisk.title": string;
  "helpdesk.stats.open": string;
  "helpdesk.stats.slaAtRisk": string;
  "helpdesk.stats.closedToday": string;
  "helpdesk.stats.capped": string;
  "helpdesk.composer.answerTab": string;
  "helpdesk.composer.internalTab": string;
  "helpdesk.composer.sendShortcut": string;
  "helpdesk.composer.solutionLabel": string;
  "helpdesk.composer.solutionPlaceholder": string;
  "helpdesk.composer.placeholderReply": string;
  "helpdesk.composer.placeholderNote": string;
  "helpdesk.composer.statusAfterSend": string;
  "helpdesk.composer.saveNote": string;
  "helpdesk.customer.crm": string;
  "helpdesk.customer.crmTitle": string;
  "helpdesk.channel.email": string;
  "helpdesk.channel.phone": string;
  "helpdesk.channel.web": string;
  "helpdesk.channel.note": string;
  "helpdesk.channel.sms": string;
  "helpdesk.channel.chat": string;
  "helpdesk.channel.twitter": string;
  "helpdesk.channel.facebook": string;
  "helpdesk.channel.other": string;
  "helpdesk.import.csvTitle": string;
  "helpdesk.conversation.title": string;
  "helpdesk.conversation.pickTicket": string;
  "helpdesk.portalLink.mintTitle": string;
  "helpdesk.portalLink.button": string;
  "helpdesk.portalLink.copied": string;
  "helpdesk.portalLink.copiedToast": string;
  "helpdesk.portalLink.prompt": string;
  "helpdesk.portalLink.manualCopied": string;
  "helpdesk.empty.noTicket": string;
  "helpdesk.empty.noTicketHint": string;
  "helpdesk.empty.noMessages": string;
  "helpdesk.empty.zammadTitle": string;
  "helpdesk.empty.zammadHint": string;
  "helpdesk.error.loadTicket": string;
  "helpdesk.error.createTicket": string;
  "helpdesk.error.save": string;
  "helpdesk.error.send": string;
  "helpdesk.error.tagAdd": string;
  "helpdesk.error.tagRemove": string;
  "helpdesk.error.portalLink": string;
  "helpdesk.error.macro": string;
  "helpdesk.error.bulk": string;
  "helpdesk.bulk.partialFail": string;
  "helpdesk.card.mine": string;
  "helpdesk.card.selectBulk": string;
  "helpdesk.card.noTitle": string;
  "helpdesk.card.unread": string;
  "helpdesk.crm.twentyLabel": string;
  "helpdesk.newTicket.subjectPh": string;
  "helpdesk.newTicket.bodyPh": string;
  "helpdesk.newTicket.cancel": string;
  "helpdesk.newTicket.submit": string;
  "helpdesk.composer.templates": string;
  "helpdesk.composer.templatesTitle": string;
  "helpdesk.composer.attachmentSoon": string;
  "helpdesk.composer.attachment": string;
  "helpdesk.customer.videoCall": string;
  "helpdesk.customer.mailAction": string;
  "helpdesk.customer.profile360": string;
  "helpdesk.customer.profileTitle": string;
  "helpdesk.customer.unknown": string;
  "helpdesk.article.agent": string;
  "helpdesk.sla.firstResponse": string;
  "helpdesk.sla.closeDeadline": string;
  "helpdesk.sla.breached": string;
  "helpdesk.sla.pill": string;
  "helpdesk.sla.due": string;
  "helpdesk.sla.panel.first": string;
  "helpdesk.sla.panel.close": string;
  "helpdesk.sla.panel.none": string;
  "helpdesk.time.justNow": string;
  "helpdesk.time.mins": string;
  "helpdesk.time.hours": string;
  "helpdesk.time.days": string;
  "helpdesk.drawer.ticketsTotal": string;
  "helpdesk.drawer.customerSince": string;
  "helpdesk.drawer.history": string;
  "helpdesk.drawer.noTickets": string;
  "helpdesk.drawer.writeEmail": string;
  "helpdesk.drawer.title": string;
  "helpdesk.drawer.close": string;

  // ─── Sign ───────────────────────────────────────────────────────────
  "sign.documents": string;
  "sign.status.draft": string;
  "sign.status.pending": string;
  "sign.status.completed": string;
  "sign.status.rejected": string;
  "sign.scope.all": string;
  "sign.upload": string;
  "sign.send": string;
  "sign.empty.list": string;
  "sign.empty.selection": string;

  // ─── Calls ──────────────────────────────────────────────────────────
  "calls.title": string;
  "calls.newCall": string;
  "calls.active": string;
  "calls.history": string;
  "calls.empty.list": string;
  "calls.empty.selection": string;
  "calls.composer.subject": string;
  "calls.composer.start": string;

  // ─── Projects ───────────────────────────────────────────────────────
  "projects.view.board": string;
  "projects.view.backlog": string;
  "projects.view.sprints": string;
  "projects.view.roadmap": string;
  "projects.view.list": string;
  "projects.newIssue": string;
  "projects.newProject": string;
  "projects.empty.list": string;
  "projects.empty.selection": string;
  "projects.import": string;
  "projects.import.title": string;
  "projects.import.description": string;
  "projects.import.upload": string;
  "projects.import.paste": string;
  "projects.import.delimiter": string;
  "projects.import.delimiter.auto": string;
  "projects.import.preview": string;
  "projects.import.mapping": string;
  "projects.import.mapping.column": string;
  "projects.import.mapping.field": string;
  "projects.import.field.ignore": string;
  "projects.import.field.name": string;
  "projects.import.field.description": string;
  "projects.import.field.state": string;
  "projects.import.field.priority": string;
  "projects.import.field.assignee": string;
  "projects.import.field.labels": string;
  "projects.import.field.startDate": string;
  "projects.import.field.targetDate": string;
  "projects.import.field.estimatePoint": string;
  "projects.import.totals.rows": string;
  "projects.import.totals.valid": string;
  "projects.import.totals.skipped": string;
  "projects.import.totals.unmapped": string;
  "projects.import.autoLabels": string;
  "projects.import.run": string;
  "projects.import.running": string;
  "projects.import.done": string;
  "projects.import.failed": string;
  "projects.import.empty": string;
  "projects.import.help.jira": string;

  // ─── Files / Office ────────────────────────────────────────────────
  "files.upload": string;
  "files.newFolder": string;
  "files.newDocument": string;
  "files.newSpreadsheet": string;
  "files.newPresentation": string;
  "files.empty": string;
  "office.openIn": string;
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
  "common.new": "Neu",
  "common.send": "Senden",
  "common.reply": "Antworten",
  "common.replyAll": "Allen antworten",
  "common.forward": "Weiterleiten",
  "common.settings": "Einstellungen",
  "common.filter": "Filter",
  "common.more": "Mehr",
  "common.all": "Alle",
  "common.none": "Keine",
  "common.empty": "Leer",
  "common.noResults": "Keine Treffer.",
  "common.error": "Fehler",
  "common.retry": "Erneut versuchen",
  "common.upload": "Hochladen",
  "common.download": "Herunterladen",
  "common.copy": "Kopieren",
  "common.copied": "Kopiert",
  "common.create": "Anlegen",
  "common.add": "Hinzufügen",
  "common.remove": "Entfernen",
  "common.confirm": "Bestätigen",
  "common.yes": "Ja",
  "common.no": "Nein",
  "common.from": "Von",
  "common.to": "An",
  "common.subject": "Betreff",
  "common.date": "Datum",
  "common.status": "Status",
  "common.priority": "Priorität",
  "common.assignee": "Zugewiesen an",
  "common.author": "Autor",
  "common.title": "Titel",
  "common.description": "Beschreibung",
  "common.notes": "Notizen",
  "common.attachments": "Anlagen",
  "common.activity": "Aktivität",
  "common.details": "Details",
  "common.today": "Heute",
  "common.thisWeek": "Diese Woche",

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

  "mail.folder.inbox": "Posteingang",
  "mail.folder.sent": "Gesendet",
  "mail.folder.drafts": "Entwürfe",
  "mail.folder.spam": "Spam",
  "mail.folder.trash": "Papierkorb",
  "mail.folder.archive": "Archiv",
  "mail.compose": "Neue Mail",
  "mail.compose.to": "An",
  "mail.compose.cc": "Cc",
  "mail.compose.bcc": "Bcc",
  "mail.compose.subject": "Betreff",
  "mail.compose.body": "Nachricht",
  "mail.compose.send": "Senden",
  "mail.compose.saveDraft": "Entwurf speichern",
  "mail.empty.list": "Keine Mails",
  "mail.empty.noSelection": "Wähle eine Mail aus.",
  "mail.markRead": "Als gelesen markieren",
  "mail.markUnread": "Als ungelesen markieren",
  "mail.delete": "In den Papierkorb",
  "mail.moveTo": "Verschieben in …",
  "mail.settings": "Mail-Einstellungen (SnappyMail Admin)",

  "crm.companies": "Firmen",
  "crm.people": "Personen",
  "crm.deals": "Deals",
  "crm.notes": "Notizen",
  "crm.tab.activity": "Aktivität",
  "crm.tab.people": "Personen",
  "crm.tab.deals": "Deals",
  "crm.tab.details": "Details",
  "crm.empty.companies": "Noch keine Firmen. Lege die erste an.",
  "crm.empty.people": "Keine Personen verknüpft.",
  "crm.empty.activity": "Noch keine Aktivität. Lege oben eine Notiz an.",
  "crm.empty.selection":
    "Wähle links eine Firma, um Activity-Feed, Personen, Deals und alle Stammdaten zu sehen.",
  "crm.placeholder.companyName": "Firmenname · Enter zum Anlegen",
  "crm.placeholder.search": "Firma suchen …",
  "crm.scraper": "Lead-Scraper anstoßen",
  "crm.settings": "CRM-Einstellungen (Twenty)",

  "helpdesk.tickets": "Tickets",
  "helpdesk.scope.all": "Alle",
  "helpdesk.scope.mine": "Meine",
  "helpdesk.scope.unassigned": "Nicht zugewiesen",
  "helpdesk.filter.open": "Offen",
  "helpdesk.filter.closed": "Geschlossen",
  "helpdesk.filter.all": "Alle",
  "helpdesk.status.new": "Neu",
  "helpdesk.status.open": "Offen",
  "helpdesk.status.pending": "Wartend",
  "helpdesk.status.closed": "Geschlossen",
  "helpdesk.status.merged": "Zusammengeführt",
  "helpdesk.priority.low": "Niedrig",
  "helpdesk.priority.normal": "Normal",
  "helpdesk.priority.high": "Hoch",
  "helpdesk.priority.urgent": "Dringend",
  "helpdesk.empty.mine": "Keine Tickets für dich.",
  "helpdesk.empty.allAssigned": "Alles zugewiesen.",
  "helpdesk.empty.open": "Keine offenen Tickets.",
  "helpdesk.empty.generic": "Keine Tickets.",
  "helpdesk.newTicket": "Neues Ticket",
  "helpdesk.reply": "Antworten",
  "helpdesk.internalNote": "Interne Notiz",
  "helpdesk.assignee": "Bearbeiter",
  "helpdesk.group": "Gruppe",
  "helpdesk.settings": "Einstellungen (Gruppen, Absender, Kanäle)",
  "helpdesk.slaRisk": "SLA-Risiko",
  "helpdesk.slaRisk.title":
    "Nur Tickets mit SLA unter 60 Minuten oder überfällig anzeigen",
  "helpdesk.stats.open": "Offen",
  "helpdesk.stats.slaAtRisk": "SLA-Risiko",
  "helpdesk.stats.closedToday": "Heute geschlossen",
  "helpdesk.stats.capped": "nur Teilmenge — siehe Zammad bei sehr großen Queues",
  "helpdesk.composer.answerTab": "Antwort",
  "helpdesk.composer.internalTab": "Interne Notiz",
  "helpdesk.composer.sendShortcut": "⌘/Ctrl + Enter zum Senden",
  "helpdesk.composer.solutionLabel": "Interne Lösung / Abschluss (optional, nur für die Akte)",
  "helpdesk.composer.solutionPlaceholder":
    "Kurz festhalten, was geklärt wurde — wird als interne Notiz gespeichert.",
  "helpdesk.composer.placeholderReply": "Antwort an Kunde…",
  "helpdesk.composer.placeholderNote": "Interne Notiz — Kunde sieht das nicht.",
  "helpdesk.composer.statusAfterSend": "Status nach Senden",
  "helpdesk.composer.saveNote": "Notiz speichern",
  "helpdesk.customer.crm": "CRM",
  "helpdesk.customer.crmTitle": "Person in Twenty CRM öffnen",
  "helpdesk.channel.email": "E-Mail",
  "helpdesk.channel.phone": "Telefon",
  "helpdesk.channel.web": "Web / Portal",
  "helpdesk.channel.note": "Notiz",
  "helpdesk.channel.sms": "SMS",
  "helpdesk.channel.chat": "Chat",
  "helpdesk.channel.twitter": "Twitter / X",
  "helpdesk.channel.facebook": "Facebook",
  "helpdesk.channel.other": "Kanal",
  "helpdesk.import.csvTitle": "Tickets aus CSV importieren",
  "helpdesk.conversation.title": "Konversation",
  "helpdesk.conversation.pickTicket": "Wähle ein Ticket",
  "helpdesk.portalLink.mintTitle":
    "Signierten Magic-Link für den Kunden erstellen und in die Zwischenablage kopieren.",
  "helpdesk.portalLink.button": "Magic-Link",
  "helpdesk.portalLink.copied": "Kopiert",
  "helpdesk.portalLink.prompt": "Magic-Link kopieren:",
  "helpdesk.portalLink.manualCopied": "Magic-Link erstellt (manuell kopieren).",
  "helpdesk.portalLink.copiedToast": "Magic-Link kopiert (gültig 30 Tage).",
  "helpdesk.empty.noTicket": "Kein Ticket gewählt",
  "helpdesk.empty.noTicketHint":
    "Wähle links ein Ticket, um Verlauf und Antwort-Composer zu sehen.",
  "helpdesk.empty.noMessages": "Keine Nachrichten.",
  "helpdesk.empty.zammadTitle": "Native Zammad-Integration",
  "helpdesk.empty.zammadHint":
    "Tickets bearbeiten, antworten, intern notieren — direkt im Portal.",
  "helpdesk.error.loadTicket": "Ticket laden fehlgeschlagen",
  "helpdesk.error.createTicket": "Anlegen fehlgeschlagen",
  "helpdesk.error.save": "Speichern fehlgeschlagen",
  "helpdesk.error.send": "Senden fehlgeschlagen",
  "helpdesk.error.tagAdd": "Tag hinzufügen fehlgeschlagen",
  "helpdesk.error.tagRemove": "Tag entfernen fehlgeschlagen",
  "helpdesk.error.portalLink": "Magic-Link fehlgeschlagen",
  "helpdesk.error.macro": "Macro fehlgeschlagen",
  "helpdesk.error.bulk": "Bulk-Update fehlgeschlagen",
  "helpdesk.bulk.partialFail": "konnten nicht aktualisiert werden",
  "helpdesk.card.mine": "Mir",
  "helpdesk.card.selectBulk": "Auswählen für Bulk-Aktionen",
  "helpdesk.card.noTitle": "(ohne Titel)",
  "helpdesk.card.unread": "Ungelesen",
  "helpdesk.crm.twentyLabel": "Twenty CRM",
  "helpdesk.newTicket.subjectPh": "Betreff…",
  "helpdesk.newTicket.bodyPh": "Beschreibung (optional)",
  "helpdesk.newTicket.cancel": "Abbrechen",
  "helpdesk.newTicket.submit": "Anlegen",
  "helpdesk.composer.templates": "Vorlagen",
  "helpdesk.composer.templatesTitle": "Vorlagen einsetzen",
  "helpdesk.composer.attachmentSoon": "Anhang (bald verfügbar)",
  "helpdesk.composer.attachment": "Anhang",
  "helpdesk.customer.videoCall": "Video-Call",
  "helpdesk.customer.mailAction": "Mail",
  "helpdesk.customer.profile360": "360°",
  "helpdesk.customer.profileTitle": "Kundenprofil öffnen (Customer 360°)",
  "helpdesk.customer.unknown": "Unbekannter Kontakt",
  "helpdesk.article.agent": "Agent",
  "helpdesk.sla.firstResponse": "First Response",
  "helpdesk.sla.closeDeadline": "Close",
  "helpdesk.sla.breached": "SLA verletzt",
  "helpdesk.sla.pill": "SLA",
  "helpdesk.sla.due": "fällig:",
  "helpdesk.sla.panel.first": "Erstantwort",
  "helpdesk.sla.panel.close": "Lösung",
  "helpdesk.sla.panel.none": "Kein SLA aktiv.",
  "helpdesk.time.justNow": "gerade",
  "helpdesk.time.mins": "Min.",
  "helpdesk.time.hours": "Std.",
  "helpdesk.time.days": "Tg.",
  "helpdesk.drawer.ticketsTotal": "Tickets gesamt",
  "helpdesk.drawer.customerSince": "Kunde seit",
  "helpdesk.drawer.history": "Ticketverlauf",
  "helpdesk.drawer.noTickets": "Keine Tickets.",
  "helpdesk.drawer.writeEmail": "E-Mail schreiben",
  "helpdesk.drawer.title": "Kundenprofil",
  "helpdesk.drawer.close": "Schließen (Esc)",

  "sign.documents": "Signaturen",
  "sign.status.draft": "Entwürfe",
  "sign.status.pending": "Ausstehend",
  "sign.status.completed": "Abgeschlossen",
  "sign.status.rejected": "Abgelehnt",
  "sign.scope.all": "Alle",
  "sign.upload": "Hochladen",
  "sign.send": "Senden",
  "sign.empty.list": "Keine Dokumente.",
  "sign.empty.selection": "Wähle ein Dokument aus oder lade ein neues hoch.",

  "calls.title": "Calls",
  "calls.newCall": "Neuer Call",
  "calls.active": "Aktiv",
  "calls.history": "Verlauf",
  "calls.empty.list": "Keine Calls",
  "calls.empty.selection": "Wähle einen Call aus oder starte einen neuen.",
  "calls.composer.subject": "Betreff",
  "calls.composer.start": "Call starten",

  "projects.view.board": "Board",
  "projects.view.backlog": "Backlog",
  "projects.view.sprints": "Sprints",
  "projects.view.roadmap": "Roadmap",
  "projects.view.list": "Liste",
  "projects.newIssue": "Neues Issue",
  "projects.newProject": "Neues Projekt",
  "projects.empty.list": "Keine Projekte.",
  "projects.empty.selection": "Wähle ein Projekt aus.",
  "projects.import": "Import",
  "projects.import.title": "Issues aus CSV importieren",
  "projects.import.description":
    "Lädt Issues aus einer CSV-Datei in das aktuelle Projekt. Erkennt Jira-, Linear- und Plane-Spalten automatisch — fehlende Mappings kannst du unten anpassen.",
  "projects.import.upload": "CSV hochladen",
  "projects.import.paste": "oder hier einfügen …",
  "projects.import.delimiter": "Trenner",
  "projects.import.delimiter.auto": "automatisch",
  "projects.import.preview": "Vorschau",
  "projects.import.mapping": "Spalten-Mapping",
  "projects.import.mapping.column": "Spalte",
  "projects.import.mapping.field": "Feld",
  "projects.import.field.ignore": "Ignorieren",
  "projects.import.field.name": "Titel",
  "projects.import.field.description": "Beschreibung",
  "projects.import.field.state": "Status",
  "projects.import.field.priority": "Priorität",
  "projects.import.field.assignee": "Bearbeiter",
  "projects.import.field.labels": "Labels",
  "projects.import.field.startDate": "Startdatum",
  "projects.import.field.targetDate": "Zieldatum",
  "projects.import.field.estimatePoint": "Schätzung",
  "projects.import.totals.rows": "Zeilen",
  "projects.import.totals.valid": "gültig",
  "projects.import.totals.skipped": "übersprungen",
  "projects.import.totals.unmapped": "unbekannte Labels",
  "projects.import.autoLabels": "Fehlende Labels automatisch anlegen",
  "projects.import.run": "Importieren",
  "projects.import.running": "Importiere …",
  "projects.import.done": "{count} Issues importiert.",
  "projects.import.failed": "{count} Zeilen fehlgeschlagen.",
  "projects.import.empty": "Noch keine CSV geladen.",
  "projects.import.help.jira":
    "Tipp: In Jira → Filter → „Export → CSV (alle Felder)“ liefert ein direkt kompatibles Format.",

  "files.upload": "Hochladen",
  "files.newFolder": "Neuer Ordner",
  "files.newDocument": "Neues Dokument",
  "files.newSpreadsheet": "Neue Tabelle",
  "files.newPresentation": "Neue Präsentation",
  "files.empty": "Dieser Ordner ist leer.",
  "office.openIn": "Öffnen in …",
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
  "common.new": "New",
  "common.send": "Send",
  "common.reply": "Reply",
  "common.replyAll": "Reply all",
  "common.forward": "Forward",
  "common.settings": "Settings",
  "common.filter": "Filter",
  "common.more": "More",
  "common.all": "All",
  "common.none": "None",
  "common.empty": "Empty",
  "common.noResults": "No results.",
  "common.error": "Error",
  "common.retry": "Retry",
  "common.upload": "Upload",
  "common.download": "Download",
  "common.copy": "Copy",
  "common.copied": "Copied",
  "common.create": "Create",
  "common.add": "Add",
  "common.remove": "Remove",
  "common.confirm": "Confirm",
  "common.yes": "Yes",
  "common.no": "No",
  "common.from": "From",
  "common.to": "To",
  "common.subject": "Subject",
  "common.date": "Date",
  "common.status": "Status",
  "common.priority": "Priority",
  "common.assignee": "Assignee",
  "common.author": "Author",
  "common.title": "Title",
  "common.description": "Description",
  "common.notes": "Notes",
  "common.attachments": "Attachments",
  "common.activity": "Activity",
  "common.details": "Details",
  "common.today": "Today",
  "common.thisWeek": "This week",

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

  "mail.folder.inbox": "Inbox",
  "mail.folder.sent": "Sent",
  "mail.folder.drafts": "Drafts",
  "mail.folder.spam": "Spam",
  "mail.folder.trash": "Trash",
  "mail.folder.archive": "Archive",
  "mail.compose": "New email",
  "mail.compose.to": "To",
  "mail.compose.cc": "Cc",
  "mail.compose.bcc": "Bcc",
  "mail.compose.subject": "Subject",
  "mail.compose.body": "Message",
  "mail.compose.send": "Send",
  "mail.compose.saveDraft": "Save draft",
  "mail.empty.list": "No mails",
  "mail.empty.noSelection": "Pick a mail to read.",
  "mail.markRead": "Mark as read",
  "mail.markUnread": "Mark as unread",
  "mail.delete": "Move to trash",
  "mail.moveTo": "Move to …",
  "mail.settings": "Mail settings (SnappyMail Admin)",

  "crm.companies": "Companies",
  "crm.people": "People",
  "crm.deals": "Deals",
  "crm.notes": "Notes",
  "crm.tab.activity": "Activity",
  "crm.tab.people": "People",
  "crm.tab.deals": "Deals",
  "crm.tab.details": "Details",
  "crm.empty.companies": "No companies yet. Create the first one.",
  "crm.empty.people": "No people linked.",
  "crm.empty.activity": "No activity yet. Add a note above.",
  "crm.empty.selection":
    "Pick a company on the left to see activity, people, deals and core data.",
  "crm.placeholder.companyName": "Company name · Enter to create",
  "crm.placeholder.search": "Search companies …",
  "crm.scraper": "Run lead scraper",
  "crm.settings": "CRM settings (Twenty)",

  "helpdesk.tickets": "Tickets",
  "helpdesk.scope.all": "All",
  "helpdesk.scope.mine": "Mine",
  "helpdesk.scope.unassigned": "Unassigned",
  "helpdesk.filter.open": "Open",
  "helpdesk.filter.closed": "Closed",
  "helpdesk.filter.all": "All",
  "helpdesk.status.new": "New",
  "helpdesk.status.open": "Open",
  "helpdesk.status.pending": "Pending",
  "helpdesk.status.closed": "Closed",
  "helpdesk.status.merged": "Merged",
  "helpdesk.priority.low": "Low",
  "helpdesk.priority.normal": "Normal",
  "helpdesk.priority.high": "High",
  "helpdesk.priority.urgent": "Urgent",
  "helpdesk.empty.mine": "No tickets for you.",
  "helpdesk.empty.allAssigned": "Everything assigned.",
  "helpdesk.empty.open": "No open tickets.",
  "helpdesk.empty.generic": "No tickets.",
  "helpdesk.newTicket": "New ticket",
  "helpdesk.reply": "Reply",
  "helpdesk.internalNote": "Internal note",
  "helpdesk.assignee": "Assignee",
  "helpdesk.group": "Group",
  "helpdesk.settings": "Settings (groups, senders, channels)",
  "helpdesk.slaRisk": "SLA risk",
  "helpdesk.slaRisk.title": "Show only tickets with SLA under 60 minutes or breached",
  "helpdesk.stats.open": "Open",
  "helpdesk.stats.slaAtRisk": "SLA at risk",
  "helpdesk.stats.closedToday": "Closed today",
  "helpdesk.stats.capped": "partial count — see Zammad for very large queues",
  "helpdesk.composer.answerTab": "Reply",
  "helpdesk.composer.internalTab": "Internal note",
  "helpdesk.composer.sendShortcut": "⌘/Ctrl + Enter to send",
  "helpdesk.composer.solutionLabel": "Internal resolution (optional, for the record)",
  "helpdesk.composer.solutionPlaceholder":
    "Briefly note what was resolved — saved as an internal note.",
  "helpdesk.composer.placeholderReply": "Reply to customer…",
  "helpdesk.composer.placeholderNote": "Internal note — not visible to customer.",
  "helpdesk.composer.statusAfterSend": "Status after send",
  "helpdesk.composer.saveNote": "Save note",
  "helpdesk.customer.crm": "CRM",
  "helpdesk.customer.crmTitle": "Open person in Twenty CRM",
  "helpdesk.channel.email": "Email",
  "helpdesk.channel.phone": "Phone",
  "helpdesk.channel.web": "Web / portal",
  "helpdesk.channel.note": "Note",
  "helpdesk.channel.sms": "SMS",
  "helpdesk.channel.chat": "Chat",
  "helpdesk.channel.twitter": "Twitter / X",
  "helpdesk.channel.facebook": "Facebook",
  "helpdesk.channel.other": "Channel",
  "helpdesk.import.csvTitle": "Import tickets from CSV",
  "helpdesk.conversation.title": "Conversation",
  "helpdesk.conversation.pickTicket": "Select a ticket",
  "helpdesk.portalLink.mintTitle":
    "Create a signed magic link for the customer and copy it to the clipboard.",
  "helpdesk.portalLink.button": "Magic link",
  "helpdesk.portalLink.copied": "Copied",
  "helpdesk.portalLink.copiedToast": "Magic link copied (valid 30 days).",
  "helpdesk.portalLink.prompt": "Copy magic link:",
  "helpdesk.portalLink.manualCopied": "Magic link created (copy manually).",
  "helpdesk.empty.noTicket": "No ticket selected",
  "helpdesk.empty.noTicketHint":
    "Pick a ticket on the left to see the thread and reply composer.",
  "helpdesk.empty.noMessages": "No messages.",
  "helpdesk.empty.zammadTitle": "Native Zammad integration",
  "helpdesk.empty.zammadHint":
    "Handle tickets, reply, and add internal notes — right in the portal.",
  "helpdesk.error.loadTicket": "Failed to load ticket",
  "helpdesk.error.createTicket": "Failed to create ticket",
  "helpdesk.error.save": "Failed to save",
  "helpdesk.error.send": "Failed to send",
  "helpdesk.error.tagAdd": "Failed to add tag",
  "helpdesk.error.tagRemove": "Failed to remove tag",
  "helpdesk.error.portalLink": "Magic link failed",
  "helpdesk.error.macro": "Macro failed",
  "helpdesk.error.bulk": "Bulk update failed",
  "helpdesk.bulk.partialFail": "could not be updated",
  "helpdesk.card.mine": "Mine",
  "helpdesk.card.selectBulk": "Select for bulk actions",
  "helpdesk.card.noTitle": "(no title)",
  "helpdesk.card.unread": "Unread",
  "helpdesk.crm.twentyLabel": "Twenty CRM",
  "helpdesk.newTicket.subjectPh": "Subject…",
  "helpdesk.newTicket.bodyPh": "Description (optional)",
  "helpdesk.newTicket.cancel": "Cancel",
  "helpdesk.newTicket.submit": "Create",
  "helpdesk.composer.templates": "Templates",
  "helpdesk.composer.templatesTitle": "Insert template",
  "helpdesk.composer.attachmentSoon": "Attachment (coming soon)",
  "helpdesk.composer.attachment": "Attachment",
  "helpdesk.customer.videoCall": "Video call",
  "helpdesk.customer.mailAction": "Mail",
  "helpdesk.customer.profile360": "360°",
  "helpdesk.customer.profileTitle": "Open customer profile (360°)",
  "helpdesk.customer.unknown": "Unknown contact",
  "helpdesk.article.agent": "Agent",
  "helpdesk.sla.firstResponse": "First response",
  "helpdesk.sla.closeDeadline": "Close",
  "helpdesk.sla.breached": "SLA breached",
  "helpdesk.sla.pill": "SLA",
  "helpdesk.sla.due": "due:",
  "helpdesk.sla.panel.first": "First response",
  "helpdesk.sla.panel.close": "Resolution",
  "helpdesk.sla.panel.none": "No active SLA.",
  "helpdesk.time.justNow": "just now",
  "helpdesk.time.mins": "min",
  "helpdesk.time.hours": "h",
  "helpdesk.time.days": "d",
  "helpdesk.drawer.ticketsTotal": "Tickets total",
  "helpdesk.drawer.customerSince": "Customer since",
  "helpdesk.drawer.history": "Ticket history",
  "helpdesk.drawer.noTickets": "No tickets.",
  "helpdesk.drawer.writeEmail": "Write email",
  "helpdesk.drawer.title": "Customer profile",
  "helpdesk.drawer.close": "Close (Esc)",

  "sign.documents": "Signatures",
  "sign.status.draft": "Drafts",
  "sign.status.pending": "Pending",
  "sign.status.completed": "Completed",
  "sign.status.rejected": "Rejected",
  "sign.scope.all": "All",
  "sign.upload": "Upload",
  "sign.send": "Send",
  "sign.empty.list": "No documents.",
  "sign.empty.selection": "Pick a document or upload a new one.",

  "calls.title": "Calls",
  "calls.newCall": "New call",
  "calls.active": "Active",
  "calls.history": "History",
  "calls.empty.list": "No calls",
  "calls.empty.selection": "Pick a call or start a new one.",
  "calls.composer.subject": "Subject",
  "calls.composer.start": "Start call",

  "projects.view.board": "Board",
  "projects.view.backlog": "Backlog",
  "projects.view.sprints": "Sprints",
  "projects.view.roadmap": "Roadmap",
  "projects.view.list": "List",
  "projects.newIssue": "New issue",
  "projects.newProject": "New project",
  "projects.empty.list": "No projects.",
  "projects.empty.selection": "Pick a project.",
  "projects.import": "Import",
  "projects.import.title": "Import issues from CSV",
  "projects.import.description":
    "Bulk-creates issues in the current project from a CSV file. Jira, Linear and Plane columns are detected automatically — adjust any unmapped column below.",
  "projects.import.upload": "Upload CSV",
  "projects.import.paste": "or paste it here…",
  "projects.import.delimiter": "Delimiter",
  "projects.import.delimiter.auto": "auto-detect",
  "projects.import.preview": "Preview",
  "projects.import.mapping": "Column mapping",
  "projects.import.mapping.column": "Column",
  "projects.import.mapping.field": "Field",
  "projects.import.field.ignore": "Ignore",
  "projects.import.field.name": "Title",
  "projects.import.field.description": "Description",
  "projects.import.field.state": "Status",
  "projects.import.field.priority": "Priority",
  "projects.import.field.assignee": "Assignee",
  "projects.import.field.labels": "Labels",
  "projects.import.field.startDate": "Start date",
  "projects.import.field.targetDate": "Due date",
  "projects.import.field.estimatePoint": "Estimate",
  "projects.import.totals.rows": "rows",
  "projects.import.totals.valid": "valid",
  "projects.import.totals.skipped": "skipped",
  "projects.import.totals.unmapped": "unknown labels",
  "projects.import.autoLabels": "Auto-create missing labels",
  "projects.import.run": "Import",
  "projects.import.running": "Importing…",
  "projects.import.done": "{count} issues imported.",
  "projects.import.failed": "{count} rows failed.",
  "projects.import.empty": "No CSV loaded yet.",
  "projects.import.help.jira":
    "Tip: In Jira → Filter → ‘Export → CSV (all fields)’ produces a directly compatible file.",

  "files.upload": "Upload",
  "files.newFolder": "New folder",
  "files.newDocument": "New document",
  "files.newSpreadsheet": "New spreadsheet",
  "files.newPresentation": "New presentation",
  "files.empty": "This folder is empty.",
  "office.openIn": "Open in …",
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
