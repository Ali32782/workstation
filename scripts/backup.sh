#!/usr/bin/env bash
# =============================================================================
# backup.sh - Daily offsite backup to Hetzner Object Storage (S3-compatible)
#
# Backs up:
#   - All Docker named volumes (via tar of /var/lib/docker/volumes)
#   - MariaDB and Postgres databases via logical dumps
# Uploads a single timestamped archive to s3://$S3_BUCKET/<date>/
# Retains N days (BACKUP_RETENTION_DAYS) on the bucket; older prefixes are purged.
#
# Run from the repo root with .env present.
# =============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-/opt/corehub}"
cd "${REPO_DIR}"

# shellcheck disable=SC1091
set -a; . ./.env; set +a

STAMP="$(date +%Y%m%d-%H%M%S)"
WORK="/var/backups/corehub/${STAMP}"
LOG="/var/log/corehub/backup-${STAMP}.log"
mkdir -p "${WORK}" "$(dirname "${LOG}")"
exec > >(tee -a "${LOG}") 2>&1

echo "[$(date -Is)] ==== Backup start ${STAMP} ===="

echo "--> dump MariaDB"
docker exec mariadb sh -c "exec mariadb-dump --all-databases --single-transaction -uroot -p${MARIADB_ROOT_PASSWORD}" \
  | gzip > "${WORK}/mariadb-all.sql.gz"

for pg in keycloak-db twenty-db gitea-db; do
  if docker ps --format '{{.Names}}' | grep -q "^${pg}$"; then
    echo "--> dump Postgres ${pg}"
    docker exec "${pg}" sh -c 'pg_dumpall -U postgres 2>/dev/null || pg_dumpall -U keycloak || pg_dumpall -U gitea' \
      | gzip > "${WORK}/${pg}.sql.gz" || echo "   (skipped ${pg})"
  fi
done

echo "--> dump Rocket.Chat MongoDB"
if docker ps --format '{{.Names}}' | grep -q '^rocketchat-mongo$'; then
  docker exec rocketchat-mongo sh -c "mongodump --archive --gzip --username root --password '${ROCKETCHAT_MONGO_ROOT_PASSWORD}' --authenticationDatabase admin" \
    > "${WORK}/rocketchat-mongo.archive.gz"
fi

echo "--> snapshot Docker volumes"
# Stop writes for file-level snapshot of Nextcloud data (brief maintenance window).
docker compose exec -T nextcloud-corehub php occ maintenance:mode --on >/dev/null 2>&1 || true
docker compose exec -T nextcloud-medtheris php occ maintenance:mode --on >/dev/null 2>&1 || true

tar --warning=no-file-changed -czf "${WORK}/volumes.tar.gz" \
  -C /var/lib/docker/volumes . || true

docker compose exec -T nextcloud-corehub php occ maintenance:mode --off >/dev/null 2>&1 || true
docker compose exec -T nextcloud-medtheris php occ maintenance:mode --off >/dev/null 2>&1 || true

ARCHIVE="/var/backups/corehub/corehub-${STAMP}.tar"
tar -cf "${ARCHIVE}" -C "${WORK}" .
echo "--> archive: $(du -h "${ARCHIVE}" | cut -f1)"

echo "--> upload to S3"
s3cmd \
  --access_key="${S3_ACCESS_KEY}" \
  --secret_key="${S3_SECRET_KEY}" \
  --host="${S3_ENDPOINT#https://}" \
  --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
  put "${ARCHIVE}" "s3://${S3_BUCKET}/$(date +%Y/%m/%d)/corehub-${STAMP}.tar"

echo "--> cleanup local"
rm -rf "${WORK}" "${ARCHIVE}"

echo "--> prune S3 prefixes older than ${BACKUP_RETENTION_DAYS} days"
CUTOFF=$(date -d "-${BACKUP_RETENTION_DAYS} days" +%Y%m%d)
s3cmd \
  --access_key="${S3_ACCESS_KEY}" \
  --secret_key="${S3_SECRET_KEY}" \
  --host="${S3_ENDPOINT#https://}" \
  --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
  ls --recursive "s3://${S3_BUCKET}/" \
  | awk -v cutoff="${CUTOFF}" '{gsub(/-/,"",$1); if ($1 < cutoff) print $4}' \
  | while read -r obj; do
      [[ -z "$obj" ]] && continue
      s3cmd \
        --access_key="${S3_ACCESS_KEY}" \
        --secret_key="${S3_SECRET_KEY}" \
        --host="${S3_ENDPOINT#https://}" \
        --host-bucket="%(bucket)s.${S3_ENDPOINT#https://}" \
        del "$obj" || true
    done

echo "[$(date -Is)] ==== Backup done ===="
