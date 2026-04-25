# Corehub / MedTheris — Self-Hosted Stack

Infrastructure-as-code for the **Hetzner single-server stack** described in
`Richard_Briefing_Stack_v3.docx` (April 2026).

Two active platform domains on a single host, isolated by Keycloak realms +
subdomains. **All Kineo360 services live under a tenant subtree** — nothing
shared sits at the apex. MedTheris is a tenant **and** the operator that
hosts the services every practice consumes.

| Domain             | Role                                                      |
|--------------------|-----------------------------------------------------------|
| `corehub.io`       | Corehub Technologies — dev team (Ali, Richard, Diana)     |
| **`kineo360.work`**| **Kineo360 product platform — every service under `<tenant>.kineo360.work`** |
| `medtheris.com`    | (optional) MedTheris GmbH mail domain                     |

Tree on Kineo360:

```
kineo360.work                              apex marketing landing
├── medtheris.kineo360.work                MedTheris (operator + internal tenant)
│   ├── auth.medtheris.kineo360.work       SSO for MedTheris team
│   ├── files.medtheris.kineo360.work      Nextcloud (team)
│   ├── chat.medtheris.kineo360.work       Rocket.Chat (team)
│   ├── meet.medtheris.kineo360.work       Jitsi — shared with all practices
│   ├── office.medtheris.kineo360.work     Collabora — shared
│   ├── support.medtheris.kineo360.work    Zammad — shared helpdesk
│   └── status.medtheris.kineo360.work     Uptime Kuma (phase 2)
├── mueller.kineo360.work                  Practice tenant
│   ├── auth.mueller.kineo360.work         SSO (realm practice-mueller)
│   ├── files.mueller.kineo360.work        Nextcloud for this practice
│   └── chat.mueller.kineo360.work         Rocket.Chat for this practice
└── <slug>.kineo360.work                   one subtree per onboarded practice
```

Email via **Migadu** (managed). VoIP via **Peoplefone CH + Zoiper**
(client-side, not on server).

---

## Repo layout

```
.
├── docker-compose.yml             # core: landing, NPM, Keycloak, Rocket.Chat,
│                                  #       Nextcloud x2, Collabora, MariaDB,
│                                  #       Twenty, Gitea, Portainer
├── docker-compose.jitsi.yml       # Jitsi Meet (4 containers)
├── docker-compose.zammad.yml      # Zammad helpdesk
├── docker-compose.monitoring.yml  # Uptime Kuma (phase 2)
├── .env.example                   # copy to .env and fill
├── Makefile                       # thin wrapper for common commands
├── landing/                       # static apex + tenant dashboard (nginx)
│   ├── conf.d/default.conf
│   └── public/{apex,tenant}/index.html
├── scripts/
│   ├── bootstrap.sh               # prepare a fresh Ubuntu 24.04 host
│   ├── backup.sh                  # daily offsite backup to Hetzner S3
│   ├── restore.sh                 # restore from an S3 archive
│   ├── onboard-practice.sh        # provision a new Kineo360 tenant
│   ├── wire-oidc.sh               # connect apps to Keycloak (Nextcloud/Gitea auto, others printable)
│   ├── smoke-test.sh              # post-deploy sanity check
│   └── mariadb-init.sh
├── keycloak/
│   ├── realm-corehub.json
│   ├── realm-medtheris-internal.json
│   └── realm-practice-template.json
├── nginx-proxy-manager/README.md  # UI playbook for Proxy Hosts
├── cron/backup.cron               # installed by bootstrap.sh
└── docs/
    ├── subdomains.md
    ├── dns-setup.md                # Cloudflare + Vercel split, step-by-step
    ├── keycloak-realms.md
    ├── oidc-wiring.md
    ├── jitsi-isolation-test.md
    └── migadu-dns.md
```

---

## Hardware target

| Phase                       | Hetzner | CPU       | RAM   | Disk          | €/mo  |
|-----------------------------|---------|-----------|-------|---------------|-------|
| Testing                     | CX32    | 4 vCPU    | 8 GB  | 80 GB SSD     | ~CHF 14 |
| **Phase 1 production**      | **CX42**| **8 vCPU**| **16 GB** | **160 GB SSD** | **~CHF 26** |
| Phase 2 (>5 practices)      | AX41    | Ryzen ded.| 64 GB | 2×512 GB NVMe | ~CHF 80 |

Expected runtime: **17 containers · ~3.8 GB RAM** with comfortable headroom on CX42.

---

## Deploy — Phase 1 (2 weeks)

### 1. Provision the server

Order a Hetzner CX42 with Ubuntu 24.04 LTS, add your SSH key.

### 2. Bootstrap

```bash
ssh root@<host>
git clone <this-repo> /opt/corehub
cd /opt/corehub
./scripts/bootstrap.sh           # Docker, UFW, deploy user, backup cron
```

### 3. Configure secrets

```bash
cp .env.example .env
$EDITOR .env                     # fill every CHANGE_ME
# DOCKER_HOST_ADDRESS must be the server's public IPv4
```

### 4. DNS

See **`docs/dns-setup.md`** for the full step-by-step (Cloudflare delegation
for `kineo360.work`, Vercel records for `corehub.io` / `medtheris.com`,
Migadu records, NPM DNS-01 setup).

Short version — point these A records at the server's public IPv4:

```
# Corehub (dev team)
auth.corehub.io         A   <ipv4>
chat.corehub.io         A   <ipv4>
files.corehub.io        A   <ipv4>
office.corehub.io       A   <ipv4>
meet.corehub.io         A   <ipv4>
crm.corehub.io          A   <ipv4>
git.corehub.io          A   <ipv4>

# Kineo360 — three wildcards cover every current and future tenant
kineo360.work           A   <ipv4>      # apex (marketing)
*.kineo360.work         A   <ipv4>      # <tenant>.kineo360.work
*.*.kineo360.work       A   <ipv4>      # <service>.<tenant>.kineo360.work
```

If the registrar does not support multi-level wildcards, add per-tenant
records on onboarding (the script prints them):

```
<slug>.kineo360.work           A   <ipv4>
auth.<slug>.kineo360.work      A   <ipv4>
files.<slug>.kineo360.work     A   <ipv4>
chat.<slug>.kineo360.work      A   <ipv4>
```

And for MedTheris (one-time):

```
medtheris.kineo360.work          A   <ipv4>
auth.medtheris.kineo360.work     A   <ipv4>
files.medtheris.kineo360.work    A   <ipv4>
chat.medtheris.kineo360.work     A   <ipv4>
meet.medtheris.kineo360.work     A   <ipv4>
office.medtheris.kineo360.work   A   <ipv4>
support.medtheris.kineo360.work  A   <ipv4>
```

Add Migadu records per `docs/migadu-dns.md` for the mail domains.

### 5. Start the core stack

```bash
make pull
make up
make ps
```

### 6. Test Jitsi in isolation FIRST

Follow `docs/jitsi-isolation-test.md` before starting it next to the rest.

```bash
make jitsi-up
```

### 7. Zammad (MedTheris helpdesk)

```bash
make zammad-up
```

### 8. Nginx Proxy Manager

Tunnel in and create Proxy Hosts per `nginx-proxy-manager/README.md`:

```bash
ssh -L 81:localhost:81 deploy@<host>
# browse http://localhost:81
```

### 9. Keycloak

Open `auth.corehub.io`, log in with `KEYCLOAK_ADMIN` / `KEYCLOAK_ADMIN_PASSWORD`,
and import the realms:

- `keycloak/realm-corehub.json`
- `keycloak/realm-medtheris-internal.json`

### 10. Wire apps to Keycloak (OIDC)

```bash
make wire REALM=corehub
make wire REALM=medtheris-internal
```

`scripts/wire-oidc.sh` fetches each client secret and configures Nextcloud
(`user_oidc`) and Gitea (`gitea admin auth add-oauth`) automatically. For
Rocket.Chat, Twenty, and Zammad it prints the exact commands/values to paste
(no stable CLI for those). See `docs/oidc-wiring.md` for details.

### 11. Smoke test

```bash
make smoke
```

Checks HTTP status, TLS cert expiry, Keycloak OIDC discovery for every realm,
and container health. Exit code = number of failures.

---

## Phase 2 — per-practice onboarding

Target: **≤ 2 h per practice**, of which ≈ 5 min is this script:

```bash
./scripts/onboard-practice.sh mueller "Physio Müller AG" info@physio-mueller.ch
```

The script

1. creates `tenants/mueller/` with its own `.env`
2. creates a dedicated Nextcloud DB in MariaDB
3. starts a per-tenant `nextcloud:29` container at `files.mueller.kineo360.work`
4. creates a Keycloak realm `practice-mueller` served on `auth.mueller.kineo360.work`
5. prints the remaining manual steps (NPM Proxy Hosts for tenant root + `auth.`,
   `files.`, `chat.`; Migadu mailbox; Peoplefone SIP)

Resulting tenant subdomains:

```
mueller.kineo360.work
auth.mueller.kineo360.work
files.mueller.kineo360.work
chat.mueller.kineo360.work
```

Override the product domain with `PRODUCT_DOMAIN=example.com ./scripts/onboard-practice.sh ...`
(default: `kineo360.work`).

---

## Daily operations

```bash
make ps                          # service overview
make logs s=keycloak             # tail one service
make pull                        # update all images (careful: test!)
make smoke                       # post-deploy health check
make backup                      # trigger an offsite backup now
make restore S=s3://corehub-backups/2026/05/01/corehub-20260501-030001.tar
make monitoring-up               # start Uptime Kuma (phase 2)
```

Backups run automatically at 03:00 Europe/Zurich via the cron installed by
`bootstrap.sh`, uploaded to Hetzner Object Storage (S3-compatible). Retention:
`BACKUP_RETENTION_DAYS` (default 30).

---

## Security non-negotiables

- **Portainer must never be public.** Bound to `127.0.0.1:9000` — use an SSH tunnel.
- **NPM admin UI (port 81) is also loopback-only** — SSH tunnel.
- All services sit behind NPM with Let's Encrypt + HSTS + HTTP/2.
- Root SSH: `prohibit-password` only; password auth disabled globally.
- UFW: 22, 80, 443, 8443/tcp + 10000/udp (Jitsi). Nothing else.

---

## Known good versions (pinned in compose)

| Service          | Image & Tag                          |
|------------------|--------------------------------------|
| NPM              | `jc21/nginx-proxy-manager:2.11.3`    |
| Keycloak         | `quay.io/keycloak/keycloak:25.0`     |
| Rocket.Chat      | `rocket.chat:6.11`                   |
| MongoDB          | `mongo:6`                            |
| Nextcloud        | `nextcloud:29-apache`                |
| MariaDB          | `mariadb:10.11`                      |
| Collabora        | `collabora/code:24.04`               |
| Twenty           | `twentycrm/twenty:latest`            |
| Gitea            | `gitea/gitea:1.22`                   |
| Portainer        | `portainer/portainer-ce:2.21.4`      |
| Jitsi            | `jitsi/*:stable-9457`                |
| Zammad           | `zammad/zammad-docker-compose:6.4.0-55` |

Bump deliberately, test on a clone first, and always run `make backup` right before.

---

## Troubleshooting index

- **Jitsi — only local video** → `docs/jitsi-isolation-test.md`
- **Let's Encrypt fails** → ensure DNS propagated + port 80 reachable from the internet
- **Nextcloud "untrusted domain"** → add `NEXTCLOUD_TRUSTED_DOMAINS` in `.env`
- **Rocket.Chat stuck on "connecting..."** → `rocketchat-mongo-init` replica set race; `docker restart rocketchat`
- **Keycloak redirects to `http://`** → make sure NPM sets `X-Forwarded-Proto`; `proxy-headers=xforwarded` is already set on the KC command

---

## License / confidentiality

Corehub Technologies LLC · Confidential · April 2026
