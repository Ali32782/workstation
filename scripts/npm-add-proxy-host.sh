#!/usr/bin/env bash
# =============================================================================
# npm-add-proxy-host.sh — idempotent NPM proxy-host installer
#
# Purpose
#   Add (or update) a Nginx-Proxy-Manager proxy_host without touching the UI
#   and without restarting the npm container. The first time we did this for
#   bot.kineo360.work the naive approach was "INSERT … && docker restart npm",
#   which wipes /data/nginx/proxy_host/*.conf and does NOT regenerate them on
#   boot — taking out all 18 production hosts for ~3 minutes. Lesson learnt;
#   this script encodes the safe path:
#     1. INSERT (or UPDATE) the proxy_host row in NPM's SQLite
#     2. Run NPM's own internalNginx.generateConfig() with eager-loaded
#        certificate + access_list relations (so listen 443 ssl + auth_basic
#        come out correctly)
#     3. nginx -t + nginx -s reload via NPM's helper (no full restart)
#
# Usage
#   sudo bash scripts/npm-add-proxy-host.sh \
#     --domain bot.kineo360.work \
#     --host kineo_bot \
#     --port 8000 \
#     [--cert-id 2] \
#     [--scheme http] \
#     [--websocket on|off] \
#     [--ssl-forced on|off] \
#     [--frame-ancestors https://app.kineo360.work] \
#     [--client-max-body-size 50M] \
#     [--proxy-buffering off|on] \
#     [--access-list-id 0] \
#     [--http2 on|off]
#
# Re-running with the same --domain UPDATEs the existing row (idempotent).
#
# Requires: docker, an `npm` container running NPM v2.x with /app/internal.
# =============================================================================

set -euo pipefail

DOMAIN=""
FORWARD_HOST=""
FORWARD_PORT=""
CERT_ID="2"            # default: *.kineo360.work wildcard cert
SCHEME="http"
WEBSOCKET="on"
SSL_FORCED="on"
HTTP2="on"
HSTS="on"
BLOCK_EXPLOITS="on"
ACCESS_LIST_ID="0"
FRAME_ANCESTORS=""
CLIENT_MAX_BODY="50M"
PROXY_BUFFERING="on"   # "off" for streamlit / streaming workloads
EXTRA_ADVANCED=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --domain)               DOMAIN="$2"; shift 2 ;;
    --host)                 FORWARD_HOST="$2"; shift 2 ;;
    --port)                 FORWARD_PORT="$2"; shift 2 ;;
    --cert-id)              CERT_ID="$2"; shift 2 ;;
    --scheme)               SCHEME="$2"; shift 2 ;;
    --websocket)            WEBSOCKET="$2"; shift 2 ;;
    --ssl-forced)           SSL_FORCED="$2"; shift 2 ;;
    --http2)                HTTP2="$2"; shift 2 ;;
    --hsts)                 HSTS="$2"; shift 2 ;;
    --block-exploits)       BLOCK_EXPLOITS="$2"; shift 2 ;;
    --access-list-id)       ACCESS_LIST_ID="$2"; shift 2 ;;
    --frame-ancestors)      FRAME_ANCESTORS="$2"; shift 2 ;;
    --client-max-body-size) CLIENT_MAX_BODY="$2"; shift 2 ;;
    --proxy-buffering)      PROXY_BUFFERING="$2"; shift 2 ;;
    --extra-advanced)       EXTRA_ADVANCED="$2"; shift 2 ;;
    -h|--help)
      sed -n '/^# Usage$/,/^# =/p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "unknown flag: $1" >&2
      exit 2 ;;
  esac
done

[[ -z "$DOMAIN"       ]] && { echo "error: --domain required" >&2; exit 2; }
[[ -z "$FORWARD_HOST" ]] && { echo "error: --host required"   >&2; exit 2; }
[[ -z "$FORWARD_PORT" ]] && { echo "error: --port required"   >&2; exit 2; }

bool() { case "${1:-}" in on|true|1|yes) echo 1 ;; *) echo 0 ;; esac; }

WS_VAL=$(bool "$WEBSOCKET")
SSL_VAL=$(bool "$SSL_FORCED")
HTTP2_VAL=$(bool "$HTTP2")
HSTS_VAL=$(bool "$HSTS")
BLOCK_VAL=$(bool "$BLOCK_EXPLOITS")

# Build advanced_config block
ADV="client_max_body_size ${CLIENT_MAX_BODY};
proxy_read_timeout 300s;"
if [[ "${PROXY_BUFFERING,,}" == "off" ]]; then
  ADV+="
proxy_buffering off;"
fi
if [[ -n "$FRAME_ANCESTORS" ]]; then
  ADV+="
add_header Content-Security-Policy \"frame-ancestors ${FRAME_ANCESTORS}\";"
fi
if [[ -n "$EXTRA_ADVANCED" ]]; then
  ADV+="
${EXTRA_ADVANCED}"
fi

# Escape single quotes for SQL
ADV_ESCAPED="${ADV//\'/\'\'}"

NPM_CONTAINER="${NPM_CONTAINER:-npm}"

echo "==> 1. UPSERT proxy_host for ${DOMAIN} (host=${FORWARD_HOST}:${FORWARD_PORT})"
docker exec -i "$NPM_CONTAINER" sqlite3 /data/database.sqlite <<SQL
-- If a row already exists for this domain, update it (preserve id/access_list_id
-- if caller didn't pass --access-list-id) — otherwise insert new.
UPDATE proxy_host
SET
  modified_on             = datetime('now'),
  forward_host            = '${FORWARD_HOST}',
  forward_port            = ${FORWARD_PORT},
  forward_scheme          = '${SCHEME}',
  certificate_id          = ${CERT_ID},
  ssl_forced              = ${SSL_VAL},
  http2_support           = ${HTTP2_VAL},
  hsts_enabled            = ${HSTS_VAL},
  block_exploits          = ${BLOCK_VAL},
  allow_websocket_upgrade = ${WS_VAL},
  access_list_id          = ${ACCESS_LIST_ID},
  advanced_config         = '${ADV_ESCAPED}',
  enabled                 = 1
WHERE domain_names LIKE '%"${DOMAIN}"%' AND is_deleted = 0;

INSERT INTO proxy_host (
  created_on, modified_on, owner_user_id, is_deleted,
  domain_names, forward_host, forward_port, forward_scheme,
  access_list_id, certificate_id, ssl_forced, caching_enabled,
  block_exploits, advanced_config, meta, allow_websocket_upgrade,
  http2_support, enabled, locations, hsts_enabled, hsts_subdomains
)
SELECT
  datetime('now'), datetime('now'), 1, 0,
  '["${DOMAIN}"]', '${FORWARD_HOST}', ${FORWARD_PORT}, '${SCHEME}',
  ${ACCESS_LIST_ID}, ${CERT_ID}, ${SSL_VAL}, 0,
  ${BLOCK_VAL}, '${ADV_ESCAPED}',
  '{"letsencrypt_agree":false,"dns_challenge":false,"nginx_online":true,"nginx_err":null}',
  ${WS_VAL}, ${HTTP2_VAL}, 1, '[]', ${HSTS_VAL}, 1
WHERE NOT EXISTS (
  SELECT 1 FROM proxy_host
  WHERE domain_names LIKE '%"${DOMAIN}"%' AND is_deleted = 0
);

SELECT id, domain_names, forward_host, forward_port, certificate_id,
       access_list_id
  FROM proxy_host
  WHERE domain_names LIKE '%"${DOMAIN}"%' AND is_deleted = 0;
SQL

echo
echo "==> 2. Regenerate nginx configs (no restart!)"
docker exec "$NPM_CONTAINER" node -e '
process.chdir("/app");
const ProxyHost = require("./models/proxy_host");
const internalNginx = require("./internal/nginx");
(async () => {
  const hosts = await ProxyHost.query()
    .where("is_deleted", 0)
    .withGraphFetched("[certificate, access_list.[clients, items]]");
  for (const h of hosts) {
    await internalNginx.deleteConfig("proxy_host", h, false, true);
    await internalNginx.generateConfig("proxy_host", h);
  }
  await internalNginx.test();
  await internalNginx.reload();
  console.log("  reloaded " + hosts.length + " proxy_hosts");
})().then(() => process.exit(0)).catch(e => {
  console.error("  ERR " + e.message);
  process.exit(1);
});
'

echo
echo "==> 3. External probe https://${DOMAIN}/"
code=$(curl -sS -m 10 -o /dev/null -w "%{http_code}" "https://${DOMAIN}/" 2>/dev/null || echo "000")
echo "    HTTP ${code}"
case "$code" in
  2*|3*|401|403) echo "    OK (responding behind NPM)" ;;
  000)           echo "    WARN: no response — DNS or upstream container down" ;;
  *)             echo "    HTTP ${code}, may need follow-up" ;;
esac

echo
echo "Done. Domain ${DOMAIN} → ${FORWARD_HOST}:${FORWARD_PORT}"
