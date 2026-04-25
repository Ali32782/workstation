# Keycloak Realm Strategy

Keycloak is the **strategic multi-tenancy core**. The realm structure below is
the lever for isolating Corehub internal users, the MedTheris internal team,
and every paying practice.

## Realm layout

```
master                        Keycloak admin realm — internal only
├── corehub                    Corehub Technologies dev team (Ali / Richard / Diana)
│                              → auth.corehub.io
├── medtheris-internal         MedTheris GmbH team (operator of the product)
│                              → auth.medtheris.kineo360.work
└── practice-<slug>            One realm per paying practice, fully isolated
    ├── practice-mueller       → auth.mueller.kineo360.work
    ├── practice-zurich-nord   → auth.zurich-nord.kineo360.work
    └── …
```

**Rule:** one realm per environment. Never mix tenants in a shared realm.
Users, groups, roles, tokens and sessions stay inside their realm.

## One Keycloak, many hostnames

A single `keycloak` container answers on every branded hostname:

- `auth.corehub.io`                    → realm `corehub`
- `auth.medtheris.kineo360.work`       → realm `medtheris-internal`
- `auth.<slug>.kineo360.work`          → realm `practice-<slug>`

Each realm sets its own `attributes.frontendUrl` so Keycloak emits links and
cookies scoped to the tenant hostname. `KC_HOSTNAME_STRICT=false` in the
compose file lets the container accept any of the above as host headers; NPM
is configured to forward `X-Forwarded-*` headers so Keycloak knows the
original scheme + host.

## Clients per realm

Each realm registers an OIDC client for every self-hosted app the tenant
consumes:

| Client ID     | App             | Redirect URI                                    |
|---------------|-----------------|-------------------------------------------------|
| `nextcloud`   | Nextcloud       | `https://files.<realm-host>/*`                  |
| `rocketchat`  | Rocket.Chat     | `https://chat.<realm-host>/*`                   |
| `gitea`       | Gitea (corehub) | `https://git.corehub.io/*`                      |
| `twenty`      | Twenty (corehub)| `https://crm.corehub.io/*`                      |
| `zammad`      | Zammad          | `https://support.medtheris.kineo360.work/*`     |

Client redirect URIs per tenant:

- Corehub:              `https://<service>.corehub.io/*`
- MedTheris internal:   `https://<service>.medtheris.kineo360.work/*`
- Practice `<slug>`:    `https://<service>.<slug>.kineo360.work/*`

See the realm JSON templates in `keycloak/`.

## Realm roles

### corehub
- `corehub-admin` — full infrastructure access (Portainer, NPM, Keycloak)
- `corehub-dev`   — dev tools (Gitea, CI, etc.)
- `corehub-user`  — baseline

### practice-<slug>
- `practice-owner`     — admin
- `practice-therapist` — clinician
- `practice-reception` — reception / billing

## Import

### Full import at boot
Mount `keycloak/realm-corehub.json` into `/opt/keycloak/data/import/` and start
Keycloak with `--import-realm`. We keep import as a one-off init; day-to-day
changes happen in the admin UI and are included in nightly DB dumps.

### Script-driven (for new practices)
`scripts/onboard-practice.sh` uses `keycloak/realm-practice-template.json`,
substitutes `__SLUG__` / `__NAME__`, and POSTs to `/admin/realms`.

## Backup

Keycloak state lives in the Postgres DB `keycloak-db` — captured by the
nightly `scripts/backup.sh`.
