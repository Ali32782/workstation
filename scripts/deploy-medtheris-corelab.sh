#!/usr/bin/env bash
set -euo pipefail
#
# Deploy Portal + MedTheris-Scraper zum **MedTheris-Corelab**-Host (Hetzner).
# NICHT kineo360-server (91.99.179.44) — siehe docs/portal.md → Deploy.
#
# Env-Overrides:
#   DEPLOY_SSH          default: medtheris-corelab (→ ~/.ssh/config, User deploy)
#   DEPLOY_SSH_KEY      optional: wenn gesetzt, z. B. $HOME/.ssh/id_ed25519 für -i
#   DEPLOY_REMOTE_DIR   default: /opt/corelab
#
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${DEPLOY_SSH:-medtheris-corelab}"
RDIR="${DEPLOY_REMOTE_DIR:-/opt/corelab}"

if [[ -n "${DEPLOY_SSH_KEY:-}" ]]; then
  SSH=(ssh -i "$DEPLOY_SSH_KEY" -o BatchMode=yes)
  RSYNC_SSH=(ssh -i "$DEPLOY_SSH_KEY")
else
  SSH=(ssh -o BatchMode=yes)
  RSYNC_SSH=(ssh)
fi

echo "==> rsync portal → ${HOST}:${RDIR}/portal/"
rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='.env*.local' \
  -e "${RSYNC_SSH[*]}" \
  "$ROOT/portal/" "${HOST}:${RDIR}/portal/"

echo "==> rsync medtheris-scraper → ${HOST}:${RDIR}/medtheris-scraper/"
rsync -avz --delete \
  --exclude='__pycache__' \
  --exclude='.venv' \
  -e "${RSYNC_SSH[*]}" \
  "$ROOT/medtheris-scraper/" "${HOST}:${RDIR}/medtheris-scraper/"

echo "==> rsync docker-compose.yml"
rsync -avz -e "${RSYNC_SSH[*]}" \
  "$ROOT/docker-compose.yml" "${HOST}:${RDIR}/docker-compose.yml"

echo "==> docker compose build + up (portal, medtheris-scraper)"
"${SSH[@]}" "$HOST" "cd $RDIR && docker compose build portal medtheris-scraper && docker compose up -d portal medtheris-scraper"

echo "Done."
