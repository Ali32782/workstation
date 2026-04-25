#!/bin/bash
# Reset NPM admin password. Run on the Hetzner host.
# Usage: ./scripts/npm-reset-admin.sh <admin-email> <new-password>
#
# Why: NPM admin is locked out / forgotten. The admin UI is loopback-only
# (port 81 via SSH tunnel) and the only recovery is direct DB edit.
set -euo pipefail

EMAIL="${1:?Email required as first arg}"
NEW_PASS="${2:?New password required as second arg}"

if ! docker ps --format '{{.Names}}' | grep -q '^npm$'; then
  echo "FATAL: npm container is not running" >&2
  exit 1
fi

USER_ID=$(docker exec npm sqlite3 /data/database.sqlite \
  "SELECT id FROM user WHERE email = '$EMAIL' AND is_disabled = 0;")

if [ -z "$USER_ID" ]; then
  echo "FATAL: no enabled user with email '$EMAIL' found in NPM DB" >&2
  echo "Existing users:" >&2
  docker exec npm sqlite3 /data/database.sqlite "SELECT id, email FROM user;" >&2
  exit 1
fi

echo "Found user_id=$USER_ID for $EMAIL"
echo "Generating bcrypt(13) hash via throwaway node container..."

HASH=$(docker run --rm node:20-alpine sh -c \
  "cd /tmp && npm install bcryptjs --silent --no-audit --no-fund 2>/dev/null && \
   node -e 'console.log(require(\"bcryptjs\").hashSync(\"$NEW_PASS\", 13))'" \
  | tail -1)

if [ ${#HASH} -ne 60 ]; then
  echo "FATAL: bcrypt hash length is ${#HASH}, expected 60" >&2
  exit 1
fi

docker exec npm sqlite3 /data/database.sqlite \
  "UPDATE auth SET secret = '$HASH' WHERE user_id = $USER_ID AND type = 'password';"

echo "Password updated. Verifying via login API..."

TOKEN=$(curl -s -X POST http://127.0.0.1:81/api/tokens \
  -H "Content-Type: application/json" \
  -d "{\"identity\":\"$EMAIL\",\"secret\":\"$NEW_PASS\"}" \
  | python3 -c "import sys, json; print(json.load(sys.stdin).get('token','FAIL'))")

if [ "$TOKEN" = "FAIL" ] || [ -z "$TOKEN" ]; then
  echo "FATAL: new password did not authenticate" >&2
  exit 1
fi

echo "OK — login works. Open NPM via SSH tunnel:"
echo "  ssh -L 81:localhost:81 deploy@<host>"
echo "  http://localhost:81"
echo "  email: $EMAIL"
