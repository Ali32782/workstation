#!/usr/bin/env bash
# Helpdesk (Zammad) backup hints — the real daily job is repo-root scripts/backup.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

echo "Production backup (volumes + logical DB dumps + S3):"
echo "  cd ${REPO_ROOT} && ./scripts/backup.sh"
echo ""
echo "Zammad stack must be running for a consistent pg_dump:"
echo "  docker compose -f docker-compose.zammad.yml --env-file .env up -d"
echo ""
echo "Full playbook: ${REPO_ROOT}/docs/backup-staging.md"
echo "Restore:       ${REPO_ROOT}/scripts/restore.sh <s3-uri>"
