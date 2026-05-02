#!/usr/bin/env bash
# =============================================================================
# backup.sh - Daily offsite backup to Hetzner Object Storage (S3-compatible)
#
# Backs up:
#   - All Docker named volumes (via tar of /var/lib/docker/volumes)
#   - MariaDB and Postgres databases via logical dumps (incl. Zammad when
#     docker-compose.zammad.yml is running: container zammad-postgres)
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

# -----------------------------------------------------------------------------
# Failure webhook — best-effort POST to BACKUP_ALERT_WEBHOOK on any error or
# on success summary. Designed to talk to Slack / Discord / Mattermost
# incoming-webhook URLs (they all accept {"text": "..."}). Silent if the env
# var is unset, so this is opt-in.
# -----------------------------------------------------------------------------
notify() {
  local kind="$1"  # "ok" | "fail"
  local message="$2"
  local url="${BACKUP_ALERT_WEBHOOK:-}"
  if [[ -z "$url" ]]; then
    return 0
  fi
  local emoji
  case "$kind" in
    ok)   emoji=":white_check_mark:" ;;
    fail) emoji=":rotating_light:" ;;
    *)    emoji=":information_source:" ;;
  esac
  # Newlines must survive JSON encoding; we keep this dependency-free with
  # a tiny inline escaper. jq would be cleaner but isn't always installed.
  local payload
  payload=$(printf '%s' "$message" \
    | python3 -c 'import json, sys; print(json.dumps({"text": sys.argv[1] + " " + sys.stdin.read()}))' \
        "$emoji" 2>/dev/null \
    || printf '{"text":"%s backup notify (raw)"}' "$emoji")
  curl --silent --show-error --max-time 5 \
       -H "Content-Type: application/json" \
       -X POST -d "$payload" "$url" >/dev/null || true
}

trap 'notify fail "Backup ${STAMP} FAILED — see $(hostname):${LOG}"' ERR

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

if docker ps --format '{{.Names}}' | grep -q '^zammad-postgres$'; then
  echo "--> dump Postgres zammad-postgres (logical)"
  docker exec zammad-postgres \
    pg_dump -U zammad --no-owner --format=plain zammad_production \
    | gzip > "${WORK}/zammad-postgres.sql.gz" || echo "   (skipped zammad-postgres)"
fi

# --- Marketing-Hub Postgres dumps ----------------------------------------------
# Postiz + OpenCut both run on bare postgres:17-alpine images that don't
# expose pg_dumpall under a named role; we dump the single app DB with the
# user/pw from .env. Failure is non-fatal since the stack is optional.
if docker ps --format '{{.Names}}' | grep -q '^postiz_postgres$'; then
  echo "--> dump Postgres postiz_postgres (logical)"
  docker exec -e PGPASSWORD="${POSTIZ_POSTGRES_PASSWORD:-postiz}" postiz_postgres \
    pg_dump -U "${POSTIZ_POSTGRES_USER:-postiz-user}" \
            -d "${POSTIZ_POSTGRES_DB:-postiz-db-local}" \
            --no-owner --format=plain \
    | gzip > "${WORK}/postiz-postgres.sql.gz" || echo "   (skipped postiz_postgres)"
fi

if docker ps --format '{{.Names}}' | grep -q '^postiz_temporal_postgres$'; then
  echo "--> dump Postgres postiz_temporal_postgres (logical)"
  docker exec -e PGPASSWORD="${POSTIZ_TEMPORAL_POSTGRES_PASSWORD:-temporal}" postiz_temporal_postgres \
    pg_dump -U "${POSTIZ_TEMPORAL_POSTGRES_USER:-temporal}" \
            -d "${POSTIZ_TEMPORAL_POSTGRES_DB:-temporal}" \
            --no-owner --format=plain \
    | gzip > "${WORK}/postiz-temporal-postgres.sql.gz" || echo "   (skipped postiz_temporal_postgres)"
fi

if docker ps --format '{{.Names}}' | grep -q '^opencut_db$'; then
  echo "--> dump Postgres opencut_db (logical)"
  docker exec -e PGPASSWORD="${OPENCUT_POSTGRES_PASSWORD:-opencut}" opencut_db \
    pg_dump -U "${OPENCUT_POSTGRES_USER:-opencut}" \
            -d "${OPENCUT_POSTGRES_DB:-opencut}" \
            --no-owner --format=plain \
    | gzip > "${WORK}/opencut-postgres.sql.gz" || echo "   (skipped opencut_db)"
fi

# Documenso Postgres (separate container, separate auth from twenty-db).
if docker ps --format '{{.Names}}' | grep -q '^documenso-db$'; then
  echo "--> dump Postgres documenso-db (logical)"
  docker exec documenso-db \
    sh -c 'pg_dumpall -U "${POSTGRES_USER:-documenso}"' \
    | gzip > "${WORK}/documenso-db.sql.gz" || echo "   (skipped documenso-db)"
fi

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

SIZE_HUMAN="$(du -h "${LOG}" | cut -f1 || echo '?')"
echo "[$(date -Is)] ==== Backup done ===="
notify ok "Backup ${STAMP} done on $(hostname). Log size: ${SIZE_HUMAN}"
