#!/usr/bin/env bash
# =============================================================================
# Documenso — Logs nach „Erinnern“ / Versand (SMTP, Jobs, Fehler).
#
# Ablauf:
#   1. Auf dem Server einloggen (z. B. ssh medtheris-corelab).
#   2. Uhrzeit notieren, im Portal auf „Erinnern“ klicken, ~10 s warten.
#   3. Dieses Skript ausführen (oder die docker logs Zeile manuell).
#
# Usage:
#   bash scripts/documenso-remind-logs.sh          # letzte 5 Minuten
#   bash scripts/documenso-remind-logs.sh 15       # letzte 15 Minuten
#
#   DOCUMENSO_CONTAINER=documenso bash scripts/documenso-remind-logs.sh
#
# Wenn der Container anders heißt:
#   docker ps --format '{{.Names}}' | grep -i documenso
# =============================================================================
set -euo pipefail

MINUTES="${1:-5}"
CONTAINER="${DOCUMENSO_CONTAINER:-documenso}"

if ! docker info >/dev/null 2>&1; then
  printf '%s\n' "✗ Docker nicht erreichbar (Berechtigung oder Docker läuft nicht)." >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  printf '%s\n' "✗ Container „$CONTAINER“ nicht gefunden. docker ps prüfen." >&2
  exit 1
fi

echo "========== Documenso logs — container=$CONTAINER — last ${MINUTES}m — $(date -u +%Y-%m-%dT%H:%M:%SZ) =========="
docker logs "$CONTAINER" --since "${MINUTES}m" 2>&1

echo ""
echo "---------- Filter-Hinweis (manuell): ----------"
echo "  docker logs $CONTAINER --since ${MINUTES}m 2>&1 | grep -iE 'smtp|mail|email|nodemailer|535|554|refused|timeout|error|signing|queue'"
