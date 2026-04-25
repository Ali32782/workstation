#!/usr/bin/env bash
# =============================================================================
# wire-oidc.sh - Connect every app to its Keycloak OIDC client.
#
# Pre-condition: Keycloak is up, realms are imported, OIDC clients exist.
#
# What this does:
#   1. Fetches the client secret for each OIDC client from Keycloak (via admin API)
#   2. Configures each app to use Keycloak as an OIDC/OAuth provider:
#        - Nextcloud (Corehub + MedTheris): installs user_oidc, adds provider
#        - Gitea:      `gitea admin auth add-oauth`
#        - Rocket.Chat: REST API → settings for Custom OAuth "keycloak"
#        - Twenty:     writes APP_SECRET/env + provider config
#        - Zammad:     prints admin-UI steps (no stable CLI)
#
# Idempotent. Re-run to rotate secrets.
#
# Usage:
#   ./scripts/wire-oidc.sh <realm> <app>
#
# Examples:
#   ./scripts/wire-oidc.sh corehub               # wires every Corehub app
#   ./scripts/wire-oidc.sh medtheris-internal    # wires MedTheris apps
#   ./scripts/wire-oidc.sh practice-mueller      # wires one practice
#   ./scripts/wire-oidc.sh corehub nextcloud     # wires just one app
# =============================================================================
set -euo pipefail

REALM="${1:?Usage: $0 <realm> [app]   apps: nextcloud rocketchat gitea twenty zammad}"
APP_FILTER="${2:-all}"

REPO_DIR="${REPO_DIR:-/opt/corehub}"
cd "${REPO_DIR}"
# shellcheck disable=SC1091
set -a; . ./.env; set +a

KC_URL="http://keycloak:8080"

echo "==> Fetching Keycloak admin token"
TOKEN=$(docker exec keycloak curl -s -X POST \
  "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KEYCLOAK_ADMIN}&password=${KEYCLOAK_ADMIN_PASSWORD}&grant_type=password&client_id=admin-cli" \
  | jq -r .access_token)

if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
  echo "!! Could not authenticate to Keycloak. Check KEYCLOAK_ADMIN[_PASSWORD]." >&2
  exit 1
fi

# ---------------------------------------------------------------------------
# Resolve the hostname that realm's clients are served from.
# Rule:   realm=corehub              -> corehub.io
#         realm=medtheris-internal   -> medtheris.kineo360.work
#         realm=practice-<slug>      -> <slug>.kineo360.work
# ---------------------------------------------------------------------------
case "${REALM}" in
  corehub)            TENANT_HOST="corehub.io";                  AUTH_HOST="auth.corehub.io" ;;
  medtheris-internal) TENANT_HOST="medtheris.kineo360.work";     AUTH_HOST="auth.medtheris.kineo360.work" ;;
  practice-*)         TENANT_HOST="${REALM#practice-}.kineo360.work"; AUTH_HOST="auth.${REALM#practice-}.kineo360.work" ;;
  *) echo "!! Unknown realm shape: ${REALM}" >&2; exit 1 ;;
esac
DISCOVERY="https://${AUTH_HOST}/realms/${REALM}/.well-known/openid-configuration"

echo "    realm         : ${REALM}"
echo "    tenant host   : ${TENANT_HOST}"
echo "    auth host     : ${AUTH_HOST}"
echo "    discovery URL : ${DISCOVERY}"

# Helper: fetch client UUID + regenerate (or fetch) client secret for a clientId.
kc_secret() {
  local client_id="$1"
  local uuid
  uuid=$(docker exec keycloak curl -s \
    "${KC_URL}/admin/realms/${REALM}/clients?clientId=${client_id}" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.[0].id // empty')
  if [[ -z "${uuid}" ]]; then
    echo "!! Client ${client_id} not found in realm ${REALM}" >&2
    return 1
  fi
  # Fetch existing secret (don't regenerate on every run to keep it stable)
  docker exec keycloak curl -s \
    "${KC_URL}/admin/realms/${REALM}/clients/${uuid}/client-secret" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r .value
}

wants() { [[ "${APP_FILTER}" == "all" || "${APP_FILTER}" == "$1" ]]; }

# ---------------------------------------------------------------------------
# Nextcloud (Corehub realm -> nextcloud-corehub, MedTheris realm -> nextcloud-medtheris,
#           practice realm -> nc-<slug>)
# ---------------------------------------------------------------------------
if wants nextcloud; then
  case "${REALM}" in
    corehub)            NC_CONTAINER="nextcloud-corehub";    NC_HOST="files.corehub.io" ;;
    medtheris-internal) NC_CONTAINER="nextcloud-medtheris";  NC_HOST="files.medtheris.kineo360.work" ;;
    practice-*)         NC_CONTAINER="nc-${REALM#practice-}"; NC_HOST="files.${REALM#practice-}.kineo360.work" ;;
  esac

  if docker ps --format '{{.Names}}' | grep -q "^${NC_CONTAINER}$"; then
    echo "==> Nextcloud (${NC_CONTAINER})"
    SECRET=$(kc_secret nextcloud)

    docker exec -u www-data "${NC_CONTAINER}" php occ app:install user_oidc     >/dev/null 2>&1 || true
    docker exec -u www-data "${NC_CONTAINER}" php occ app:enable  user_oidc     >/dev/null

    # Remove any previous provider with the same name, then add fresh.
    docker exec -u www-data "${NC_CONTAINER}" php occ user_oidc:provider:delete keycloak >/dev/null 2>&1 || true
    docker exec -u www-data "${NC_CONTAINER}" php occ user_oidc:provider \
      keycloak \
      --clientid=nextcloud \
      --clientsecret="${SECRET}" \
      --discoveryuri="${DISCOVERY}" \
      --scope="openid email profile" \
      --mapping-uid=preferred_username \
      --mapping-display-name=name \
      --mapping-email=email \
      --unique-uid=1

    echo "    OK - Nextcloud connected to realm ${REALM}"
  else
    echo "    (skip) Nextcloud container ${NC_CONTAINER} not running"
  fi
fi

# ---------------------------------------------------------------------------
# Gitea (only exists in Corehub)
# ---------------------------------------------------------------------------
if wants gitea && [[ "${REALM}" == "corehub" ]]; then
  echo "==> Gitea"
  SECRET=$(kc_secret gitea)

  # Remove existing auth source if present, then add fresh.
  docker exec -u git gitea gitea admin auth list 2>/dev/null \
    | awk '$2 == "keycloak" {print $1}' \
    | while read -r id; do
        [[ -n "${id}" ]] && docker exec -u git gitea gitea admin auth delete --id "${id}" || true
      done

  docker exec -u git gitea gitea admin auth add-oauth \
    --name keycloak \
    --provider openidConnect \
    --key nextcloud \
    --auto-discover-url "${DISCOVERY}" \
    --key gitea \
    --secret "${SECRET}" \
    --scopes "openid email profile" \
    --skip-local-2fa

  echo "    OK - Gitea OAuth2 source 'keycloak' added"
fi

# ---------------------------------------------------------------------------
# Rocket.Chat Custom OAuth
# ---------------------------------------------------------------------------
if wants rocketchat; then
  case "${REALM}" in
    corehub) CHAT_URL="https://chat.corehub.io" ;;
    medtheris-internal) CHAT_URL="https://chat.medtheris.kineo360.work" ;;
    practice-*) CHAT_URL="https://chat.${REALM#practice-}.kineo360.work" ;;
  esac
  echo "==> Rocket.Chat (${CHAT_URL})"
  SECRET=$(kc_secret rocketchat)
  ADMIN_TOKEN_FILE="/tmp/rc-admin-${REALM}.json"

  # The admin password/username was set via env on first boot; use the same.
  # Rocket.Chat admin login (requires first-run admin created manually):
  echo "    Rocket.Chat has no CLI; settings are applied via REST. Paste:"
  cat <<EOF

  # 1. Log in as a Rocket.Chat admin (first-run wizard must be completed).
  # 2. Create an admin user's personal access token in: Account -> Security -> Personal Access Tokens
  # 3. Export RC_USER_ID and RC_TOKEN, then run:

  export RC="${CHAT_URL}"
  export RC_USER_ID=...; export RC_TOKEN=...

  curl -s -X POST "\$RC/api/v1/settings.addCustomOAuth" \\
    -H "X-Auth-Token: \$RC_TOKEN" -H "X-User-Id: \$RC_USER_ID" \\
    -H 'Content-Type: application/json' \\
    -d '{"name":"Keycloak"}'

  for kv in \\
    "Accounts_OAuth_Custom-Keycloak=true" \\
    "Accounts_OAuth_Custom-Keycloak-url=https://${AUTH_HOST}/realms/${REALM}" \\
    "Accounts_OAuth_Custom-Keycloak-token_path=/protocol/openid-connect/token" \\
    "Accounts_OAuth_Custom-Keycloak-identity_path=/protocol/openid-connect/userinfo" \\
    "Accounts_OAuth_Custom-Keycloak-authorize_path=/protocol/openid-connect/auth" \\
    "Accounts_OAuth_Custom-Keycloak-scope=openid email profile" \\
    "Accounts_OAuth_Custom-Keycloak-id=rocketchat" \\
    "Accounts_OAuth_Custom-Keycloak-secret=${SECRET}" \\
    "Accounts_OAuth_Custom-Keycloak-login_style=redirect" \\
    "Accounts_OAuth_Custom-Keycloak-username_field=preferred_username" \\
    "Accounts_OAuth_Custom-Keycloak-email_field=email" \\
    "Accounts_OAuth_Custom-Keycloak-name_field=name" \\
    "Accounts_OAuth_Custom-Keycloak-merge_users=true" \\
    "Accounts_OAuth_Custom-Keycloak-show_button=true" \\
    ; do
      k=\${kv%%=*}; v=\${kv#*=};
      curl -s -X POST "\$RC/api/v1/settings/\$k" \\
        -H "X-Auth-Token: \$RC_TOKEN" -H "X-User-Id: \$RC_USER_ID" \\
        -H 'Content-Type: application/json' \\
        -d "{\"value\":\"\$v\"}" >/dev/null
  done
  echo "Rocket.Chat OIDC wired."

EOF
fi

# ---------------------------------------------------------------------------
# Twenty CRM (only corehub)
# ---------------------------------------------------------------------------
if wants twenty && [[ "${REALM}" == "corehub" ]]; then
  echo "==> Twenty CRM"
  SECRET=$(kc_secret twenty)
  echo "    Add these to the 'twenty' service environment in docker-compose.yml,"
  echo "    then restart:  docker compose up -d twenty"
  cat <<EOF
      AUTH_SSO_ENABLED: "true"
      AUTH_OIDC_ENABLED: "true"
      AUTH_OIDC_CLIENT_ID: twenty
      AUTH_OIDC_CLIENT_SECRET: ${SECRET}
      AUTH_OIDC_ISSUER: https://${AUTH_HOST}/realms/${REALM}
      AUTH_OIDC_REDIRECT_URI: https://crm.corehub.io/auth/oidc/callback
EOF
fi

# ---------------------------------------------------------------------------
# Zammad (helpdesk) - no stable CLI, print the admin-UI steps
# ---------------------------------------------------------------------------
if wants zammad && [[ "${REALM}" != "corehub" ]]; then
  echo "==> Zammad"
  SECRET=$(kc_secret zammad)
  cat <<EOF
    Zammad OAuth2 setup (Admin UI -> Settings -> Security -> Third-party Applications):

      Authorize URL:    https://${AUTH_HOST}/realms/${REALM}/protocol/openid-connect/auth
      Token URL:        https://${AUTH_HOST}/realms/${REALM}/protocol/openid-connect/token
      Userinfo URL:     https://${AUTH_HOST}/realms/${REALM}/protocol/openid-connect/userinfo
      Client ID:        zammad
      Client Secret:    ${SECRET}
      Scope:            openid email profile

EOF
fi

echo "==> Done for realm ${REALM}."
