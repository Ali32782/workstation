# Security Debt — offen

Diese Liste wird abgebaut bevor echte Patientendaten in das System
einfließen (spätestens vor Onboarding erster externer Praxis).

## Current State (Setup-Phase)

**Datum:** 2026-04-24
**Status:** Shared Admin-Credentials akzeptiert für schnellen Setup

### Akzeptierte Debt

| Asset | Current | Target |
|---|---|---|
| Keycloak Master Admin `ali` | Password `Neuro8008logie` | 20+ Zeichen + TOTP MFA |
| Nextcloud Corehub `Ali` | break-glass local | ✅ SSO via Keycloak (user_oidc) |
| Nextcloud Medtheris `ali` | break-glass local | SSO via Keycloak (next batch) |
| Rocket.Chat `ali` | break-glass local | ✅ SSO via Keycloak (custom-oauth) |
| Twenty CRM `ali.peters@kineo.swiss` | gleich | deferred — siehe Twenty-Block unten |
| Gitea `ali` | break-glass local | ✅ SSO via Keycloak (oauth2 source) |
| Zammad `admin` | break-glass local | ✅ SSO via Keycloak (omniauth oidc) |

### Fixes vor Produktiv-Go-Live (Checkliste)

- [ ] **Rocket.Chat 2FA wieder aktivieren** (wurde für OAuth-Setup temporär aus)
  - Admin → Accounts → Two Factor Authentication → Enabled + Enforce Password Fallback
  - Ali kriegt TOTP-App (Authy / 1Password / iOS Codes)
- [ ] **Keycloak MFA (TOTP) für `ali` im master realm erzwingen**
  - Admin Console → Authentication → Flows → Browser → OTP Form = Required
- [ ] **Keycloak Master-Admin-Passwort rotieren** auf ≥20 Zeichen unique
- [x] **OIDC in alle Tools wired** (Nextcloud, Rocket.Chat, Gitea, Zammad — Twenty deferred)
  - Wiring per `scripts/wire-sso-corehub.sh` (idempotent, secrets via env-vars)
  - Per-Tool Admin-Accounts werden zu "break-glass" und bleiben mit Unique-Password liegen
- [ ] **Twenty CRM SSO** — explizit deferred bis einer dieser Trigger:
  - Twenty führt OIDC für Self-Hosted ohne Multi-Workspace-Zwang ein, ODER
  - Twenty Enterprise wird lizensiert (kostenpflichtig), ODER
  - Wir migrieren auf 2nd-Level-Wildcard `*.crm.kineo360.work` (DNS, Cert, NPM-Routing)

  Hintergrund: Twenty v2 koppelt SSO-UI an `IS_MULTIWORKSPACE_ENABLED=true`,
  was jeden Workspace auf `<workspace>.<base-domain>` zwingt. Würde zwei
  Wildcard-Level brauchen, die unsere aktuelle DNS/Cert-Struktur nicht hat.
  Ali nutzt Twenty bis dahin mit lokalem Account (Email + Password).
- [x] **Issue-Tracker für Corehub & Kineo aufsetzen** — Plane Community Edition deployed
  - Domain: `plane.kineo360.work` (iframe-fähig, NPM strippt X-Frame-Options)
  - 13 Container (web, space, admin, live, api, worker, beat-worker, migrator, db, redis/valkey, mq/rabbitmq, minio, proxy)
  - Workspaces innerhalb Plane: `corehub`, `kineo` (gleiche Instanz, getrennte Daten)
  - **SSO deferred** — gleiche Limitierung wie Twenty: OIDC ist Pro/Business-Feature
  - Members nutzen Migadu-Email + Plane-Passwort bis OIDC oder Plane Pro lizensiert wird
- [ ] **Plane SSO** — explizit deferred bis einer dieser Trigger:
  - Plane Community führt OIDC ein, ODER
  - Plane Pro/Business wird lizensiert (~$8/user/month), ODER
  - bitbay/plane-oidc Community-Fork wird stable (aktuell 6★, develop branch)
- [x] **Jitsi Meet self-hosted** für RC-Calls + Workstation-Tile
  - Domain: `meet.kineo360.work` (4 Container: web, prosody, jicofo, jvb)
  - JVB UDP 10000 inbound (Hetzner Cloud Firewall + UFW müssen offen sein — TODO checken)
  - Rocket.Chat: `VideoConf_Default_Provider=jitsi`, Domain gesetzt → "Call"-Button in jedem Channel
  - "Calls"-Tile in allen 3 Workspaces (Corehub, MedTheris, Kineo)
- [x] **SnappyMail** als iframe-fähiger Mail-Client (Migadu blockt Webmail-Iframe via X-Frame-Options: DENY)
  - Domain: `webmail-self.kineo360.work` (1 Container, ~50 MB RAM)
  - Pre-konfiguriert: `kineo360.work`, `corehub.kineo360.work`, `medtheris.kineo360.work`, `kineo.swiss`
  - Mail-Tile in allen 3 Workspaces zeigt jetzt iframe (statt newtab zu Migadu)
  - Admin-Panel: `https://webmail-self.kineo360.work/?admin` (Initial-Password siehe Server `/var/lib/snappymail/_data_/_default_/admin_password.txt` im Container)
- [ ] **Kineo Workspace eigene Backends** — Skeleton im Portal sichtbar, eigene Instanzen NOCH NICHT deployed
  - Pending: Nextcloud-Kineo (`files.kineo.kineo360.work`)
  - Pending: Zammad-Kineo (`support.kineo.kineo360.work`) — heavy (~3-4 GB RAM extra)
  - Blocker: Cert für `*.kineo.kineo360.work` (2-level wildcard) muss noch ausgestellt werden
  - Trigger zum Deployen: erste echte Kineo-Datei oder erstes Kineo-Ticket
  - **Mail funktioniert schon**: `*@kineo.kineo360.work` über Migadu (Domain angelegt + MX/SPF/DKIM/DMARC auf Cloudflare gesetzt, Mailbox-Provisioning via Onboarding-Tool)
- [ ] **Customer-Domain-Migration MedTheris** — `kineo360.work` ist die temporäre Plattform-Domain
  - Trigger: MedTheris Customer-facing-TLD ist registriert (z.B. `medtheris.ch`/`.health`/`.app`)
  - Migration in Reihenfolge:
    1. Marketing-Site + Login + App auf neue Domain (`app.medtheris.<tld>`, `auth.medtheris.<tld>`)
    2. Customer-Mail (`*@medtheris.<tld>`) — alte `medtheris.kineo360.work`-Aliase ~6 Monate forwarden
    3. Internal bleibt auf `*.kineo360.work` (Gitea, Portainer, NPM, Status, Workstation-Portal)
  - Aktuell: Customer-Material wird "Kineo360"-frei gehalten, sieht der Kunde eh nie
- [x] **Onboarding-Tool im Portal** — Phase 1 live unter `/admin/onboarding`
  - Zugriff: Username-Allowlist `PORTAL_ADMIN_USERNAMES=ali,johannes` (env), gerendert als "Onboarding"-Pill in TopBar
  - **Mitglieder-Tab**: Liste aller User aus dem Single-Realm `main`, gruppiert nach Top-Level-Group-Membership (`/corehub`, `/medtheris`, `/kineo`); CRUD: anlegen (1 User in 1 Realm + Multi-Group-Memberships + auto-Mailbox je Workspace-Domain via Migadu), Passwort-Reset, deaktivieren, löschen
  - **Clients-Tab**: ist intentional aus dem Sidebar-Menü entfernt — internes Tool, keine externen Praxis-Tenants. Code unter `app/admin/onboarding/clients/*` bleibt für späteren Wiedergebrauch erhalten.
  - Backend: `lib/keycloak-admin.ts` (admin-cli password grant, in-memory token cache, jetzt mit `addUserToGroup`/`removeUserFromGroup`/`findGroupByPath` Helpers), `lib/migadu.ts` (HTTP basic auth, graceful skip wenn Key fehlt)
  - **DONE**: `MIGADU_ADMIN_USER=ali.peters@kineo.swiss` + `MIGADU_API_KEY` (Token "maili") in `/opt/corelab/.env` gesetzt. Mailbox-Auto-Provisioning live.
  - **DONE**: Migadu-Subdomains `corehub.kineo360.work`, `medtheris.kineo360.work`, `kineo.kineo360.work` via API angelegt + Cloudflare DNS (MX, SPF, DKIM, DMARC) automatisch gesetzt mit `/tmp/migadu-subdomains.sh`
  - Migadu zeigt Domain-State noch `inactive` (greift erst an wenn erste Mail über MX kommt), API-Provisioning von Mailboxen funktioniert aber bereits unabhängig davon
  - **PENDING Phase 2**: Auto-Run der Client-Provisioning-Skripts via dedizierten Runner (Portal-Container hat keinen Host-Docker-Socket bewusst aus Sicherheitsgründen)
- [x] **Keycloak Single-Realm-Migration `corehub` + `medtheris-internal` + `kineo` → `main`** (2026-04-25)
  - Vorher: 3 separate Realms, jeder User mehrfach angelegt, jede App nur SSO mit ihrem Realm → drei Logins.
  - Jetzt: 1 Realm `main`, Top-Level-Groups `/corehub`, `/medtheris`, `/kineo` (+ je 4-7 Sub-Groups laut `keycloak-setup-task.md`), 1 User-Identität pro Person, Multi-Group-Membership für cross-team Sichtbarkeit, ein einziger Login öffnet alle Apps.
  - 8 OIDC-Clients (portal, nextcloud-corehub, nextcloud-medtheris, rocketchat-corehub, rocketchat-medtheris, gitea, zammad-medtheris, twenty-corehub) im Realm `main` mit `groups`-Protocol-Mapper.
  - Kern-Accounts migriert inkl. `ali`, `johannes` und Contractor-Konten
    (`diana.matushkina`, `richard.bilous`, …) mit Group-Memberships.
  - Migration-Skript: `scripts/migrate-to-main-realm.sh` (idempotent).
  - **Rollback-Fähig**: alte Realms (`corehub`, `medtheris-internal`, `kineo`) bleiben enabled bis Smoke-Tests erfolgreich, danach disabled (nicht deleted) als Rollback-Option.
- [x] **Nextcloud `TokenPasswordExpiredException` / "CSRF check failed"** (2026-04-26)
  - Symptom: User klickt Doc → 412 Precondition Failed mit "CSRF check failed"-Seite. Auslöser ist eine alte `oc_authtoken`-Row deren AES-verschlüsseltes Passwort nicht mehr zum aktuellen NC-Hash passt (passiert bei jedem `user_oidc`-Login wenn die abgeleitete Passwort-Quelle leicht abweicht).
  - Fix angewandt auf BEIDEN Instanzen (`nextcloud-corehub` + `nextcloud-medtheris`):
    - `occ config:system:set remember_login_cookie_lifetime --type=integer --value=0` → es werden gar keine "remember-me"-Tokens mehr ausgestellt → `loginWithCookie()` wird nie mehr aufgerufen → keine `TokenPasswordExpiredException` mehr.
    - `DELETE FROM oc_authtoken; DELETE FROM oc_bruteforce_attempts;` (per `mariadb`-Container, root-Pass aus Container-Env) → Bestehende stale Tokens + IP-Locks weg.
    - `redis-cli FLUSHALL` → Session-Cache leer.
  - Endbenutzer: muss einmalig Browser-Cookies für `files.kineo360.work` + `files.medtheris.kineo360.work` löschen, danach läuft alles über silent OIDC-Login (Keycloak SSO ist eh schon aktiv).
  - **PENDING Persistence**: Wenn die NC-Volumes (`nc_corehub_data`, `nc_medtheris_data`) je gewipt werden, muss `remember_login_cookie_lifetime=0` re-applyed werden. TODO: Init-Hook unter `/docker-entrypoint-hooks.d/post-installation/00-disable-remember.sh` mounten.
- [ ] **Fail2ban** auf Host für SSH + NPM Login-Brute-Force-Schutz
- [ ] **Backup-Verschlüsselung** (S3 Hetzner Object Storage mit restic + Password)
- [ ] **Audit-Log** in Keycloak aktivieren (Events → Login Events storage 14d)
- [ ] **CrowdSec oder analog** für HTTP-Layer-Threats vor NPM

## Why this is acceptable right now

- Keine echten Patientendaten im System
- Nur `ali` hat Zugang (ein Operator)
- Keine ausgehenden Connections außer Let's Encrypt + Docker Registry
- Alle admin-URLs nur über HTTPS + TLS 1.2+
- SSH-Key-only-Login aktiv, root direkt via SSH disabled
- UFW + Docker Network-Isolation zwischen `corehub-internal` und `medtheris-internal` Compose-Networks (App-Daten sind getrennt; nur die Identität in Keycloak ist konsolidiert)
- Keycloak sessions stateful (nicht JWT) → Logout = sofort raus

## Trigger für Debt-Abbau

Einer reicht zum "jetzt fixen":

1. Erste externe Praxis wird onboarded
2. Erste Test-Patientenakte wird angelegt (auch Dummy-Daten)
3. Domain-Transfer `medtheris.com` abgeschlossen und Go-Live geplant
4. Ein Mitarbeiter (nicht Ali) bekommt Zugriff auf ein Tool
