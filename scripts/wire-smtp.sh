#!/usr/bin/env bash
# =============================================================================
# Configure SMTP across the stack (Migadu, port 587 STARTTLS).
#
# Idempotent: re-run after rotating SMTP_PASSWORD or changing identity.
# Reads SMTP_* from /opt/corelab/.env on the host (or current shell env).
#
# Wired services:
#   - Rocket.Chat (corehub + medtheris)
#   - Nextcloud   (corehub + medtheris)
#   - Keycloak    (master realm SMTP + every tenant realm)
#   - Twenty CRM  (env vars in compose)
#
# Usage:
#   ssh root@server '/opt/corelab/scripts/wire-smtp.sh'
# =============================================================================
set -euo pipefail

# Load .env if present
if [ -f /opt/corelab/.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /opt/corelab/.env
  set +a
fi

: "${SMTP_HOST:?SMTP_HOST not set}"
: "${SMTP_PORT:?SMTP_PORT not set}"
: "${SMTP_USER:?SMTP_USER not set}"
: "${SMTP_PASSWORD:?SMTP_PASSWORD not set}"
: "${SMTP_FROM_EMAIL:=$SMTP_USER}"
: "${SMTP_FROM_NAME:=Kineo360}"

green() { printf '\033[32m✓ %s\033[0m\n' "$*"; }
yellow() { printf '\033[33m! %s\033[0m\n' "$*"; }
red() { printf '\033[31m✗ %s\033[0m\n' "$*"; }

# -----------------------------------------------------------------------------
# 1) Rocket.Chat — both corehub and medtheris
# -----------------------------------------------------------------------------
configure_rocketchat() {
  local mongo_container="$1"
  local instance="$2"

  if ! docker ps --format '{{.Names}}' | grep -q "^${mongo_container}$"; then
    yellow "Rocket.Chat ($instance): mongo container ${mongo_container} not running, skip"
    return 0
  fi

  docker exec "$mongo_container" mongosh rocketchat --quiet --eval "
    const upd = (id, val, type='string') => db.rocketchat_settings.updateOne(
      {_id:id},
      {\$set:{value:val, type:type, _updatedAt:new Date()}},
      {upsert:true}
    );
    upd('SMTP_Host',          '${SMTP_HOST}');
    upd('SMTP_Port',           ${SMTP_PORT}, 'int');
    upd('SMTP_Username',      '${SMTP_USER}');
    upd('SMTP_Password',      '${SMTP_PASSWORD}', 'password');
    upd('SMTP_Protocol',      'smtp');
    upd('SMTP_Pool',           true,  'boolean');
    upd('SMTP_IgnoreTLS',      false, 'boolean');
    upd('From_Email',         '${SMTP_FROM_EMAIL}');
    print('Rocket.Chat ${instance} SMTP settings written');
  " > /dev/null
  green "Rocket.Chat ($instance) — SMTP configured (smtp.migadu.com:587 STARTTLS)"
}

configure_rocketchat rocketchat-mongo            corehub
configure_rocketchat rocketchat-mongo-medtheris  medtheris

# Restart RCs so settings re-load
docker restart rocketchat rocketchat-medtheris > /dev/null 2>&1 || true
green "Rocket.Chat — both instances restarting to apply"

# -----------------------------------------------------------------------------
# 2) Nextcloud — both corehub and medtheris
# -----------------------------------------------------------------------------
configure_nextcloud() {
  local container="$1"
  local instance="$2"

  if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    yellow "Nextcloud ($instance): container ${container} not running, skip"
    return 0
  fi

  docker exec -u www-data "$container" php occ config:system:set mail_smtpmode      --value="smtp"      > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_smtpsecure    --value="tls"       > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_smtpauth      --type=boolean --value=true > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_smtpauthtype  --value="LOGIN"     > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_smtphost      --value="${SMTP_HOST}" > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_smtpport      --value="${SMTP_PORT}" > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_smtpname      --value="${SMTP_USER}" > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_smtppassword  --value="${SMTP_PASSWORD}" > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_from_address  --value="$(echo "${SMTP_FROM_EMAIL}" | cut -d@ -f1)" > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_domain        --value="$(echo "${SMTP_FROM_EMAIL}" | cut -d@ -f2)" > /dev/null
  docker exec -u www-data "$container" php occ config:system:set mail_sendmailmode  --value="smtp"      > /dev/null
  green "Nextcloud ($instance) — SMTP configured"
}

configure_nextcloud nextcloud-corehub   corehub
configure_nextcloud nextcloud-medtheris medtheris

# -----------------------------------------------------------------------------
# 3) Keycloak — master + corehub + medtheris-internal realm SMTP
# -----------------------------------------------------------------------------
if docker ps --format '{{.Names}}' | grep -q '^keycloak$'; then
  : "${KEYCLOAK_ADMIN:=admin}"
  : "${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD missing}"
  docker exec keycloak /opt/keycloak/bin/kcadm.sh config credentials \
      --server http://localhost:8080 --realm master \
      --user "${KEYCLOAK_ADMIN}" --password "${KEYCLOAK_ADMIN_PASSWORD}" > /dev/null

  for realm in master corehub medtheris-internal; do
    docker exec keycloak /opt/keycloak/bin/kcadm.sh update "realms/${realm}" \
      -s "smtpServer.host=${SMTP_HOST}" \
      -s "smtpServer.port=${SMTP_PORT}" \
      -s "smtpServer.from=${SMTP_FROM_EMAIL}" \
      -s "smtpServer.fromDisplayName=${SMTP_FROM_NAME}" \
      -s "smtpServer.replyTo=${SMTP_FROM_EMAIL}" \
      -s "smtpServer.starttls=true" \
      -s "smtpServer.ssl=false" \
      -s "smtpServer.auth=true" \
      -s "smtpServer.user=${SMTP_USER}" \
      -s "smtpServer.password=${SMTP_PASSWORD}" > /dev/null && \
      green "Keycloak realm ${realm} — SMTP configured"
  done
else
  yellow "Keycloak: container not running, skip"
fi

# -----------------------------------------------------------------------------
# Done
# -----------------------------------------------------------------------------
echo
green "All services SMTP-configured. Test from each app's admin UI:"
echo "  - Rocket.Chat: Admin → Email → 'Send test email'"
echo "  - Nextcloud:   Settings → Basic settings → 'Send email'"
echo "  - Keycloak:    Realm settings → Email → 'Test connection'"
