"""
diagnose_api.py – Testet die OneDoc interne Calendar API direkt.
Kein Browser nötig, keine Auswahl durchklicken.

Die IDs kommen aus dem HTML der Profilseite:
  data-professional-id   → Therapeut
  data-entity-id         → Standort/Praxis
  data-calendar-id       → Kalender

Ausführen: python3 diagnose_api.py
"""

import urllib.request
import urllib.parse
import json
from datetime import datetime, timedelta

# ── Andrina Kümin @ Kineo Seefeld ─────────────────────────────────────────
PROFESSIONAL_ID = "2907953"
ENTITY_ID       = "50967"
CALENDAR_ID     = "125442"

BASE = "https://www.onedoc.ch"
HEADERS = {
    "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept":       "application/json, text/plain, */*",
    "Accept-Language": "de-CH,de;q=0.9",
    "Referer":      f"{BASE}/de/physiotherapeutin/zurich/pcy2s/andrina-kumin",
    "X-Requested-With": "XMLHttpRequest",
}

def fetch(url, params=None):
    if params:
        url = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8")
            return r.status, body
    except Exception as e:
        return 0, str(e)

def test_endpoints():
    heute = datetime.now().strftime("%Y-%m-%d")
    naechste_woche = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")

    print(f"\n{'='*60}")
    print("OneDoc API Diagnose")
    print(f"Professional: {PROFESSIONAL_ID} | Entity: {ENTITY_ID} | Calendar: {CALENDAR_ID}")
    print(f"{'='*60}\n")

    # Kandidaten für die Slot-API
    endpunkte = [
        # Häufige Muster für Buchungsplattformen
        (f"/api/v1/calendars/{CALENDAR_ID}/slots",
         {"from": heute, "to": naechste_woche}),
        (f"/api/v1/availability",
         {"calendar_id": CALENDAR_ID, "from": heute, "to": naechste_woche}),
        (f"/api/calendars/{CALENDAR_ID}/availabilities",
         {"start": heute, "end": naechste_woche}),
        (f"/api/v2/professionals/{PROFESSIONAL_ID}/slots",
         {"from": heute}),
        (f"/api/v1/professionals/{PROFESSIONAL_ID}/availabilities",
         {"entity_id": ENTITY_ID, "from": heute, "to": naechste_woche}),
        (f"/api/booking/slots",
         {"professional_id": PROFESSIONAL_ID, "entity_id": ENTITY_ID,
          "from": heute, "to": naechste_woche}),
        # OneDoc-spezifisch (aus ähnlichen Plattformen bekannt)
        (f"/booking/api/v1/slots",
         {"calendarId": CALENDAR_ID, "from": heute, "to": naechste_woche}),
        (f"/booking/api/slots",
         {"calendar_id": CALENDAR_ID, "start_date": heute}),
    ]

    gefunden = []
    for pfad, params in endpunkte:
        url = BASE + pfad
        status, body = fetch(url, params)
        body_preview = body[:120].replace("\n", " ")
        symbol = "✓" if status == 200 else "✗"
        print(f"  [{status}] {symbol} {pfad}")
        if status == 200:
            print(f"       → {body_preview}")
            gefunden.append((pfad, params, body))
        elif status == 401:
            print(f"       → Login nötig (401)")
        elif status == 404:
            pass  # Nicht vorhanden, kein Output
        else:
            print(f"       → {body_preview[:80]}")

    print(f"\n{'='*60}")
    if gefunden:
        print(f"✓ {len(gefunden)} Endpunkt(e) gefunden!")
        for pfad, params, body in gefunden:
            print(f"\n  URL: {BASE + pfad}")
            print(f"  Params: {params}")
            try:
                data = json.loads(body)
                print(f"  Antwort (gekürzt): {json.dumps(data, ensure_ascii=False)[:300]}")
                with open("api_response.json", "w") as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                print(f"  Vollständige Antwort: api_response.json")
            except:
                print(f"  Antwort (raw): {body[:200]}")
    else:
        print("✗ Kein direkter API-Zugang gefunden.")
        print("\nNächster Schritt: Browser-Netzwerk-Traffic analysieren.")
        print("→ Starte: python3 diagnose_network.py")
    print(f"{'='*60}\n")

if __name__ == "__main__":
    test_endpoints()
