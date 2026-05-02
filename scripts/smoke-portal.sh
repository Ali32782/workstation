#!/usr/bin/env bash
set -euo pipefail
#
# Quick HTTP smoke after deploy.
#
# Env:
#   PORTAL_SMOKE_URL   default: https://app.kineo360.work
#
# Checks:
#   GET {base}/api/health     → 200, JSON contains "ok"
#   GET {base}/p/status       → 200, HTML contains public status title
#
BASE="${PORTAL_SMOKE_URL:-https://app.kineo360.work}"
BASE="${BASE%/}"

tmp1=$(mktemp)
tmp2=$(mktemp)
trap 'rm -f "$tmp1" "$tmp2"' EXIT

echo "==> GET $BASE/api/health"
code1=$(curl -sS -o "$tmp1" -w "%{http_code}" "$BASE/api/health" || true)
if [[ "$code1" != "200" ]]; then
  echo "FAIL: expected HTTP 200, got $code1"
  cat "$tmp1" 2>/dev/null || true
  exit 1
fi
if ! grep -q '"ok"' "$tmp1"; then
  echo "FAIL: response has no ok field"
  cat "$tmp1"
  exit 1
fi
echo "    $(tr -d '\n' < "$tmp1" | head -c 120)..."

echo "==> GET $BASE/p/status"
code2=$(curl -sS -o "$tmp2" -w "%{http_code}" "$BASE/p/status" || true)
if [[ "$code2" != "200" ]]; then
  echo "FAIL: expected HTTP 200, got $code2"
  exit 1
fi
if ! grep -qF "MedTheris · Status" "$tmp2"; then
  echo "FAIL: status page body unexpected (title missing)"
  head -c 400 "$tmp2"
  exit 1
fi

echo "OK — portal responds ($BASE)"
echo
echo "Tip: für eine vollständige Stack-Smoke (alle Container + interne Probes) →"
echo "  bash scripts/smoke-stacks.sh"
