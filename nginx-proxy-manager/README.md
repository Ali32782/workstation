# Nginx Proxy Manager — Proxy Host Playbook

NPM is configured **via its web UI**, not declaratively. The UI lives at
`http://localhost:81` (loopback-bound). Reach it through an SSH tunnel:

```bash
ssh -L 81:localhost:81 deploy@<host>
# then open http://localhost:81
```

Default first-login: `admin@example.com` / `changeme` — change immediately.

## One-time global settings

- **Settings → Default Site**: `Congratulations Page`
- **Settings → Let's Encrypt email**: `${ACME_EMAIL}` from `.env`

## Wildcard certificates — do this first

Before creating any Proxy Hosts under `kineo360.work`, request wildcards so
every new tenant gets HTTPS without extra steps.

- DNS (at the registrar of `kineo360.work`):
  ```
  *.kineo360.work.         A    <server-ipv4>
  *.*.kineo360.work.       A    <server-ipv4>   ← covers auth.medtheris.kineo360.work, files.<slug>.kineo360.work, ...
  kineo360.work.           A    <server-ipv4>   ← apex marketing
  ```
  If the registrar forbids multi-level wildcards, move DNS to Cloudflare or
  another provider that allows them.

- NPM → **SSL Certificates → Add Let's Encrypt**:
  - Cert A: `*.kineo360.work`, `kineo360.work`
  - Cert B: `*.*.kineo360.work`
  - Use **DNS Challenge** with the registrar plugin and API token.

## Defaults for every Proxy Host

- **Scheme**: `http`
- **Cache Assets**: off
- **Block Common Exploits**: on
- **Websockets Support**: on
- **SSL tab**: select the matching wildcard · **Force SSL** · **HTTP/2** · **HSTS** on

### Corehub (`corehub.io`)

| Domain                   | Forward Hostname     | Port | Extra                                                        |
|--------------------------|----------------------|------|--------------------------------------------------------------|
| `auth.corehub.io`        | `keycloak`           | 8080 | `proxy_buffer_size 128k;` in Advanced                        |
| `chat.corehub.io`        | `rocketchat`         | 3000 | Websockets on                                                |
| `files.corehub.io`       | `nextcloud-corehub`  | 80   | Advanced: `client_max_body_size 10G;` + well-known redirects |
| `office.corehub.io`      | `collabora`          | 9980 | Websockets on                                                |
| `meet.corehub.io`        | `jitsi-web`          | 80   | Websockets on                                                |
| `crm.corehub.io`         | `twenty`             | 3000 |                                                              |
| `git.corehub.io`         | `gitea`              | 3000 | Advanced: `client_max_body_size 512M;`                       |

### Kineo360 apex (marketing)

| Domain                  | Forward Hostname   | Port |
|-------------------------|--------------------|------|
| `kineo360.work`         | landing container  | 80   |
| `www.kineo360.work`     | (301 redirect)     | —    |

### Kineo360 — MedTheris tenant (operator of all shared services)

| Domain                                   | Forward Hostname        | Port | Notes                        |
|------------------------------------------|-------------------------|------|------------------------------|
| `medtheris.kineo360.work`                | landing / dashboard     | 80   | Optional                     |
| `auth.medtheris.kineo360.work`           | `keycloak`              | 8080 | Advanced snippet below       |
| `files.medtheris.kineo360.work`          | `nextcloud-medtheris`   | 80   | Nextcloud snippet below      |
| `chat.medtheris.kineo360.work`           | `rocketchat`            | 3000 | Websockets on                |
| `meet.medtheris.kineo360.work`           | `jitsi-web`             | 80   | Websockets on                |
| `office.medtheris.kineo360.work`         | `collabora`             | 9980 | Websockets on                |
| `support.medtheris.kineo360.work`        | `zammad-nginx`          | 8080 |                              |
| `status.medtheris.kineo360.work`         | `uptime-kuma`           | 3001 | Phase 2                      |

### Kineo360 — practice tenants (auto-generated per onboarding)

For every `<slug>`:

| Domain                                | Forward Hostname     | Port |
|---------------------------------------|----------------------|------|
| `<slug>.kineo360.work`                | landing (optional)   | 80   |
| `auth.<slug>.kineo360.work`           | `keycloak`           | 8080 |
| `files.<slug>.kineo360.work`          | `nc-<slug>`          | 80   |
| `chat.<slug>.kineo360.work`           | `rocketchat`         | 3000 |

## Nextcloud — required Advanced nginx snippet

Paste into the **Advanced** tab of every Nextcloud Proxy Host
(`files.corehub.io`, `files.medtheris.kineo360.work`, `files.<slug>.kineo360.work`):

```nginx
client_max_body_size 10G;
fastcgi_buffers 64 4K;

location = /.well-known/carddav   { return 301 $scheme://$host/remote.php/dav; }
location = /.well-known/caldav    { return 301 $scheme://$host/remote.php/dav; }
location = /.well-known/webfinger { return 301 $scheme://$host/index.php/.well-known/webfinger; }
location = /.well-known/nodeinfo  { return 301 $scheme://$host/index.php/.well-known/nodeinfo; }
```

## Keycloak — required Advanced nginx snippet

Paste into the **Advanced** tab of every `auth.*` Proxy Host:

```nginx
proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
```

## Hardened defaults for everything (Advanced)

```nginx
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-Frame-Options "SAMEORIGIN" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
```
