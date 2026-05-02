#!/usr/bin/env bash
# =============================================================================
# Documenso SMTP — sanity check before debugging "E-Mail nicht gesendet".
#
# Loads the same variables as docker-compose (DOCUMENSO_SMTP_* from .env),
# verifies they are non-empty, optionally probes smtp.migadu.com:465.
#
# Usage (server):
#   ssh deploy@server 'bash /opt/corelab/scripts/check-documenso-smtp.sh'
#
# Usage (local repo):
#   bash scripts/check-documenso-smtp.sh
#
# Override env file:
#   CORELAB_ENV=/path/to/.env bash scripts/check-documenso-smtp.sh
# =============================================================================
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${CORELAB_ENV:-}"
if [ -z "$ENV_FILE" ]; then
  if [ -f /opt/corelab/.env ]; then
    ENV_FILE=/opt/corelab/.env
  elif [ -f "$REPO_ROOT/.env" ]; then
    ENV_FILE="$REPO_ROOT/.env"
  else
    printf '%s\n' "✗ No .env found. Set CORELAB_ENV=/path/to/.env or create $REPO_ROOT/.env" >&2
    exit 1
  fi
fi

if [ ! -f "$ENV_FILE" ]; then
  printf '%s\n' "✗ CORELAB_ENV=$ENV_FILE is not a file" >&2
  exit 1
fi

# Do not `source` the whole .env — values with spaces often lack quotes.
# Only load the Documenso SMTP keys docker-compose injects into the container.
load_documenso_smtp_from_envfile() {
  local line key val
  while IFS= read -r line || [ -n "$line" ]; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// /}" ]] && continue
    case "$line" in
      DOCUMENSO_SMTP_USERNAME=*|DOCUMENSO_SMTP_PASSWORD=*|DOCUMENSO_SMTP_FROM_ADDRESS=*|DOCUMENSO_SMTP_FROM_NAME=*|DOCUMENSO_SMTP_HOST=*|DOCUMENSO_SMTP_PORT=*)
        key="${line%%=*}"
        val="${line#*=}"
        val="${val%$'\r'}"
        if [[ "$val" == \"*\" ]]; then val="${val:1:${#val}-2}"; fi
        case "$key" in
          DOCUMENSO_SMTP_USERNAME) export DOCUMENSO_SMTP_USERNAME="$val" ;;
          DOCUMENSO_SMTP_PASSWORD) export DOCUMENSO_SMTP_PASSWORD="$val" ;;
          DOCUMENSO_SMTP_FROM_ADDRESS) export DOCUMENSO_SMTP_FROM_ADDRESS="$val" ;;
          DOCUMENSO_SMTP_FROM_NAME) export DOCUMENSO_SMTP_FROM_NAME="$val" ;;
          DOCUMENSO_SMTP_HOST) export DOCUMENSO_SMTP_HOST="$val" ;;
          DOCUMENSO_SMTP_PORT) export DOCUMENSO_SMTP_PORT="$val" ;;
        esac
        ;;
    esac
  done < "$ENV_FILE"
}

load_documenso_smtp_from_envfile

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1" >&2; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }

# Defaults match docker-compose.yml documenso service; .env overrides win.
SMTP_HOST="${DOCUMENSO_SMTP_HOST:-smtp.migadu.com}"
SMTP_PORT="${DOCUMENSO_SMTP_PORT:-587}"

echo "Env file: $ENV_FILE"
echo "Expected SMTP target (compose): ${SMTP_HOST}:${SMTP_PORT} STARTTLS"
echo ""

ERR=0

check_secret() {
  local name=$1
  local val=${!name:-}
  if [ -z "$val" ]; then
    red "✗ $name is empty or unset — Documenso cannot send mail."
    ERR=1
  elif [ "$val" = "CHANGE_ME_MIGADU_PASSWORD" ] || [ "$val" = "CHANGE_ME" ]; then
    yellow "! $name is still a placeholder — replace with the real Migadu password."
    ERR=1
  else
    green "✓ $name is set (${#val} characters)"
  fi
}

check_secret DOCUMENSO_SMTP_USERNAME
check_secret DOCUMENSO_SMTP_PASSWORD
check_secret DOCUMENSO_SMTP_FROM_ADDRESS

if [ -n "${DOCUMENSO_SMTP_FROM_NAME:-}" ]; then
  green "✓ DOCUMENSO_SMTP_FROM_NAME=${DOCUMENSO_SMTP_FROM_NAME}"
else
  yellow "! DOCUMENSO_SMTP_FROM_NAME unset (compose uses default Kineo360 Sign)"
fi

echo ""
if [ "$ERR" -ne 0 ]; then
  red "Fix the variables above in $ENV_FILE then:"
  echo "  cd $(dirname "$ENV_FILE") && docker compose up -d documenso"
  exit 1
fi

probe_ok=0
if command -v nc >/dev/null 2>&1; then
  if nc -z -w 6 "$SMTP_HOST" "$SMTP_PORT" 2>/dev/null; then
    probe_ok=1
  fi
fi
if [ "$probe_ok" -eq 0 ] && command -v timeout >/dev/null 2>&1; then
  if timeout 6 bash -c "echo >/dev/tcp/${SMTP_HOST}/${SMTP_PORT}" 2>/dev/null; then
    probe_ok=1
  fi
fi

if [ "$probe_ok" -eq 1 ]; then
  green "✓ TCP reachability: ${SMTP_HOST}:${SMTP_PORT}"
else
  yellow "! Could not verify TCP ${SMTP_HOST}:${SMTP_PORT} (install nc, or check firewall). Credentials still look OK."
fi

echo ""
green "Next steps:"
echo "  1. docker compose up -d documenso   # if you changed .env"
echo "  2. docker logs documenso --tail 80   # look for SMTP / TLS errors"
echo "  3. In Documenso UI: send a test email from org email settings (if available)"
exit 0
