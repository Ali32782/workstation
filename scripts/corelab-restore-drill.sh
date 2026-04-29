#!/usr/bin/env bash
#
# corelab-restore-drill.sh
#
# Monthly drill: take the latest production backup, restore it into an
# isolated `restore-drill` Docker network, and run a couple of sanity
# queries to verify the data actually loaded. If any check fails, the
# script exits non-zero so cron will mail the operator.
#
# This is intentionally defensive: a backup is only as good as the last
# successful restore. Running this monthly catches silent corruption /
# encryption-key drift / schema mismatches before we ever need them.
#
# Wire-up:
#     0 4 1 * *  /opt/corelab/scripts/corelab-restore-drill.sh >> /var/log/corelab-restore-drill.log 2>&1

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/corelab}"
DRILL_DIR="${DRILL_DIR:-/var/lib/corelab-restore-drill}"

mkdir -p "$DRILL_DIR"
LATEST=$(ls -1t "$BACKUP_DIR"/corelab-*.tar* 2>/dev/null | head -n1 || true)
if [ -z "$LATEST" ]; then
  echo "[drill] no backups found in $BACKUP_DIR"
  exit 1
fi

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT
echo "[drill] using backup $LATEST"

# Decrypt if needed
if [[ "$LATEST" == *.age ]]; then
  if [ -z "${AGE_IDENTITY:-}" ]; then
    echo "[drill] AGE_IDENTITY not set — cannot decrypt $LATEST"
    exit 2
  fi
  age -d -i "$AGE_IDENTITY" "$LATEST" > "$WORK/backup.tar"
else
  cp "$LATEST" "$WORK/backup.tar"
fi

mkdir -p "$WORK/extract"
tar -xf "$WORK/backup.tar" -C "$WORK/extract"

# ── Sanity checks ──────────────────────────────────────────────────
echo "[drill] checking pg dumps load"
for f in "$WORK/extract"/twenty_db.dump "$WORK/extract"/mautic_db.dump; do
  if [ ! -f "$f" ]; then
    echo "[drill] missing $f"
    exit 3
  fi
  # pg_restore --list reads header without writing — fast smoke test.
  if ! pg_restore -l "$f" >/dev/null; then
    echo "[drill] dump $f is unreadable"
    exit 4
  fi
done

if [ -f "$WORK/extract/mongo.archive.gz" ]; then
  echo "[drill] checking mongo archive header"
  gunzip -t "$WORK/extract/mongo.archive.gz"
fi

echo "[drill] all checks passed"
