# Dokumentations-Index

Kurzüberblick über alle Anleitungen unter `docs/` und ihren Umsetzungsgrad im Repo (Stand: intern geprüft, keine Garantie für Fremdsysteme wie Keycloak-Produktion).

| Dokument | Zweck | Repo / Umsetzung |
|----------|--------|------------------|
| [integration-event-feed.md](./integration-event-feed.md) | Webhook → Pulse / RC (Documenso + generic) | `portal/src/app/api/integrations/event-feed/webhook/route.ts` |
| [kineo-reporting-integration.md](./kineo-reporting-integration.md) | Gap Report / Operations-Dashboard im Kineo-Workspace | Env `NEXT_PUBLIC_KINEO_*` + `portal/src/lib/workspaces.ts` |
| [cross-hub-roadmap.md](./cross-hub-roadmap.md) | Querschnitt Roadmap Event-Feed, Governance, … | Strategie + `portal/src/lib/integrations/event-feed-types.ts` (Phase 0) |
| [portal.md](./portal.md) | Portal-Architektur, Env; Deploy: `npm run verify`, nur-Portal vs. Skript | `portal/`, `docker-compose.yml` Service `portal`, `scripts/deploy-medtheris-corelab.sh` |
| [mobile-qa-checklist.md](./mobile-qa-checklist.md) | iPhone/iPad QA: Dashboard, Mail, Chat, Calls, CRM, Projekte, Helpdesk | Manuelles Abhaken; Shell `MobileShell`, Calls/Chat Safe Area |
| [roadmap-step-by-step.md](./roadmap-step-by-step.md) | Phasen-Checkliste Ops/Dev/Helpdesk | Manuelles Abhaken; Scripts referenziert |
| [oidc-wiring.md](./oidc-wiring.md) | OIDC an Keycloak | `scripts/wire-oidc.sh` |
| [keycloak-realms.md](./keycloak-realms.md) | Realm-Konzept | `keycloak/*.json`, `scripts/migrate-to-main-realm.sh` |
| [dns-setup.md](./dns-setup.md), [subdomains.md](./subdomains.md), [migadu-dns.md](./migadu-dns.md) | DNS / Mail-DNS | Extern (Cloudflare/Migadu) |
| [ssh-corelab.md](./ssh-corelab.md) | SSH-Alias Corelab-Host | Operativ |
| [backup-staging.md](./backup-staging.md) | Backup & Restore | `scripts/backup.sh`, `scripts/restore.sh`, `cron/backup.cron` |
| [scraper-runner.md](./scraper-runner.md) | Scraper HTTP-Runner | `medtheris-scraper/`, Compose `medtheris-scraper` |
| [twenty-medtheris-schema.md](./twenty-medtheris-schema.md) | 23 fehlende Twenty-Custom-Fields anlegen, damit Push-Daten ankommen | Setup-Anleitung + Re-Push-Hinweis |
| [helpdesk-setup.md](./helpdesk-setup.md) | Zammad + Portal | `docker-compose.zammad.yml`, Portal Helpdesk |
| [marketing-pipeline.md](./marketing-pipeline.md), [mautic-setup.md](./mautic-setup.md) | Marketing-Automation (Mailchimp-Alternative) | Portal APIs / Mautic extern |
| [opencut-setup.md](./opencut-setup.md) | In-Browser-Videoeditor (CapCut-Alternative) | `docker-compose.opencut.yml`, env `NEXT_PUBLIC_OPENCUT_URL` |
| [postiz-setup.md](./postiz-setup.md) | Social-Media-Scheduler (Buffer-Alternative, 30+ Plattformen) | `docker-compose.postiz.yml`, env `NEXT_PUBLIC_POSTIZ_URL` |
| [jitsi-isolation-test.md](./jitsi-isolation-test.md) | Jitsi-Tests | `docker-compose.jitsi.yml` |
| [PRODUCT-VISION.md](./PRODUCT-VISION.md) | Produktvision | Referenz |
| [SECURITY-DEBT.md](./SECURITY-DEBT.md) | Bekannte Sicherheits-Schulden | Tracking |
| [WELLEN-AUFTRAG.md](./WELLEN-AUFTRAG.md) | Wellen-Planung | Referenz |
| [playbooks/README.md](./playbooks/README.md) | Interne Playbooks | Siehe Unterseiten |

### Scripts – häufig referenziert

| Zweck | Pfad | Status |
|-------|------|--------|
| Portal Keycloak-Client | `scripts/migrate-to-main-realm.sh` | **vorhanden** (legt u. a. Client `portal` an) |
| Portal Secret auslesen | `scripts/keycloak-portal-client.sh` | **vorhanden** (Helper) |
| Deploy Portal Corelab | `scripts/deploy-medtheris-corelab.sh` | **vorhanden** (voll: Portal+Scraper; `DEPLOY_PORTAL_ONLY=1`: nur Portal + Compose) |
| Integration Feed Smoke | `scripts/test-integration-feed-webhook.sh` | **vorhanden** |
| CSP für iframed Apps | `scripts/npm-iframe-csp.sh` | **vorhanden** |
| OIDC Wiring | `scripts/wire-oidc.sh` | **vorhanden** |
| Portal-only Smoke | `scripts/smoke-portal.sh` | **vorhanden** (LB-style probe) |
| Cross-Stack Smoke | `scripts/smoke-stacks.sh` | **vorhanden** (Container + interne Endpoints) |
| Backup-Freshness | `scripts/backup-verify.sh` | **vorhanden** (Alter + Größe + Log-Tail) |
| Backup-Cron-Fix | `scripts/fix-backup-cron.sh` | **vorhanden** (root-only; korrigiert Legacy-Pfad) |
| OpenCut/Postiz aktivieren | `scripts/activate-opencut-postiz.sh` | **vorhanden** (env-uncomment + Portal rebuild) |
| Documenso SMTP-Check | `scripts/check-documenso-smtp.sh` | **vorhanden** (Creds + TCP-Probe) |
| Documenso SMTP-Livetest | `scripts/documenso-smtp-livetest.sh` | **vorhanden** (echte Mail) |
| Documenso Reminder-Logs | `scripts/documenso-remind-logs.sh` | **vorhanden** |
| ~~`scripts/csp-relax.sh`~~ (ältere Texte) | — | **ersetzt** durch `npm-iframe-csp.sh` |
| Documenso × Keycloak (`wire-documenso-keycloak.sh`) | — | **nicht** als Script vorhanden → Keycloak-UI / Documenso-Doku |

Bei neuen Docs: diesen Index und die Spalte „Scripts“ mitpflegen.
