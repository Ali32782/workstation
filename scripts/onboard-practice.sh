#!/usr/bin/env bash
# =============================================================================
# onboard-practice.sh - Provision a new Kineo360 practice tenant.
# Target: ~1-2 h manual → minutes automated.
#
# Creates:
#   - Keycloak realm  practice-<slug>
#   - Nextcloud instance + DB  files.<slug>.kineo360.work
#   - Rocket.Chat workspace entry (reminder: realm + SSO link)
#   - Migadu mailbox reminder
#   - Peoplefone/Zoiper doc stub
#
# Usage:  ./scripts/onboard-practice.sh <slug> <display-name> <admin-email>
# Example: ./scripts/onboard-practice.sh physiomueller "Physio Müller AG" info@physio-mueller.ch
# =============================================================================
set -euo pipefail

SLUG="${1:?slug required (a-z0-9, e.g. physiomueller)}"
NAME="${2:?display name required}"
EMAIL="${3:?admin email required}"

if ! [[ "${SLUG}" =~ ^[a-z0-9][a-z0-9-]{1,30}$ ]]; then
  echo "slug must be lowercase a-z0-9- , 2-31 chars" >&2
  exit 1
fi

REPO_DIR="${REPO_DIR:-/opt/corehub}"
cd "${REPO_DIR}"
# shellcheck disable=SC1091
set -a; . ./.env; set +a

TENANT_DIR="tenants/${SLUG}"
if [[ -d "${TENANT_DIR}" ]]; then
  echo "Tenant ${SLUG} already exists." >&2
  exit 1
fi

PRODUCT_DOMAIN="${PRODUCT_DOMAIN:-kineo360.work}"
TENANT_ROOT="${SLUG}.${PRODUCT_DOMAIN}"
AUTH_SUB="auth.${SLUG}.${PRODUCT_DOMAIN}"
NC_SUB="files.${SLUG}.${PRODUCT_DOMAIN}"
CHAT_SUB="chat.${SLUG}.${PRODUCT_DOMAIN}"
NC_DB="nc_${SLUG//-/_}"
NC_DB_PASS=$(openssl rand -base64 24 | tr -d '=+/')
ADMIN_PASS=$(openssl rand -base64 18 | tr -d '=+/')

echo "==> 1/5 Create tenant directory"
mkdir -p "${TENANT_DIR}"

cat > "${TENANT_DIR}/.env" <<EOF
TENANT_SLUG=${SLUG}
TENANT_NAME=${NAME}
TENANT_EMAIL=${EMAIL}
TENANT_ROOT=${TENANT_ROOT}
AUTH_SUB=${AUTH_SUB}
NC_SUB=${NC_SUB}
CHAT_SUB=${CHAT_SUB}
NC_DB=${NC_DB}
NC_DB_PASS=${NC_DB_PASS}
NC_ADMIN_USER=admin
NC_ADMIN_PASS=${ADMIN_PASS}
EOF
chmod 600 "${TENANT_DIR}/.env"

echo "==> 2/5 Create Nextcloud DB in MariaDB"
docker exec -i mariadb mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}" <<SQL
CREATE DATABASE IF NOT EXISTS ${NC_DB} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${NC_DB}'@'%' IDENTIFIED BY '${NC_DB_PASS}';
GRANT ALL PRIVILEGES ON ${NC_DB}.* TO '${NC_DB}'@'%';
FLUSH PRIVILEGES;
SQL

echo "==> 3/5 Render Nextcloud compose override"
cat > "${TENANT_DIR}/docker-compose.yml" <<EOF
name: tenant-${SLUG}
networks:
  proxy: { external: true }
  shared-internal: { external: true, name: corehub_shared-internal }
volumes:
  nc_${SLUG}_data:
services:
  nextcloud-${SLUG}:
    image: nextcloud:29-apache
    container_name: nc-${SLUG}
    restart: unless-stopped
    environment:
      MYSQL_HOST: mariadb
      MYSQL_DATABASE: ${NC_DB}
      MYSQL_USER: ${NC_DB}
      MYSQL_PASSWORD: ${NC_DB_PASS}
      NEXTCLOUD_ADMIN_USER: admin
      NEXTCLOUD_ADMIN_PASSWORD: ${ADMIN_PASS}
      NEXTCLOUD_TRUSTED_DOMAINS: ${NC_SUB}
      OVERWRITEPROTOCOL: https
      OVERWRITEHOST: ${NC_SUB}
      TRUSTED_PROXIES: 172.16.0.0/12
      TZ: ${TZ}
    volumes:
      - nc_${SLUG}_data:/var/www/html
    networks: [proxy, shared-internal]
EOF

docker compose -f "${TENANT_DIR}/docker-compose.yml" up -d

echo "==> 4/5 Create Keycloak realm practice-${SLUG}"
# Obtain admin token, then POST a minimal realm definition.
KC_URL="http://keycloak:8080"
TOKEN=$(docker exec keycloak curl -s -X POST \
  "${KC_URL}/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=${KEYCLOAK_ADMIN}&password=${KEYCLOAK_ADMIN_PASSWORD}&grant_type=password&client_id=admin-cli" \
  | jq -r .access_token)

if [[ -z "${TOKEN}" || "${TOKEN}" == "null" ]]; then
  echo "   !! Could not authenticate to Keycloak; create realm manually." >&2
else
  sed "s/__SLUG__/${SLUG}/g; s/__NAME__/${NAME//\//\\/}/g" \
    keycloak/realm-practice-template.json \
    | docker exec -i keycloak curl -s -X POST "${KC_URL}/admin/realms" \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        --data-binary @-
  echo "   realm practice-${SLUG} created"
fi

echo "==> 5/5 Manual checklist"
cat <<EOF

Tenant '${SLUG}' provisioned.

Remaining manual steps (~15 min):

  1. DNS (skip if *.*.${PRODUCT_DOMAIN} wildcard is active):
       ${TENANT_ROOT}    A  -> <server-ip>
       ${AUTH_SUB}       A  -> <server-ip>
       ${NC_SUB}         A  -> <server-ip>
       ${CHAT_SUB}       A  -> <server-ip>

  2. Nginx Proxy Manager — create Proxy Hosts:
       ${TENANT_ROOT}   -> landing container   (optional tenant landing)
       ${AUTH_SUB}      -> keycloak:8080       (SSO, realm practice-${SLUG})
       ${NC_SUB}        -> nc-${SLUG}:80       (Force SSL, HTTP/2, websockets ON)
       ${CHAT_SUB}      -> rocketchat:3000     (workspace for this tenant)

  3. Migadu control panel:
       - Option A: use a ${SLUG}@${PRODUCT_DOMAIN} mailbox (no extra DNS).
       - Option B: add the practice's own domain (e.g. physio-mueller.ch)
                  as an alias/identity in Migadu and set MX/SPF/DKIM/DMARC.

  4. Peoplefone CH:
       create SIP account, send Zoiper config to ${EMAIL}

  5. First login:
       URL:       https://${NC_SUB}
       User:      admin
       Password:  ${ADMIN_PASS}    (stored in ${TENANT_DIR}/.env)

EOF
