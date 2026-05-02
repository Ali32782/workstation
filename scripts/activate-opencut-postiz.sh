#!/usr/bin/env bash
# =============================================================================
# activate-opencut-postiz.sh
#
# Sobald DNS (videos.kineo360.work + social.kineo360.work) auf den Server
# zeigt, schaltet dieses Skript den Marketing-Hub komplett frei — inkl.
# der NPM-Proxy-Hosts (kein UI-Klick mehr nötig).
#
# Ablauf:
#   1. Smoke-Test der internen Endpoints (ohne NPM)
#   2. NPM-Proxy-Hosts via npm-add-proxy-host.sh anlegen / aktualisieren
#      (idempotent, kein UI-Klick, kein docker-restart-npm)
#   3. (optional) HTTPS-Smoke-Test über die öffentlichen URLs
#   4. NEXT_PUBLIC_OPENCUT_URL / NEXT_PUBLIC_POSTIZ_URL in /opt/corelab/.env
#      einkommentieren
#   5. portal-Image rebuilden (env-Vars werden zum Build-Zeitpunkt gebaked)
#   6. portal neu hochziehen
#   7. Smoke-Test der Sidebar-API
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
echo "==> 2. NPM Proxy-Hosts anlegen / aktualisieren (idempotent)"
HELPER="${REPO_ROOT}/scripts/npm-add-proxy-host.sh"
if [[ ! -x "$HELPER" ]]; then
  echo "  ! ${HELPER} fehlt oder ist nicht ausführbar — Abbruch."
  echo "  Hint: scp scripts/npm-add-proxy-host.sh und chmod +x"
  exit 1
fi

# Pre-flight: zeigt DNS schon auf den Server?
SERVER_IP="${SERVER_IP:-$(curl -fsS https://api.ipify.org 2>/dev/null || echo "")}"
for d in videos.kineo360.work social.kineo360.work; do
  RESOLVED=$(dig +short "$d" A | head -1)
  if [[ -z "$RESOLVED" ]]; then
    echo "  ! ${d} hat keinen DNS-A-Record — bitte in Cloudflare anlegen und erneut starten."
    exit 1
  fi
  if [[ -n "$SERVER_IP" && "$RESOLVED" != "$SERVER_IP" ]]; then
    echo "  ! ${d} → ${RESOLVED}, Server ist ${SERVER_IP} — DNS zeigt nicht auf uns."
    exit 1
  fi
done
echo "  ✓ DNS-Records vorhanden"

# OpenCut: Browser-only video editor; iframe ok für CSP frame-ancestors,
# kein WebSocket im klassischen Sinn nötig.
bash "$HELPER" \
  --domain videos.kineo360.work \
  --host opencut_web \
  --port 3000 \
  --frame-ancestors "https://app.kineo360.work" \
  --client-max-body-size 1024M

# Postiz: Heavy-WebSocket (Temporal queue UI), grosse Uploads für Reels/Videos,
# unbuffered streaming an Frontend.
bash "$HELPER" \
  --domain social.kineo360.work \
  --host postiz_backend \
  --port 5000 \
  --frame-ancestors "https://app.kineo360.work" \
  --client-max-body-size 512M \
  --proxy-buffering off

echo
echo "==> 3. Public HTTPS smoke test"
curl -fsS -o /dev/null -w "  https://videos.kineo360.work  HTTP %{http_code}\n" \
  --max-time 10 https://videos.kineo360.work/ \
  || echo "  ! videos.kineo360.work antwortet nicht — Logs prüfen"
curl -fsS -o /dev/null -w "  https://social.kineo360.work  HTTP %{http_code}\n" \
  --max-time 10 https://social.kineo360.work/ \
  || echo "  ! social.kineo360.work antwortet nicht — Logs prüfen"

echo
echo "==> 4. Portal-.env: NEXT_PUBLIC_OPENCUT_URL / NEXT_PUBLIC_POSTIZ_URL aktivieren"
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
echo "==> 5. Portal-Image rebuilden (NEXT_PUBLIC_* werden beim Build gebaked)"
docker compose build portal

echo
echo "==> 6. Portal neu hochziehen"
docker compose up -d portal

echo
echo "==> 7. Smoke-Test Portal-Sidebar"
sleep 8
PORTAL_URL="${PORTAL_PUBLIC_URL:-$PORTAL_PUBLIC_URL_DEFAULT}"
echo "  Portal: $PORTAL_URL"
curl -fsS -o /dev/null -w "  HTTP %{http_code}\n" --max-time 10 "$PORTAL_URL/login" || true

echo
echo "✅ OpenCut + Postiz aktiviert. Sidebar zeigt jetzt 'Video Editor' und"
echo "   'Social Scheduler' für medtheris + kineo Workspaces."
