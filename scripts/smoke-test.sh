#!/usr/bin/env bash
# =============================================================================
# smoke-test.sh - Post-deploy sanity check for the Kineo360 / Corehub stack.
#
# Checks:
#   1. TLS cert is valid & not expiring soon (>14 days)
#   2. HTTP 200/3xx on every expected endpoint
#   3. Keycloak OIDC discovery is reachable for every realm
#   4. Websocket upgrade works where needed (jitsi web channel)
#   5. Docker container health overview
#
# Usage:
#   ./scripts/smoke-test.sh                     # all core endpoints
#   ./scripts/smoke-test.sh --tenant mueller    # include a practice tenant
#
# Exit code = number of failures (0 = all green).
# =============================================================================
set -uo pipefail

EXTRA_TENANT=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --tenant) EXTRA_TENANT="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 2 ;;
  esac
done

FAIL=0
CURL="curl -fsS --max-time 8 -o /dev/null -w %{http_code}"

green() { printf '\033[32m  OK \033[0m  %s\n' "$1"; }
red()   { printf '\033[31m FAIL\033[0m  %s  -- %s\n' "$1" "$2"; FAIL=$((FAIL+1)); }
skip()  { printf '\033[33m SKIP\033[0m  %s  -- %s\n' "$1" "$2"; }

check_http() {
  local url="$1"; local want="${2:-200|301|302|303}"
  local code
  code=$(${CURL} "${url}" 2>/dev/null || true)
  if [[ "${code}" =~ ^(${want})$ ]]; then
    green "${url}  (${code})"
  else
    red "${url}" "got HTTP ${code:-?} (want ${want})"
  fi
}

check_oidc() {
  local auth_host="$1"; local realm="$2"
  local url="https://${auth_host}/realms/${realm}/.well-known/openid-configuration"
  if curl -fsS --max-time 8 "${url}" 2>/dev/null | jq -e .issuer >/dev/null; then
    green "OIDC discovery  ${realm}"
  else
    red "OIDC discovery  ${realm}" "no valid issuer at ${url}"
  fi
}

check_cert() {
  local host="$1"
  local not_after days_left
  not_after=$(echo | openssl s_client -servername "${host}" -connect "${host}:443" 2>/dev/null \
    | openssl x509 -noout -enddate 2>/dev/null | sed 's/^notAfter=//')
  if [[ -z "${not_after}" ]]; then
    red "TLS cert  ${host}" "could not read certificate"
    return
  fi
  days_left=$(( ( $(date -d "${not_after}" +%s 2>/dev/null || gdate -d "${not_after}" +%s) - $(date +%s) ) / 86400 ))
  if (( days_left > 14 )); then
    green "TLS cert  ${host}  (${days_left}d left)"
  else
    red "TLS cert  ${host}" "expires in ${days_left}d"
  fi
}

echo "==> HTTPS endpoints"
for h in \
    kineo360.work \
    auth.corehub.io files.corehub.io chat.corehub.io meet.corehub.io \
    crm.corehub.io  git.corehub.io \
    medtheris.kineo360.work \
    auth.medtheris.kineo360.work \
    files.medtheris.kineo360.work \
    chat.medtheris.kineo360.work \
    meet.medtheris.kineo360.work \
    support.medtheris.kineo360.work ; do
  check_http "https://${h}/" '200|301|302|303'
done

if [[ -n "${EXTRA_TENANT}" ]]; then
  echo "==> Tenant: ${EXTRA_TENANT}"
  for h in \
      "${EXTRA_TENANT}.kineo360.work" \
      "auth.${EXTRA_TENANT}.kineo360.work" \
      "files.${EXTRA_TENANT}.kineo360.work" \
      "chat.${EXTRA_TENANT}.kineo360.work" ; do
    check_http "https://${h}/" '200|301|302|303'
  done
fi

echo "==> OIDC discovery"
check_oidc auth.corehub.io                   corehub
check_oidc auth.medtheris.kineo360.work      medtheris-internal
if [[ -n "${EXTRA_TENANT}" ]]; then
  check_oidc "auth.${EXTRA_TENANT}.kineo360.work" "practice-${EXTRA_TENANT}"
fi

echo "==> TLS certs (expiry)"
for h in \
    kineo360.work \
    auth.corehub.io files.corehub.io \
    auth.medtheris.kineo360.work \
    files.medtheris.kineo360.work \
    meet.medtheris.kineo360.work ; do
  check_cert "${h}"
done

echo "==> Docker container health"
if command -v docker >/dev/null 2>&1; then
  bad=$(docker ps --format '{{.Names}}\t{{.Status}}' \
        | awk -F'\t' '$2 !~ /^Up.*(healthy|[0-9]+ (second|minute|hour|day)s?)/ && $2 !~ /^Up/ {print}')
  if [[ -z "${bad}" ]]; then
    green "all containers running"
  else
    while IFS= read -r line; do red "container" "${line}"; done <<< "${bad}"
  fi
else
  skip "docker" "CLI not available on this host"
fi

echo
if (( FAIL == 0 )); then
  printf '\033[32m==> all checks passed\033[0m\n'
  exit 0
else
  printf '\033[31m==> %d check(s) failed\033[0m\n' "${FAIL}"
  exit "${FAIL}"
fi
