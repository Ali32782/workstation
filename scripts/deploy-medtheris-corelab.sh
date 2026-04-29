#!/usr/bin/env bash
set -euo pipefail
#
# Deploy Portal + MedTheris-Scraper zum **MedTheris-Corelab**-Host (Hetzner).
# NICHT kineo360-server (91.99.179.44) — siehe docs/portal.md → Deploy.
#
# Env-Overrides:
#   DEPLOY_SSH          default: deploy@178.104.222.61
#   DEPLOY_SSH_KEY      default: $HOME/.ssh/id_ed25519
#   DEPLOY_REMOTE_DIR   default: /opt/corelab
#
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
HOST="${DEPLOY_SSH:-deploy@178.104.222.61}"
KEY="${DEPLOY_SSH_KEY:-$HOME/.ssh/id_ed25519}"
RDIR="${DEPLOY_REMOTE_DIR:-/opt/corelab}"

SSH=(ssh -i "$KEY" -o BatchMode=yes)
RSYNC_SSH=(ssh -i "$KEY")

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
