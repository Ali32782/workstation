#!/usr/bin/env bash
# =============================================================================
# disk-monitor.sh — disk-space watchdog for the prod host
#
# Run from cron (every 30 min) and you'll catch a runaway log/volume before
# the SSL renewal, the daily backup, or PostgreSQL bricks the box.
#
# Behaviour:
#   - WARN at >= ${DISK_WARN_PCT:-80} % usage (default 80)
#   - CRIT at >= ${DISK_CRIT_PCT:-92} %
#   - Posts to ${DISK_ALERT_WEBHOOK} (same Slack/Mattermost format as
#     backup.sh) once per state change. State is persisted in
#     /var/lib/corehub/disk-monitor.state so we don't spam.
#
# Cron-friendly invocation:
#   */30 * * * * /opt/corelab/scripts/disk-monitor.sh > /dev/null 2>&1
# =============================================================================
set -euo pipefail

WARN_PCT="${DISK_WARN_PCT:-80}"
CRIT_PCT="${DISK_CRIT_PCT:-92}"
WEBHOOK="${DISK_ALERT_WEBHOOK:-${BACKUP_ALERT_WEBHOOK:-}}"
STATE_DIR="${DISK_MONITOR_STATE_DIR:-/var/lib/corehub}"
STATE_FILE="${STATE_DIR}/disk-monitor.state"

mkdir -p "$STATE_DIR"

# Mounts to watch — typical Linux production layout. Skip overlay/tmpfs/squashfs.
# The trailing column from `df` is the mount point.
mounts() {
  df -P -x tmpfs -x devtmpfs -x squashfs -x overlay -x nsfs \
    | awk 'NR>1 && $1 !~ /^\/dev\/loop/ {print $5"|"$6}'
}

prev_state() {
  local mount="$1"
  if [[ -f "$STATE_FILE" ]]; then
    grep -F "${mount}=" "$STATE_FILE" | tail -n1 | cut -d= -f2 || true
  fi
}

write_state() {
  local mount="$1" state="$2"
  local tmp
  tmp="$(mktemp)"
  if [[ -f "$STATE_FILE" ]]; then
    grep -vF "${mount}=" "$STATE_FILE" > "$tmp" || true
  fi
  echo "${mount}=${state}" >> "$tmp"
  mv "$tmp" "$STATE_FILE"
  chmod 0644 "$STATE_FILE"
}

notify() {
  local kind="$1"  # "ok" | "warn" | "crit"
  local message="$2"
  if [[ -z "$WEBHOOK" ]]; then
    echo "[$(date -Is)] [$kind] $message"
    return 0
  fi
  local emoji
  case "$kind" in
    ok)   emoji=":white_check_mark:" ;;
    warn) emoji=":warning:" ;;
    crit) emoji=":fire:" ;;
    *)    emoji=":information_source:" ;;
  esac
  local payload
  payload=$(printf '%s' "$message" \
    | python3 -c 'import json,sys; print(json.dumps({"text": sys.argv[1] + " " + sys.stdin.read()}))' \
        "$emoji" 2>/dev/null \
    || printf '{"text":"%s disk %s (raw)"}' "$emoji" "$kind")
  curl --silent --show-error --max-time 5 \
       -H "Content-Type: application/json" \
       -X POST -d "$payload" "$WEBHOOK" >/dev/null || true
}

worst_seen=0

while IFS='|' read -r usage_pct mount; do
  [[ -z "$mount" ]] && continue
  pct="${usage_pct%\%}"
  prev="$(prev_state "$mount")"
  state="ok"
  if (( pct >= CRIT_PCT )); then
    state="crit"
  elif (( pct >= WARN_PCT )); then
    state="warn"
  fi

  if [[ "$state" != "$prev" ]]; then
    case "$state" in
      crit)
        notify crit "$(hostname): ${mount} at ${pct}% (CRIT, threshold ${CRIT_PCT}%)"
        ;;
      warn)
        notify warn "$(hostname): ${mount} at ${pct}% (WARN, threshold ${WARN_PCT}%)"
        ;;
      ok)
        if [[ -n "$prev" && "$prev" != "ok" ]]; then
          notify ok "$(hostname): ${mount} back to ${pct}% (recovered from ${prev})"
        fi
        ;;
    esac
    write_state "$mount" "$state"
  fi

  if (( pct > worst_seen )); then
    worst_seen=$pct
  fi
done < <(mounts)

# Exit code mirrors the worst seen — handy when called interactively.
if (( worst_seen >= CRIT_PCT )); then exit 2; fi
if (( worst_seen >= WARN_PCT )); then exit 1; fi
exit 0
