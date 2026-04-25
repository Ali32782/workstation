#!/bin/bash
# Patches NPM proxy hosts so they can be embedded as iframes by the portal
# at app.kineo360.work.
#
# Strips upstream X-Frame-Options + Content-Security-Policy and adds our own
# `frame-ancestors 'self' https://app.kineo360.work` via openresty's
# `more_set_headers` (additive, inherited even when location adds its own headers).
#
# Run on the Hetzner host. Requires NPM_USER + NPM_PASS env vars (admin login).
set -euo pipefail

NPM_USER="${NPM_USER:?Set NPM_USER env var}"
NPM_PASS="${NPM_PASS:?Set NPM_PASS env var}"
NPM_URL="${NPM_URL:-http://127.0.0.1:81}"

# Comma-separated list of NPM proxy_host IDs to patch.
# Discover via:  curl -s -H "Authorization: Bearer $TOKEN" $NPM_URL/api/nginx/proxy-hosts | jq '.[] | {id, domain_names}'
HOSTS="${HOSTS:-2 3 4 5 6 8 9 10 11}"

TOKEN=$(curl -s -X POST "$NPM_URL/api/tokens" \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$NPM_USER\",\"secret\":\"$NPM_PASS\"}" \
  | python3 -c "import sys, json; print(json.load(sys.stdin)['token'])")

CSP_MARKER="# --- portal-iframe-csp ---"
cat > /tmp/csp-snippet.txt <<'EOF'
# --- portal-iframe-csp ---
more_clear_headers "X-Frame-Options";
more_clear_headers "Content-Security-Policy";
more_set_headers "Content-Security-Policy: frame-ancestors 'self' https://app.kineo360.work";
EOF

for ID in $HOSTS; do
  HOST_JSON=$(curl -s "$NPM_URL/api/nginx/proxy-hosts/$ID" -H "Authorization: Bearer $TOKEN")
  DOMAIN=$(echo "$HOST_JSON" | python3 -c "import sys, json; print(','.join(json.load(sys.stdin).get('domain_names',['?'])))")
  echo "$HOST_JSON" | python3 -c "import sys, json; print(json.load(sys.stdin).get('advanced_config') or '')" > /tmp/existing.txt

  python3 - <<'PYSTRIP' > /tmp/cleaned.txt
import re
with open('/tmp/existing.txt') as f:
    content = f.read()
content = re.sub(
    r'\n*# --- portal-iframe-csp ---.*?(?=\n\n|\Z)',
    '',
    content,
    flags=re.DOTALL,
).strip()
print(content)
PYSTRIP

  if [ -s /tmp/cleaned.txt ]; then
    cat /tmp/cleaned.txt > /tmp/new-config.txt
    printf "\n\n" >> /tmp/new-config.txt
    cat /tmp/csp-snippet.txt >> /tmp/new-config.txt
  else
    cp /tmp/csp-snippet.txt /tmp/new-config.txt
  fi

  python3 -c "
import json
with open('/tmp/new-config.txt') as f:
    config = f.read()
print(json.dumps({'advanced_config': config}))
" > /tmp/csp-payload.json

  RESULT=$(curl -s -X PUT "$NPM_URL/api/nginx/proxy-hosts/$ID" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" \
    -d @/tmp/csp-payload.json)

  if echo "$RESULT" | grep -q '"error"'; then
    echo "  $DOMAIN: FAILED"
    echo "$RESULT" | head -3
  else
    echo "  $DOMAIN: patched"
  fi
done

echo "--- nginx reload ---"
docker exec npm nginx -s reload
