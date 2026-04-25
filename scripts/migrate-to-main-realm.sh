#!/usr/bin/env bash
# =============================================================================
# migrate-to-main-realm.sh — collapse 3 realms into a single 'main' realm.
#
# Idempotent: re-running is safe; existing entities are skipped or updated.
#
# Creates:
#   - Realm 'main' with sensible defaults (8h idle, 24h max, sslRequired=external)
#   - Groups: /kineo, /corehub, /medtheris  + 18 subgroups (per spec)
#   - Realm roles: <org>-<role> for every subgroup (used for fine-grained perms)
#   - OIDC clients: portal, nextcloud-corehub, nextcloud-medtheris,
#                   rocketchat-corehub, rocketchat-medtheris,
#                   gitea, zammad-medtheris, twenty-corehub
#     Each gets a 'groups' protocol mapper so JWTs carry group memberships.
#   - Migrates internal users (ali, johannes, diana, richard) with group memberships
#
# Outputs:
#   /tmp/main-secrets.env   — all generated client secrets, ready for app configs
#   /tmp/main-users.txt     — user list with their temp passwords (1× use)
# =============================================================================
set -euo pipefail

# Defensive: caller may have `set -a` + .env loaded which could pre-export
# names we use. unset them so `declare -A` works as expected.
unset GROUPS CLIENTS USERS REALM 2>/dev/null || true

# --- config ---------------------------------------------------------------
REALM="${REALM:-main}"
KC_CONTAINER="${KC_CONTAINER:-keycloak}"
KC_URL_INTERNAL="http://localhost:8080"

# Subgroup spec (per keycloak-setup-task.md)
declare -A GROUPS=(
  [kineo]="executives leadership extended-leadership physio fitness billing customer-care"
  [corehub]="product-owner full-stack front-end back-end ui-ux dev-ops tester"
  [medtheris]="sales onboarding helpdesk tech-support"
)

# Client spec: clientId|valid_redirect_uris|web_origins|root_url
CLIENTS=(
  "portal|https://app.kineo360.work/api/auth/callback/keycloak,http://localhost:3000/api/auth/callback/keycloak|https://app.kineo360.work,http://localhost:3000|https://app.kineo360.work"
  "nextcloud-corehub|https://files.kineo360.work/*|https://files.kineo360.work|https://files.kineo360.work"
  "nextcloud-medtheris|https://files.medtheris.kineo360.work/*|https://files.medtheris.kineo360.work|https://files.medtheris.kineo360.work"
  "rocketchat-corehub|https://chat.kineo360.work/*|https://chat.kineo360.work|https://chat.kineo360.work"
  "rocketchat-medtheris|https://chat.medtheris.kineo360.work/*|https://chat.medtheris.kineo360.work|https://chat.medtheris.kineo360.work"
  "gitea|https://git.kineo360.work/*|https://git.kineo360.work|https://git.kineo360.work"
  "zammad-medtheris|https://support.medtheris.kineo360.work/*|https://support.medtheris.kineo360.work|https://support.medtheris.kineo360.work"
  "twenty-corehub|https://crm.kineo360.work/*|https://crm.kineo360.work|https://crm.kineo360.work"
)

# Internal users (username|email|firstName|lastName|groups,comma-separated)
USERS=(
  "ali|ali.peters@kineo.swiss|Ali|Peters|/kineo/executives,/corehub/dev-ops,/medtheris/sales"
  "johannes|johannes@corehub.kineo360.work|Johannes Ali|Peters|/corehub/product-owner,/kineo/leadership"
  "diana|diana@corehub.kineo360.work|Diana|Schneider|/corehub/full-stack"
  "richard|richard@corehub.kineo360.work|Richard|Bauer|/corehub/back-end"
)

# --- helpers --------------------------------------------------------------
kc() {
  docker exec "$KC_CONTAINER" /opt/keycloak/bin/kcadm.sh "$@"
}

log()  { echo "$@" >&2; }

require_admin_logged_in() {
  if kc get realms --fields realm >/dev/null 2>&1; then return; fi
  log "kcadm.sh has no valid credentials cached. Logging in…"
  if [[ -z "${KEYCLOAK_ADMIN:-}" || -z "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
    log "ERROR: set KEYCLOAK_ADMIN + KEYCLOAK_ADMIN_PASSWORD before running"
    exit 1
  fi
  kc config credentials --server "$KC_URL_INTERNAL" --realm master \
    --user "$KEYCLOAK_ADMIN" --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null
}

ensure_realm() {
  if kc get "realms/$REALM" --fields realm >/dev/null 2>&1; then
    log "  [ok] realm '$REALM' exists"
    return
  fi
  kc create realms \
    -s realm="$REALM" \
    -s enabled=true \
    -s displayName="Kineo Group" \
    -s registrationAllowed=false \
    -s rememberMe=true \
    -s loginWithEmailAllowed=true \
    -s duplicateEmailsAllowed=false \
    -s sslRequired=external \
    -s ssoSessionIdleTimeout=28800 \
    -s ssoSessionMaxLifespan=86400 \
    -s accessTokenLifespan=300 >/dev/null
  log "  [created] realm '$REALM'"
}

# Returns the group id for a path like /kineo or /kineo/physio (empty if absent).
# Output goes to STDOUT only — for capture via $(…). Logs go to stderr.
# Walks the tree via /children endpoints because Keycloak omits subGroups
# in brief representation by default.
get_group_id() {
  local path="$1"
  IFS='/' read -ra PARTS <<< "${path#/}"
  local cur_id=""
  local children_json
  children_json=$(kc get groups -r "$REALM" 2>/dev/null)
  for part in "${PARTS[@]}"; do
    cur_id=$(printf '%s' "$children_json" \
      | python3 -c "import json,sys; a=json.load(sys.stdin); print(next((g['id'] for g in a if g['name']=='$part'), ''))")
    if [[ -z "$cur_id" ]]; then echo ""; return; fi
    children_json=$(kc get "groups/$cur_id/children" -r "$REALM" 2>/dev/null)
  done
  echo "$cur_id"
}

ensure_group() {
  local path="$1"
  local gid
  gid=$(get_group_id "$path")
  if [[ -n "$gid" ]]; then
    log "    [ok] group $path"
    return
  fi
  if [[ "$path" =~ ^/[^/]+$ ]]; then
    kc create groups -r "$REALM" -s name="${path#/}" >/dev/null
  else
    local parent="${path%/*}"
    local child="${path##*/}"
    ensure_group "$parent"
    local pid
    pid=$(get_group_id "$parent")
    kc create "groups/$pid/children" -r "$REALM" -s name="$child" >/dev/null
  fi
  log "    [created] group $path"
}

ensure_realm_role() {
  local name="$1"
  if kc get "roles/$name" -r "$REALM" >/dev/null 2>&1; then
    log "    [ok] role $name"
    return
  fi
  kc create roles -r "$REALM" -s name="$name" -s description="Members of /$name" >/dev/null 2>&1 \
    && log "    [created] role $name" \
    || log "    [warn] could not create role $name (may exist)"
}

assign_role_to_group() {
  local group_path="$1" role_name="$2"
  local gid
  gid=$(get_group_id "$group_path")
  if [[ -z "$gid" ]]; then log "    [skip] role $role_name → no group $group_path"; return; fi
  local has_role
  has_role=$(kc get "groups/$gid/role-mappings/realm" -r "$REALM" 2>/dev/null \
    | python3 -c "import json,sys; print('y' if any(r.get('name')=='$role_name' for r in json.load(sys.stdin)) else '')")
  if [[ -n "$has_role" ]]; then
    log "    [ok] role $role_name already on $group_path"
    return
  fi
  kc add-roles -r "$REALM" --gid "$gid" --rolename "$role_name" >/dev/null
  log "    [linked] role $role_name → group $group_path"
}

ensure_client() {
  local clientId="$1" redirects_csv="$2" origins_csv="$3" rootUrl="$4"
  local existing_id
  existing_id=$(kc get clients -r "$REALM" -q "clientId=$clientId" --fields id 2>/dev/null \
    | python3 -c "import json,sys; a=json.load(sys.stdin); print(a[0]['id'] if a else '')")

  local redirects_json origins_json
  redirects_json=$(python3 -c "import json; print(json.dumps('$redirects_csv'.split(',')))")
  origins_json=$(python3 -c "import json; print(json.dumps('$origins_csv'.split(',')))")

  if [[ -z "$existing_id" ]]; then
    local secret
    secret=$(openssl rand -hex 24)
    kc create clients -r "$REALM" \
      -s clientId="$clientId" \
      -s enabled=true \
      -s "redirectUris=$redirects_json" \
      -s "webOrigins=$origins_json" \
      -s rootUrl="$rootUrl" \
      -s baseUrl="$rootUrl" \
      -s protocol=openid-connect \
      -s publicClient=false \
      -s bearerOnly=false \
      -s standardFlowEnabled=true \
      -s directAccessGrantsEnabled=false \
      -s serviceAccountsEnabled=false \
      -s "secret=$secret" >/dev/null
    existing_id=$(kc get clients -r "$REALM" -q "clientId=$clientId" --fields id 2>/dev/null \
      | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
    log "    [created] client $clientId"
  else
    kc update "clients/$existing_id" -r "$REALM" \
      -s "redirectUris=$redirects_json" \
      -s "webOrigins=$origins_json" \
      -s rootUrl="$rootUrl" \
      -s baseUrl="$rootUrl" >/dev/null
    log "    [updated] client $clientId"
  fi

  local has_mapper
  has_mapper=$(kc get "clients/$existing_id/protocol-mappers/models" -r "$REALM" 2>/dev/null \
    | python3 -c "import json,sys; print('y' if any(m.get('name')=='groups' for m in json.load(sys.stdin)) else '')")
  if [[ -z "$has_mapper" ]]; then
    kc create "clients/$existing_id/protocol-mappers/models" -r "$REALM" \
      -s name=groups \
      -s protocol=openid-connect \
      -s protocolMapper=oidc-group-membership-mapper \
      -s 'config."full.path"=true' \
      -s 'config."id.token.claim"=true' \
      -s 'config."access.token.claim"=true' \
      -s 'config."userinfo.token.claim"=true' \
      -s 'config."claim.name"=groups' >/dev/null
    log "      [mapper] groups added"
  else
    log "      [ok] mapper groups exists"
  fi

  local cur_secret
  cur_secret=$(kc get "clients/$existing_id/client-secret" -r "$REALM" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('value',''))")
  local upper
  upper=$(echo "$clientId" | tr 'a-z-' 'A-Z_')
  echo "${upper}_CLIENT_SECRET=${cur_secret}" >> /tmp/main-secrets.env
}

generate_temp_password() {
  openssl rand -base64 18 | tr -d '=+/' | head -c 18
}

ensure_user() {
  local username="$1" email="$2" first="$3" last="$4" groups_csv="$5"
  local existing_id
  existing_id=$(kc get users -r "$REALM" -q "username=$username" -q "exact=true" --fields id 2>/dev/null \
    | python3 -c "import json,sys; a=json.load(sys.stdin); print(a[0]['id'] if a else '')")
  if [[ -z "$existing_id" ]]; then
    local temp_pw
    temp_pw=$(generate_temp_password)
    kc create users -r "$REALM" \
      -s username="$username" \
      -s email="$email" \
      -s firstName="$first" \
      -s lastName="$last" \
      -s enabled=true \
      -s emailVerified=true \
      -s 'requiredActions=["UPDATE_PASSWORD","CONFIGURE_TOTP"]' >/dev/null
    existing_id=$(kc get users -r "$REALM" -q "username=$username" -q "exact=true" --fields id 2>/dev/null \
      | python3 -c "import json,sys; print(json.load(sys.stdin)[0]['id'])")
    kc set-password -r "$REALM" --userid "$existing_id" --new-password "$temp_pw" --temporary >/dev/null
    log "  [created] user $username"
    echo "$username|$temp_pw|$email" >> /tmp/main-users.txt
  else
    kc update "users/$existing_id" -r "$REALM" \
      -s firstName="$first" -s lastName="$last" -s email="$email" >/dev/null
    log "  [ok] user $username (id $existing_id)"
  fi

  IFS=',' read -ra GROUPS_ARR <<< "$groups_csv"
  for path in "${GROUPS_ARR[@]}"; do
    local gid
    gid=$(get_group_id "$path")
    if [[ -z "$gid" ]]; then log "    [skip] no group $path"; continue; fi
    if kc get "users/$existing_id/groups" -r "$REALM" --fields id 2>/dev/null \
         | grep -q "\"$gid\""; then
      log "    [ok] $username already in $path"
    else
      kc update "users/$existing_id/groups/$gid" -r "$REALM" -n >/dev/null
      log "    [added] $username → $path"
    fi
  done
}

# --- main ----------------------------------------------------------------
log "==> Logging in to Keycloak"
require_admin_logged_in

log ""
log "==> 1/4 Realm"
ensure_realm

log ""
log "==> 2/4 Groups + roles"
for org in "${!GROUPS[@]}"; do
  ensure_group "/$org"
  for sub in ${GROUPS[$org]}; do
    ensure_group "/$org/$sub"
    role="${org}-${sub}"
    ensure_realm_role "$role"
    assign_role_to_group "/$org/$sub" "$role"
  done
done

log ""
log "==> 3/4 Clients"
: > /tmp/main-secrets.env
echo "# Generated $(date)" >> /tmp/main-secrets.env
for spec in "${CLIENTS[@]}"; do
  IFS='|' read -r cid redirs origins root <<< "$spec"
  ensure_client "$cid" "$redirs" "$origins" "$root"
done

log ""
log "==> 4/4 Users"
: > /tmp/main-users.txt
echo "# username|temp_password|email — share once, then 'rm /tmp/main-users.txt'" >> /tmp/main-users.txt
for spec in "${USERS[@]}"; do
  IFS='|' read -r u e f l g <<< "$spec"
  ensure_user "$u" "$e" "$f" "$l" "$g"
done

log ""
log "==> Done"
log "  Client secrets → /tmp/main-secrets.env"
log "  User temp pws  → /tmp/main-users.txt"
