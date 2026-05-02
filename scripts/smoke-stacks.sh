#!/usr/bin/env bash
set -euo pipefail
#
# Container & endpoint smoke for ALL self-hosted stacks.
#
# Runs over SSH against medtheris-corelab. Designed to be cheap (~10s) so
# you can run it after every deploy or on a cron.
#
# Sections:
#   1. docker ps snapshot (filter: only our app containers)
#   2. internal HTTP probes via the `proxy` network
#   3. public HTTPS probes (sanity-check NPM/DNS/cert)
#
# Exit codes:
#   0  all green
#   1  at least one container missing or unhealthy / endpoint not 2xx-3xx
#
# Env:
#   SSH_HOST   default: medtheris-corelab
#   SKIP_PUBLIC=1   skip public HTTPS section (e.g. on dev laptops without DNS)
#

SSH_HOST="${SSH_HOST:-medtheris-corelab}"
SKIP_PUBLIC="${SKIP_PUBLIC:-0}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

fail=0

echo "==> 1. Container snapshot ($SSH_HOST)"
# We list ALL relevant containers and detect "exited", "restarting" or
# "unhealthy" → fail. Healthy + Up → ok. "Up" without health is treated
# as ok (some images don't ship a healthcheck).
#
# Exclusions:
#   *-init / *-migrator — one-shot bootstrap containers that legitimately
#   exit 0 after seeding the schema or the initial admin user. Treating
#   them as "running" would force us to keep a Compose hack that restarts
#   them; ignoring them in the smoke is correct.
container_lines=$(ssh "$SSH_HOST" 'docker ps -a --format "{{.Names}}|{{.Status}}" \
  | grep -E "^(portal|keycloak|keycloak-db|mautic_|twenty|plane|postiz_|opencut_|nextcloud|rocketchat|jitsi|gitea|zammad|snappymail|documenso|nginx-proxy-manager)" \
  | grep -vE "(-init|-migrator)" || true')

while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  name="${line%%|*}"
  status="${line#*|}"
  case "$status" in
    *unhealthy*|*Restarting*|*Exited*|*Created*|*Dead*)
      red "  ✗ $name — $status"
      fail=1
      ;;
    *healthy*)
      green "  ✓ $name — $status"
      ;;
    Up*)
      green "  ✓ $name — $status (no healthcheck)"
      ;;
    *)
      yellow "  ? $name — $status"
      ;;
  esac
done <<< "$container_lines"

echo
echo "==> 2. Internal HTTP probes (via 'proxy' docker network)"

# (container, port, path, label, expected-codes-regex)
probes=(
  "portal              3000  /api/health         portal-health        200"
  "twenty              3000  /healthz            twenty-health        200|404"
  "mautic_web          80    /                   mautic-front         200|301|302"
  "rocketchat          3000  /api/info           rocketchat-corehub   200"
  "rocketchat-medtheris 3000 /api/info           rocketchat-medtheris 200"
  "plane-proxy         80    /                   plane-front          200|301|302"
  "nextcloud-corehub   80    /status.php         nc-corehub           200"
  "nextcloud-medtheris 80    /status.php         nc-medtheris         200"
  "gitea               3000  /                   gitea-front          200|303"
  "zammad-nginx        8080  /                   zammad-front         200|301|302|303"
  "snappymail          8888  /                   snappymail-front     200"
  "documenso           3000  /api/health         documenso-health     200|404"
  "opencut_web         3000  /api/health         opencut-health       200"
  "postiz_backend      5000  /auth/login         postiz-front         200"
)

for p in "${probes[@]}"; do
  read -r host port path label codes <<<"$p"
  code=$(ssh "$SSH_HOST" "docker run --rm --network proxy curlimages/curl:latest \
      -fsS -o /dev/null -w '%{http_code}' --max-time 5 \
      http://${host}:${port}${path} 2>/dev/null || echo ERR")
  if [[ "$code" =~ ^(${codes})$ ]]; then
    green "  ✓ ${label}  → HTTP $code"
  else
    red   "  ✗ ${label}  → HTTP $code  (host=${host}:${port}${path})"
    fail=1
  fi
done

if [[ "$SKIP_PUBLIC" == "1" ]]; then
  echo
  yellow "==> 3. SKIPPED public HTTPS probes (SKIP_PUBLIC=1)"
else
  echo
  echo "==> 3. Public HTTPS probes (sanity-check NPM/DNS/cert)"
  pubs=(
    "https://app.kineo360.work/api/health                       200"
    "https://auth.kineo360.work/realms/main                     200"
    "https://crm.kineo360.work                                  200|302"
    "https://files.kineo360.work                                200|302"
    "https://chat.kineo360.work                                 200|302"
    "https://meet.kineo360.work                                 200"
    "https://plane.kineo360.work                                200|302"
    "https://sign.kineo360.work                                 200|302|307"
    "https://videos.kineo360.work                               200|503"
    "https://social.kineo360.work                               200|302|503"
  )
  for p in "${pubs[@]}"; do
    read -r url codes <<<"$p"
    code=$(curl -fsS -o /dev/null -w '%{http_code}' --max-time 8 "$url" 2>/dev/null || echo ERR)
    if [[ "$code" =~ ^(${codes})$ ]]; then
      green "  ✓ ${url}  → HTTP $code"
    else
      yellow "  ? ${url}  → HTTP $code  (DNS/NPM nicht aktiv?)"
      # Public probes are advisory only — don't fail the whole run on
      # them, since some hosts (videos/social) may not be wired yet.
    fi
  done
fi

echo
if [[ "$fail" == "0" ]]; then
  green "==> ALL GREEN"
  exit 0
else
  red "==> Some checks failed — see ✗ above"
  exit 1
fi
