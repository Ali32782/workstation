#!/bin/bash

# Pfad zum Skript (gleicher Ordner wie diese Datei)
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "============================================"
echo "  Kineo AG – Dashboard Update"
echo "============================================"
echo ""

# Python prüfen
if ! command -v python3 &> /dev/null; then
    echo "❌ Python nicht gefunden!"
    echo "   Bitte python.org öffnen und Python installieren."
    read -p "Enter drücken zum Beenden..."
    exit 1
fi

# Pakete prüfen und ggf. installieren
python3 -c "import openpyxl, pandas" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "📦 Installiere fehlende Pakete..."
    pip3 install openpyxl pandas pdfplumber --quiet
    echo ""
fi

# Dashboard updaten
python3 update_dashboard.py

echo ""
echo "Fenster schliesst in 5 Sekunden..."
sleep 5
