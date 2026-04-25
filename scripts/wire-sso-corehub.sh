#!/usr/bin/env bash
# =============================================================================
# Wire all corehub-side apps to Keycloak (OIDC SSO).
# Idempotent — safe to re-run after rotating secrets.
#
# Apps wired:
#   - Nextcloud Corehub (user_oidc app)
#   - Gitea            (oauth2 source via gitea CLI)
#   - Rocket.Chat      (Custom OAuth via mongo)
#   - Zammad           (OIDC via rails runner)
#   - Twenty CRM       (env-var based, only sets vars; restart required)
#
# Run on the Hetzner host.
# =============================================================================
set -euo pipefail

KC_BASE="https://auth.kineo360.work"
KC_REALM="corehub"
KC_ISSUER="${KC_BASE}/realms/${KC_REALM}"

# Client secrets (read from Keycloak before running)
NC_CLIENT_ID="nextcloud"
NC_SECRET="${NC_SECRET:?Pass NC_SECRET}"

GITEA_CLIENT_ID="gitea"
GITEA_SECRET="${GITEA_SECRET:?Pass GITEA_SECRET}"

RC_CLIENT_ID="rocketchat"
RC_SECRET="${RC_SECRET:?Pass RC_SECRET}"

ZAMMAD_CLIENT_ID="zammad"
ZAMMAD_SECRET="${ZAMMAD_SECRET:?Pass ZAMMAD_SECRET}"

green()  { printf '\033[32m✓ %s\033[0m\n' "$*"; }
yellow() { printf '\033[33m! %s\033[0m\n' "$*"; }

# -----------------------------------------------------------------------------
# 1) Nextcloud — user_oidc
# -----------------------------------------------------------------------------
wire_nextcloud() {
  local container="nextcloud-corehub"
  if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    yellow "Nextcloud: container not running, skip"; return 0
  fi

  # Ensure user_oidc app is enabled
  docker exec -u www-data "$container" php occ app:enable user_oidc >/dev/null 2>&1 || true

  # Idempotent: delete existing keycloak provider, then re-add
  docker exec -u www-data "$container" php occ user_oidc:provider:delete keycloak >/dev/null 2>&1 || true

  docker exec -u www-data "$container" php occ user_oidc:provider \
    keycloak \
    --clientid="$NC_CLIENT_ID" \
    --clientsecret="$NC_SECRET" \
    --discoveryuri="$KC_ISSUER/.well-known/openid-configuration" \
    --scope="openid profile email" \
    --mapping-uid="preferred_username" \
    --mapping-display-name="name" \
    --mapping-email="email" \
    --unique-uid=0 \
    >/dev/null

  # Auto-provision users on first OIDC login
  docker exec -u www-data "$container" php occ config:app:set user_oidc auto_provision --value="1" >/dev/null
  docker exec -u www-data "$container" php occ config:app:set user_oidc soft_auto_provision --value="1" >/dev/null

  green "Nextcloud → Keycloak OIDC wired (provider 'keycloak', auto-provision on)"
}

# -----------------------------------------------------------------------------
# 2) Gitea — oauth2 source
# -----------------------------------------------------------------------------
wire_gitea() {
  local container="gitea"
  if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    yellow "Gitea: container not running, skip"; return 0
  fi

  # Find or create the auth source
  local existing
  existing=$(docker exec -u git "$container" gitea admin auth list 2>/dev/null | awk '$2=="Keycloak"{print $1}' || true)

  if [ -n "$existing" ]; then
    docker exec -u git "$container" gitea admin auth update-oauth \
      --id "$existing" \
      --provider openidConnect \
      --key "$GITEA_CLIENT_ID" \
      --secret "$GITEA_SECRET" \
      --auto-discover-url "$KC_ISSUER/.well-known/openid-configuration" \
      --scopes "openid profile email" \
      >/dev/null
    green "Gitea → Keycloak OIDC updated (source id=$existing)"
  else
    docker exec -u git "$container" gitea admin auth add-oauth \
      --name "Keycloak" \
      --provider openidConnect \
      --key "$GITEA_CLIENT_ID" \
      --secret "$GITEA_SECRET" \
      --auto-discover-url "$KC_ISSUER/.well-known/openid-configuration" \
      --scopes "openid profile email" \
      >/dev/null
    green "Gitea → Keycloak OIDC source created (Login-Button 'Keycloak' erscheint)"
  fi
}

# -----------------------------------------------------------------------------
# 3) Rocket.Chat — Custom OAuth via Mongo
# -----------------------------------------------------------------------------
wire_rocketchat() {
  local mongo="rocketchat-mongo"
  if ! docker ps --format '{{.Names}}' | grep -q "^${mongo}$"; then
    yellow "Rocket.Chat: mongo container not running, skip"; return 0
  fi

  docker exec "$mongo" mongosh rocketchat --quiet --eval "
    const upd = (id, val, type='string') => db.rocketchat_settings.updateOne(
      {_id: id},
      {\$set: {value: val, type: type, _updatedAt: new Date()}},
      {upsert: true}
    );
    upd('Accounts_OAuth_Custom-Keycloak',                  true,  'boolean');
    upd('Accounts_OAuth_Custom-Keycloak-url',              '${KC_BASE}');
    upd('Accounts_OAuth_Custom-Keycloak-token_path',       '/realms/${KC_REALM}/protocol/openid-connect/token');
    upd('Accounts_OAuth_Custom-Keycloak-identity_path',    '/realms/${KC_REALM}/protocol/openid-connect/userinfo');
    upd('Accounts_OAuth_Custom-Keycloak-authorize_path',   '/realms/${KC_REALM}/protocol/openid-connect/auth');
    upd('Accounts_OAuth_Custom-Keycloak-scope',            'openid profile email');
    upd('Accounts_OAuth_Custom-Keycloak-token_sent_via',   'header');
    upd('Accounts_OAuth_Custom-Keycloak-identity_token_sent_via', 'header');
    upd('Accounts_OAuth_Custom-Keycloak-id',               '${RC_CLIENT_ID}');
    upd('Accounts_OAuth_Custom-Keycloak-secret',           '${RC_SECRET}', 'password');
    upd('Accounts_OAuth_Custom-Keycloak-login_style',      'redirect');
    upd('Accounts_OAuth_Custom-Keycloak-button_label_text','Mit Keycloak anmelden');
    upd('Accounts_OAuth_Custom-Keycloak-button_label_color','#FFFFFF');
    upd('Accounts_OAuth_Custom-Keycloak-button_color',     '#1e4d8c');
    upd('Accounts_OAuth_Custom-Keycloak-key_field',        'username');
    upd('Accounts_OAuth_Custom-Keycloak-username_field',   'preferred_username');
    upd('Accounts_OAuth_Custom-Keycloak-name_field',       'name');
    upd('Accounts_OAuth_Custom-Keycloak-email_field',      'email');
    upd('Accounts_OAuth_Custom-Keycloak-roles_claim',      'roles');
    upd('Accounts_OAuth_Custom-Keycloak-merge_users',      true,  'boolean');
    upd('Accounts_OAuth_Custom-Keycloak-show_button',      true,  'boolean');
    print('OK');
  " >/dev/null
  docker restart rocketchat >/dev/null 2>&1
  green "Rocket.Chat → Keycloak Custom-OAuth wired (button visible after restart)"
}

# -----------------------------------------------------------------------------
# 4) Zammad — OIDC via Rails runner
# -----------------------------------------------------------------------------
wire_zammad() {
  local container="zammad-railsserver"
  if ! docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
    yellow "Zammad: railsserver not running, skip"; return 0
  fi

  cat > /tmp/zammad-oidc.rb <<RUBY
Setting.set('auth_openid_connect', true)
Setting.set('auth_openid_connect_credentials', {
  name: 'Keycloak',
  display_name: 'Mit Keycloak anmelden',
  identifier: '${ZAMMAD_CLIENT_ID}',
  secret: '${ZAMMAD_SECRET}',
  issuer: '${KC_ISSUER}',
  scope: 'openid profile email',
  uid_field: 'preferred_username',
  pkce: true
})
Setting.set('auth_third_party_auto_link_at_inital_login', true)
puts 'OK'
RUBY
  docker cp /tmp/zammad-oidc.rb "${container}:/tmp/zammad-oidc.rb"
  docker exec "$container" sh -c "cd /opt/zammad && bundle exec rails runner -e production /tmp/zammad-oidc.rb" 2>&1 | tail -3
  green "Zammad → Keycloak OIDC wired (button visible at /#login)"
}

# -----------------------------------------------------------------------------
# 5) Twenty CRM — needs env vars in compose. Print instructions.
# -----------------------------------------------------------------------------
wire_twenty() {
  yellow "Twenty CRM: SSO needs env-vars in docker-compose, will be done in second step"
}

wire_nextcloud
wire_gitea
wire_rocketchat
wire_zammad
wire_twenty

echo
green "Done. Smoke-Test: open each app in incognito and look for 'Mit Keycloak anmelden' button."
