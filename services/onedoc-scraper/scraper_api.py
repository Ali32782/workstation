import urllib.request
import urllib.parse
import urllib.error
import ssl
import json
import sqlite3
import logging
from datetime import datetime, timedelta
from pathlib import Path
from observations import init_observation_tables, save_observation
from discovery import init_discovery_tables, sync_api_therapeuten

DB_PATH  = Path(__file__).parent / "slots.db"
LOG_PATH = Path(__file__).parent / "scraper.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(LOG_PATH)]
)
log = logging.getLogger(__name__)

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

BASE = "https://www.onedoc.ch"
HEADERS = {
    "User-Agent":       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.3 Safari/605.1.15",
    "Accept":           "*/*",
    "Accept-Language":  "de-DE,de;q=0.9",
    "Referer":          "https://www.onedoc.ch/de/",
    "X-Requested-With": "XMLHttpRequest",
    "X-API-Version":    "1.2.0",
    "X-OneDoc-App":     "web-patient",
}


PRAXEN = [
    {"standort": "Seefeld", "entity_id": "50967", "therapeuten": [
        {"name": "Andrina Kümin",   "prof_id": "2907953", "calendar_id": "125442"},
        {"name": "Joëlle Ramseier", "prof_id": "2998987", "calendar_id": "128306"},
        {"name": "Helen Schwank",   "prof_id": "2907961", "calendar_id": "125445"},
        {"name": "Noah Stierli",    "prof_id": "2907964", "calendar_id": "125443"},
        {"name": "Sereina Urech",   "prof_id": "2907969", "calendar_id": "125444"},
        {"name": "Meike Vogel",     "prof_id": "2944269", "calendar_id": "126599"},
    ]},
    {"standort": "Wipkingen", "entity_id": "50970", "therapeuten": [
        {"name": "Eva Danko",        "prof_id": "2907150", "calendar_id": "125383"},
        {"name": "Raphael Hahner",   "prof_id": "2907166", "calendar_id": "125386"},
        {"name": "Sonia Montero",    "prof_id": "2907167", "calendar_id": "125387"},
        {"name": "Eve Schreurs",     "prof_id": "2999078", "calendar_id": "128319"},
        {"name": "Barbara Victorio", "prof_id": "2944281", "calendar_id": "126601"},
    ]},
    {"standort": "Stauffacher", "entity_id": "50968", "therapeuten": [
        {"name": "Andrina Kümin",   "prof_id": "2908008", "calendar_id": "125453"},
        {"name": "Emma Leu",        "prof_id": "2962676", "calendar_id": "127231"},
        {"name": "Carmen Weber",    "prof_id": "2911916", "calendar_id": "125641"},
    ]},
    {"standort": "Escher Wyss", "entity_id": "51318", "therapeuten": [
        {"name": "Clara Benning",   "prof_id": "2936879", "calendar_id": "126376"},
        {"name": "Annika Heinrich", "prof_id": "2936895", "calendar_id": "126377"},
        {"name": "Andreas Niggl",   "prof_id": "2936885", "calendar_id": "126378"},
    ]},
    {"standort": "Zollikon", "entity_id": "50971", "therapeuten": [
        {"name": "Helen Schwank", "prof_id": "2907110", "calendar_id": "125377"},
        {"name": "Meike Vogel",   "prof_id": "2944266", "calendar_id": "126598"},
    ]},
    {"standort": "Thalwil", "entity_id": "50969", "therapeuten": [
        {"name": "Theresa Bitterlich", "prof_id": "2907175", "calendar_id": "125393"},
        {"name": "Annika Heinrich",    "prof_id": "2907168", "calendar_id": "125394"},
        {"name": "Emma Leu",           "prof_id": "2962677", "calendar_id": "127230"},
        {"name": "Andreas Niggl",      "prof_id": "2907180", "calendar_id": "125439"},
        {"name": "Hanna Raffeiner",    "prof_id": "2907170", "calendar_id": "125395"},
        {"name": "Joëlle Ramseier",    "prof_id": "3056625", "calendar_id": "129911"},
    ]},
]


def save_snapshot(datum, standort, therapeut, slots_dict, kw0=0, kw1=0, kw2=0, kw3=0, kw4=0):
    """Speichert Slot-Zählung in SQLite."""
    import sqlite3, json as _json
    db = Path(__file__).parent / "slots.db"
    conn = sqlite3.connect(db)
    conn.execute("""CREATE TABLE IF NOT EXISTS slot_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        datum TEXT, standort TEXT, therapeut TEXT,
        naechste_7d INTEGER DEFAULT 0, naechste_14d INTEGER DEFAULT 0, naechste_30d INTEGER DEFAULT 0,
        slots_kw0 INTEGER DEFAULT 0, slots_kw1 INTEGER DEFAULT 0,
        slots_kw2 INTEGER DEFAULT 0, slots_kw3 INTEGER DEFAULT 0, slots_kw4 INTEGER DEFAULT 0,
        slots_json TEXT, scrape_ok INTEGER DEFAULT 1, fehler_msg TEXT,
        created_at TEXT DEFAULT (datetime('now')))""")
    for col in ["slots_kw0", "slots_kw1", "slots_kw2", "slots_kw3", "slots_kw4"]:
        try:
            conn.execute(f"ALTER TABLE slot_snapshots ADD COLUMN {col} INTEGER DEFAULT 0")
        except Exception:
            pass
    conn.execute("""INSERT INTO slot_snapshots
        (datum, standort, therapeut, naechste_7d, naechste_14d, naechste_30d,
         slots_kw0, slots_kw1, slots_kw2, slots_kw3, slots_kw4, slots_json, scrape_ok)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)""",
        (datum, standort, therapeut, kw0, kw0 + kw1, kw0 + kw1 + kw2,
         kw0, kw1, kw2, kw3, kw4, _json.dumps(slots_dict or {}, ensure_ascii=False)))
    conn.commit(); conn.close()

def api_get(pfad: str, params: dict = None):
    url = BASE + pfad
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as r:
            body = json.loads(r.read().decode("utf-8"))
            return r.status, body
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as ex:
        log.error(f"Request fehler {url}: {ex}")
        return 0, None


# ── Appointment Types laden ───────────────────────────────────────────────────

STANDARD_TYPE_ID = 176378  # Allgemein Physiotherapie (30 min)

def get_appointment_types(entity_id: str, prof_id: str) -> list[dict]:
    """Holt Terminarten – probiert established und new um ID 176378 zu finden."""
    STANDARD_ID = 176378
    alle = []
    for client_type in ["established", "new"]:
        status, data = api_get(
            f"/api/entities/{entity_id}/bookable-appointment-types",
            {"professionalId": prof_id, "acceptedClientType": client_type}
        )
        if status == 200 and data:
            for t in data.get("data", []):
                if not any(x.get("appointmentTypeId") == t.get("appointmentTypeId") for x in alle):
                    alle.append(t)
        if any(t.get("appointmentTypeId") == STANDARD_ID for t in alle):
            break
    return alle

def get_slots(entity_id: str, prof_id: str, calendar_id: str,
              appointment_type_id: str,
              von: str, bis: str) -> list[dict]:
    """Liest freie Slots über echten OneDoc-Endpunkt (entdeckt 26.03.2026)."""
    status, data = api_get(
        f"/api/v1/locations/{entity_id}/availabilities",
        {
            "professionId": "53",
            "startDate": von,
            "endDate": bis,
            "professionalId": prof_id,
            "appointmentTypeId": appointment_type_id,
            "acceptedClientType": "established",
            "selectUniqueAppointmentTypePerDay": "true",
            "field": "availabilities:timeSlots,nextTimeSlotOn",
        }
    )
    if status != 200 or not data:
        # Fallback: ohne acceptedClientType probieren
        status, data = api_get(
            f"/api/v1/locations/{entity_id}/availabilities",
            {
                "professionId": "53",
                "startDate": von,
                "endDate": bis,
                "professionalId": prof_id,
                "appointmentTypeId": appointment_type_id,
                "selectUniqueAppointmentTypePerDay": "true",
                "field": "availabilities:timeSlots,nextTimeSlotOn",
            }
        )
        if status != 200 or not data:
            log.warning(f"    Slots API → {status} (auch ohne clientType)")
            return []
    time_slots = data.get("data", {}).get("timeSlots", {})
    slots = []
    for datum, slot_list in time_slots.items():
        for ts in slot_list:
            slots.append({"date": datum, "startTime": ts.get("dateTime",""), "booked": False})
    log.info(f"    → {len(slots)} freie Slots")
    return slots


# ── Discover: IDs von Profilseite lesen ───────────────────────────────────────

def discover_ids_from_html(prof_url: str) -> dict:
    """
    Liest professional_id, entity_id, calendar_id direkt aus dem HTML der Profilseite.
    z.B. https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2s/andrina-kumin
    """
    import re
    req = urllib.request.Request(BASE + prof_url if not prof_url.startswith("http") else prof_url,
                                  headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as r:
            html = r.read().decode("utf-8")
        ids = {}
        for attr in ["data-professional-id", "data-entity-id", "data-calendar-id"]:
            m = re.search(rf'{attr}="(\d+)"', html)
            if m:
                ids[attr.replace("data-", "").replace("-", "_")] = m.group(1)
        return ids
    except Exception as ex:
        log.error(f"Discover fehler: {ex}")
        return {}


# ── Haupt-Scraper ─────────────────────────────────────────────────────────────

def scrape_therapeut(standort: str, name: str, entity_id: str, prof_id: str, calendar_id: str = "") -> dict:
    if not prof_id:
        log.warning(f"  {name}: keine prof_id konfiguriert")
        return {"name": name, "standort": standort, "ok": False, "slots": 0,
                "slots_kw0": 0, "slots_kw1": 0, "slots_kw2": 0, "slots_kw3": 0, "slots_kw4": 0}

    from datetime import date
    heute_dt  = date.today()
    wochentag = heute_dt.weekday()
    kw0_start = heute_dt
    kw0_ende  = heute_dt + timedelta(days=6 - wochentag)
    kw1_start = kw0_ende + timedelta(days=1)
    kw1_ende  = kw1_start + timedelta(days=6)
    kw2_start = kw1_ende + timedelta(days=1)
    kw2_ende  = kw2_start + timedelta(days=6)
    kw3_start = kw2_ende + timedelta(days=1)
    kw3_ende  = kw3_start + timedelta(days=6)
    kw4_start = kw3_ende + timedelta(days=1)
    kw4_ende  = kw4_start + timedelta(days=6)
    def fmt(d): return d.strftime("%Y-%m-%d")

    log.info(f"  Scraping: {name} @ {standort}")

    typen = get_appointment_types(entity_id, prof_id)
    if not typen:
        log.warning(f"    Keine Terminarten gefunden")
        return {"name": name, "standort": standort, "ok": False, "slots": 0,
                "slots_kw0": 0, "slots_kw1": 0, "slots_kw2": 0, "slots_kw3": 0, "slots_kw4": 0}

    log.info(f"    {len(typen)} Terminarten: {[t['name'] for t in typen[:5]]}")

    STANDARD_ID = 176378
    standard = [t for t in typen if t.get("appointmentTypeId") == STANDARD_ID]
    if standard:
        target_typ = standard[0]
    else:
        def prio(t):
            n = t["name"].lower()
            if "allgemein" in n and "30" in n: return 0
            if "allgemein" in n: return 1
            if "30" in n and "physio" in n: return 2
            if "physio" in n: return 3
            return 9
        physio = [t for t in typen if "physio" in t["name"].lower()]
        target_typ = sorted(physio, key=prio)[0] if physio else typen[0]
        log.warning(f"    Standard-ID {STANDARD_ID} nicht gefunden, nehme: {target_typ['name']}")

    apt_type_id = str(target_typ["appointmentTypeId"])
    log.info(f"    Terminart: '{target_typ['name']}' (ID: {apt_type_id})")

    slots_kw0 = get_slots(entity_id, prof_id, calendar_id, apt_type_id, fmt(kw0_start), fmt(kw0_ende))
    slots_kw1 = get_slots(entity_id, prof_id, calendar_id, apt_type_id, fmt(kw1_start), fmt(kw1_ende))
    slots_kw2 = get_slots(entity_id, prof_id, calendar_id, apt_type_id, fmt(kw2_start), fmt(kw2_ende))
    slots_kw3 = get_slots(entity_id, prof_id, calendar_id, apt_type_id, fmt(kw3_start), fmt(kw3_ende))
    slots_kw4 = get_slots(entity_id, prof_id, calendar_id, apt_type_id, fmt(kw4_start), fmt(kw4_ende))

    log.info(
        f"    → KW0:{len(slots_kw0)} KW1:{len(slots_kw1)} KW2:{len(slots_kw2)} "
        f"KW3:{len(slots_kw3)} KW4:{len(slots_kw4)}"
    )

    datum = heute_dt.strftime("%Y-%m-%d")
    alle = slots_kw0 + slots_kw1 + slots_kw2 + slots_kw3 + slots_kw4
    slots_dict = {}
    for s in alle:
        d = s["date"]
        slots_dict[d] = slots_dict.get(d, 0) + 1
    save_snapshot(
        datum,
        standort,
        name,
        slots_dict,
        kw0=len(slots_kw0),
        kw1=len(slots_kw1),
        kw2=len(slots_kw2),
        kw3=len(slots_kw3),
        kw4=len(slots_kw4),
    )
    # Nur KW0–KW3 für Trend/Absage-Erkennung: vergleichbar mit Historie vor KW4; sonst
    # würde jeder erste Lauf nach API-Erweiterung künstliche Massen-„Absagen“ erzeugen.
    total_freie_slots_obs = (
        len(slots_kw0) + len(slots_kw1) + len(slots_kw2) + len(slots_kw3)
    )
    obs_slots = slots_kw0 + slots_kw1 + slots_kw2 + slots_kw3
    slot_keys = sorted(
        {f"{s['date']}|{s.get('startTime') or ''}" for s in obs_slots}
    )
    save_observation(
        standort,
        name,
        total_freie_slots_obs,
        {"days": slots_dict, "keys": slot_keys},
    )

    return {
        "name":        name,
        "standort":    standort,
        "ok":          True,
        "slots":       len(slots_kw0),
        "slots_kw0":   len(slots_kw0),
        "slots_kw1":   len(slots_kw1),
        "slots_kw2":   len(slots_kw2),
        "slots_kw3":   len(slots_kw3),
        "slots_kw4":   len(slots_kw4),
        "slots_detail": [s["startTime"] for s in slots_kw0[:5]],
        "terminart":   target_typ["name"],
    }


def run_all():
    datum = datetime.now().strftime("%Y-%m-%d")
    log.info(f"\n=== API Scraper Start: {datum} ===")
    init_observation_tables()
    init_discovery_tables()
    ergebnisse = []
    for praxis in PRAXEN:
        for th in praxis["therapeuten"]:
            if not th.get("prof_id"):
                log.warning(f'  {th["name"]}: keine prof_id')
                continue
            r = scrape_therapeut(
                praxis["standort"], th["name"],
                praxis["entity_id"], th["prof_id"],
                th.get("calendar_id", "")
            )
            ergebnisse.append(r)
    log.info(f"\n=== Fertig: {len(ergebnisse)} Therapeuten ===")
    for r in ergebnisse:
        status = "✓" if r["ok"] else "✗"
        log.info(f"  [{status}] {r['name']} @ {r['standort']}: {r.get('slots','?')} Slots")
    sync_api_therapeuten(ergebnisse, datum=datum)
    return ergebnisse


# ── IDs für alle Therapeuten ermitteln ───────────────────────────────────────

def discover_all_ids():
    """
    Liest die IDs aller Therapeuten von ihren Profilseiten.
    Einmalig ausführen um die prof_ids zu befüllen.
    """
    urls = [
        ("Andrina Kümin",   "/de/physiotherapeutin/zurich/pcy2s/andrina-kumin"),
        ("Joëlle Ramseier", "/de/physiotherapeutin/zurich/pc1ac/joelle-ramseier"),
        ("Helen Schwank",   "/de/physiotherapeutin/zurich/pcwfb/helen-schwank"),
        ("Noah Stierli",    "/de/physiotherapeut/zurich/pcycf/noah-stierli"),
        ("Sereina Urech",   "/de/physiotherapeutin/zurich/pcy7e/sereina-urech"),
        ("Meike Vogel",     "/de/physiotherapeutin/zurich/pcyc1/meike-vogel"),
        # Wipkingen
        ("Eva Danko",       "/de/physiotherapeutin/zurich/ebdl4/kineo-wipkingen"),
        # Thalwil
        ("Theresa Bitterlich", "/de/physiotherapeutin/thalwil/pcy1f/theresa-bitterlich"),
    ]

    print(f"\n{'='*60}")
    print("IDs für alle Therapeuten ermitteln...")
    print(f"{'='*60}")
    for name, url in urls:
        ids = discover_ids_from_html(url)
        print(f"\n  {name}:")
        for k, v in ids.items():
            print(f"    {k} = {v}")
        if not ids:
            print(f"    ⚠️  Keine IDs gefunden – URL prüfen")


if __name__ == "__main__":
    import sys
    if "--all" in sys.argv:
        run_all()
    elif "--discover" in sys.argv:
        discover_all_ids()
    else:
        print("\nTest: Andrina Kümin @ Seefeld")
        r = scrape_therapeut("Seefeld", "Andrina Kümin", "50967", "2907953", "125442")
        print(f"\nErgebnis: {json.dumps(r, ensure_ascii=False, indent=2)}")
