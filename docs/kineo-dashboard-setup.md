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

## Auth-Layer (HTTP Basic Auth via NPM)

Direkter Browser-Zugriff auf `dashboard.kineo360.work` ist hinter einer
NPM-Access-List versteckt (Realm "Authorization required"). Konfiguration:

| NPM-Objekt        | Wert                                |
|-------------------|-------------------------------------|
| Access-List Name  | "Kineo Dashboard" (id 1)            |
| `satisfy_any`     | `1` (auth_basic ODER ip-allowlist) |
| `pass_auth`       | `1` (Authorization-Header durchreichen) |
| User              | `kineo` (Klartext-PW im Passwort-Manager des Admins) |
| htpasswd-File     | `/data/access/1` (bcrypt-Hash, root-only) |

`satisfy_any=1` ist wichtig — sonst kombiniert NPM `auth_basic` mit dem
implizit gerenderten `deny all;` in den access rules (weil keine
IP-Allowlist gesetzt ist), was zu hartem 403 für **alle** Requests führt.
Mit `satisfy_any=1` reicht erfolgreiches Basic-Auth.

Passwort ändern (über UI):

> NPM-UI → Access Lists → "Kineo Dashboard" → Edit → Authorization →
> Passwort ändern → Save. NPM rendert das htpasswd-File via `htpasswd -b -B`
> neu, kein nginx-Reload nötig.

Passwort ändern (headless):

```bash
docker exec npm htpasswd -b -B -C 13 /data/access/1 kineo NEUES_PASSWORT
docker exec npm sqlite3 /data/database.sqlite \
  "UPDATE access_list_auth SET password='NEUES_PASSWORT', \
   modified_on=datetime('now') WHERE access_list_id=1 AND username='kineo';"
```

(Klartext-Passwort in der DB ist NPM-Standard — wird nur fürs UI-Pre-Fill
verwendet. nginx liest ausschließlich den bcrypt-Hash aus `/data/access/1`.)

Innerhalb des Portal-iframes klappt der Login transparent: einmal im Browser
authentifiziert, hält Chrome/Safari/Firefox den Basic-Auth-Header pro Origin
im Memory-Cache. Wenn ein "echtes" SSO über Keycloak gewünscht ist, ist
`oauth2-proxy` der nächste Schritt — siehe `MORGEN.md` Eintrag 1c.

## Logs & Debug

```bash
docker logs kineo_dashboard --tail 100 -f
docker exec npm tail -f /data/logs/proxy-host-20_access.log
docker exec npm tail -f /data/logs/proxy-host-20_error.log
```
