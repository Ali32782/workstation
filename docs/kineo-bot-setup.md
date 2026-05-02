# Kineo Raumplanungs-Assistent — Self-Hosted Setup

> Status: live seit 2026-05-02 unter <https://bot.kineo360.work> · ersetzt
> `https://kineo-raumplanungsassistent.onrender.com`.

Der "Raumplanungs-Assistent" ist ein FastAPI/Anthropic-Chatbot der das
Kineo-Stellenplanungs-Wissen kapselt (HTML-Frontend + Claude im Backend +
optional Postgres für OTP-Sessions/Termine). Bis 2026-05 lief er auf
Render.com, jetzt direkt auf Hetzner-Host neben dem restlichen CoreHub-Stack —
damit fällt eine externe Plattform-Abhängigkeit weg und das Portal-Iframe
zeigt auf eine eigene Subdomain mit kontrollierten CSP-Headern.

## Komponenten

| Layer            | Wert                                                         |
|------------------|--------------------------------------------------------------|
| Source           | github.com/Ali32782/Kineo-Raumplanungsassistent (private)    |
| Server-Pfad      | `/opt/corelab/kineo-bot/`                                    |
| Image            | `corehub/kineo-bot:latest`                                   |
| Container        | `kineo_bot` · port `8000` · Netz `proxy`                     |
| Public URL       | `https://bot.kineo360.work` (NPM proxy_host id 19)           |
| Cert             | NPM cert id 2 (`*.kineo360.work` Wildcard via Let's Encrypt) |
| Portal-Eintrag   | Sidebar Kineo · `NEXT_PUBLIC_KINEO_CHATBOT_URL`              |

## Erstes Deployment — Schritt für Schritt

### 1. Source auf den Server bringen

```bash
# Clone aus dem privaten Repo (HTTPS-Auth aus den Credentials des Repo-Owners)
git clone https://github.com/Ali32782/Kineo-Raumplanungsassistent.git /tmp/kineo-bot

# Auf den Server rsyncen (kein git auth auf dem Server nötig)
rsync -azv --delete --exclude=.git \
  /tmp/kineo-bot/ medtheris-corelab:/opt/corelab/kineo-bot/
```

Im Server-Pfad liegt zusätzlich ein `Dockerfile` (nicht Teil des Bot-Repos —
gehört nur zur CoreHub-Deployment-Variante).

### 2. ENV-Variablen in `/opt/corelab/.env`

```ini
# Bot pflichtig — fällt zurück auf SCRAPER_ANTHROPIC_API_KEY wenn nicht gesetzt:
BOT_ANTHROPIC_API_KEY=sk-ant-...

# Optional Postgres (sonst In-Memory, OK für niedrige Last):
BOT_DATABASE_URL=postgresql://user:pass@host:5432/db

# Optional Bearer-Gate vor /api/chat (siehe README im Bot-Repo):
BOT_APP_TOKEN=

# Optional OneDoc-Slot-Forwarding (slots_server.py auf Hetzner):
BOT_SLOTS_API_KEY=

# Portal-Sidebar:
NEXT_PUBLIC_KINEO_CHATBOT_URL=https://bot.kineo360.work
NEXT_PUBLIC_KINEO_CHATBOT_EMBED=iframe
```

### 3. Container bauen & starten

```bash
ssh medtheris-corelab '
cd /opt/corelab && \
docker compose -f docker-compose.yml -f docker-compose.kineo-bot.yml \
  up -d --build kineo_bot
'
```

Der Healthcheck pingt intern `GET /` und erwartet 200 (StaticFiles-Mount
liefert `index.html`).

### 4. NPM Proxy Host für `bot.kineo360.work`

Wenn das Setup neu aufgebaut wird, lässt sich der Eintrag entweder über das
NPM-UI klicken — oder per SQLite-Insert (siehe `scripts/npm-add-bot-host.sql`
und das `internalNginx`-Regenerate-Snippet weiter unten).

Wichtige Felder:

- domain_names: `["bot.kineo360.work"]`
- forward_host: `kineo_bot` · forward_port: `8000` · scheme: `http`
- certificate_id: `2` (`*.kineo360.work` Wildcard)
- ssl_forced: 1 · http2_support: 1 · websocket: 1
- advanced_config:
  ```nginx
  client_max_body_size 50M;
  proxy_read_timeout 300s;
  add_header Content-Security-Policy "frame-ancestors https://app.kineo360.work";
  ```

Der `frame-ancestors`-Header erlaubt das Embedding **nur** vom Portal aus —
fremde Seiten können den Bot nicht einbetten.

### 5. Portal rebuilden

Damit `NEXT_PUBLIC_KINEO_CHATBOT_URL` in den Client-Bundle wandert, muss das
Portal neu gebaut werden (env vars werden zur Build-Zeit gebakt):

```bash
ssh medtheris-corelab '
cd /opt/corelab && \
docker compose build --no-cache portal && \
docker compose up -d portal
'
```

Danach in der Sidebar des `Kineo`-Workspaces erscheint der "Chatbot"-Eintrag
und öffnet `bot.kineo360.work` als iframe.

## Updates aus dem Bot-Repo ziehen

```bash
# Lokal (auf Anikas Mac mit GitHub-Auth):
cd /tmp/kineo-bot && git pull
rsync -azv --delete --exclude=.git \
  /tmp/kineo-bot/ medtheris-corelab:/opt/corelab/kineo-bot/

# Server:
ssh medtheris-corelab '
cd /opt/corelab && \
docker compose -f docker-compose.yml -f docker-compose.kineo-bot.yml \
  up -d --build kineo_bot
'
```

Das `Dockerfile` im Server-Pfad bleibt erhalten (kein `--delete-after` Konflikt
weil rsync nur die Bot-Dateien austauscht).

## NPM-Recovery (falls proxy_host configs nach `docker restart npm` leer sind)

NPM rendert die nginx configs aus der SQLite-DB nicht zwingend automatisch
beim Boot. Wenn `/data/nginx/proxy_host/` leer ist und alle Hosts 502/000
liefern, hilft folgendes Snippet (mit eager-load der certificate-Relation,
damit `listen 443 ssl` und `ssl_certificate` korrekt gerendert werden):

```bash
docker exec npm node -e '
process.chdir("/app");
const ProxyHost = require("./models/proxy_host");
const internalNginx = require("./internal/nginx");
(async () => {
  const hosts = await ProxyHost.query()
    .where("is_deleted", 0)
    .withGraphFetched("[certificate]");
  for (const h of hosts) {
    await internalNginx.deleteConfig("proxy_host", h, false, true);
    await internalNginx.generateConfig("proxy_host", h);
  }
  await internalNginx.test();
  await internalNginx.reload();
})().then(() => process.exit(0));'
```

Lerne daraus: nach **jedem** SQL-direkten Eingriff in NPM diese Regenerate-
Routine fahren, statt `docker restart npm` zu ziehen — der Restart pustet die
Configs weg, generiert sie aber nicht zwingend neu.

## Logs & Debug

```bash
docker logs kineo_bot --tail 100 -f
docker exec npm tail -f /data/logs/proxy-host-19_access.log
docker exec npm tail -f /data/logs/proxy-host-19_error.log
```

## Render.com aufräumen

Sobald Portal-Rebuild durch und `bot.kineo360.work` ein paar Minuten stabil
läuft, kann der Render-Service `kineo-raumplanungsassistent.onrender.com` ohne
Datenverlust gelöscht werden — die Postgres-DB war dort optional und wird
hier durch In-Memory bzw. einer eigenen Postgres-Instanz ersetzt (falls
`BOT_DATABASE_URL` gesetzt). Die DNS-Antwort `*.onrender.com` zeigt nicht in
unsere Infrastruktur, daher gibt es keine Reverse-Dependencies zu beachten.
