#!/usr/bin/env bash
set -euo pipefail
#
# backup-verify.sh
#
# Lightweight check that `corelab-backup.sh` is actually producing
# fresh tarballs. Designed to run from a laptop over SSH (cheap, no
# privileges needed beyond the deploy user).
#
# Verifies:
#   1. /var/backups/corelab/ exists and contains at least one *.tar.gz
#   2. Newest archive is < MAX_AGE_HOURS (default 30h — i.e. one cron miss
#      is tolerated, two are not)
#   3. Newest archive is > MIN_SIZE_MB (default 50 MB — empty/short
#      tarballs usually mean a pg_dump aborted silently)
#
# Env:
#   SSH_HOST          default: medtheris-corelab
#   BACKUP_DIR        default: /var/backups/corelab
#   MAX_AGE_HOURS     default: 30
#   MIN_SIZE_MB       default: 50

SSH_HOST="${SSH_HOST:-medtheris-corelab}"
# Real backup target on the production host. The path historically ended
# up named "corehub" instead of "corelab" — keep both as fallbacks so we
# don't have to rename the directory atomically.
BACKUP_DIR="${BACKUP_DIR:-/var/backups/corehub}"
BACKUP_DIR_FALLBACK="${BACKUP_DIR_FALLBACK:-/var/backups/corelab}"
LOG_FILE="${LOG_FILE:-/var/log/corehub/backup.log}"
MAX_AGE_HOURS="${MAX_AGE_HOURS:-30}"
MIN_SIZE_MB="${MIN_SIZE_MB:-50}"

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }

echo "==> Backup verify ($SSH_HOST)"
echo "    Primary:  $BACKUP_DIR"
echo "    Fallback: $BACKUP_DIR_FALLBACK"
echo

# Single SSH round-trip: try the primary, then the fallback. We avoid sudo
# because the deploy user owns these dirs anyway.
out=$(ssh "$SSH_HOST" "set -e
  for dir in '$BACKUP_DIR' '$BACKUP_DIR_FALLBACK'; do
    if [[ -d \"\$dir\" ]]; then
      # Recurse one level — corehub-style 'backup.sh' creates per-day
      # subdirs (\$BACKUP_DIR/<stamp>/), corelab-style writes flat tarballs.
      newest=\$(find \"\$dir\" -maxdepth 2 \\( -name '*.tar.gz' -o -name '*.tar' \\) -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1)
      if [[ -n \"\$newest\" ]]; then
        ts=\${newest%% *}
        path=\${newest#* }
        size=\$(stat -c %s \"\$path\")
        age_h=\$(awk -v t=\$ts -v now=\$(date +%s) 'BEGIN { printf \"%.1f\", (now - t) / 3600 }')
        echo \"OK \$path \$size \$age_h\"
        echo '---listing---'
        ls -lh \"\$dir\" | head -n 12
        echo '---log_tail---'
        if [[ -r '$LOG_FILE' ]]; then tail -n 8 '$LOG_FILE'; else echo '(no readable log at $LOG_FILE)'; fi
        exit 0
      fi
    fi
  done
  echo 'NO_ARCHIVES'
  echo '---log_tail---'
  if [[ -r '$LOG_FILE' ]]; then tail -n 12 '$LOG_FILE'; else echo '(no readable log at $LOG_FILE)'; fi
")

if echo "$out" | head -n1 | grep -q NO_ARCHIVES; then
  red "✗ Keine Backup-Archive (*.tar / *.tar.gz) in $BACKUP_DIR oder $BACKUP_DIR_FALLBACK"
  echo
  yellow "Letzte Log-Zeilen ($LOG_FILE):"
  echo "$out" | sed -n '/---log_tail---/,$p' | sed '1d'
  exit 1
fi

read -r status path size age_h <<<"$(echo "$out" | head -n1)"
size_mb=$(awk -v s=$size 'BEGIN { printf "%.1f", s / 1024 / 1024 }')

echo "  Newest: $path"
echo "  Size:   ${size_mb} MB"
echo "  Age:    ${age_h} h"

fail=0
if awk -v a="$age_h" -v max="$MAX_AGE_HOURS" 'BEGIN { exit !(a > max) }'; then
  red "  ✗ Archive zu alt (> ${MAX_AGE_HOURS}h)"
  fail=1
else
  green "  ✓ Frisch genug (< ${MAX_AGE_HOURS}h)"
fi

if awk -v s="$size_mb" -v min="$MIN_SIZE_MB" 'BEGIN { exit !(s < min) }'; then
  red "  ✗ Archive zu klein (< ${MIN_SIZE_MB} MB) — pg_dump fehlgeschlagen?"
  fail=1
else
  green "  ✓ Größe plausibel (≥ ${MIN_SIZE_MB} MB)"
fi

echo
echo "Listing:"
echo "$out" | sed -n '/---listing---/,/---log_tail---/p' | sed '1d;$d'
echo
echo "Log tail ($LOG_FILE):"
echo "$out" | sed -n '/---log_tail---/,$p' | sed '1d'

exit "$fail"
