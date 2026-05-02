#!/bin/bash
# Kineo Dashboard – Server-Lauf via venv
set -e
cd "$(dirname "$0")"
source .venv/bin/activate
python update_dashboard.py
