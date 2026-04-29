# Onboarding-Checklist neue Mitarbeiter:in

> Diese Checklist deckt den ersten Tag bis zur ersten Woche bei
> Kineo / MedTheris ab. Punkte sind in der Reihenfolge gelistet, in
> der sie typischerweise abgearbeitet werden.

## Tag 1 — Zugang & Account-Setup

- [ ] **Keycloak-Account anlegen**: <https://auth.kineo360.work> →
      Admin-Console → Realm „kineo" → Users → Add user. Email +
      First/Last Name + temporäres Passwort setzen. User in die
      passende Gruppe (`medtheris`, `corehub`, …) hinzufügen.
- [ ] **Migadu-Postfach einrichten**: <https://admin.migadu.com> →
      Mailboxes → New Mailbox. Pattern: `vorname.nachname@medtheris.com`
      (oder `@corehub.work` für Corehub-Mitarbeitende).
- [ ] **2FA-Reset-Karte ausdrucken**: Im Keycloak-User-Profil unter
      „Credentials" eine Backup-OTP-Liste erzeugen, drucken, im
      Tresor ablegen. Erst dann in der Welcome-Mail erwähnen.
- [ ] **Welcome-Mail versenden**: Vorlage `WELCOME_DE.md` aus dem
      Wiki kopieren, Login-URL + temporäres Passwort einsetzen.
- [ ] **Kalender-Einladungen**: Daily-Standup, wöchentliches Sync,
      monatliches All-Hands.

## Tag 1-2 — Tools & Zugriff

- [ ] **Plane-Workspace** (Projektmanagement): Add member im richtigen
      Workspace, Rolle „Member" oder „Admin" je nach Bedarf.
- [ ] **Twenty CRM**: Gruppenbasiert automatisch synchronisiert,
      ABER: API-Key generieren falls die Person scrapen darf.
- [ ] **Mautic** (nur MedTheris): User in Mautic anlegen mit Rolle
      „Marketing-User" — wir teilen den `portal-bridge` API-Token
      NICHT mit Endusern.
- [ ] **GitHub-Org**: Einladung an `corelabcom` (für Devs) oder
      Read-Access auf das `playbooks`-Repo (für Ops).
- [ ] **Status-Page-Bookmark**: <https://app.kineo360.work/p/status>
      ist ohne Login zugänglich, sollte aber im Lesezeichen-Ordner
      „MedTheris" liegen.

## Tag 2-3 — Produkt-Onboarding

- [ ] **Portal-Tour**: 30-min Walkthrough durch CRM, Mail, Calls,
      Office. Fokus: Cmd+K (globale Suche), Triage-Loop, Mautic-Push.
- [ ] **Scraper-Demo** (nur falls Sales/Marketing): Live einen
      Postleitzahl-Scrape laufen lassen, Ergebnisse in CRM checken,
      einen Lead in Mautic pushen.
- [ ] **Fehler-Eskalation**: Erklären, wer welche Probleme bekommt
      (siehe `escalation-matrix.md` im Wiki).
- [ ] **Datenschutz-Briefing**: Schweizer DSG + GDPR-Basics. ICP
      sind Schweizer Praxen, also DSG > GDPR.

## Erste Woche — Vertiefung

- [ ] **AI-Features anschauen**: AI-Lead-Classify im CRM-Detail,
      AI-Email-Drafts in der Mail-Compose. Token-Kosten besprechen.
- [ ] **Audit-Log-Lesezugriff** (nur Admins): `/api/admin/audit?limit=50`
      → JSON, oder dashboard-internes Audit-View (kommt in Welle 7
      RBAC).
- [ ] **Kalender-Sync** mit eigenem Tool (Google/Apple): Calendar-
      Anbindung im Portal aktivieren, ICS-Feed konfigurieren.
- [ ] **Notiz-Vorlagen** im Files-Modul: `templates/` durchgehen.

## Erste 30 Tage — Tiefe

- [ ] **Backup-Wissen**: `corelab-backup.sh` + `corelab-restore-drill.sh`
      lesen, einmal restore-drill manuell triggern.
- [ ] **Helpdesk-Workflow**: Zammad → Portal → Customer-Magic-Link
      lesen + einen Ticket-Lifecycle simulieren.
- [ ] **Quartalsziele** mit dem direkten Lead besprechen, im Plane-
      Cycle als OKRs festhalten.

---

**Buddy-System**: Jede:r neue Mitarbeiter:in bekommt für die ersten
30 Tage eine:n erfahrene:n Buddy zugeordnet. Daily 15-min Check-In
in der ersten Woche, dann je nach Bedarf.
