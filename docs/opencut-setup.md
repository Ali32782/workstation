# OpenCut — In-Browser Video Editor (CapCut-Alternative)

> Stand: 2026-05-01 · Stack: `docker-compose.opencut.yml`

OpenCut ist ein Open-Source-Videoeditor (MIT-Lizenz, ~48k GitHub-Stars), der **vollständig im Browser** läuft — die Videos verlassen den Client nicht. Schnitt, Multi-Track-Timeline, Real-Time-Preview, Export — alles WebCodecs/WebGPU. Damit ist er funktional vergleichbar mit CapCut für Reels/Shorts/Captions, aber ohne Wasserzeichen, Subscription oder Cloud-Upload.

Repo: https://github.com/OpenCut-app/OpenCut

## Architektur

| Service | Image | Zweck |
|---|---|---|
| `opencut_db` | `postgres:17-alpine` | User, Projekte, Auth (Better-Auth) |
| `opencut_redis` | `redis:7-alpine` | Sessions, Rate-Limit, BullMQ |
| `opencut_redis_http` | `hiett/serverless-redis-http` | Upstash-REST-Shim damit OpenCut unverändert läuft |
| `opencut_web` | self-built (Next.js) | Editor-UI + API |

Eigene Postgres + Redis pro Stack — kein Shared-State mit den Plane-/Documenso-/Keycloak-DBs, damit ein OpenCut-Upgrade keine fremden Migrationen anfasst.

Public URL: **https://videos.kineo360.work** (über Nginx Proxy Manager).

---

## Installation (einmalig auf dem Server)

### 1. Upstream-Repo klonen

```bash
ssh medtheris-corelab
sudo mkdir -p /opt/corelab/opencut
sudo chown $(whoami):$(whoami) /opt/corelab/opencut
git clone https://github.com/OpenCut-app/OpenCut /opt/corelab/opencut
```

### 2. `.env` ergänzen

In `/opt/corelab/.env` die folgenden Variablen hinzufügen (Werte generieren!):

```bash
OPENCUT_PUBLIC_URL=https://videos.kineo360.work
OPENCUT_BETTER_AUTH_SECRET=$(openssl rand -hex 32)
OPENCUT_DB_PASSWORD=$(openssl rand -base64 24 | tr -d /=+)
OPENCUT_REDIS_HTTP_TOKEN=$(openssl rand -hex 16)
# Portal-Sidebar (NEXT_PUBLIC_* wird zur Build-Zeit gebacken):
NEXT_PUBLIC_OPENCUT_URL=https://videos.kineo360.work
```

Optional (Sound-Library + Blog-CMS):

```bash
OPENCUT_FREESOUND_CLIENT_ID=
OPENCUT_FREESOUND_API_KEY=
OPENCUT_MARBLE_WORKSPACE_KEY=
```

### 3. Build + Start

```bash
cd /opt/corelab
docker compose -f docker-compose.opencut.yml --env-file .env up -d --build
# erster Build dauert ~6-10 min (Bun-Workspace + Next.js + WASM)
docker compose -f docker-compose.opencut.yml logs -f opencut_web
```

Healthcheck: `docker ps` zeigt `opencut_web ... (healthy)` nach ~1-2 min nach Start.

### 4. Nginx Proxy Manager

Neuer Proxy Host:

| Feld | Wert |
|---|---|
| Domain | `videos.kineo360.work` |
| Forward Hostname / IP | `opencut_web` |
| Forward Port | `3000` |
| Block Common Exploits | ✓ |
| Websockets Support | ✓ |
| SSL | Let's Encrypt + Force SSL + HTTP/2 + HSTS |

**Custom Nginx Config** (Advanced-Tab) für Iframe-Embed im Portal:

```nginx
add_header Content-Security-Policy "frame-ancestors 'self' https://app.kineo360.work" always;
add_header X-Frame-Options "ALLOW-FROM https://app.kineo360.work" always;
```

(siehe auch `scripts/npm-iframe-csp.sh` für die Standard-Variante)

### 5. Cloudflare DNS

A-Record für `videos.kineo360.work` → `<Hetzner-Server-IP>`. Anschließend TLS via NPM ausstellen.

### 6. Portal rebuild

`NEXT_PUBLIC_OPENCUT_URL` wird zur Build-Zeit eingebettet, also Portal-Image neu bauen:

```bash
docker compose build portal && docker compose up -d portal
```

In der Sidebar erscheinen unter **MedTheris** und **Kineo** die App **Video Editor** (Office-Hub-Sektion).

---

## Updates

```bash
cd /opt/corelab/opencut
git pull
cd /opt/corelab
docker compose -f docker-compose.opencut.yml --env-file .env up -d --build
```

Da der Build-Cache je nach Schichten-Änderung einiges einsparen kann, läuft der Re-Build oft in 2-3 Minuten durch.

---

## Backup

OpenCut speichert Projekt-Metadaten (Tracks, Clips, Markers) in `opencut_postgres` und Auth-Sessions in `opencut_redis`. **Die Videos selbst liegen NICHT auf dem Server** (alles Client-seitig in IndexedDB).

Für Disaster-Recovery reicht ein nächtliches `pg_dump` des Postgres:

```bash
docker exec opencut_db pg_dump -U opencut opencut | gzip > /var/backups/opencut-$(date +%F).sql.gz
```

(Hinzufügen in `cron/` analog zu Documenso/Plane)

---

## Troubleshooting

| Symptom | Lösung |
|---|---|
| Build schlägt fehl mit "out of memory" | Server-RAM <4GB → `NODE_OPTIONS=--max-old-space-size=2048` als Build-Arg setzen |
| Editor lädt, aber Videos klemmen beim Export | Browser unterstützt kein WebCodecs → Chrome/Edge ≥94, Firefox ≥130, Safari ≥16.4 |
| Iframe in Portal zeigt "refused to connect" | NPM-Custom-Config fehlt → `frame-ancestors` setzen + NPM reload |
| Login schlägt fehl mit 500 | `BETTER_AUTH_SECRET` nicht gesetzt oder Postgres nicht migriert → Logs prüfen |

---

## Offene Punkte (Roadmap)

- **SSO via Keycloak**: OpenCut nutzt Better-Auth; ein OIDC-Plugin für Keycloak müssten wir konfigurieren oder einen eigenen Reverse-Auth-Layer davor schalten (z.B. Authelia). Aktuell: separate User-Accounts in OpenCut.
- **Asset-Library mit Nextcloud**: Ein Webhook-basierter Sync zwischen OpenCut-Exports und einem Nextcloud-Ordner wäre ein nice-to-have, aber kein Blocker.
- **Watermark + Branding**: Open-Source-Edition kommt ohne Wasserzeichen — wenn ihr ein automatisches Branding-Overlay wollt, muss das im Editor-Code gepatcht werden.
