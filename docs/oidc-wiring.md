# OIDC Wiring — connect every app to Keycloak

Registering an OIDC client in Keycloak is **half the work**. Each app also
needs to be told "use this Keycloak as an IdP". This doc describes the
plumbing and the helper script that automates most of it.

## Prerequisites

1. Keycloak is running and reachable at `auth.<tenant-host>`.
2. The tenant realm exists (imported from `keycloak/realm-<name>.json` or
   created by `scripts/onboard-practice.sh`).
3. The realm contains the OIDC clients (`nextcloud`, `rocketchat`, `gitea`,
   `twenty`, `zammad`) defined in the realm JSON.

## Quick run

```bash
# Wire every Corehub app (Nextcloud, Rocket.Chat, Gitea, Twenty)
./scripts/wire-oidc.sh corehub

# Wire every MedTheris internal app (Nextcloud, Rocket.Chat, Zammad)
./scripts/wire-oidc.sh medtheris-internal

# Wire one practice tenant (Nextcloud, Rocket.Chat, Zammad)
./scripts/wire-oidc.sh practice-mueller

# Wire just one app in one realm
./scripts/wire-oidc.sh corehub nextcloud
```

The script:

1. Gets an admin token from Keycloak's `master` realm.
2. Fetches each client's existing secret (stable across runs — does **not**
   regenerate unless you delete/recreate the client).
3. Configures each app:
   - **Nextcloud** — fully automated via `occ user_oidc:provider`.
   - **Gitea** — fully automated via `gitea admin auth add-oauth`.
   - **Rocket.Chat** — prints a `curl`-based settings script (needs an admin
     Personal Access Token; no installer CLI exists).
   - **Twenty** — prints the env vars to paste into compose.
   - **Zammad** — prints the values to paste into the admin UI (no stable
     CLI for OAuth config).

## Per-app manual fallback (if automation breaks)

### Nextcloud (fully scriptable)

```bash
docker exec -u www-data <nc-container> php occ app:install user_oidc
docker exec -u www-data <nc-container> php occ app:enable  user_oidc
docker exec -u www-data <nc-container> php occ user_oidc:provider \
  keycloak \
  --clientid=nextcloud \
  --clientsecret=<secret-from-keycloak> \
  --discoveryuri=https://<auth-host>/realms/<realm>/.well-known/openid-configuration \
  --scope="openid email profile" \
  --mapping-uid=preferred_username \
  --mapping-display-name=name \
  --mapping-email=email \
  --unique-uid=1
```

### Gitea

```bash
docker exec -u git gitea gitea admin auth add-oauth \
  --name keycloak \
  --provider openidConnect \
  --auto-discover-url https://auth.corehub.io/realms/corehub/.well-known/openid-configuration \
  --key gitea \
  --secret <secret> \
  --scopes "openid email profile" \
  --skip-local-2fa
```

### Rocket.Chat (admin UI path)

1. Log in to `chat.<tenant-host>` as the first-run admin.
2. **Administration → Settings → OAuth → Add custom oauth → Name: Keycloak**
3. Configure the resulting `Custom OAuth: Keycloak` block:

   | Field                | Value                                                    |
   |----------------------|----------------------------------------------------------|
   | URL                  | `https://<auth-host>/realms/<realm>`                     |
   | Token Path           | `/protocol/openid-connect/token`                         |
   | Identity Path        | `/protocol/openid-connect/userinfo`                      |
   | Authorize Path       | `/protocol/openid-connect/auth`                          |
   | Scope                | `openid email profile`                                   |
   | Id                   | `rocketchat`                                             |
   | Secret               | *client secret from Keycloak*                            |
   | Login Style          | `Redirect`                                               |
   | Username field       | `preferred_username`                                     |
   | Email field          | `email`                                                  |
   | Name field           | `name`                                                   |
   | Merge users          | `Yes`                                                    |
   | Show button          | `Yes`                                                    |

### Twenty CRM

Add to the `twenty` service in `docker-compose.yml`:

```yaml
      AUTH_SSO_ENABLED: "true"
      AUTH_OIDC_ENABLED: "true"
      AUTH_OIDC_CLIENT_ID: twenty
      AUTH_OIDC_CLIENT_SECRET: ${TWENTY_OIDC_SECRET}
      AUTH_OIDC_ISSUER: https://auth.corehub.io/realms/corehub
      AUTH_OIDC_REDIRECT_URI: https://crm.corehub.io/auth/oidc/callback
```

Then `docker compose up -d twenty`.

### Zammad

Admin UI at `support.medtheris.kineo360.work` → **Settings → Security →
Third-party Applications → OAuth2**:

| Field           | Value                                                          |
|-----------------|----------------------------------------------------------------|
| Authorize URL   | `https://<auth-host>/realms/<realm>/protocol/openid-connect/auth` |
| Token URL       | `https://<auth-host>/realms/<realm>/protocol/openid-connect/token` |
| Userinfo URL    | `https://<auth-host>/realms/<realm>/protocol/openid-connect/userinfo` |
| Client ID       | `zammad`                                                       |
| Client Secret   | *client secret from Keycloak*                                  |
| Scope           | `openid email profile`                                         |

Enable under **Settings → Security → Authentication → OAuth2**.

## Rotating a secret

To invalidate the current secret and issue a new one, delete the client in
Keycloak (Admin UI → Clients → `<name>` → Delete), re-import the realm JSON
(or recreate the client), then re-run `wire-oidc.sh`. Every app picks up the
new secret automatically (Nextcloud, Gitea) or via the printed steps
(Rocket.Chat, Twenty, Zammad).

## First-login flow

1. User opens `files.mueller.kineo360.work`.
2. Nextcloud sees unauthenticated request → redirects to Keycloak.
3. Keycloak serves `https://auth.mueller.kineo360.work/realms/practice-mueller/...`
4. User logs in with Keycloak credentials (or creates password on first
   login if admin pre-provisioned them).
5. Keycloak redirects back to Nextcloud with an authorization code.
6. Nextcloud exchanges code for token → user is logged in. If this is their
   first login, `user_oidc` auto-provisions the local account.
