# Mobile-QA: Dashboard, Mail, Chat, Calls, CRM, Projekte, Helpdesk

Manuelle Prüfmatrix für **iPhone** und **iPad** (Safari; optional „Zum Home-Bildschirm“). Ziel: wiederholbare Checks nach Releases — keine Aussage „fertig“, sondern nachweisbares Abhaken.

## Geräte-Matrix (Minimum)

| Gerät | Orientierung | Browser |
|-------|----------------|---------|
| Schmales Telefon (≤390 px breit, z. B. iPhone SE / Mini) | Hochformat | Safari |
| Neuere Notch/Dynamic Island | Hoch + Quer | Safari |
| iPad (klein oder Standard) | Hoch + Quer | Safari |

**Zwei Modi:** normales Browser-Tab und optional **installierte Web-App** (`standalone`), falls ihr das nutzt.

## Globale Kriterien (für jeden Bereich)

- **Safe Area:** Keine wichtigen Buttons oder festen Eingaben unter der Home-Indicator-Leiste oder verdeckt durch die Notch (visuell prüfen).
- **Touch-Ziele:** Wo möglich mind. ca. **44×44 pt** wirksame Klickfläche (Apple HIG); bei Tabellen/Zeilenhöhen besonders prüfen.
- **Scroll:** Kein „festgefahrenes“ Layout (horizontaler Overflow der ganzen Seite); Längsscroll nur dort, wo erwartet (Listen, Nachrichten).
- **Tastatur:** Eingabefelder öffnen die virtuelle Tastatur ohne dass gesendete Buttons unsichtbar bleiben (Composer unten).
- **Navigation:** Auf kleinen Screens **Drawer** über Mobile-Shell erreichbar; Zielseite lädt ohne abgeschnittenen Header.

**Portal-Basis im Code:** `viewportFit: cover`, `100dvh`, `MobileShell` (Drawer + Safe-Area-Padding unten), Calls/Chat mit `env(safe-area-inset-*)` — trotzdem jede Route einzeln testen.

## Routen-Schema

Alle Pfade: `/{workspace}/…` mit `workspace ∈ { corehub, medtheris, kineo }`.

---

### 1. Dashboard

**Route:** `/{workspace}/dashboard`

**Hauptkomponente:** `portal/src/components/dashboards/WorkspaceDashboard.tsx`

| Check | OK |
|-------|---|
| Überschrift + Datum lesbar, kein Abschneiden | ☐ |
| `LivePulse`-Bereich scrollbar / nicht überbreit | ☐ |
| Karten-Grid (Inbox, Issues, …): eine Spalte auf schmal; keine Überlappung | ☐ |
| Quick-Links (Hub-Kacheln): gut antippbar, Navigation korrekt | ☐ |
| Tipps-Sektion unten lesbar mit Mobile-Shell-Padding | ☐ |

---

### 2. Mail

**Route:** `/{workspace}/mail`

**Hauptkomponente:** `portal/src/components/mail/MailClient.tsx`

| Check | OK |
|-------|---|
| Ordnerliste + Nachrichtenliste + Lesefenster: auf Phone sinnvolles **Ein-/Zwei-Spalten**-Verhalten (zurück aus Detail) | ☐ |
| Composer / Antworten: Eingabe + Senden mit Tastatur nutzbar | ☐ |
| Lange Betreff-/Snippet-Zeilen: `truncate` / Wrap akzeptabel | ☐ |
| Fehlerseite „Postfach nicht erreichbar“ auf kleinem Screen lesbar | ☐ |

---

### 3. Chat

**Route:** `/{workspace}/chat`

**Hauptkomponente:** `portal/src/components/chat/ChatClient.tsx`

| Check | OK |
|-------|---|
| Kanal-/DM-Liste vs. Thread auf Phone wechselbar | ☐ |
| Nachrichtenbereich scrollt; Eingabe unten mit Safe Area | ☐ |
| Modale Seitenleisten / Thread-Drawer nicht abgeschnitten | ☐ |

---

### 4. Calls

**Route:** `/{workspace}/calls`

**Verwandte UI:** `MeetingCallOverlay`, `ActiveCallStage`, `IncomingCallPortal` (unter `portal/src/components/calls/`)

| Check | OK |
|-------|---|
| Übersichtsseite: Buttons bedienbar, nicht unter Home Indicator | ☐ |
| Aktiver Call / Overlay: Vollbild und Mini-Stage auf Phone/iPad | ☐ |
| Jitsi/embed: Mikro/Kamera-Erlaubnis; Rotation wenn üblich | ☐ |

---

### 5. CRM

**Routen:** `/{workspace}/crm`, `/{workspace}/crm/pipeline`, `/{workspace}/crm/company/[id]`, ggf. `/{workspace}/crm/settings`

**Hauptkomponente:** `portal/src/components/crm/CrmClient.tsx` (+ Twenty-Embed falls aktiv)

| Check | OK |
|-------|---|
| Listen/Karten auf Phone eine Spalte; horizontales Scrollen nur beabsichtigt (Pipeline) | ☐ |
| Embed **Twenty** (falls genutzt): Zoom/Scroll akzeptabel; Login innerhalb iframe | ☐ |
| Company-Hub: Tabs/Sections ohne Überlauf der gesamten Seite | ☐ |
| Admin-Scraper-Bereich (falls sichtbar): Buttons erreichbar | ☐ |

---

### 6. Projekte

**Routen:** `/{workspace}/projects`, `/{workspace}/projects/plane`, `/{workspace}/projects/settings`

**Hauptkomponente:** `portal/src/components/projects/ProjectsClient.tsx` (+ Plane-Board)

| Check | OK |
|-------|---|
| Hub-Auswahl und Navigation auf Phone | ☐ |
| Plane-Board: Spalten horizontal scrollbar vs. zu schmale Spalten — dokumentieren, ob akzeptabel | ☐ |
| Issue-Detail / Modals vollständig sichtbar | ☐ |

---

### 7. Helpdesk

**Routen:** `/{workspace}/helpdesk`, `/{workspace}/helpdesk/settings`

**Hauptkomponente:** `portal/src/components/helpdesk/HelpdeskClient.tsx`

| Check | OK |
|-------|---|
| Ticketliste + Detail: Mobile-Flow (Liste ↔ Detail) | ☐ |
| Zammad-Embed (falls aktiv): Lesbarkeit, Scroll, SSO | ☐ |
| Große Formulare / Filterleisten: umbrechen oder einblendbar | ☐ |

---

## Ergebnis dokumentieren

Pro Lauf: Datum, Tester, Gerät/OS-Version, Workspace. Abweichungen kurz notieren (Screenshot + Route). Schwere Bugs vor Release eskalieren; kleine Layout-Themen als Follow-up-Issues.

## Hinweis zu iFrames

Wo das Portal **Twenty**, **Plane**, **Zammad** oder andere Tools einbettet, bestimmt deren UI einen Teil des Mobile-Verhaltens — CSP und NPM-`iframe`-Einstellungen siehe `docs/portal.md` und `scripts/npm-iframe-csp.sh`.
