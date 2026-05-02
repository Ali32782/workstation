#!/bin/bash
# setup_mac.sh – Einmalig ausführen auf dem Mac
# Voraussetzung: Homebrew ist installiert (https://brew.sh)

set -e

echo ""
echo "======================================"
echo "  Kineo Slot-Bot – Mac Setup"
echo "======================================"

# 1. Homebrew prüfen
echo ""
echo "1. Homebrew prüfen..."
if ! command -v brew &>/dev/null; then
    echo "   ✗ Homebrew nicht gefunden."
    echo "   Installieren mit:"
    echo '   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
    exit 1
fi
echo "   ✓ Homebrew $(brew --version | head -1)"

# 2. Python installieren (falls nicht vorhanden)
echo ""
echo "2. Python installieren..."
if ! command -v python3 &>/dev/null; then
    brew install python
    echo "   ✓ Python installiert"
else
    echo "   ✓ $(python3 --version) bereits vorhanden"
fi

# 3. Projektordner erstellen und Dateien kopieren
echo ""
echo "3. Projektordner vorbereiten..."
mkdir -p ~/onedoc_scraper/screenshots
mkdir -p ~/onedoc_scraper/logs

# Dateien aus dem aktuellen Verzeichnis kopieren (falls von Downloads ausgeführt)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ "$SCRIPT_DIR" != "$HOME/onedoc_scraper" ]; then
    echo "   Kopiere .py Dateien nach ~/onedoc_scraper ..."
    cp "$SCRIPT_DIR"/*.py ~/onedoc_scraper/ 2>/dev/null || true
    cp "$SCRIPT_DIR"/*.sh ~/onedoc_scraper/ 2>/dev/null || true
fi
cd ~/onedoc_scraper

# 4. Python-Pakete installieren
echo ""
echo "4. Python-Pakete installieren..."
python3 -m pip install --quiet --upgrade pip
python3 -m pip install --quiet playwright
echo "   ✓ Playwright installiert"

# 5. Chromium-Browser installieren
echo ""
echo "5. Chromium Browser installieren..."
python3 -m playwright install chromium
echo "   ✓ Chromium installiert"

# 6. Ferttig
echo ""
echo "======================================"
echo "  Setup abgeschlossen!"
echo "======================================"
echo ""
echo "Jetzt ausführen:"
echo ""
echo "  cd ~/onedoc_scraper"
echo "  python3 diagnose_onedoc.py"
echo ""
