#!/usr/bin/env bash
# =============================================================================
# install-logrotate.sh — install /etc/logrotate.d/corehub
#
# Idempotent: safe to run as often as you like. Re-runs every time the file
# changes (cmp before write).
#
# What it rotates:
#   /var/log/corehub/*.log     daily, 14 days kept, gzip after 1 day
#   /var/log/corehub/backup.log → never blank-line-truncate (it's the trail
#                                 for backup-verify.sh; copytruncate keeps
#                                 the inode stable for tail -f).
#
# Run on the host with:
#   ssh medtheris-corelab 'sudo bash /opt/corelab/scripts/install-logrotate.sh'
#
# Verify:
#   sudo logrotate --debug /etc/logrotate.d/corehub
# =============================================================================
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Refusing to run without root. Re-run with sudo." >&2
  exit 1
fi

CONF=/etc/logrotate.d/corehub
TMP="$(mktemp)"

cat > "$TMP" <<'EOF'
# /etc/logrotate.d/corehub — managed by scripts/install-logrotate.sh.
# Edit there, not here.

/var/log/corehub/*.log {
    daily
    rotate 14
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    dateext
    dateformat -%Y%m%d
    su root root
    create 0640 root root
}

# backup.log is the source of truth for backup-verify.sh — keep extra
# generations and never zero-out without compressing first.
/var/log/corehub/backup.log {
    weekly
    rotate 26          # ~6 months of weekly archives
    missingok
    notifempty
    compress
    delaycompress
    copytruncate
    dateext
    dateformat -%Y%m%d
    su root root
    create 0640 root root
}
EOF

if [[ -f "$CONF" ]] && cmp -s "$TMP" "$CONF"; then
  echo "==> $CONF already up-to-date."
  rm -f "$TMP"
else
  install -m 0644 -o root -g root "$TMP" "$CONF"
  rm -f "$TMP"
  echo "==> wrote $CONF"
fi

# Validate without rotating (logrotate exits non-zero on malformed config).
if logrotate --debug "$CONF" >/dev/null 2>&1; then
  echo "==> logrotate config validated (--debug)"
else
  echo "WARN: logrotate --debug $CONF reported issues — re-run manually for details." >&2
fi

# Sanity: ensure the log dir exists with sane perms (we create it lazily
# from backup.sh, but if logrotate runs first that's a chicken/egg).
mkdir -p /var/log/corehub
chmod 0755 /var/log/corehub
chown root:root /var/log/corehub

echo "==> Done."
