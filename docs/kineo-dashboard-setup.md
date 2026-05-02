# Kineo Operations Dashboard — Containerised Streamlit Setup

> Status: live seit 2026-05-02 unter <https://dashboard.kineo360.work> · ersetzt
> den lokalen `streamlit run streamlit_upload.py`-Workflow.

Das Operations-Dashboard ist eine Streamlit-App die Hyrox- / SportsNow-
Exporte (Kursplan, Rechnungen, Aboliste, Umsatzanalysen) entgegennimmt und
das konsolidierte `Kineo_Dashboard_AKTUELL.xlsx` produziert. Bis 2026-05 lief
das nur lokal auf Anikas Mac (`Dashboard_Aktualisieren.command`); jetzt steht
es als Container neben dem CoreHub-Stack und ist iframe-bar im Kineo-
Workspace.

## Komponenten

| Layer            | Wert                                                            |
|------------------|-----------------------------------------------------------------|
| Source           | `/opt/corelab/kineo-dashboard/` (vom Mac via `Dashboard_Aktualisieren.command` synct) |
| Image            | `corehub/kineo-dashboard:latest`                                |
| Container        | `kineo_dashboard` · port `8501` · Netz `proxy`                  |
| Public URL       | `https://dashboard.kineo360.work` (NPM proxy_host id 20)        |
| Cert             | NPM cert id 2 (`*.kineo360.work` Wildcard)                      |
| Portal-Eintrag   | Sidebar Kineo · `NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL`    |
| Volumes          | `./kineo-dashboard/input` + `./kineo-dashboard/output` (bind)   |

## Deployment-Runbook

### 1. Source bringen / aktualisieren

Der Mac-Workflow `Dashboard_Aktualisieren.command` syncht den Code nach
`/opt/corelab/kineo-dashboard/`. Wenn der Server-Pfad neu aufgesetzt wird:

```bash
rsync -azv --delete --exclude=.venv --exclude=__pycache__ \
  ~/Kineo_Dashboard/ medtheris-corelab:/opt/corelab/kineo-dashboard/
```

Dockerfile liegt im Server-Pfad und wird durch den Sync **nicht überschrieben**
(Source-Sync schließt den Mac-`.venv`-Ordner aus, das Dockerfile gehört zum
CoreHub-Deployment, nicht zum App-Code).

### 2. Container bauen + starten

```bash
ssh medtheris-corelab '
cd /opt/corelab && \
docker compose -f docker-compose.yml -f docker-compose.kineo-dashboard.yml \
  up -d --build kineo_dashboard
'
```

Healthcheck pingt `GET /_stcore/health` (Streamlit-internal).

### 3. NPM-Proxy-Host (einmalig)

UI-Variante: in NPM einen Proxy-Host für `dashboard.kineo360.work` →
`kineo_dashboard:8501` anlegen, Wildcard-Cert `*.kineo360.work` zuweisen.

Headless-Variante (was wir gemacht haben):

```sql
INSERT INTO proxy_host (
  domain_names, forward_host, forward_port, forward_scheme,
  certificate_id, ssl_forced, http2_support, allow_websocket_upgrade,
  block_exploits, advanced_config, …
) VALUES (
  '["dashboard.kineo360.work"]', 'kineo_dashboard', 8501, 'http',
  2, 1, 1, 1, 1,
  'client_max_body_size 256M;
   proxy_read_timeout 300s;
   proxy_buffering off;
   add_header Content-Security-Policy "frame-ancestors https://app.kineo360.work";',
  …
);
```

`proxy_buffering off;` ist für Streamlit-Streaming wichtig (sonst hängen
WebSocket-Frames im Buffer). `client_max_body_size 256M;` lässt grosse XLSX-
Uploads durch.

Nach dem `INSERT` **nicht** `docker restart npm` — stattdessen den
internalNginx-Regenerate fahren (siehe `docs/kineo-bot-setup.md` "NPM-
Recovery").

### 4. Portal env + Rebuild

```ini
NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL=https://dashboard.kineo360.work
NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_EMBED=iframe
```

Dann:

```bash
ssh medtheris-corelab '
cd /opt/corelab && \
docker compose build --no-cache portal && \
docker compose up -d portal
'
```

## Streamlit-iframe-Konfiguration

Streamlit ist standardmäßig **nicht** iframe-freundlich. Folgende Stellschrauben
sind jetzt aktiv:

| Setting | Wert | Warum |
|---------|------|-------|
| `--server.enableCORS` | `false` | Sonst blockt Streamlit Cross-Origin-Anfragen |
| `--server.enableXsrfProtection` | `false` | Sonst 403 bei POSTs aus dem iframe |
| `--server.headless` | `true` | Verhindert das Auto-Browser-Open |
| `proxy_buffering off` (NPM) | — | WebSocket-Streaming |
| `frame-ancestors https://app.kineo360.work` (NPM) | — | nur Portal darf iframen |

Streamlit selbst setzt **kein** `X-Frame-Options`-Header (mehr) — der
`frame-ancestors`-CSP-Header aus NPM ist die einzige Schranke.

## Daten-Persistenz

Das `input/` und `output/` Verzeichnis wird via Bind-Mount in den Container
gemappt — sprich: **der Container ist stateless**, alle Hyrox-Exporte und das
generierte `Kineo_Dashboard_AKTUELL.xlsx` leben auf dem Host und überleben
`docker compose up -d --build`.

```
/opt/corelab/kineo-dashboard/
├── input/
│   ├── kineo-hyrox_active_passes_*.xlsx
│   ├── kineo-hyrox_invoices_*.xlsx
│   ├── kineo-hyrox_schedules_*.xlsx
│   └── …
└── output/
    ├── archive/
    └── Kineo_Dashboard_AKTUELL.xlsx
```

## Sicherheits-TODO (offen)

Aktuell schützt **nur** der CSP-Header `frame-ancestors` — wer die URL
`https://dashboard.kineo360.work` direkt im Browser ansurft, sieht das
Dashboard ohne Login. Das Hyrox-Datenmaterial enthält Umsatz- und
Kunden-Listen. Optionen:

1. **NPM Access-List** mit HTTP-Basic-Auth davorschalten (1 Klick im NPM-UI).
2. **Streamlit-Auth via OAuth-Proxy** (komplexer, integriert sich mit Keycloak).
3. **Nur über Portal-iframe öffnen** — wenn der Portal-Login-Cookie das
   einzige Gate sein soll, dann müsste der NPM-Layer iframe-only enforcen
   (z. B. `Sec-Fetch-Dest: iframe` als Bedingung in einem Custom-Nginx-`if`).

In `MORGEN.md` als Punkt 2g vermerkt.

## Logs & Debug

```bash
docker logs kineo_dashboard --tail 100 -f
docker exec npm tail -f /data/logs/proxy-host-20_access.log
docker exec npm tail -f /data/logs/proxy-host-20_error.log
```
