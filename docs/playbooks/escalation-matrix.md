---
owner: ops-lead
last_review: 2026-05-01
status: active (single-operator phase)
---

# Eskalationsmatrix

> **Aktueller Stand**: Single-Operator-Phase. Ali ist Primary für ALLES — die Matrix dient (a) als Orientierung wenn ein zweiter Operator dazukommt, und (b) damit Ali im Notfall sieht, welcher externe Vendor zuständig ist.

## Primary / Backup

| Rolle | Primary | Backup | Erreichbarkeit |
|---|---|---|---|
| Ops-Lead (alles unten) | **Ali** | — | Telegram + ali@kineo.swiss |
| Externe Eskalation | Ali → Vendor | — | siehe Vendor-Tabelle unten |

> Sobald Johannes oder ein dritter Operator on-call sind, hier eintragen + `PORTAL_ADMIN_USERNAMES` erweitern.

## Vorfall → Wo nachschauen → Wer

| Vorfall-Typ | Erstes Runbook | Zuständig | Externe Eskalation |
|---|---|---|---|
| Login schlägt fehl (Portal, Nextcloud, RC, Gitea, Zammad) | [`docs/oidc-wiring.md`](../oidc-wiring.md) + Keycloak `/admin` | Ali | Keycloak-Community (Discourse) |
| Keycloak-Realm `main` korrupt | `keycloak/realm-main.json` reapply via UI | Ali | Keycloak-Support (kostenpflichtig) |
| Mail-Flow tot (kein Versand / kein Empfang) | `scripts/check-documenso-smtp.sh` + Migadu-Status-Page | Ali | Migadu Support `support@migadu.com` |
| Documenso schickt keine Reminder | `scripts/documenso-remind-logs.sh` + `docs/integration-event-feed.md` | Ali | Documenso GitHub-Issues |
| Zammad / Helpdesk down | [`docs/helpdesk-setup.md`](../helpdesk-setup.md) + `docker logs zammad-railsserver` | Ali | Zammad-Forum |
| Twenty CRM down / Schema-Drift | [`docs/twenty-medtheris-schema.md`](../twenty-medtheris-schema.md) + `docker logs twenty` | Ali | Twenty Discord |
| Plane down | Plane-Logs (`docker logs plane-api-1`) | Ali | Plane GitHub Issues |
| Mautic down | [`docs/mautic-setup.md`](../mautic-setup.md) | Ali | Mautic Slack |
| OpenCut Build/Run Probleme | [`docs/opencut-setup.md`](../opencut-setup.md) | Ali | OpenCut GitHub Issues |
| Postiz / Temporal-Workflows hängen | [`docs/postiz-setup.md`](../postiz-setup.md) + `docker logs postiz_temporal` | Ali | Postiz GitHub Issues |
| NPM / SSL / Cert-Renewal | `nginx-proxy-manager/README.md` + NPM-UI Logs | Ali | Let's Encrypt status page |
| Server überlastet (Load > 50, SSH unresponsive) | `uptime` + `docker stats` (lokal über Hetzner Console) | Ali | Hetzner Cloud Support |
| Komplette Server-Outage | `bash scripts/restore.sh` aus letztem S3-Backup | Ali | Hetzner Status + Cloud-Console |
| Backup defekt / fehlt | [`docs/backup-staging.md`](../backup-staging.md), `scripts/backup-verify.sh`, `scripts/fix-backup-cron.sh` | Ali | — |
| DSG-Anfrage (Auskunft, Löschung) | [`docs/SECURITY-DEBT.md`](../SECURITY-DEBT.md) — Self-Service ist Backlog | Ali | Datenschutz-Anwalt |
| Domain / DNS / TLD-Ablauf | Cloudflare-Dashboard | Ali | Cloudflare Support, Migadu Support |
| Scraper liefert Müll / 0 Hits | [`docs/scraper-runner.md`](../scraper-runner.md) + `docker logs medtheris-scraper` | Ali | Anthropic Console (API-Quota), Google Maps API-Console |

## Vendor-Erreichbarkeiten

| Vendor | Service | Kontakt | SLA |
|---|---|---|---|
| Hetzner | Server (CX42) | https://console.hetzner.cloud + Ticket-System | 24/7 für kritische Tickets |
| Cloudflare | DNS + WAF | https://dash.cloudflare.com → Support-Center | Free-Tier: best effort |
| Migadu | Mail | support@migadu.com | Mo-Fr Tagsüber CEST |
| Anthropic | Claude API (Scraper, Web-Search) | https://console.anthropic.com | Self-Serve, Quota-Erhöhung per Ticket |
| Google Cloud | Maps Places API (Scraper) | https://console.cloud.google.com | Self-Serve |
| Peoplefone | SIP/Telefonie | https://my.peoplefone.ch | Mo-Fr Bürozeiten |
| Let's Encrypt | TLS-Zertifikate | https://letsencrypt.status.io | best effort, Community-Support |

## Reaktionszeit-Erwartungen (intern)

| Severity | Beispiel | Reaktion |
|---|---|---|
| **P1** — Stack komplett down | `https://app.kineo360.work` lädt nicht | < 30 Min |
| **P2** — Eine Domäne kaputt | Login geht aber Mail nicht | < 4 h |
| **P3** — Cosmetic / Single-User | Ein bestimmter User kann nicht hochladen | < 2 Werktage |
| **P4** — Backlog-Item | "Wäre schön wenn …" | Kein SLA, geht in Plane-Backlog |

## Quick-Refresh-Befehle

Wenn ein Stack sich aufhängt aber Server gesund ist, in dieser Reihenfolge probieren:

```bash
# 1. Service-spezifischer restart
docker compose restart <service>

# 2. Voll-recreate (env-changes greifen)
docker compose up -d <service>

# 3. Logs bevor was wildes
docker logs --tail 200 <service>

# 4. Smoke-Sweep
bash scripts/smoke-stacks.sh
```

## Nächste Schritte

1. Sobald 2nd Operator: Primary/Backup-Spalte ausfüllen, Telefon + GPG-Fingerprint hinterlegen.
2. Pro neuen Stack diese Matrix erweitern (Vorlage: 1 Zeile in „Vorfall → Wo nachschauen → Wer").
3. Quartalsweise `last_review` aktualisieren + alte Vendors prüfen (kontaktdaten + SLA).
