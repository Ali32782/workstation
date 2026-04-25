#!/usr/bin/env bash
# Run ON SERVER. Patches NPM proxy hosts 2+8 (Keycloak) with large proxy buffers.
set -euo pipefail
: "${NPM_IDENTITY:=ali.peters@kineo.swiss}"
: "${NPM_SECRET:?Set NPM_SECRET}"

TOKEN="$(
  curl -s -X POST http://localhost:81/api/tokens \
    -H "Content-Type: application/json" \
    -d "{\"identity\":\"$NPM_IDENTITY\",\"secret\":\"$NPM_SECRET\"}" \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])"
)"

export NPM_TOKEN="$TOKEN"
export ADV="proxy_buffer_size 128k;
proxy_buffers 4 256k;
proxy_busy_buffers_size 256k;
large_client_header_buffers 4 32k;
proxy_read_timeout 300s;
proxy_connect_timeout 75s;
"

for id in 2 8; do
  echo "=== PATCH host $id ==="
  curl -s "http://localhost:81/api/nginx/proxy-hosts/${id}" \
    -H "Authorization: Bearer $TOKEN" -o /tmp/npm-ph.json
  export NPM_HOST_ID=$id
  python3 <<'PY'
import json, os, urllib.request
host_id = os.environ["NPM_HOST_ID"]
token = os.environ["NPM_TOKEN"]
adv = os.environ["ADV"]
with open("/tmp/npm-ph.json") as f:
    d = json.load(f)
d["advanced_config"] = adv
clean = {k: d[k] for k in (
  "domain_names", "forward_host", "forward_port", "access_list_id",
  "certificate_id", "ssl_forced", "caching_enabled", "block_exploits",
  "advanced_config", "allow_websocket_upgrade", "http2_support",
  "forward_scheme", "enabled", "locations", "hsts_enabled", "hsts_subdomains",
) if k in d}
clean["meta"] = {"letsencrypt_agree": False, "dns_challenge": False}
body = json.dumps(clean).encode()
req = urllib.request.Request(
    f"http://localhost:81/api/nginx/proxy-hosts/{host_id}",
    data=body, method="PUT",
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
)
with urllib.request.urlopen(req) as r:
    r.read(500)
print("OK", r.status, "host", host_id)
PY
done

echo "=== Done ==="
curl -s -o /dev/null -w "auth: %{http_code}\n" https://auth.kineo360.work/
