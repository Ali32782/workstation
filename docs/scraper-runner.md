# MedTheris Scraper Runner — Setup

> Stand: 2026‑04‑26

Der Scraper-Runner ist eine kleine Flask-App, die im
`medtheris-scraper`-Container läuft. Er erlaubt es, den
`main.py`-Subprozess via HTTP zu triggern — typischerweise vom
Portal-Admin-UI unter `/admin/onboarding/scraper`.

## Architektur

```
   Browser ──HTTPS──▶ Portal /admin/onboarding/scraper
                          │
                          ▼  (server-side)
                Portal /api/admin/scraper/*
                          │
                          ▼  (Bearer token, Docker network)
                medtheris-scraper:8088 (Flask)
                          │
                          ▼  (subprocess.Popen)
                  python main.py --canton ZH --limit 20 …
                          │
                          ▼
              Twenty CRM ✚ scraper.sqlite ✚ run.log
```

## Required env vars

In der Portal-`.env`:

```
SCRAPER_RUNNER_URL=http://medtheris-scraper:8088
SCRAPER_RUNNER_TOKEN=<32-byte hex string, gleich wie scraper-side>
```

In der Compose-Env (für den `medtheris-scraper`-Container, gleicher
Token wie portal-side, plus die normalen Scraper-Env-Vars):

```
SCRAPER_RUNNER_TOKEN=<32-byte hex string>
SCRAPER_GOOGLE_MAPS_API_KEY=<key>
SCRAPER_ANTHROPIC_API_KEY=<key>
# Origin only — Twenty GraphQL is at {origin}/graphql (never …/api/graphql).
SCRAPER_TWENTY_API_URL=https://crm.kineo360.work
SCRAPER_TWENTY_API_KEY=<workspace-API-key Medtheris>
SCRAPER_TENANT_TAG=medtheris
SCRAPER_ENABLE_SOCIAL_LOOKUP=0   # 1 wenn web_search aktiviert werden soll
```

Token erzeugen:

```sh
openssl rand -hex 32
```

## Deploy

```sh
# Auf der Hetzner-Box:
cd /opt/corelab
git pull
# .env aktualisieren wie oben.
docker compose build medtheris-scraper
docker compose up -d medtheris-scraper portal
```

Erster Test:

```sh
# Healthz (no auth):
curl http://localhost:8088/healthz   # auf der Hetzner-Box im Docker-Netz

# Status:
curl -H "Authorization: Bearer $SCRAPER_RUNNER_TOKEN" \
     http://localhost:8088/status

# Trigger (dry-run, ZH, max 5 Praxen):
curl -X POST -H "Authorization: Bearer $SCRAPER_RUNNER_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"canton":"ZH","limit":5,"max_plz":2,"dry_run":true}' \
     http://localhost:8088/trigger
```

## API

### `GET /healthz`
Public. Liefert `{ok: true, now: <iso>}`. Für Compose-Healthcheck.

### `GET /status`
Bearer-protected. Liefert den letzten persistierten State + Log-Tail.

```json
{
  "state": "done",
  "started_at": "2026-04-26T08:42:11+00:00",
  "finished_at": "2026-04-26T08:55:30+00:00",
  "exit_code": 0,
  "params": {"canton":"ZH","limit":5,"dry_run":true},
  "log_tail": "..."
}
```

### `POST /trigger`
Bearer-protected. Startet einen Scraper-Subprozess. Body:

```json
{
  "canton":      "ZH" | null,        // optional, default = alle
  "limit":       20,                  // optional max practices
  "max_plz":     10,                  // optional Cost-Bremse
  "max_queries": 4,                   // optional Cost-Bremse
  "max_pages":   3,                   // optional max Result-Pages/PLZ
  "dry_run":     true,                // optional, default false
  "no_extract":  false                // optional, skip LLM
}
```

Antworten:
- `200 OK` → Job gestartet.
- `409 Conflict` → ein Job läuft schon. Vor dem nächsten Trigger via
  `/status` warten, bis `state` != `running`.
- `401 Unauthorized` → Bearer fehlt/falsch.

## Persistenz

Im Container:
- `/var/scraper/state.json` — letzter Run-State.
- `/var/scraper/run.log`    — full stdout des aktuellen / letzten Runs.
- `/var/scraper/scraper.sqlite` — dedup-Cache.

Diese drei Files leben im Docker-Volume `scraper_state` und überleben
Container-Restarts. Backup-Strategie: nightly tar via `cron/backup.cron`
(noch zu ergänzen).

## Sicherheitsmodell

- Der Runner bindet auf `0.0.0.0:8088`, ist aber **nicht** über NPM
  exponiert — er ist nur im Docker-Netz `proxy + corehub-internal`
  erreichbar.
- Auth: Bearer-Token. Der Token muss auf beiden Seiten identisch
  konfiguriert sein.
- Privilege: Der Container läuft als unprivilegierter User (`python` im
  base-image). Er kann das Internet (Google Maps, Anthropic, Twenty),
  aber nichts auf dem Host.
