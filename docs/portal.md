# Portal — Corehub Workstation

> Custom branded portal that wraps all internal apps under one shell.
> Lives at `https://app.kineo360.work`. Code in `portal/`.

## Stack

- Next.js 16.2 (App Router) + React 19 + TypeScript
- Tailwind CSS v4 (no shadcn/ui — custom primitives only)
- Auth.js v5 with Keycloak provider (single realm `main` — alle internen Teams)
- lucide-react icons
- Standalone Docker build, runs as `portal` service in main `docker-compose.yml`

## Architecture

```
Browser ──HTTPS──> NPM (app.kineo360.work, cert *.kineo360.work)
                      │
                      └──> portal:3000 (Next.js standalone)
                              │
                              ├── /login                        — Keycloak SSO entry
                              ├── /[workspace]/dashboard        — native workspace dashboard
                              └── /[workspace]/apps/[appId]     — iframe wrapper for backend apps
                                                                    (or new-tab redirect for Migadu/Projekte)
```

## Workspaces

Source of truth: `portal/src/lib/workspaces.ts` und `portal/src/lib/onboarding-config.ts`.

Alle Workspaces leben im **einen** Keycloak-Realm `main`. Sichtbarkeit pro User
ergibt sich aus Group-Membership in einer der drei Top-Level-Groups.

| Workspace | Group-Path | Sub-Groups (Beispiele) | Apps |
|-----------|------------|------------------------|------|
| **corehub** | `/corehub` | product-owner, full-stack, front-end, back-end, ui-ux, dev-ops, tester | Dashboard, Mail (SnappyMail), Chat (RC), Calendar+Files+Office (NC), CRM (Twenty), Code (Gitea), Projekte (Plane), Calls (Jitsi), Sign (Documenso), Status, Identity, Proxy |
| **medtheris** | `/medtheris` | sales, onboarding, helpdesk, tech-support | Dashboard, Mail, Chat (RC-MT), Calendar+Files+Office (NC-MT), CRM, Helpdesk (Zammad), Calls, Marketing (Mautic), Video Editor (OpenCut), Social Scheduler (Postiz), Sign, Status, Identity |
| **kineo** | `/kineo` | executives, leadership, extended-leadership, physio, fitness, billing, customer-care | Dashboard, Mail, Chat, Calls, Calendar (deferred NC-Kineo), CRM, Helpdesk (deferred), Projekte, Marketing, Video Editor, Social Scheduler, Sign, Status, Identity |

Workspace-Switcher in der Top-Bar zeigt nur Workspaces, deren Group der User
angehört (Admins sehen immer alle drei). Aktueller Workspace ist Teil der URL
(`/corehub/...` vs `/medtheris/...` vs `/kineo/...`).

**Kineo · Reporting (optional):** Zwei Sidebar-Einträge (Gap Report, Operations Dashboard) erscheinen nur, wenn `NEXT_PUBLIC_KINEO_GAP_REPORT_URL` bzw. `NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL` gesetzt sind — siehe [`docs/kineo-reporting-integration.md`](./kineo-reporting-integration.md).

**Marketing-Hub-Apps (optional):**
- "Marketing" (Mautic) erscheint, wenn `MAUTIC_URL` gesetzt ist
- "Video Editor" (OpenCut) erscheint, wenn `NEXT_PUBLIC_OPENCUT_URL` gesetzt ist (medtheris + kineo)
- "Social Scheduler" (Postiz) erscheint, wenn `NEXT_PUBLIC_POSTIZ_URL` gesetzt ist (medtheris + kineo)

Setup pro Tool: [`docs/mautic-setup.md`](./mautic-setup.md), [`docs/opencut-setup.md`](./opencut-setup.md), [`docs/postiz-setup.md`](./postiz-setup.md).

**Admin-only Apps:** "Onboarding" und "Scraper" erscheinen nur für User, deren Username in `PORTAL_ADMIN_USERNAMES` (kommagetrennt, default: `ali,johannes`) auftaucht. Die Liste wird auf Server-Seite via `lib/admin-allowlist.ts` ausgewertet — TopBar-Pill, Sidebar-Eintrag und API-Routes (`/api/onboarding/**`, `/api/scraper/**`) prüfen den Allowlist-Eintrag bei jeder Anfrage.

### Group-Claim im ID-Token

Jeder OIDC-Client im Realm `main` (portal, nextcloud×2, rocketchat×2, gitea,
zammad, twenty) hat einen `groups`-Protocol-Mapper, der die vollen Group-Pfade
(z.B. `/corehub/dev-ops`) als `groups`-Claim ins ID/Access-Token schreibt. Das
Portal nutzt diesen Claim für Sidebar-Sichtbarkeit; die anderen Apps können
ihn für eigene Rollen-/Gruppen-Mappings verwenden (Nextcloud: User-Group
Auto-Provisioning; Gitea: Org-Mapping etc.).

## App Embedding

Three modes per app:
- `embed: "native"` — own page within the portal (e.g. dashboard)
- `embed: "iframe"` — embedded via `AppFrame` component, sandboxed iframe with `allow-same-origin allow-scripts allow-forms allow-popups allow-downloads allow-modals`. If the backend refuses (X-Frame-Options/CSP), falls back to "open in new tab" UI.
- `embed: "newtab"` — direct external link, opens in new browser tab. Used for Migadu (no iframe support) and the projects placeholder.

### iframe-CSP per backend app

NPM strips upstream `X-Frame-Options` + `Content-Security-Policy` and injects `frame-ancestors 'self' https://app.kineo360.work` instead — applied to all 9 iframed proxy hosts via `more_set_headers` (openresty headers-more module).

Reproducible via `scripts/npm-iframe-csp.sh` (ältere Server-Kopien nannten `/tmp/csp-relax.sh`; vor Commit bereinigen).

## Auth Flow

1. Unauthenticated request → middleware redirects to `/login?callbackUrl=…`
2. Login page → form action calls `signIn("keycloak")` server-action
3. Auth.js redirects to `https://auth.kineo360.work/realms/main/protocol/openid-connect/auth?client_id=portal&…`
4. User authenticates at Keycloak (and TOTP if enabled)
5. Keycloak redirects back to `https://app.kineo360.work/api/auth/callback/keycloak?code=…`
6. Auth.js exchanges code for tokens, sets session cookie, redirects to original URL

Session lives 8h, JWT strategy (no DB needed).

User profile in session:
- `session.user.name` — full name from Keycloak
- `session.user.username` — `preferred_username` claim
- `session.user.email` — email from Keycloak
- `session.idToken` — for backend-initiated logout
- `session.groups` — voll qualifizierte Group-Pfade (z.B. `["/corehub/dev-ops","/kineo/executives"]`), aus `groups`-Claim

## Keycloak Client

- Realm: `main`
- Client ID: `portal`
- Confidential (client secret in `.env` as `PORTAL_KC_CLIENT_SECRET`)
- Standard flow on, PKCE S256 enforced
- Protocol-Mapper `groups` (full path, in id/access/userinfo)
- Redirect URIs: `https://app.kineo360.work/api/auth/callback/keycloak`, `http://localhost:3000/api/auth/callback/keycloak` (dev)
- Web origins: `https://app.kineo360.work`, `http://localhost:3000`

Geschwister-Clients im selben Realm `main`: `nextcloud-corehub`,
`nextcloud-medtheris`, `rocketchat-corehub`, `rocketchat-medtheris`, `gitea`,
`zammad-medtheris`, `twenty-corehub` — alle mit eigenem Secret und
`groups`-Mapper.

To recreate (if lost): run `scripts/migrate-to-main-realm.sh` (creates client `portal` in realm `main`), then read the secret with `scripts/keycloak-portal-client.sh --print-secret` or from `/tmp/main-secrets.env`.

## Local Development

```bash
cd portal
cp .env.local.example .env.local
# Fill AUTH_SECRET, KEYCLOAK_CLIENT_SECRET (use the live secret from server's .env)
npm install
npm run dev
# Open http://localhost:3000 — browser will redirect to Keycloak prod realm.
```

Add `http://localhost:3000/api/auth/callback/keycloak` to the Keycloak `portal` client's allowed redirect URIs (already included).

## Deploy

### Vor dem Deploy (lokal)

Portal-Änderungen vor Merge oder vor Sync zum Server:

```bash
cd portal && npm run verify
```

Das entspricht `check:i18n` plus `tsc --noEmit` (siehe `portal/package.json`). Für einen schnellen Typecheck allein reicht auch `npx tsc --noEmit`.

Im Repo liegt **kein** GitHub Actions Workflow für Deploy — Produktion läuft über **rsync + Docker Compose** auf dem Host (oder das Skript unten).

### Ziel-Host und SSH

**Ziel-Host (vereinbart):** **MedTheris-Corelab** auf Hetzner — `178.104.222.61`, Login **`deploy`**.

Lokale SSH-Client-Config (Copy-Paste: [`docs/ssh-corelab.md`](./ssh-corelab.md)): Host-Alias **`medtheris-corelab`** → dann reicht z. B. `ssh medtheris-corelab` und `./scripts/deploy-medtheris-corelab.sh` ohne IP.

> Nicht den älteren **`kineo360-server`** (91.99.179.44) für diesen Stack verwenden.

**Einmalig auf dem Server:** siehe [`docs/ssh-corelab.md`](./ssh-corelab.md) (root: `chown` für `portal`, `medtheris-scraper`, `docker-compose.yml` und **Verzeichnis** `/opt/corelab`).

### Variante A — nur Portal

Wenn sich nur `portal/` (und ggf. Root-`docker-compose.yml`) geändert hat und der **MedTheris-Scraper** unverändert bleiben soll:

```bash
# Repo-Root; SSH-Alias wie oben
rsync -avz --delete --exclude='node_modules' --exclude='.next' --exclude='.env*.local' \
  portal/ medtheris-corelab:/opt/corelab/portal/

# Nur nötig, wenn sich docker-compose.yml geändert hat:
rsync -avz docker-compose.yml medtheris-corelab:/opt/corelab/docker-compose.yml

ssh medtheris-corelab 'cd /opt/corelab && docker compose build portal && docker compose up -d portal'
```

Kurzform mit dem gleichen Skript wie Variante B:

```bash
DEPLOY_PORTAL_ONLY=1 ./scripts/deploy-medtheris-corelab.sh
```

(`docker-compose.yml` wird dabei immer mit synchronisiert — entspricht der manuellen Variante.)

Der Container bleibt auf dem internen **`proxy`**-Netz; andere Services (DB, Keycloak, …) werden nicht angerührt.

### Variante B — Portal + MedTheris-Scraper (Standard)

Das Skript synchronisiert **`portal/`**, **`medtheris-scraper/`**, **`docker-compose.yml`** und **`scripts/`**, baut beide Images und startet beide Container:

```bash
./scripts/deploy-medtheris-corelab.sh
```

Overrides: `DEPLOY_SSH`, `DEPLOY_SSH_KEY`, `DEPLOY_REMOTE_DIR`, `DEPLOY_PORTAL_ONLY=1` (nur Portal, siehe Variante A) — Kopfkommentar in [`scripts/deploy-medtheris-corelab.sh`](../scripts/deploy-medtheris-corelab.sh).

### Manuelles Voll-Sync (ohne Skript)

```bash
rsync -avz --delete --exclude='node_modules' --exclude='.next' --exclude='.env*.local' \
    portal/ medtheris-corelab:/opt/corelab/portal/

rsync -avz --delete --exclude='__pycache__' --exclude='.venv' \
    medtheris-scraper/ medtheris-corelab:/opt/corelab/medtheris-scraper/

rsync -avz docker-compose.yml medtheris-corelab:/opt/corelab/docker-compose.yml

ssh medtheris-corelab 'cd /opt/corelab && docker compose build portal medtheris-scraper && docker compose up -d portal medtheris-scraper'
```

### Nach dem Deploy

Container exposes port `3000` on the `proxy` network (not host-bound). NPM proxy host #12 forwards `app.kineo360.work` → `portal:3000`.

**Smoke:** kurz `https://app.kineo360.work` laden, Login; bei Cmd+K-/Search-Änderungen leere Suche und Integrationstreffer prüfen. Gesamter HTTPS-Pfad ist z. B. in `scripts/smoke-test.sh` beschrieben (siehe auch [`docs/WELLEN-AUFTRAG.md`](./WELLEN-AUFTRAG.md)).

## Environment Variables

In server `.env`:
```env
PORTAL_URL=https://app.kineo360.work
PORTAL_AUTH_SECRET=<openssl rand -base64 32>
PORTAL_KC_CLIENT_ID=portal
PORTAL_KC_CLIENT_SECRET=<from Keycloak client config>
```

## Adding a New App to the Sidebar

1. Add an entry to `WORKSPACES.<workspace>.apps` in `portal/src/lib/workspaces.ts`
2. Pick `embed`: `iframe` if the backend supports it, `newtab` if not, `native` if you'll build a custom page
3. Pick a `lucide-react` icon
4. If `iframe`: extend `scripts/npm-iframe-csp.sh` HOSTS list with the new NPM proxy-host ID and re-run

## Adding a New Native Page (instead of iframe)

1. Set `embed: "native"` and `url: "/<workspace>/<id>"` in the workspaces.ts entry
2. Create `portal/src/app/[workspace]/<id>/page.tsx`
3. Use the existing layout (TopBar + Sidebar are already wrapped via `[workspace]/layout.tsx`)

## Known Gaps / Follow-ups

- **Twenty CRM SSO**: client `twenty-corehub` ist im Realm `main` angelegt, aber Twenty selbst ist noch nicht gegen den Realm konfiguriert (Twenty's eigene OIDC-Implementation hat enterprise-only Beschränkungen — deferred, siehe `SECURITY-DEBT.md`)
- **Zammad helpdesk**: läuft als `zammad-medtheris` (`support.medtheris.kineo360.work`); Kineo-Instanz ist Placeholder
- **Projekte tracker (Plane)**: deployed at `plane.kineo360.work`, iframed in Corehub & Kineo workspaces — **Portal-SSO-Brücke** über `/api/plane/sso` (deterministisches Passwort-Shim + Invite), **kein natives Keycloak-OIDC in Plane Community**.
- **Alte Realms**: `corehub`, `medtheris-internal`, `kineo` sind nach der Migration noch enabled für Rollback. Können nach erfolgreichem Smoke-Test disabled (nicht deleted!) werden via:
  ```
  for r in corehub medtheris-internal kineo; do
    docker exec keycloak /opt/keycloak/bin/kcadm.sh update realms/$r -s enabled=false
  done
  ```
- **Custom Keycloak theme**: portal login button is branded but Keycloak login screen still uses default theme. Phase 2 work.
- **Interne Mitarbeitende**: Mitgliederverwaltung mit Keycloak + optional Migadu unter **`/admin/onboarding/members`** (nicht nur Bash-Skripte). Kunden-/Practice-Onboarding weiterhin über `scripts/onboard-practice.sh` und verwandte Skripte.
