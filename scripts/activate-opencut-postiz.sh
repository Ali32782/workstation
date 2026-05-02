#!/usr/bin/env bash
# =============================================================================
# activate-opencut-postiz.sh
#
# Sobald DNS (videos.kineo360.work + social.kineo360.work) auf den Server
# zeigt UND beide Domains in NPM einen Proxy-Host haben, schaltet dieses
# Skript die Portal-Sidebar-Einträge frei und rebuildet das Portal.
#
# Ablauf:
#   1. Smoke-Test der internen Endpoints (ohne NPM)
#   2. (optional) HTTPS-Smoke-Test über die öffentlichen URLs
#   3. NEXT_PUBLIC_OPENCUT_URL / NEXT_PUBLIC_POSTIZ_URL in /opt/corelab/.env
#      einkommentieren
#   4. portal-Image rebuilden (env-Vars werden zum Build-Zeitpunkt gebaked)
#   5. portal neu hochziehen
#   6. Smoke-Test der Sidebar-API
#
# Verwendung (auf dem Server oder via SSH):
#   ssh medtheris-corelab 'cd /opt/corelab && bash scripts/activate-opencut-postiz.sh'
# =============================================================================

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/corelab}"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"
PORTAL_PUBLIC_URL_DEFAULT="https://app.kineo360.work"

cd "$REPO_ROOT"

echo "==> 1. Internal smoke test (Docker-side)"
docker run --rm --network proxy curlimages/curl:latest \
  -fsS -o /dev/null -w "  opencut_web:3000/        HTTP %{http_code}\n" \
  --max-time 10 http://opencut_web:3000/ || {
    echo "  ! opencut_web nicht erreichbar — Stack down? Abbruch."
    exit 1
  }
docker run --rm --network proxy curlimages/curl:latest \
  -fsS -o /dev/null -w "  postiz_backend:5000/auth HTTP %{http_code}\n" \
  --max-time 10 http://postiz_backend:5000/auth/login || {
    echo "  ! postiz_backend nicht erreichbar — Stack down? Abbruch."
    exit 1
  }

echo
echo "==> 2. Public HTTPS smoke test (nur Warnung wenn NPM/DNS noch fehlt)"
curl -fsS -o /dev/null -w "  https://videos.kineo360.work  HTTP %{http_code}\n" \
  --max-time 10 https://videos.kineo360.work/ \
  || echo "  ! videos.kineo360.work noch nicht öffentlich — DNS oder NPM fehlt"
curl -fsS -o /dev/null -w "  https://social.kineo360.work  HTTP %{http_code}\n" \
  --max-time 10 https://social.kineo360.work/ \
  || echo "  ! social.kineo360.work noch nicht öffentlich — DNS oder NPM fehlt"

echo
echo "==> 3. Portal-.env: NEXT_PUBLIC_OPENCUT_URL / NEXT_PUBLIC_POSTIZ_URL aktivieren"
if grep -qE "^# *NEXT_PUBLIC_OPENCUT_URL=" "$ENV_FILE"; then
  sed -i 's|^# *\(NEXT_PUBLIC_OPENCUT_URL=.*\)|\1|' "$ENV_FILE"
  echo "  ✓ NEXT_PUBLIC_OPENCUT_URL einkommentiert"
else
  echo "  ✓ NEXT_PUBLIC_OPENCUT_URL bereits aktiv (oder Eintrag fehlt — bitte manuell prüfen)"
fi
if grep -qE "^# *NEXT_PUBLIC_POSTIZ_URL=" "$ENV_FILE"; then
  sed -i 's|^# *\(NEXT_PUBLIC_POSTIZ_URL=.*\)|\1|' "$ENV_FILE"
  echo "  ✓ NEXT_PUBLIC_POSTIZ_URL einkommentiert"
else
  echo "  ✓ NEXT_PUBLIC_POSTIZ_URL bereits aktiv (oder Eintrag fehlt — bitte manuell prüfen)"
fi

echo
echo "==> 4. Portal-Image rebuilden (NEXT_PUBLIC_* werden beim Build gebaked)"
docker compose build portal

echo
echo "==> 5. Portal neu hochziehen"
docker compose up -d portal

echo
echo "==> 6. Smoke-Test Portal-Sidebar"
sleep 8
PORTAL_URL="${PORTAL_PUBLIC_URL:-$PORTAL_PUBLIC_URL_DEFAULT}"
echo "  Portal: $PORTAL_URL"
curl -fsS -o /dev/null -w "  HTTP %{http_code}\n" --max-time 10 "$PORTAL_URL/login" || true

echo
echo "✅ OpenCut + Postiz aktiviert. Sidebar zeigt jetzt 'Video Editor' und"
echo "   'Social Scheduler' für medtheris + kineo Workspaces."
