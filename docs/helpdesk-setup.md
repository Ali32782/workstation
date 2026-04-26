# Helpdesk (Zammad) — Setup-Anleitung

> Stand: 2026‑04‑26. Zammad-Version: aktuelle stable (Docker-Compose).
> Public URL: <https://support.medtheris.kineo360.work>

Dieses Dokument beschreibt **wie ein Operator** den Helpdesk konfiguriert,
damit eingehende Mails (z.B. an `info@kineo360.work`) automatisch zu
Tickets werden, einen Bearbeiter zugewiesen bekommen und beantwortet
werden können.

---

## 0. Wo bin ich?

Im Portal-Sidebar des Workspace **MedTheris** gibt es den Tab
**"Helpdesk"**. Dieser Tab iframet `support.medtheris.kineo360.work`.
Direkt aufrufen kannst du Zammad auch unter:

- Admin-Login (`#admin`):  
  <https://support.medtheris.kineo360.work/#login>  
  → Standard-Owner: `johannes@medtheris.kineo360.work` (Magic-Link Login).
- Agenten-/User-Login: identisch — Berechtigungen werden über Zammad-
  Rollen gesteuert (Admin / Agent / Customer).

> Tipp: Das Portal nutzt einen Bridge-Token statt OIDC, daher loggst du
> dich aktuell **direkt in Zammad** ein. SSO via Keycloak ist deferred.

---

## 1. Postfach hinzufügen — `info@kineo360.work` als Inbound-Channel

> Ziel: Jede Mail an `info@…` landet in Zammad, wird einer **Group**
> ("Inbox" oder "Kineo Support") zugeordnet und löst optional eine
> Auto-Antwort ("Wir melden uns innerhalb von 24h") aus.

### 1.1 Vorbereitung in Migadu

1. Sicherstellen, dass `info@kineo360.work` als **Mailbox** (nicht
   Forwarder) in Migadu existiert.  
   Migadu-Admin → "Mailboxes" → ggf. "Add new" mit Passwort.
2. Passwort merken — wir brauchen es gleich für den IMAP-Pull.
3. (Optional) Die Mailbox bekommt einen Forwarder vorgeschaltet, damit
   eine zweite Person die Mails parallel sieht. Standard: **kein
   Forwarder**, weil Zammad ja schon "die zweite Person" ist.

### 1.2 In Zammad

1. Login als Admin → Zahnrad-Icon links unten → **System → Channels →
   Email**.
2. Tab **Accounts** → "Add account" rechts oben.
3. **Inbound:**
   - Adapter: **IMAP**
   - Hostname: `imap.migadu.com`
   - User: `info@kineo360.work`
   - Password: (das aus Migadu)
   - Port: `993`
   - SSL/STARTTLS: **SSL/TLS**
   - Folder: `INBOX`
   - "Keep messages on server": **off** (Zammad löscht sie nach Import).
   - Verify Connection klicken — sollte grün werden.
4. **Outbound:** *(damit Antworten von Zammad aus über die gleiche
   Adresse rausgehen)*
   - Adapter: **SMTP**
   - Hostname: `smtp.migadu.com`
   - User: `info@kineo360.work`
   - Password: (gleich wie oben)
   - Port: `465`, SSL/TLS: **SSL/TLS**
5. **Speichern.**

### 1.3 Channel-Routing (welche Group bekommt die Tickets?)

1. Admin → **System → Channels → Email** → Tab **Accounts**.
2. Bei dem neu angelegten Account auf das Zahnrad → **Edit**.
3. Feld **Destination Group**: z.B. **"Kineo Support"**.
4. (Optional) **Signature** auswählen (z.B. "Kineo Standard-Signatur",
   die du vorher unter *System → Signatures* anlegst).

### 1.4 Test

1. Schick eine Test-Mail an `info@kineo360.work` (von einer anderen
   Adresse).
2. Innerhalb von ~60 Sekunden (IMAP-Polling-Intervall) sollte das
   Ticket im Zammad-Dashboard auftauchen.
3. Antwort über Zammad zurückschreiben → kommt aus `info@…` raus.

---

## 2. Mehrere Postfächer (multi-tenant)

Jedes Workspace kann sein eigenes Postfach + Group bekommen:

| Workspace | Empfohlene Adresse                  | Group              |
|-----------|-------------------------------------|--------------------|
| MedTheris | `support@medtheris.kineo360.work`   | `Medtheris Support`|
| Kineo     | `info@kineo360.work`                | `Kineo Support`    |
| Corehub   | `support@corehub.kineo360.work`     | `Corehub Support`  |

**Pro Workspace** legst du in Zammad genau eine **Group** an
(Admin → User → Groups), und ordnest den IMAP-Channel der entsprechenden
Group zu. Anschliessend bekommen Agenten via Rollen Zugriff (Admin →
User → Roles → Permissions: "ticket.agent" + "Group X = Read/Write").

> Multi-Tenancy in Zammad ist **Group-basiert**, nicht Workspace-basiert.
> D.h. ein User mit Rolle "Agent" und Zugriff auf Group "Kineo Support"
> sieht ausschliesslich Kineo-Tickets, niemals Medtheris-Tickets.

---

## 3. Trigger & Auto-Antworten

> Ziel: Sobald ein Ticket angelegt wird, schickt Zammad eine
> Empfangsbestätigung an den Absender.

1. Admin → **System → Triggers** → "New trigger".
2. **Conditions:**
   - "Action": **is** "created"
   - "Article Sender": **is** "Customer"
   - "Group": **is** "Kineo Support"
3. **Perform:**
   - "Notification: Email" → "Recipient: Article last sender"
   - "Subject": `Re: #{ticket.title}`
   - "Body": z.B.
     ```
     Hallo {{ticket.customer.firstname}},
     vielen Dank für deine Nachricht. Wir haben deine Anfrage erhalten
     und melden uns innerhalb von 24h zurück.
     Ticket-Nummer: #{ticket.number}
     Liebe Grüsse, das Kineo-Team
     ```
4. Speichern.

---

## 4. SLA + Eskalation (optional, recommended)

1. Admin → **System → SLA** → "New SLA".
2. Conditions: Group = "Kineo Support".
3. Targets: First Response 4h, Update 12h, Solution 48h (Beispiel).
4. Eskalation: bei Verletzung → Trigger schreibt einen
   internen Hinweis ins Ticket + Mail an Admin.

---

## 5. Was prüfen, wenn keine Mails ankommen?

```sh
# Auf der Hetzner-Box:
docker logs zammad-railsserver 2>&1 | grep -i 'imap\|error' | tail -50
docker logs zammad-scheduler 2>&1 | tail -100
```

Häufige Stolpersteine:

- **Migadu-IMAP wirft 535 Auth Fail** → Passwort in Zammad ist
  abgelaufen (Migadu-Mailbox wurde rotiert). Lösung: in Migadu neuen
  App-Token erstellen, in Zammad Channel editieren.
- **Mails landen, aber keine Tickets entstehen** → "Destination Group"
  fehlt. Channel editieren, Group setzen.
- **Mails kommen rein, Antworten gehen nicht raus** → Outbound (SMTP)
  ist nicht konfiguriert. Channel editieren, "Outbound" Tab füllen.
- **Hetzner blockt SMTP 25/465/587** → wir nutzen Migadu (eigener
  Mailserver, akzeptiert von ausgehend). Falls Zammad meldet "Connection
  refused", nutze Brevo SMTP-Relay (`SMTP_RELAY_HOST` analog zum Portal).

---

## 6. Sign-In via Keycloak (deferred)

Aktuell: Zammad-User loggen sich mit lokalem Account ein (Magic-Link).
SSO-Integration via Keycloak/OIDC ist im Backlog (siehe Plane V2MIG
"Audit-Log in Keycloak"). Solange müssen Agenten lokale Accounts in
Zammad haben.

---

## 7. Native Portal-UI (Freshdesk-/Zendesk-Layout)

> Das Portal hat einen **eigenen Helpdesk-Tab**, der via Zammad-API
> arbeitet (kein iframe). Kompletter Funktionsumfang ohne Zammad-UI.

### 7.1 Was ist im Portal direkt nutzbar?

| Feature              | Tastenkürzel | Wo                                                  |
|----------------------|--------------|-----------------------------------------------------|
| Tickets durchsuchen  | `/`          | Liste links                                         |
| Tickets navigieren   | `j` / `k`    | global                                              |
| Antworten            | `r`          | Konversationspane fokussiert                        |
| Internes Notiz       | Tab "Notiz"  | im Composer                                         |
| Mir zuweisen         | `u`          | im Detail                                           |
| Neues Ticket         | `n`          | global                                              |
| Bulk-Auswahl togglen | `x`          | aktuelles Ticket markieren                          |
| Shortcuts            | `?`          | Overlay                                             |
| Esc                  | `Esc`        | Drawer / Popups schließen                           |

### 7.2 Tags

- Im Detail-Header (Konversationspane) und in der rechten Sidebar gibt es
  einen Tag-Editor mit **Autocomplete** (Zammad `tag_search`).
- Pro Klick auf das `×` rechts vom Tag wird er entfernt — Änderungen
  werden sofort persistiert.

### 7.3 Macros

- Zammad-Macros (Admin → Manage → Macros) erscheinen automatisch im
  **Macros-Dropdown** rechts oben im Detail-Header.
- Server-side Anwendung: Status-/Prio-/Owner-Patches + Tag-Adds/Removes
  + optionale Notiz oder E-Mail. Reihenfolge wie in Zammad.
- Cache: 60 s — nach Macro-Anlegen also kurz warten oder den Browser
  neu laden.

### 7.4 Bulk-Aktionen

1. Hover über Tickets in der Liste → Checkbox links erscheint.
2. Mehrere selektieren → blaue **Bulk-Bar** über der Liste.
3. Status / Priorität / Gruppe / Bearbeiter zentral setzen → Anwenden.
4. Per-Ticket-Fehler werden im Alert aufgelistet (z.B. wenn ein
   selektiertes Ticket inzwischen verschoben wurde).

### 7.5 Customer 360°

- Klick auf **Kundenname** in der Detail-Card oder den 360°-Button öffnet
  den Slide-In-Drawer.
- Anzeige: Profil + KPIs + komplette Ticket-History (alle Status, scoped
  auf die Tenant-Groups).
- Klick auf ein History-Ticket springt direkt dorthin.

### 7.6 SLA-Indikator

- Wenn in Zammad eine **SLA** definiert ist (Admin → System → SLA), zeigt
  jedes davon betroffene Ticket eine **SLA-Pill** im Header und in der
  Karte:
  - Grün: ≥ 1h Restzeit
  - Gelb: < 1h
  - Rot: bereits überschritten ("SLA verletzt")
- Detail-Sidebar zeigt First-Response- und Lösungs-Countdown getrennt.

### 7.7 Saved Views (Overviews)

- Zammad-Overviews (Admin → Manage → Overviews) erscheinen als
  **Pill-Bar** über der Ticket-Liste. Aktivieren = Tickets-Liste wechselt
  zur Overview-Definition.
- Tenant-Filter: Tickets ausserhalb der eigenen Group werden trotzdem
  rausgefiltert, selbst wenn das Overview sie eigentlich liefert.

### 7.8 Canned Responses (Vorlagen)

- Im Composer: Button **"Vorlagen"** → Dropdown mit allen gespeicherten
  Vorlagen → Klick fügt Text an Cursor-Position ein.
- **Verwaltung** (anlegen/bearbeiten/löschen) im selben Dropdown via
  "Vorlagen verwalten".
- Speicherung **lokal pro Browser** via `localStorage`
  (`helpdesk:canned-responses:<workspace>`). Server-Sync ist Backlog.

### 7.9 Mehrere Workspaces

Jeder Workspace hat seine eigenen Zammad-Groups (siehe `.env`):

```env
HELPDESK_TENANT_MEDTHERIS_GROUPS="Medtheris Support"
HELPDESK_TENANT_KINEO_GROUPS="Kineo Support"
HELPDESK_TENANT_COREHUB_GROUPS="Corehub Support"
HELPDESK_ALLOWED_GROUPS=/kineo,/medtheris,/corehub
```

User ohne passende Keycloak-Group bekommen 403; Workspace ohne
`*_GROUPS`-Eintrag bekommt 503 mit Setup-Hinweis im UI.
