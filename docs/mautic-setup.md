# Mautic Setup — MedTheris Marketing Automation

> Stand: 2026‑04‑27 · ergänzt `docs/marketing-pipeline.md`

Mautic 6 läuft als drei Container (`mautic_web`, `mautic_cron`,
`mautic_worker`) zusammen mit der bestehenden MariaDB. Erreichbar unter
`https://marketing.medtheris.kineo360.work` über Nginx Proxy Manager.

Das Portal hat eine native UI unter
`https://app.kineo360.work/medtheris/marketing` die per REST gegen
Mautic spricht (Übersicht, Kontakte, Segmente, Kampagnen, Mails). Editor-
Funktionen (Mail-Designer, Campaign-Builder, Forms) öffnen sich direkt in
Mautic — der Hub kümmert sich um Read-Only-Anzeige + Twenty-Sync.

---

## Initial-Deploy (einmalig)

### 1. `.env` ergänzen

```bash
# Mautic Marketing Automation (MedTheris)
MAUTIC_URL=https://marketing.medtheris.kineo360.work
MAUTIC_DB_PASSWORD=$(openssl rand -base64 32)
MAUTIC_API_USERNAME=portal-bridge
MAUTIC_API_TOKEN=                   # nach Schritt 4 setzen
```

### 2. DB-User in MariaDB erzeugen

Wenn die MariaDB schon läuft, das Init-Script wird nicht erneut
ausgeführt — den User manuell anlegen:

```bash
docker exec -it mariadb mysql -uroot -p"$MARIADB_ROOT_PASSWORD" <<SQL
CREATE DATABASE IF NOT EXISTS mautic CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS 'mautic'@'%' IDENTIFIED BY '$MAUTIC_DB_PASSWORD';
GRANT ALL PRIVILEGES ON mautic.* TO 'mautic'@'%';
FLUSH PRIVILEGES;
SQL
```

Frische Stacks bekommen den User automatisch über
`scripts/mariadb-init.sh`.

### 3. Stack starten

```bash
docker compose --env-file .env up -d mautic_web mautic_cron mautic_worker
docker compose logs -f mautic_web   # bis "Ready, listening" erscheint (~2 min)
```

Mautic läuft nach dem ersten Start die Doctrine-Migrations selber durch
(`DOCKER_MAUTIC_RUN_MIGRATIONS=true`).

### 4. NPM Proxy Host eintragen

In Nginx Proxy Manager: neuer Proxy Host
`marketing.medtheris.kineo360.work` → `mautic_web:80` (HTTP), Cloudflare
DNS-01 Cert. Nach `Save` öffnet sich der Mautic-Installer.

### 5. Initial-Setup im Browser

`https://marketing.medtheris.kineo360.work` öffnen:

1. **Datenbank-Check** sollte direkt grün sein (ENV-Vars sind im Container hinterlegt).
2. **Admin User** anlegen (z. B. `admin` / starkes Passwort, `marketing@medtheris.kineo360.work`).
3. **Mail-Konfiguration**:
   - Transport: `SMTP`
   - Host: `smtp.migadu.com`
   - Port: `587` (STARTTLS)
   - User: `johannes@medtheris.kineo360.work`
   - Password: Migadu-Passwort
   - Encryption: TLS

### 6. API-Bridge-User

1. **Settings → Configuration → API Settings** → API + Basic Auth aktivieren, speichern.
2. **Settings → Users → New** → `portal-bridge`, Rolle `Administrator`, starkes Passwort.
3. Passwort zurück in `.env` als `MAUTIC_API_TOKEN` eintragen, Stack neu starten:
   ```bash
   docker compose up -d portal
   ```

Ab jetzt zeigt `https://app.kineo360.work/medtheris/marketing` echte Daten.

---

## Twenty CRM ↔ Mautic Sync

Aktuell als **Pull-Sync per n8n / Cron** vorgesehen, weil Mautic keine
Twenty-Webhooks kennt. Drei Empfehlungen:

1. **Stage-Mapping**: Twenty-Stage `Neu` → Mautic-Segment `prospects`,
   `Qualifiziert` → `qualified`, `Kunde` → `customers`.
2. **Trigger**: alle 15 min ein n8n-Workflow (`workflows.kineo360.work`):
   `GET /api/companies?updatedAt>last_run` → für jede Firma die
   Hauptperson holen → `POST /api/contacts/new` in Mautic →
   `POST /api/segments/{id}/contact/{cid}/add`.
3. **Reply-Stop**: wenn ein Lead auf eine Drip-Mail antwortet (Mautic
   detektiert das via "DNC reason: replied"), per n8n den Twenty-Stage
   auf `In Conversation` hochziehen, sodass das Sales-Team übernimmt.

Die Portal-Lib bietet schon zwei Helfer:
`upsertContact()` und `addContactToSegment()` — die kann ein zukünftiger
`/api/marketing/sync/twenty` Endpoint direkt nutzen.

---

## Troubleshooting

| Symptom                                       | Ursache & Fix |
|----------------------------------------------|----|
| Portal /marketing → "Mautic ist noch nicht eingerichtet" | `.env` hat noch keinen `MAUTIC_API_TOKEN`, oder `portal`-Container wurde nach dem Setzen nicht neu gestartet. |
| 500 vom Mautic-Container nach erstem Start    | Migration noch nicht durch — `docker compose logs -f mautic_web` und 60-90s warten. |
| Mails landen im Spam-Ordner                   | DKIM/SPF/DMARC für `medtheris.kineo360.work` fehlt. Siehe `docs/marketing-pipeline.md` Schritt 4. |
| `mautic_cron` Container in `restarting`       | Image-Build-Variable fehlt — sicherstellen dass `DOCKER_MAUTIC_ROLE=mautic_cron` gesetzt ist. |
| Worker frisst CPU bei jedem Boot              | Symfony-Messenger queue lief sich am Restart fest. `docker compose restart mautic_worker` reicht. |

---

## Backups

Mautic-State liegt in drei Volumes:
- `mautic_config` — `parameters_local.php`, lokale Overrides
- `mautic_logs` — Mailer- und Cron-Logs (rolling, kein Restore-Bedarf)
- `mautic_media` — hochgeladene Bilder/Assets für Mails & Landing-Pages

Plus die `mautic`-Database in MariaDB. Beides sollte ins existierende
S3-Backup mit aufgenommen werden (`scripts/backup.sh`, falls vorhanden,
sonst hier ergänzen).
