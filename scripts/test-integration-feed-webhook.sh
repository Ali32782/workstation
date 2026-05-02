#!/usr/bin/env bash
# Smoke-test the portal integration event webhook (generic + Documenso-shaped).
# Usage:
#   PORTAL_URL=https://app.kineo360.work \
#   INTEGRATION_FEED_WEBHOOK_SECRET='…' \
#   DOCUMENSO_WEBHOOK_SECRET='…' \
#   bash scripts/test-integration-feed-webhook.sh
#
# Loads secrets from CORELAB_ENV file when set (same pattern as other scripts):
#   CORELAB_ENV=/opt/corelab/.env bash scripts/test-integration-feed-webhook.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -n "${CORELAB_ENV:-}" && -f "$CORELAB_ENV" ]]; then
  # shellcheck disable=SC1090
  set -a && source "$CORELAB_ENV" && set +a
fi

BASE_URL="${PORTAL_URL:-${AUTH_URL:-https://app.kineo360.work}}"
BASE_URL="${BASE_URL%/}"
URL="$BASE_URL/api/integrations/event-feed/webhook"

echo "→ POST (normalized JSON, Bearer) $URL"
if [[ -z "${INTEGRATION_FEED_WEBHOOK_SECRET:-}" ]]; then
  echo "  SKIP: set INTEGRATION_FEED_WEBHOOK_SECRET"
else
  curl -sS -X POST "$URL" \
    -H "Authorization: Bearer $INTEGRATION_FEED_WEBHOOK_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"workspaceId":"corehub","eventType":"integration.smoke.test","payload":{"source":"test-integration-feed-webhook.sh"}}' \
    | jq . 2>/dev/null || cat
  echo ""
fi

echo "→ POST (Documenso-shaped, X-Documenso-Secret) $URL"
if [[ -z "${DOCUMENSO_WEBHOOK_SECRET:-}" ]]; then
  echo "  SKIP: set DOCUMENSO_WEBHOOK_SECRET"
else
  curl -sS -X POST "$URL" \
    -H "X-Documenso-Secret: $DOCUMENSO_WEBHOOK_SECRET" \
    -H "Content-Type: application/json" \
    -d '{"event":"DOCUMENT_COMPLETED","createdAt":"2026-04-30T12:00:00.000Z","payload":{"id":999001,"title":"Webhook smoke test","status":"COMPLETED","externalId":null,"completedAt":"2026-04-30T12:00:00.000Z"}}' \
    | jq . 2>/dev/null || cat
  echo ""
fi

echo "Done. Check Pulse „Integration“ on the workspace set by INTEGRATION_FEED_DEFAULT_WORKSPACE (Documenso path)."
echo "Events file: portal_data volume …/integration-events/ (see docs/integration-event-feed.md)."
