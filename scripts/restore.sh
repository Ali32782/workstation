#!/usr/bin/env bash
# =============================================================================
# restore.sh - Restore from an offsite archive
# Usage: ./scripts/restore.sh s3://corehub-backups/2026/04/23/corehub-20260423-030001.tar
# =============================================================================
set -euo pipefail

SRC="${1:?Usage: $0 <s3-uri>}"
REPO_DIR="${REPO_DIR:-/opt/corehub}"
cd "${REPO_DIR}"
# shellcheck disable=SC1091
set -a; . ./.env; set +a

WORK="$(mktemp -d)"
trap "rm -rf ${WORK}" EXIT

echo "==> download ${SRC}"
s3cmd \
  --access_key="${S3_ACCESS_KEY}" \
  --secret_key="${S3_SECRET_KEY}" \
  --host="${S3_ENDPOINT#https://}" \
  --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
  get "${SRC}" "${WORK}/archive.tar"

tar -xf "${WORK}/archive.tar" -C "${WORK}"

echo "==> stop stack"
docker compose down
docker compose -f docker-compose.jitsi.yml down 2>/dev/null || true
docker compose -f docker-compose.zammad.yml down 2>/dev/null || true

echo "==> restore volumes"
tar -xzf "${WORK}/volumes.tar.gz" -C /var/lib/docker/volumes

echo "==> start DBs only"
docker compose up -d mariadb keycloak-db twenty-db gitea-db rocketchat-mongo
sleep 15

echo "==> restore MariaDB"
zcat "${WORK}/mariadb-all.sql.gz" | docker exec -i mariadb mariadb -uroot -p"${MARIADB_ROOT_PASSWORD}"

for pg in keycloak-db twenty-db gitea-db; do
  if [[ -f "${WORK}/${pg}.sql.gz" ]]; then
    echo "==> restore ${pg}"
    zcat "${WORK}/${pg}.sql.gz" | docker exec -i "${pg}" psql -U postgres || true
  fi
done

if [[ -f "${WORK}/rocketchat-mongo.archive.gz" ]]; then
  echo "==> restore Rocket.Chat MongoDB"
  docker exec -i rocketchat-mongo sh -c "mongorestore --archive --gzip --username root --password '${ROCKETCHAT_MONGO_ROOT_PASSWORD}' --authenticationDatabase admin --drop" \
    < "${WORK}/rocketchat-mongo.archive.gz"
fi

echo "==> start full stack"
docker compose up -d

echo "==> start auxiliary stacks (Zammad / Jitsi — if compose files exist)"
docker compose -f docker-compose.zammad.yml --env-file .env up -d 2>/dev/null || true
docker compose -f docker-compose.jitsi.yml up -d 2>/dev/null || true

echo "Done. Verify services and DNS. See docs/backup-staging.md for Zammad SQL restore notes."
