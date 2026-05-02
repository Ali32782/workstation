#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# keycloak-portal-client.sh — Portal OIDC client in realm `main`
#
# Full provisioning (realm + all sibling clients + groups): run
#   scripts/migrate-to-main-realm.sh
#
# This helper only documents and optionally prints the confidential secret for
# client_id=portal so you can set PORTAL_KC_CLIENT_SECRET / KEYCLOAK_CLIENT_SECRET.
#
# Usage:
#   ./scripts/keycloak-portal-client.sh              # instructions only
#   KEYCLOAK_ADMIN=… KEYCLOAK_ADMIN_PASSWORD=… \
#     KC_CONTAINER=keycloak ./scripts/keycloak-portal-client.sh --print-secret
#
# Requires: docker, Keycloak container reachable as KC_CONTAINER (default keycloak).
# -----------------------------------------------------------------------------
set -euo pipefail

REALM="${REALM:-main}"
CLIENT_ID="${CLIENT_ID:-portal}"
KC_CONTAINER="${KC_CONTAINER:-keycloak}"
KC_URL_INTERNAL="${KC_URL_INTERNAL:-http://localhost:8080}"

kc() {
  docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"
}

print_instructions() {
  cat <<EOF
Portal OIDC client ($CLIENT_ID) lives in Keycloak realm '$REALM'.

Create / repair everything (recommended):
  ./scripts/migrate-to-main-realm.sh
Secrets are written to /tmp/main-secrets.env on the host where you ran it.

To print the current client secret from a running Keycloak (needs admin creds):
  KEYCLOAK_ADMIN=admin KEYCLOAK_ADMIN_PASSWORD='…' \\
    ./scripts/keycloak-portal-client.sh --print-secret

Portal Compose expects:
  PORTAL_KC_CLIENT_ID=$CLIENT_ID
  PORTAL_KC_CLIENT_SECRET=<from Keycloak>
Maps internally to KEYCLOAK_CLIENT_ID / KEYCLOAK_CLIENT_SECRET for NextAuth.
EOF
}

require_login() {
  if kc get realms --fields realm >/dev/null 2>&1; then
    return 0
  fi
  if [[ -z "${KEYCLOAK_ADMIN:-}" || -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
    echo "ERROR: set KEYCLOAK_ADMIN and KEYCLOAK_ADMIN_PASSWORD for --print-secret" >&2
    exit 1
  fi
  kc config credentials --server "$KC_URL_INTERNAL" --realm master \
    --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null
}

print_secret() {
  require_login
  local internal_id
  internal_id="$(kc get clients -r "$REALM" -q "clientId=$CLIENT_ID" --fields id --format csv --noquotes 2>/dev/null | head -1)"
  if [[ -z "$internal_id" || "$internal_id" == "id" ]]; then
    echo "ERROR: client '$CLIENT_ID' not found in realm '$REALM'. Run migrate-to-main-realm.sh first." >&2
    exit 1
  fi
  echo "Client secret for realm=$REALM clientId=$CLIENT_ID:"
  kc get clients/"$internal_id"/client-secret -r "$REALM"
}

main() {
  if [[ "${1:-}" == "--print-secret" ]]; then
    print_secret
  else
    print_instructions
  fi
}

main "$@"
