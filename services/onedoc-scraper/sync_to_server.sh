#!/usr/bin/env bash
# Code auf Hetzner syncen; Server-DB und models/ nicht überschreiben.
set -euo pipefail
rsync -avz --delete \
  --exclude '.git' \
  --exclude '.venv' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.cursor' \
  --exclude '.env' \
  --exclude 'slots.db' \
  --exclude 'models' \
  "/Users/anika/onedoc_scraper/" \
  "root@128.140.96.217:/opt/onedoc_scraper/"
echo "OK: rsync fertig. Optional: ssh ... systemctl restart onedoc-scheduler"
