# Schritt-für-Schritt: was wann erledigen

Geordnete Reihenfolge für Betrieb, Portal und Helpdesk-Tiefe. Abhaken von oben nach unten.

---

## Phase A — Infrastruktur & Daten

1. **`.env` auf dem Server**  
   Root-`.env` aus `.env.example` ableiten, alle Secrets setzen, nie Committen.

2. **Tägliches Backup**  
   `cron/backup.cron` aktiv; nach Deploy manuell `./scripts/backup.sh` testen; Objekt im S3-Bucket prüfen.

3. **Zammad läuft beim Backup**  
   `docker compose -f docker-compose.zammad.yml --env-file .env up -d` — sonst fehlt `zammad-postgres.sql.gz` (Volumes sichern trotzdem).

4. **Restore-Übung (Staging)**  
   Zweiten Host oder Snapshot nutzen; `docs/backup-staging.md` + `scripts/restore.sh <s3-uri>`; Login, Helpdesk, CRM kurz testen.

5. **Staging-DNS & Keycloak**  
   Staging-URLs in NPM; Redirect-URIs / Clients in Keycloak anpassen (nicht Prod-Clients mischen).

---

## Phase B — Portal lokal / CI

6. **Dev-Server**  
   `cd portal && npm install && npm run dev`; `portal/.env.local` mit `AUTH_SECRET`, `KEYCLOAK_*`; Callback `http://localhost:3000/api/auth/callback/keycloak`.

7. **Build**  
   `npm run build` vor Releases; Docker-Image wie in `docker-compose.yml` für `portal`.

---

## Phase C — Helpdesk (Portal + Zammad)

8. **HELPDESK_TENANT_* / ZAMMAD_***  
   Workspace-Zuordnung und Bridge-Token gesetzt; im Portal Helpdesk öffnen, Tickets sichtbar.

9. **Phonestar (optional)**  
   `PHONESTAR_WEBHOOK_SECRET`, `PHONESTAR_HELPDESK_WORKSPACE`; Webhook POST testen.

10. **Makros mit Platzhaltern**  
    In Zammad Makros z. B. `{{ticket.number}}` verwenden; im Portal anwenden testen.

11. **Twenty-Person-Link**  
    CRM-Zugriff für dieselben User wie Helpdesk; bei falscher URL `TWENTY_PERSON_URL_TEMPLATE` in `.env` setzen (siehe `.env.example`).

12. **i18n**  
    Sprache im Portal umschalten; fehlende Übersetzungen in `src/lib/i18n/messages.ts` ergänzen.

---

## Phase D — Qualität & Ausbau

13. **Stats / KPIs**  
    Kennzahlen im Helpdesk prüfen; bei sehr großen Queues `openCapped` / `closedCapped` in der API beachten (bis zu 30×100 Tickets pro Metrik, dann „+“ und Hinweistext).

14. **Größere Features (optional)**  
    Wissensdatenbank, Reporting-Export, Automationen — jeweils eigenes Ticket/PR, nicht alles auf einmal.

15. **Regelmäßig**  
    Quartalsweise Restore-Test; Keycloak- und Zammad-Updates planen.

---

## Kurzreferenz Dateien

| Thema | Ort |
|--------|-----|
| Backup & Staging | `docs/backup-staging.md`, `scripts/backup.sh`, `scripts/restore.sh` |
| Portal lokal | `portal/README.md` |
| Helpdesk-Client | `portal/src/components/helpdesk/HelpdeskClient.tsx` |
| Zammad-API | `portal/src/lib/helpdesk/zammad.ts` |
| Übersetzungen | `portal/src/lib/i18n/messages.ts` |
