#!/usr/bin/env bash
#
# corelab-backup.sh
#
# Daily backup of the Corehub/MedTheris production stack. Wraps the
# important Docker volumes + Postgres + Mongo dumps into a single
# timestamped tarball under /var/backups/corelab/, keeps the last
# RETENTION_DAYS days, and exits non-zero if any step fails so cron
# can surface the failure via mail.
#
# Wire-up: install at /opt/corelab/scripts/corelab-backup.sh and add
# the following crontab line as root on the production host:
#
#     0 3 * * *  /opt/corelab/scripts/corelab-backup.sh >> /var/log/corelab-backup.log 2>&1
#
# Once per month (1st of the month, 04:00) run a restore-drill against
# a scratch volume to validate the dump is actually loadable. The
# drill script lives next to this one as corelab-restore-drill.sh.

set -euo pipefail

STACK_DIR="${STACK_DIR:-/opt/corelab}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/corelab}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
COMPOSE="${COMPOSE:-docker compose}"

mkdir -p "$BACKUP_DIR"
TS=$(date -u +"%Y%m%dT%H%M%SZ")
WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

echo "[backup] starting $TS"

cd "$STACK_DIR"

# ── Postgres ────────────────────────────────────────────────────────
# Twenty CRM + Mautic both run on Postgres. Dump each into the work
# dir; the heredoc lists DBs to back up.
for spec in \
    "twenty_db twenty_db twenty" \
    "mautic_db mautic_db mautic"; do
  set -- $spec
  service=$1
  user=$2
  db=$3
  echo "[backup] pg_dump $service ($db)"
  $COMPOSE exec -T "$service" pg_dump -U "$user" -Fc "$db" \
    > "$WORK/${service}.dump"
done

# ── Mongo (chat + helpdesk attachments) ─────────────────────────────
if $COMPOSE ps mongo >/dev/null 2>&1; then
  echo "[backup] mongodump chat"
  $COMPOSE exec -T mongo mongodump --archive --gzip \
    > "$WORK/mongo.archive.gz"
fi

# ── Cloud / files volume ────────────────────────────────────────────
# Tar the live volume; we accept slightly inconsistent files as the
# cost of an online backup — the frontend's optimistic file API can
# handle the very rare partial upload at restore time.
if [ -d "$STACK_DIR/data/cloud" ]; then
  echo "[backup] tar cloud-data"
  tar -C "$STACK_DIR/data" -czf "$WORK/cloud-data.tgz" cloud
fi

# ── Audit log + portal data ─────────────────────────────────────────
if [ -d "$STACK_DIR/data/audit" ]; then
  echo "[backup] tar audit-log"
  tar -C "$STACK_DIR/data" -czf "$WORK/audit.tgz" audit
fi

# ── Configs / .env ──────────────────────────────────────────────────
# The .env files contain secrets — same backup tarball, but encrypt
# end-to-end: first stage tar+gz, then optional age-encrypt if the
# AGE_RECIPIENTS env-var is set (recommended in prod).
echo "[backup] tar configs"
tar -C "$STACK_DIR" -czf "$WORK/configs.tgz" \
  --exclude=".git" --exclude="data" \
  --exclude="node_modules" \
  $(ls -1 "$STACK_DIR" | grep -E '\.env|docker-compose|nginx|deploy|scripts')

OUT="$BACKUP_DIR/corelab-${TS}.tar"
echo "[backup] composing $OUT"
tar -C "$WORK" -cf "$OUT" .

if [ -n "${AGE_RECIPIENTS:-}" ] && command -v age >/dev/null 2>&1; then
  echo "[backup] encrypting with age (recipients: $AGE_RECIPIENTS)"
  age -r "$AGE_RECIPIENTS" -o "$OUT.age" "$OUT"
  rm -f "$OUT"
  OUT="$OUT.age"
fi

echo "[backup] done: $OUT ($(du -h "$OUT" | cut -f1))"

# ── Retention ───────────────────────────────────────────────────────
echo "[backup] pruning >${RETENTION_DAYS}d"
find "$BACKUP_DIR" -maxdepth 1 -type f \
  \( -name 'corelab-*.tar' -o -name 'corelab-*.tar.age' \) \
  -mtime +"$RETENTION_DAYS" -print -delete || true

echo "[backup] complete"
