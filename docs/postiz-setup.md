# Postiz — Open-Source Social-Media-Scheduler (Buffer/Hootsuite-Alternative)

> Stand: 2026-05-01 · Stack: `docker-compose.postiz.yml`

Postiz ist ein selbst-gehosteter Social-Media-Posting-Scheduler mit AI-Copilot, Visual-Calendar, 30+ Plattformen und Approval-Workflows (AGPL-3.0, ~28k GitHub-Stars). Aktiv weiterentwickelt (täglich Commits), Next.js + NestJS unter der Haube — passt 1:1 zum Corehub-Stack.

Repo: https://github.com/gitroomhq/postiz-app  
Docs: https://docs.postiz.com/

## Architektur (~7 Container)

| Service | Image | Zweck |
|---|---|---|
| `postiz_backend` | `ghcr.io/gitroomhq/postiz-app:latest` | Frontend + API (port 5000 intern) |
| `postiz_postgres` | `postgres:17-alpine` | User, Posts, OAuth-Tokens |
| `postiz_redis` | `redis:7-alpine` | Sessions, Queues |
| `postiz_temporal` | `temporalio/auto-setup:1.28.1` | Workflow-Engine für geplante Posts |
| `postiz_temporal_postgres` | `postgres:16-alpine` | Temporal-State |
| `postiz_temporal_es` | `elasticsearch:7.17` | Temporal-Workflow-Suche (256 MB Heap) |

**Resource-Erwartung:** ~3-4 GB RAM für den ganzen Stack. Auf einem 8GB-Server ist das vertretbar, auf 4GB knapp.

Public URL: **https://social.kineo360.work** (über Nginx Proxy Manager).

---

## Installation (einmalig auf dem Server)

### 1. `.env` ergänzen

In `/opt/corelab/.env` die folgenden Variablen hinzufügen:

```bash
POSTIZ_PUBLIC_URL=https://social.kineo360.work
POSTIZ_FRONTEND_URL=https://social.kineo360.work
POSTIZ_NEXT_PUBLIC_BACKEND_URL=https://social.kineo360.work/api
POSTIZ_BACKEND_INTERNAL_URL=http://postiz_backend:3000
POSTIZ_JWT_SECRET=$(openssl rand -hex 32)
POSTIZ_DB_PASSWORD=$(openssl rand -base64 24 | tr -d /=+)
POSTIZ_DISABLE_REGISTRATION=true   # nach erstem Account-Setup empfohlen
# Portal-Sidebar (NEXT_PUBLIC_* wird zur Build-Zeit gebacken):
NEXT_PUBLIC_POSTIZ_URL=https://social.kineo360.work
```

OAuth-Tokens pro Plattform (siehe Abschnitt 4 unten) — für den ersten Start reicht es, diese leer zu lassen.

### 2. Stack starten

```bash
cd /opt/corelab
docker compose -f docker-compose.postiz.yml --env-file .env pull
docker compose -f docker-compose.postiz.yml --env-file .env up -d
docker compose -f docker-compose.postiz.yml logs -f postiz
```

Beim ersten Start dauert es ~2-3 Minuten bis Temporal+Elasticsearch hochgefahren sind und Postiz die DB-Migrationen durchgezogen hat.

### 3. Nginx Proxy Manager

Neuer Proxy Host:

| Feld | Wert |
|---|---|
| Domain | `social.kineo360.work` |
| Forward Hostname / IP | `postiz_backend` |
| Forward Port | `5000` |
| Block Common Exploits | ✓ |
| Websockets Support | ✓ (für Real-Time-Calendar) |
| SSL | Let's Encrypt + Force SSL + HTTP/2 + HSTS |

**Custom Nginx Config** (Advanced-Tab):

```nginx
add_header Content-Security-Policy "frame-ancestors 'self' https://app.kineo360.work" always;
add_header X-Frame-Options "ALLOW-FROM https://app.kineo360.work" always;
client_max_body_size 100M;   # Image/Video uploads für Posts
```

DNS: A-Record `social.kineo360.work` → `<Hetzner-Server-IP>`.

### 4. OAuth pro Plattform (Reihenfolge optional)

Jede Plattform verlangt eine eigene Developer-App. Reihenfolge nach Wichtigkeit fürs Marketing-Team — typische Bearbeitungszeit pro Plattform: **Minuten bis Wochen**.

#### LinkedIn (~Minuten)
1. https://www.linkedin.com/developers/apps → "Create app"
2. Auth-URL: `https://social.kineo360.work/integrations/social/linkedin`
3. Required scopes: `r_liteprofile`, `r_emailaddress`, `w_member_social`, `r_organization_social`, `w_organization_social`
4. Client-ID + Secret in `.env`:
   ```bash
   POSTIZ_LINKEDIN_CLIENT_ID=…
   POSTIZ_LINKEDIN_CLIENT_SECRET=…
   ```

#### X (Twitter) (~Tage)
1. https://developer.x.com/en/portal/dashboard — verlangt seit 2024 ein bezahltes Tier ($100/Monat Basic) für Posting-API
2. Callback: `https://social.kineo360.work/integrations/social/x`
3. API-Key + Secret in `.env`:
   ```bash
   POSTIZ_X_API_KEY=…
   POSTIZ_X_API_SECRET=…
   ```

#### Meta (Facebook + Instagram) (~Tage bis Wochen)
1. https://developers.facebook.com/apps → "Business" App
2. Produkte hinzufügen: **Instagram Graph API**, **Facebook Login**
3. Verifikation als Business + App-Review für `instagram_content_publish` (Wochen!)
4. Redirect-URIs: `https://social.kineo360.work/integrations/social/facebook`, `…/instagram`
5. ENV:
   ```bash
   POSTIZ_FACEBOOK_APP_ID=…
   POSTIZ_FACEBOOK_APP_SECRET=…
   POSTIZ_INSTAGRAM_APP_ID=…
   POSTIZ_INSTAGRAM_APP_SECRET=…
   ```

#### TikTok (~Wochen)
1. https://developers.tiktok.com/apps → "TikTok Login Kit" + "Content Posting API"
2. App-Review erforderlich für Posting-Scope (Production Tier)
3. Redirect: `https://social.kineo360.work/integrations/social/tiktok`
4. ENV:
   ```bash
   POSTIZ_TIKTOK_CLIENT_ID=…
   POSTIZ_TIKTOK_CLIENT_SECRET=…
   ```

#### YouTube (~Stunden)
1. https://console.cloud.google.com → "APIs & Services" → OAuth Client ID
2. Scope: `youtube.upload`
3. Redirect: `https://social.kineo360.work/integrations/social/youtube`
4. ENV:
   ```bash
   POSTIZ_YOUTUBE_CLIENT_ID=…
   POSTIZ_YOUTUBE_CLIENT_SECRET=…
   ```

#### Bluesky / Mastodon / Threads
Bluesky braucht keine OAuth-App (App-Password im UI ist ausreichend). Mastodon hat ein OAuth-Self-Service-Flow auf jedem Server. Threads geht über Meta-App (siehe oben).

**Nach jeder OAuth-Änderung**: 
```bash
docker compose -f docker-compose.postiz.yml down
docker compose -f docker-compose.postiz.yml --env-file .env up -d
```
Compose env-Vars werden NICHT bei `restart` neu gelesen.

### 5. Portal rebuild

```bash
docker compose build portal && docker compose up -d portal
```

In der Sidebar erscheint unter **MedTheris** und **Kineo** die App **Social Scheduler**.

### 6. Erst-Account-Setup

1. https://social.kineo360.work öffnen → "Sign Up"
2. Admin-Account anlegen (erste Registrierung wird automatisch Admin)
3. Anschließend in der `.env` `POSTIZ_DISABLE_REGISTRATION=true` setzen (dann muss man User aus dem Admin-UI heraus einladen)

---

## AI-Copilot aktivieren

Postiz hat einen integrierten Content-Generator (Captions, Hashtags, Image-Vorschläge) basierend auf OpenAI:

```bash
POSTIZ_OPENAI_API_KEY=sk-…
```

Alternative: Das Anthropic-API-Key-Feld kann auch eingerichtet werden (über UI im Profile-Settings), wenn Postiz das Provider-Switching unterstützt — Stand 2026-05 noch in Entwicklung.

---

## Updates

```bash
cd /opt/corelab
docker compose -f docker-compose.postiz.yml --env-file .env pull
docker compose -f docker-compose.postiz.yml --env-file .env up -d
```

Großbreaking-Versionen (z.B. v2.x → v3.x) lt. Postiz-Dokumentation immer manuell migrieren — `docs.postiz.com/installation/migration` prüfen.

---

## Backup

```bash
# Postiz-Daten (User, Posts, OAuth-Tokens)
docker exec postiz_postgres pg_dump -U postiz-user postiz-db-local | gzip > /var/backups/postiz-$(date +%F).sql.gz
# Uploads (Bild/Video-Assets)
docker run --rm -v postiz_postiz_uploads:/data -v /var/backups:/out alpine tar czf /out/postiz-uploads-$(date +%F).tar.gz -C /data .
```

---

## Troubleshooting

| Symptom | Lösung |
|---|---|
| `Cannot connect to temporal` | Temporal braucht 30-60s Startup. Logs: `docker logs postiz_temporal`. Falls hängt: `docker compose down && up -d` |
| Geplante Posts feuern nicht | RUN_CRON=true gesetzt? Backend-Container auch noch healthy? Temporal-UI auf Port 8080 (intern) checken |
| Iframe in Portal zeigt "refused to connect" | NPM-CSP fehlt — `frame-ancestors` setzen |
| LinkedIn-OAuth: "redirect_uri does not match" | Callback-URL in der LinkedIn-App muss EXAKT `https://social.kineo360.work/integrations/social/linkedin` sein (kein Trailing-Slash) |
| Image-Upload schlägt fehl bei >5MB | NPM `client_max_body_size` setzen (siehe oben) |

---

## Offene Punkte (Roadmap)

- **SSO via Keycloak**: Postiz unterstützt generic-OAuth (`POSTIZ_GENERIC_OAUTH=true` + zugehörige Endpoints). Bei Bedarf konfigurieren — Default ist Username/Password.
- **Twenty CRM-Sync**: Postiz hat eine Webhook-API. Theoretisch kann das Portal nach erfolgreichem Post einen Twenty-Activity-Eintrag erzeugen. Nicht implementiert.
- **OpenCut-Integration**: Direkt aus Postiz' Asset-Library auf OpenCut springen — wäre ein eigener Portal-Linker (kein direkter Postiz-Feature).
