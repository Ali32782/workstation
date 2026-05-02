#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

echo "============================================"
echo "  Kineo – Hyrox Upload (Streamlit)"
echo "============================================"
echo ""

if ! command -v python3 &> /dev/null; then
    echo "Python nicht gefunden."
    read -p "Enter zum Beenden..."
    exit 1
fi

python3 -c "import streamlit" 2>/dev/null
if [ $? -ne 0 ]; then
    echo "Installiere streamlit..."
    pip3 install streamlit --quiet
    echo ""
fi

python3 -m streamlit run streamlit_upload.py
