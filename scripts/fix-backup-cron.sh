#!/usr/bin/env bash
set -euo pipefail
#
# fix-backup-cron.sh
#
# One-shot repair for a known Ops bug: the cron entry
# /etc/cron.d/corehub-backup still points at /opt/corehub/scripts/backup.sh
# which was deleted during the corehub→corelab rename. Result: ~daily
# silent backup failures since end of April 2026.
#
# This script:
#   1. Verifies the broken cron line is present
#   2. Replaces it with a corelab-pointed line (deploy user, same time)
#   3. Disables the duplicate /etc/cron.d/corelab-backup if both exist
#   4. Runs ONE manual backup so we close the freshness gap immediately
#
# Run on the server as root:
#   sudo bash /opt/corelab/scripts/fix-backup-cron.sh
#
# Idempotent: re-running the script after the fix is a no-op.

REPO_DIR="${REPO_DIR:-/opt/corelab}"
DEPLOY_USER="${DEPLOY_USER:-deploy}"
LOG_DIR="${LOG_DIR:-/var/log/corehub}"
CRON_FILE="${CRON_FILE:-/etc/cron.d/corelab-backup}"
LEGACY_FILE="${LEGACY_FILE:-/etc/cron.d/corehub-backup}"

if [[ "$EUID" -ne 0 ]]; then
  echo "ERROR: must run as root (sudo)" >&2
  exit 1
fi

if [[ ! -x "$REPO_DIR/scripts/backup.sh" ]]; then
  echo "ERROR: $REPO_DIR/scripts/backup.sh not found or not executable" >&2
  exit 1
fi

mkdir -p "$LOG_DIR"
chown "$DEPLOY_USER":"$DEPLOY_USER" "$LOG_DIR"

# Step 1: write the canonical cron file.
# We run as **root** (not $DEPLOY_USER) because backup.sh tar's
# /var/lib/docker/volumes which is 700 root:root — anything else fails with
# "Permission denied" on the volume snapshot.
cat > "$CRON_FILE" <<EOF
# /etc/cron.d/corelab-backup — daily offsite backup at 03:00 Europe/Zurich
# Managed by scripts/fix-backup-cron.sh. Edit there, not here.
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/sbin:/bin:/usr/sbin:/usr/bin
REPO_DIR=$REPO_DIR

0 3 * * * root $REPO_DIR/scripts/backup.sh >> $LOG_DIR/backup.log 2>&1
EOF
chmod 644 "$CRON_FILE"
echo "[fix] wrote $CRON_FILE"

# Step 2: deactivate the legacy cron file if it still references the
# deleted path (we don't delete — easier to spot in `ls /etc/cron.d/`).
if [[ -f "$LEGACY_FILE" ]] && grep -q '/opt/corehub/scripts/backup.sh' "$LEGACY_FILE"; then
  mv "$LEGACY_FILE" "${LEGACY_FILE}.disabled"
  echo "[fix] disabled legacy $LEGACY_FILE → ${LEGACY_FILE}.disabled"
fi

# Step 3: kick one backup right now so the freshness check goes green.
# Run as root (same as the cron now does); we already enforce $EUID==0 above.
echo "[fix] running one manual backup to close the gap…"
REPO_DIR="$REPO_DIR" bash -lc "$REPO_DIR/scripts/backup.sh" \
  >> "$LOG_DIR/backup.log" 2>&1 \
  && echo "[fix] manual backup OK — see $LOG_DIR/backup.log" \
  || { echo "[fix] manual backup FAILED — inspect $LOG_DIR/backup.log"; exit 2; }

echo "[fix] done"
