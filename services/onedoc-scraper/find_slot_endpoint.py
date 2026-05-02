"""
find_slot_endpoint.py – Findet den echten Slot-Endpunkt durch systematisches Testen.
Nutzt bekannte IDs: entity=50967, prof=2907953, cal=125442, type=176378

Ausführen: python3 find_slot_endpoint.py
"""
import urllib.request, urllib.parse, urllib.error, ssl, json
from datetime import datetime, timedelta

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

BASE    = "https://www.onedoc.ch"
ENTITY  = "50967"
PROF    = "2907953"
CAL     = "125442"
TYPE_ID = "176378"
HEUTE   = datetime.now().strftime("%Y-%m-%d")
IN_14   = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%d")
IN_14T  = (datetime.now() + timedelta(days=14)).strftime("%Y-%m-%dT23:59:59")
HEUTET  = datetime.now().strftime("%Y-%m-%dT00:00:00")

HEADERS = {
    "User-Agent":   "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept":       "application/json, text/plain, */*",
    "Accept-Language": "de-CH,de;q=0.9",
    "Referer":      f"{BASE}/de/physiotherapeutin/zurich/pcy2s/andrina-kumin",
    "X-Requested-With": "XMLHttpRequest",
}

KANDIDATEN = [
    # Calendar-basiert
    (f"/api/calendars/{CAL}/slots",
     {"appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    (f"/api/calendars/{CAL}/slots",
     {"typeId": TYPE_ID, "startDate": HEUTE, "endDate": IN_14}),
    (f"/api/calendars/{CAL}/availabilities",
     {"appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    (f"/api/v2/calendars/{CAL}/slots",
     {"appointmentTypeId": TYPE_ID, "from": HEUTET, "to": IN_14T}),
    (f"/api/v1/calendars/{CAL}/slots",
     {"appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    # Entity + Professional
    (f"/api/entities/{ENTITY}/professionals/{PROF}/availabilities",
     {"appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    (f"/api/entities/{ENTITY}/professionals/{PROF}/slots",
     {"appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    (f"/api/entities/{ENTITY}/availabilities",
     {"professionalId": PROF, "appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    # Booking-spezifisch
    (f"/booking/api/availabilities",
     {"calendarId": CAL, "appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    (f"/booking/api/v1/availabilities",
     {"calendarId": CAL, "typeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    (f"/api/booking/availabilities",
     {"calendarId": CAL, "appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    # Ohne Datum (gibt evtl. nächste verfügbare zurück)
    (f"/api/calendars/{CAL}/next-available",
     {"appointmentTypeId": TYPE_ID}),
    (f"/api/entities/{ENTITY}/professionals/{PROF}/next-slot",
     {"appointmentTypeId": TYPE_ID}),
    # Mit Timestamp
    (f"/api/calendars/{CAL}/slots",
     {"appointmentTypeId": TYPE_ID, "startAt": HEUTET, "endAt": IN_14T}),
    # Alternativer Parametername
    (f"/api/entities/{ENTITY}/slots",
     {"calendarId": CAL, "appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
    (f"/api/slots",
     {"calendarId": CAL, "entityId": ENTITY, "professionalId": PROF,
      "appointmentTypeId": TYPE_ID, "from": HEUTE, "to": IN_14}),
]

def get(path, params):
    url = BASE + path + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=8) as r:
            body = json.loads(r.read().decode())
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as ex:
        return 0, str(ex)

print(f"\n{'='*65}")
print(f"Slot-Endpunkt Suche")
print(f"entity={ENTITY} | prof={PROF} | cal={CAL} | type={TYPE_ID}")
print(f"{'='*65}\n")

gefunden = []
for path, params in KANDIDATEN:
    status, body = get(path, params)
    if status == 200:
        body_str = json.dumps(body)[:200]
        print(f"✓ [{status}] {path}")
        print(f"  params: {params}")
        print(f"  body:   {body_str}\n")
        gefunden.append((path, params, body))
    elif status == 401:
        print(f"? [401] {path}  ← Login nötig")
    elif status == 422:
        print(f"? [422] {path}  ← Falsche Parameter (Endpunkt existiert!)")
        gefunden.append((path, params, None))
    elif status not in [404, 0]:
        print(f"? [{status}] {path}")

print(f"\n{'='*65}")
if gefunden:
    print(f"✓ {len(gefunden)} Endpunkt(e) gefunden!")
    with open("slot_endpoint.json", "w") as f:
        json.dump([{"path": p, "params": q} for p,q,_ in gefunden], f, indent=2)
    print("Gespeichert: slot_endpoint.json")
else:
    print("✗ Kein Endpunkt gefunden.")
    print("\nNächster Schritt: Browser-Traffic analysieren")
    print("→ python3 discover_all_v2.py --slots-only")
print(f"{'='*65}\n")
