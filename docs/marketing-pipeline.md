# MedTheris Marketing-Pipeline — Status & Plan

> Stand: 2026‑04‑26

## TL;DR — was ist heute schon da?

| Layer                         | Tool / Service              | Status      |
|-------------------------------|-----------------------------|-------------|
| **Lead-Discovery**            | `medtheris-scraper` (Python)| ✅ Live     |
| **Lead-Storage / CRM**        | Twenty (`crm.kineo360.work`)| ✅ Live     |
| **Trigger UI für Scraper**    | Portal `/admin/onboarding/scraper` | ✅ Live |
| **Marketing Automation**      | Mautic (`marketing.medtheris.kineo360.work`) | 🟡 Compose vorhanden, Initial-Setup offen — siehe `docs/mautic-setup.md` |
| **Native Marketing-UI**       | Portal `/medtheris/marketing` | ✅ Code deployt (zeigt Setup-Anleitung bis Bridge-Token gesetzt) |
| **Drip-Sequences / Tracking** | Mautic Campaigns + Open/Click Tracking | ⏳ wird im Mautic UI angelegt |
| **Twenty ↔ Mautic Sync**      | n8n Workflow (Stage-Mapping)| ⏳ geplant — Helfer (`upsertContact`, `addContactToSegment`) liegen schon im Portal-Code |

Die User-Frage *"hatten wir nicht noch ne marketing pipeline mit einem
weiteren programm vorgesehen?"* bezieht sich auf die zweite Spalte:
ja, es war geplant — aber **nicht deployt**. In der ersten
Architektur-Diskussion war `Lemlist` (SaaS) im Gespräch, das wurde aber
zugunsten einer self-hosted Lösung verworfen, ohne dass eine ausgewählt
wurde.

---

## Empfehlung: zweistufiger Stack

```
   ┌──────────────┐       ┌──────────────┐       ┌──────────────┐
   │ Scraper      │──────▶│ Twenty CRM   │──────▶│   n8n        │
   │ (Discovery)  │ Lead  │ (Source of   │ Trigger│ (Orchestration│
   └──────────────┘       │  Truth)      │       │  + Sequences)│
                          └──────────────┘       └──────┬───────┘
                                                        │
                                                        ▼
                                                 ┌──────────────┐
                                                 │  Listmonk    │
                                                 │  (Mass-Mail  │
                                                 │  Provider)   │
                                                 └──────┬───────┘
                                                        │ SMTP
                                                        ▼
                                              ┌────────────────┐
                                              │ Brevo / Migadu │
                                              │ (Versand)      │
                                              └────────────────┘
```

### Warum genau diese Kombi?

- **n8n** (apache-2 lizenziert, self-hosted, Docker) ist die heute
  beste Open-Source-Workflow-Engine. Hat fertige Twenty-, Listmonk-,
  HTTP-, Webhook-, Wait-, IF-Nodes — alles was wir für eine Sales-
  Sequenz brauchen.
- **Listmonk** ist ein lightweight (Go-binary) Newsletter / Bulk-Mail-
  Tool mit Subscriber-Management, Templates, Open/Click-Tracking,
  Bounce-Handling, Subscription-Forms, eigener REST-API. Sehr klein
  und schnell, perfekt für 1000–10000 Empfänger pro Monat.
- **Brevo** als Versand-Relay weil Hetzner Port 25/465/587 blockiert
  und Migadu Quotas hat (siehe Migadu-Limit-Vorfall vom 24.04.). Brevo
  hat einen Free-Tier von 300 Mails/Tag und ist DSGVO-OK.

### Alternative (heavier, voller Featureset): **Mautic**

Mautic ist ein voller "Marketing Automation" Stack (PHP/Symfony):
Forms, Landing Pages, Campaign-Editor, Lead-Scoring, A/B-Testing,
Contact-Segments. Selbsthosten heisst aber ~2GB RAM permanent + PHP-
Worker. Empfehlung **falls** wir später richtige Marketing-Kampagnen
fahren wollen (Anzeigen → Landing → Drip → Sales Hand-Off).

Für die heutige Phase (B2B-Outbound mit ~50–200 Praxen pro Woche)
reicht Listmonk + n8n locker.

---

## Konkreter Deploy-Plan (Phase 1, ~2h Arbeit)

### Schritt 1 — Listmonk deployen
```yaml
# docker-compose.marketing.yml (NEW)
services:
  listmonk:
    image: listmonk/listmonk:latest
    restart: unless-stopped
    environment:
      LISTMONK_app__address: 0.0.0.0:9000
      LISTMONK_db__host: listmonk-db
      LISTMONK_db__user: listmonk
      LISTMONK_db__password: ${LISTMONK_DB_PASS}
      LISTMONK_db__database: listmonk
    depends_on: [listmonk-db]
    networks: [proxy, corehub-internal]

  listmonk-db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: listmonk
      POSTGRES_PASSWORD: ${LISTMONK_DB_PASS}
      POSTGRES_DB: listmonk
    volumes:
      - listmonk_pg:/var/lib/postgresql/data
    networks: [corehub-internal]

volumes:
  listmonk_pg:
```

NPM-Proxy-Eintrag: `mailing.kineo360.work` → `listmonk:9000`.

### Schritt 2 — n8n deployen
```yaml
  n8n:
    image: n8nio/n8n:latest
    restart: unless-stopped
    environment:
      N8N_HOST: workflows.kineo360.work
      N8N_PROTOCOL: https
      N8N_PORT: 5678
      WEBHOOK_URL: https://workflows.kineo360.work
      DB_TYPE: postgresdb
      DB_POSTGRESDB_HOST: n8n-db
      DB_POSTGRESDB_USER: n8n
      DB_POSTGRESDB_PASSWORD: ${N8N_DB_PASS}
      DB_POSTGRESDB_DATABASE: n8n
      N8N_BASIC_AUTH_ACTIVE: 'true'
      N8N_BASIC_AUTH_USER: admin
      N8N_BASIC_AUTH_PASSWORD: ${N8N_BASIC_AUTH_PASSWORD}
    networks: [proxy, corehub-internal]

  n8n-db:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: n8n
      POSTGRES_PASSWORD: ${N8N_DB_PASS}
      POSTGRES_DB: n8n
    volumes:
      - n8n_pg:/var/lib/postgresql/data
    networks: [corehub-internal]
```

NPM-Eintrag: `workflows.kineo360.work` → `n8n:5678`.

### Schritt 3 — Initialer Workflow in n8n

**"New Twenty Lead → Listmonk → 3-Step Drip"**

```
[Cron: every 15min]
   └── [HTTP: GET /api/companies?stage=Neu&updatedAt>last_run]   (Twenty)
        └── [Loop: each new company]
             └── [HTTP: POST /api/subscribers]                   (Listmonk)
                  └── [HTTP: POST /api/campaigns/{drip-1}]       (Listmonk)
                       └── [Wait 3 days]
                            └── [HTTP: POST .../{drip-2}]
                                 └── [Wait 5 days]
                                      └── [HTTP: POST .../{drip-3}]
```

Wichtige Details:
- Twenty "Stage" wird in Listmonk als Subscriber-Liste gemappt
  (`prospects`, `qualified`, `negotiation`, `customer`).
- Sobald Twenty den Stage auf "qualified" hochsetzt, n8n
  unsubscribed aus `prospects` und published in `qualified` → die Drip-
  Sequence stoppt automatisch.
- Replies zu Drip-Mails landen via "Reply-To: johannes@…" wieder im
  Migadu-Postfach von Johannes UND triggern (über Mailparser/IMAP-Watcher
  in n8n) ein Twenty-Update auf Stage "in conversation".

### Schritt 4 — Brevo SMTP-Account anlegen + in Listmonk hinterlegen

- Brevo-Free-Account (300 Mails/Tag) reicht für Q2.
- Listmonk-Settings → SMTP: `smtp-relay.brevo.com:587`, User =
  Brevo-Login, Pass = Brevo-API-Key.
- DKIM/SPF/DMARC für `medtheris.kineo360.work`:
  - SPF: `v=spf1 include:spf.brevosend.com include:_spf.migadu.com -all`
  - DKIM: Brevo gibt 2 CNAME-Records (`mail._domainkey` und
    `mail2._domainkey`), in DNS einrichten.
  - DMARC: `v=DMARC1; p=quarantine; rua=mailto:dmarc@medtheris.kineo360.work`

Domain-Reputation: in den ersten 2 Wochen **maximal 50 Mails/Tag**
versenden (Listmonk hat ein Throttle dafür), sonst Spam-Folder.

---

## Phase 2 (deferred bis Phase 1 läuft & ROI klar ist)

- **Mautic** (oder direkt **HubSpot/Pardot SaaS** falls Budget da ist)
  für volle Funnel-Sicht inkl. Webseiten-Tracking, Lead-Scoring,
  Landing-Pages.
- **Inbound** über `medtheris.kineo360.work` Marketing-Site mit Forms,
  die Submissions direkt in Twenty + n8n triggern.
- **A/B Tests** auf Drip-Mail-Subjects via Listmonk Campaigns oder
  via n8n Random-Branching.

---

## Quick-Wins ohne Tools (heute schon möglich)

Bevor Phase 1 deployt ist, kannst du sofort:

1. **Manuelles Drip via Twenty + Migadu.** Twenty-View "Neue Leads
   diese Woche" → CSV-Export → Listmonk-Trial **oder** SMTP-Skript
   `scripts/send-cold-mail.py` (würde ich auf Anfrage bauen).
2. **Personalisierte Cold-Mails** mit Anthropic-LLM aus den Scraper-
   gespeicherten Daten generieren (`practice.summary`, `owner.linkedin`,
   `booking_system`, …) — der Scraper hat dafür schon alle Felder.

---

## Offene Entscheidungen

- [ ] Brevo Free-Tier vs. Migadu (Migadu hat Quota) vs. Postmark
      (transactional, ~$10/mo).
- [ ] Domain für Versand: `medtheris.kineo360.work` (riskiert die
      Reputation der Hauptdomain) oder eigene Sender-Domain
      `mail.medtheris.kineo360.work` (sauberer, Standard).
- [ ] Listmonk-vs-Mautic-Entscheidung — Listmonk ist die zügigere Wahl,
      Mautic die zukunftssichere.
- [ ] Wer pflegt die Drip-Templates (Copy)?
