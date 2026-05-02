"""
discover_all_v2.py – Findet alle Therapeuten + den Slot-API-Endpunkt.
Macht alles in einem Schritt.

Ausführen: python3 discover_all_v2.py
"""

import urllib.request, ssl, re, json, asyncio
from pathlib import Path
from playwright.async_api import async_playwright

SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Accept-Language": "de-CH,de;q=0.9",
}
BASE = "https://www.onedoc.ch"

# Bekannte entity_ids (bereits ermittelt)
STANDORTE = [
    ("Seefeld",     "50967", "/de/physiotherapiepraxis/zurich/ebdl1/kineo-zurich-seefeld"),
    ("Wipkingen",   "50970", "/de/physiotherapiepraxis/zurich/ebdl4/kineo-wipkingen"),
    ("Stauffacher", "50968", "/de/physiotherapiepraxis/zurich/ebdl2/kineo-zurich-stauffacher"),
    ("Escher Wyss", "51318", "/de/physiotherapiepraxis/zurich/ebdvs/kineo-escher-wyss"),
    ("Zollikon",    "50971", "/de/physiotherapiepraxis/zollikon/ebdl5/kineo-zollikon"),
    ("Thalwil",     "",      "/de/physiotherapiepraxis/thalwil/ebdl6/kineo-thalwil"),
]


def fetch(url: str) -> str:
    req = urllib.request.Request(
        BASE + url if url.startswith("/") else url, headers=HEADERS
    )
    with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as r:
        return r.read().decode("utf-8")


def extract_ids(html: str) -> dict:
    ids = {}
    for attr in ["data-professional-id", "data-entity-id", "data-calendar-id"]:
        m = re.search(rf'{attr}="(\d+)"', html)
        if m:
            key = attr.replace("data-", "").replace("-id","_id").replace("-","_")
            ids[key] = m.group(1)
    return ids


def find_therapeuten_links(html: str, standort_url: str) -> list[tuple[str,str]]:
    """
    Findet Therapeuten-Profillinks via mehrere Strategien.
    """
    found = {}

    # Strategie 1: JSON-LD structured data
    for m in re.finditer(r'"url"\s*:\s*"(https://www\.onedoc\.ch/de/physiotherapeut[^"]+)"', html):
        url = m.group(1).replace(BASE, "")
        # Name aus dem Kontext versuchen
        found[url] = ""

    # Strategie 2: href mit Therapeuten-Pattern
    for m in re.finditer(r'href="(/de/physiotherapeut(?:in)?/[^"#?]+)"', html):
        url = m.group(1)
        if url not in found:
            found[url] = ""

    # Strategie 3: API-Aufruf für Praxis-Therapeuten
    entity_match = re.search(r'data-entity-id="(\d+)"', html)
    if entity_match:
        entity_id = entity_match.group(1)
        try:
            status, data = api_get(f"/api/entities/{entity_id}/professionals")
            if status == 200 and data:
                for p in data.get("data", []):
                    prof_id = str(p.get("id", ""))
                    name = p.get("fullName") or f"{p.get('firstName','')} {p.get('lastName','')}".strip()
                    slug = p.get("slug", "")
                    city = p.get("city", "zurich").lower()
                    gender = "physiotherapeut" if p.get("gender") == "male" else "physiotherapeutin"
                    if slug:
                        url = f"/de/{gender}/{city}/{slug}"
                        found[url] = name
                    print(f"    API: {name} | prof_id={prof_id}")
        except Exception as e:
            pass

    # Namen aus href-Kontext extrahieren
    for url in list(found.keys()):
        if not found[url]:
            slug = url.rstrip("/").split("/")[-1]
            # "andrina-kumin" → "Andrina Kümin" (approximation)
            name = slug.replace("-", " ").title()
            found[url] = name

    # Praxis-URLs herausfiltern
    result = []
    seen = set()
    for url, name in found.items():
        if url in seen: continue
        if any(x in url for x in ["praxis","zentrum","institut","klinik","group","gruppe"]):
            continue
        # Muss mind. 4 URL-Segmente haben: /de/typ/stadt/code/name
        parts = [p for p in url.split("/") if p]
        if len(parts) < 4: continue
        seen.add(url)
        result.append((name, url))

    return result


def api_get(path: str, params: dict = None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers={**HEADERS, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=10) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except:
        return 0, None


import urllib.parse


# ── Teil 1: Therapeuten und IDs ermitteln ─────────────────────────────────────

def discover_therapeuten():
    print(f"\n{'='*65}")
    print("  Teil 1: Alle Therapeuten IDs ermitteln")
    print(f"{'='*65}\n")

    alle_praxen = []
    total = 0

    for standort, entity_id, praxis_url in STANDORTE:
        print(f"── {standort} (entity={entity_id})")
        try:
            html = fetch(praxis_url)
        except Exception as e:
            print(f"   ✗ Fehler beim Laden: {e}\n")
            alle_praxen.append({"standort": standort, "entity_id": entity_id,
                                 "url": BASE+praxis_url, "therapeuten": []})
            continue

        # entity_id aus HTML falls noch nicht bekannt
        if not entity_id:
            m = re.search(r'data-entity-id="(\d+)"', html)
            if m: entity_id = m.group(1)

        th_links = find_therapeuten_links(html, praxis_url)
        print(f"   {len(th_links)} Therapeuten-Links gefunden")

        therapeuten = []
        for name, th_url in th_links:
            try:
                th_html = fetch(th_url)
                ids = extract_ids(th_html)
                prof_id = ids.get("professional_id", "")
                cal_id  = ids.get("calendar_id", "")

                # Name aus HTML verbessern
                name_match = re.search(r'<h1[^>]*>([^<]+)</h1>', th_html)
                if name_match:
                    name = name_match.group(1).strip()
                    # "Frau Andrina Kümin" → "Andrina Kümin"
                    name = re.sub(r'^(Frau|Herr)\s+', '', name)

                symbol = "✓" if prof_id else "⚠"
                print(f"   [{symbol}] {name:30s} prof={prof_id:10s} cal={cal_id}")
                therapeuten.append({
                    "name": name, "prof_id": prof_id,
                    "calendar_id": cal_id, "url": BASE + th_url
                })
                total += 1
            except Exception as e:
                print(f"   [✗] {th_url}: {e}")

        alle_praxen.append({
            "standort": standort, "entity_id": entity_id,
            "url": BASE + praxis_url, "therapeuten": therapeuten
        })
        print()

    Path("praxen_config.json").write_text(
        json.dumps(alle_praxen, ensure_ascii=False, indent=2)
    )

    print(f"\n✓ {total} Therapeuten gefunden, gespeichert in praxen_config.json")
    return alle_praxen


# ── Teil 2: Slot-API-Endpunkt finden ─────────────────────────────────────────

async def find_slot_api():
    print(f"\n{'='*65}")
    print("  Teil 2: Slot-API-Endpunkt via Browser-Traffic finden")
    print(f"{'='*65}\n")

    URL = "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2s/andrina-kumin"
    calls = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=500)
        page = await (await browser.new_context(
            locale="de-CH", viewport={"width":1280,"height":900}
        )).new_page()

        async def on_resp(resp):
            if resp.status == 200 and "onedoc.ch" in resp.url:
                try:
                    ct = resp.headers.get("content-type","")
                    if "json" in ct:
                        body = await resp.json()
                        path = resp.url.replace("https://www.onedoc.ch","").split("?")[0]
                        qs   = resp.url.split("?")[1] if "?" in resp.url else ""
                        calls.append({"path": path, "qs": qs, "body": body})
                        preview = json.dumps(body)[:120]
                        print(f"  [API] {path}")
                        if qs: print(f"        ?{qs[:80]}")
                        print(f"        {preview}")
                except: pass

        page.on("response", on_resp)

        print("Lade Seite...")
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        # Cookie
        for sel in ["#didomi-notice-agree-button"]:
            try:
                if await page.locator(sel).is_visible(timeout=2000):
                    await page.locator(sel).click()
                    await page.wait_for_timeout(1000)
            except: pass

        # Scrollen damit Booking-Widget lädt
        await page.evaluate("window.scrollTo(0, 600)")
        await page.wait_for_timeout(5000)
        await page.screenshot(path="screenshots/booking_widget.png", full_page=True)

        # Falls Widget sichtbar: Auswahl durchklicken
        print("\nVersuche Terminbuchung zu starten...")
        klick_selektoren = [
            "button:has-text('Termin buchen')",
            "a:has-text('Termin buchen')",
            "[class*='booking'] button",
            "[class*='BookButton']",
            "button:has-text('Online buchen')",
        ]
        for sel in klick_selektoren:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=1500):
                    print(f"  Klick: {sel}")
                    await el.click()
                    await page.wait_for_timeout(3000)
                    break
            except: pass

        await page.wait_for_timeout(5000)

        print(f"\n{'='*65}")
        print(f"Alle API-Calls ({len(calls)} total):")
        for c in calls:
            print(f"\n  PATH: {c['path']}")
            if c['qs']: print(f"  QS:   {c['qs'][:100]}")
            body_str = json.dumps(c['body'])
            if any(x in body_str for x in ["slot","avail","time","date"]):
                print(f"  *** SLOT-KANDIDAT ***")
            print(f"  DATA: {body_str[:150]}")

        Path("api_calls.json").write_text(
            json.dumps(calls, ensure_ascii=False, indent=2)
        )
        print(f"\nGespeichert: api_calls.json")
        print(f"Screenshot:  screenshots/booking_widget.png")

        print("\nBrowser schliesst in 10s...")
        await page.wait_for_timeout(10000)
        await browser.close()

    return calls


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import sys
    if "--slots-only" in sys.argv:
        asyncio.run(find_slot_api())
    elif "--ids-only" in sys.argv:
        discover_therapeuten()
    else:
        # Beides
        praxen = discover_therapeuten()
        asyncio.run(find_slot_api())
