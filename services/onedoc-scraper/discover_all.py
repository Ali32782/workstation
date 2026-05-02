"""
discover_all.py – Liest alle Therapeuten-IDs von allen 6 Kineo-Standorten.
Einmalig ausführen, gibt fertige PRAXEN-Konfiguration aus.

Ausführen: python3 discover_all.py
"""

import urllib.request
import urllib.parse
import ssl
import re
import json
from pathlib import Path

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    "User-Agent":      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept-Language": "de-CH,de;q=0.9",
}

BASE = "https://www.onedoc.ch"

# Alle 6 Standort-Seiten
STANDORTE = [
    ("Seefeld",     "/de/physiotherapiepraxis/zurich/ebdl1/kineo-zurich-seefeld"),
    ("Wipkingen",   "/de/physiotherapiepraxis/zurich/ebdl4/kineo-wipkingen"),
    ("Stauffacher", "/de/physiotherapiepraxis/zurich/ebdl2/kineo-zurich-stauffacher"),
    ("Escher Wyss", "/de/physiotherapiepraxis/zurich/ebdvs/kineo-escher-wyss"),
    ("Zollikon",    "/de/physiotherapiepraxis/zollikon/ebdl5/kineo-zollikon"),
    ("Thalwil",     "/de/physiotherapiepraxis/thalwil/ebdl6/kineo-thalwil"),
]


def fetch_html(url: str) -> str:
    req = urllib.request.Request(BASE + url, headers=HEADERS)
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as r:
        return r.read().decode("utf-8")


def extract_ids(html: str) -> dict:
    """Liest data-professional-id, data-entity-id, data-calendar-id aus HTML."""
    ids = {}
    for attr in ["data-professional-id", "data-entity-id", "data-calendar-id"]:
        m = re.search(rf'{attr}="(\d+)"', html)
        if m:
            ids[attr.replace("data-", "").replace("-id", "_id").replace("-", "_")] = m.group(1)
    return ids


def get_therapeuten_urls(html: str) -> list[tuple[str, str]]:
    """Findet alle Therapeuten-Profillinks auf einer Standortseite."""
    # Muster: /de/physiotherapeut(in)/stadt/code/name
    pattern = r'href="(/de/physiotherapeut(?:in)?/[^/]+/[^/]+/[^"]+)"[^>]*>\s*(?:<[^>]+>\s*)*([^<]{3,60})</a'
    treffer = re.findall(pattern, html)

    # Duplikate entfernen, nur Personen-URLs (keine Praxis-URLs)
    gesehen = set()
    result = []
    for url, name in treffer:
        name = re.sub(r'\s+', ' ', name).strip()
        # Praxis-URLs ausschliessen (enthalten "praxis" oder "zentrum")
        if url in gesehen or not name or len(name) < 3:
            continue
        if any(x in url for x in ["praxis", "zentrum", "institut", "klinik"]):
            continue
        gesehen.add(url)
        result.append((name, url))
    return result


def get_entity_id_from_praxis(html: str) -> str:
    """Liest die entity_id aus der Praxisseite."""
    m = re.search(r'data-entity-id="(\d+)"', html)
    return m.group(1) if m else ""


def main():
    print(f"\n{'='*65}")
    print("  Kineo – Alle Therapeuten IDs ermitteln")
    print(f"{'='*65}\n")

    alle_praxen = []
    total = 0

    for standort, praxis_url in STANDORTE:
        print(f"Standort: {standort}")
        print(f"  URL: {praxis_url}")

        try:
            praxis_html = fetch_html(praxis_url)
        except Exception as e:
            print(f"  ✗ Fehler: {e}\n")
            continue

        entity_id = get_entity_id_from_praxis(praxis_html)
        therapeuten_urls = get_therapeuten_urls(praxis_html)

        print(f"  entity_id: {entity_id}")
        print(f"  {len(therapeuten_urls)} Therapeuten gefunden")

        therapeuten = []
        for name, th_url in therapeuten_urls:
            try:
                th_html = fetch_html(th_url)
                ids = extract_ids(th_html)
                prof_id    = ids.get("professional_id", "")
                cal_id     = ids.get("calendar_id", "")
                ent_id     = ids.get("entity_id", entity_id)

                status = "✓" if prof_id else "⚠"
                print(f"  [{status}] {name}")
                print(f"        prof_id={prof_id} | calendar_id={cal_id} | entity_id={ent_id}")

                therapeuten.append({
                    "name":        name,
                    "prof_id":     prof_id,
                    "calendar_id": cal_id,
                    "url":         BASE + th_url,
                })
                total += 1
            except Exception as e:
                print(f"  [✗] {name}: {e}")

        alle_praxen.append({
            "standort":   standort,
            "entity_id":  entity_id,
            "url":        BASE + praxis_url,
            "therapeuten": therapeuten,
        })
        print()

    # Als JSON speichern
    Path("praxen_config.json").write_text(
        json.dumps(alle_praxen, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    # Fertige Python-Konfiguration ausgeben
    print(f"\n{'='*65}")
    print(f"  Gefunden: {total} Therapeuten in {len(alle_praxen)} Standorten")
    print(f"  Gespeichert: praxen_config.json")
    print(f"{'='*65}")
    print("\nFertige PRAXEN-Konfiguration für scraper_api.py:\n")
    print("PRAXEN = [")
    for p in alle_praxen:
        print(f'    {{')
        print(f'        "standort":  "{p["standort"]}",')
        print(f'        "entity_id": "{p["entity_id"]}",')
        print(f'        "therapeuten": [')
        for t in p["therapeuten"]:
            print(f'            {{"name": "{t["name"]}", "prof_id": "{t["prof_id"]}", "calendar_id": "{t["calendar_id"]}"}},')
        print(f'        ]')
        print(f'    }},')
    print("]")


if __name__ == "__main__":
    main()
