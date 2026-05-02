# Cross-hub roadmap (Impact × Aufwand × Abhängigkeiten)

> Stand: 2026-05-01 — Phase 0 + Teile von Phase 1 sind im Repo (Event-Feed, Pulse-Cards, Cmd+K-Integration, Audit-Konvention, Marketing-Hub vollständig). Phase 2 Governance ist offen, ebenso Phase 4–6.

Ziel: die größten **Querschnitts-Lücken** über mehrere Hubs schließen — mit klarer Reihenfolge entlang der angebundenen Systeme **Twenty** (CRM), **Plane** (Projekte), **Zammad** (Helpdesk), **Documenso** (Signing), **Rocket.Chat** (Chat), **Mautic** (Marketing-Automation), **Postiz** (Social-Scheduling), **OpenCut** (Video-Edit), plus **Portal/Nextcloud** (Office/Files).

**Legende**

| Aufwand | Bedeutung |
|---------|-----------|
| S | wenige Tage, überwiegend Portal |
| M | 1–3 Wochen, API + UI |
| L | mehrere Wochen, Domänenmodell / mehrere Services |
| XL | Quartals-Thema, Governance / mehrere Teams |

| Impact | Bedeutung |
|--------|-----------|
| H | Hebel für viele Nutzer:innen / Automation |
| M | messbare Produktivität |
| L | Qualität, Risiko, Vertrauen |

**Abhängigkeiten (kurz)**

- **Event-Feed** entlastet alle anderen Themen (Benachrichtigung, Chat, Pulse), braucht aber stabiles **Schema + Auslieferung** (Webhook/SQS/outbox).
- **Governance & Retention** braucht **Audit + Owner pro Workspace** und je nach Tiefe **APIs der Backends** (Twenty/Zammad/Documenso/RC).
- **Knowledge/Deflection** profitiert von **Zammad KB** + vorhandener Mail-KI; Portal-eigenes Wiki ist optional.
- **Zeit/Budget (Plane)** hängt an **Plane APIs / Felder** (Estimates vs. tatsächliche Zeiten).
- **CPQ/Katalog** ist **Twenty-Datenmodell** (Custom Objects / Felder) oder separates Produkt.
- **Signing Bulk/Evidence** primär **Documenso** Fähigkeiten + dünne Portal-Schicht.

---

## Priorisierte Episoden

### Phase 0 — Fundament (jetzt)

| Thema | Impact | Aufwand | Abhängigkeiten | Lieferobjekt | Stand |
|-------|--------|---------|-----------------|--------------|-------|
| Event-Feed **Typen & Kontrakte** | H | S | keine | `portal/src/lib/integrations/event-feed-types.ts`; dieses Dokument | ✅ done |
| Pulse **Chat-Modul** durch echte Signale ersetzen | M | M | RC oder Portal-Aggregator | Rocket.Chat unread/mentions API oder Feed-Consumer | ✅ done (Pulse-Cards live) |
| Audit **Konvention** (wer schrieb was) | M | S | Portal `audit.ts` | Naming/TODO für helpdesk/sign routes | 🔄 partially (Konvention existiert, Coverage in Helpdesk + Sign offen) |
| Cmd+K Global-Suche mit Event-Feed | M | M | Phase 0 Event-Feed | Cmd+K → letzte Events bei leerer Query | ✅ done |

### Phase 1 — Integrations-/Event-Feed (horizontal)

| Paket | Impact | Aufwand | Abhängigkeiten | Systeme | Stand |
|-------|--------|---------|----------------|---------|-------|
| Normalisierte **Webhook-Ingest** (signatur-verifiziert) | H | M | Secrets pro Integration | Portal `/api/integrations/*` | ✅ done (Documenso + generic) |
| **Outbox** oder Queue (optional) für Replay | H | L | Infra-Entscheid | Redis/NATS/SQS | ❌ open |
| **Rocket.Chat Bot/Room** für Hub-Events | M | M | RC Token, Room IDs | Rocket.Chat | 🔄 partially (Call-Ring lebt; allgemeine Hub-Events offen) |
| Cmd+K / Suche um **„letzte Events"** erweitern | M | M | Event-Store minimal | Portal | ✅ done |

### Phase 2 — Governance & Retention

| Paket | Impact | Aufwand | Abhängigkeiten | Systeme |
|-------|--------|---------|----------------|---------|
| Workspace **Retention-Policy** (Dokumentation + Flags) | M | S | Legal/Product | Portal config |
| **Twenty** Lösch-/Export-Pfade dokumentieren | M | M | Twenty Admin | Twenty |
| **Zammad** Aufbewahrung / Artikel-Lifecycle | M | M | Zammad Setup | Zammad |
| **Documenso** Aufbewahrung / Zugriff | M | M | Compose `documenso` | Documenso |
| **Rocket.Chat** Retention (Ser­ver-Policy) | L | M | RC Admin | Rocket.Chat |

### Phase 3 — Knowledge & Deflection

| Paket | Impact | Aufwand | Abhängigkeiten | Systeme |
|-------|--------|---------|----------------|---------|
| Zammad **Knowledge Base** an Ticket-Erstellung koppeln (Vorschläge) | H | M | KB-Inhalt vorhanden | Zammad + Portal |
| Mail-KI **KB-Quelle** einheitlich benennen (gleiche Taxonomie wie Helpdesk) | M | S | Copy + Config | Portal |
| Optionales **Portal-Wiki** (Office/Markdown) | M | L | IA-Entscheid | Nextcloud/Portal |

### Phase 4 — Projekt: Zeit & Budget

| Paket | Impact | Aufwand | Abhängigkeiten | Systeme |
|-------|--------|---------|----------------|---------|
| Plane **Ist-Stunden** aus Modul „Zeiterfassung“ lesen (falls aktiv) | H | M–L | Plane Workspace Features | Plane |
| **Budget-Felder** am Projekt (Cap, Burn-Rate) — Anzeige im Portal | M | L | Datenmodell Plane vs. Portal-Cache | Plane + Portal |
| Alerts bei **Überschreitung** (Pulse/E-Mail) | M | M | Phase 1 Feed | Portal |

### Phase 5 — CRM: CPQ & Produktkatalog

| Paket | Impact | Aufwand | Abhängigkeiten | Systeme |
|-------|--------|---------|----------------|---------|
| **Produkt** + **Preislisten** als Twenty-Objekte oder Feldmodell | H | L–XL | Twenty Schema Migration | Twenty |
| **Angebotszeilen** + Summierung → Opportunity Amount | H | L | Editor UX | Portal + Twenty |
| Brücke zu **Signing** (PROPOSAL → Vertrag) | M | M | Documenso Upload API | Documenso |

### Phase 6 — Signing: Bulk & Evidence

| Paket | Impact | Aufwand | Abhängigkeiten | Systeme |
|-------|--------|---------|----------------|---------|
| **Bulk-Versand** (Liste → N Envelopes) | H | L | Documenso API Limits | Documenso |
| **Completion Certificate / Audit Export** im Portal | M | M–L | Documenso Export | Documenso |
| Signer **Step-up** Sichtbarkeit (was Documenso kann) | M | S–M | OIDC/Konfiguration | Documenso |

---

## Reihenfolge-Empfehlung (kleine Teams)

1. **Phase 0** — Kontrakte + Pulse verbessern (sichtbarer Fortschritt).
2. **Phase 1** — Ein Kanal (z. B. RC oder „letzte Events“-Panel) + eine echte Quelle (Sign completed / Ticket created).
3. **Phase 3** parallel zu **Phase 2 leicht** — KB-Vorschläge liefern oft schnellen Helpdesk-ROI. **← jetzt**
4. **Phase 4–6** nach Datenklärung (Plane Zeitmodul? Twenty Felder für Produkte? Documenso Bulk).
5. **Phase 7 — Marketing-Hub-Integration** (neu, 2026-05-01) — Mautic + OpenCut + Postiz sind als Tools in der Sidebar; tiefe Integration (Mautic-Sync auf Twenty-Stage-Wechsel, Postiz-Cross-Post bei OpenCut-Render) ist Backlog.

---

## System-Matrix (wer blockiert wen)

| | Twenty | Plane | Zammad | Documenso | Rocket.Chat |
|--|:------:|:-----:|:------:|:---------:|:-------------:|
| Event-Feed | Webhooks/Cron Pull | Webhooks | Webhooks | Webhooks | Outbound bots |
| Governance | Export/Löschung | Projekt-Archiv | Tickets/Articles | Dokumente | RC Policies |
| Knowledge | — | — | **Primär** | — | Optional Pins |
| Zeit/Budget | — | **Primär** | — | — | — |
| CPQ | **Primär** | — | — | Anbindung | — |
| Bulk/Evidence | — | — | — | **Primär** | — |

---

## Referenz im Code

- Pulse Aggregation: `portal/src/lib/pulse/index.ts`
- Audit Basis: `portal/src/lib/audit.ts`
- Integration Event Typen (Phase 0): `portal/src/lib/integrations/event-feed-types.ts`

Letzte Aktualisierung: Roadmap-Autorenteam (Cursor); bei Änderungen an Compose/Services bitte Matrix und Phasen mitziehen.

### Appendix: Portal integration-related API routes (generated)

*2026-04-30 — aus `portal/src/app/api` per Muster `integrations`, `webhook`, Rocket.Chat, Documenso, Plane, Twenty, Callback; gruppiert nach Backend.*

- **`api/integrations/phonestar/webhook`** — Phonestar-Inbound-Webhook
- **`api/integrations/rocketchat/call-ring`** — Rocket.Chat Outgoing Webhook → Call-Ring-Store
- **`api/comms/phonestar-ring`**, **`api/comms/incoming-calls`**, **`api/comms/call-ring/dismiss`**, **`api/comms/mentions`** — Comms mit Phonestar-/RC-Anbindung
- **`api/plane/sso`** — Plane-SSO-Brücke (inkl. Redirect/`callbackUrl`-Muster)
- **`api/projects/**`** — Plane-REST-Proxy (Issues, Cycles, Labels, Import, `my-issues`, …)
- **`api/sign/**`**, **`api/admin/sign/tenants`** — Documenso-Signing und Admin-Tenant-Infos
- **`api/crm/**`**, **`api/admin/leads/**`**, **`api/helpdesk/crm-person`**, **`api/marketing/contacts/[id]/crm`** — Twenty-CRM; ergänzend **`api/search`**, **`api/ai/*`** und **`api/office/word-merge`** wo Twenty genutzt wird
- **`api/chat/**`** (inkl. **`api/chat/call`**) — Rocket.Chat-REST-Proxy (Räume, Nachrichten, Upload, …)
