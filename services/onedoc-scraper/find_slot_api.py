"""
find_slot_api.py – Klickt durch die OneDoc-Buchungsauswahl und fängt den Slot-API-Call ab.

Schritt 1: Patient:innenstatus auswählen ("bereits erfasst")
Schritt 2: Terminart auswählen ("Allgemein Physiotherapie 30 min")
Schritt 3: Slot-API-Call im Netzwerk-Traffic fangen

Ausführen: python3 find_slot_api.py
"""

import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2s/andrina-kumin"
Path("screenshots").mkdir(exist_ok=True)

async def find_slot_api():
    print(f"\n{'='*65}")
    print("Slot-API Finder – mit Buchungsauswahl")
    print(f"{'='*65}\n")

    slot_calls = []
    alle_calls = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=700)
        page = await (await browser.new_context(
            locale="de-CH", viewport={"width": 1280, "height": 900}
        )).new_page()

        # Alle JSON-Responses aufzeichnen
        async def on_response(resp):
            if "onedoc.ch" not in resp.url: return
            try:
                ct = resp.headers.get("content-type", "")
                if "json" not in ct: return
                body = await resp.json()
                path = resp.url.replace("https://www.onedoc.ch", "").split("?")[0]
                qs   = resp.url.split("?")[1] if "?" in resp.url else ""
                alle_calls.append({"path": path, "qs": qs, "status": resp.status, "body": body})

                body_str = json.dumps(body)
                is_slot = any(x in body_str.lower() for x in
                    ["starttime","start_time","startat","slot","availab","timeslot","datetime"])
                is_slot_path = any(x in path.lower() for x in
                    ["slot","avail","schedule","calendar","booking"])

                marker = " *** SLOT-KANDIDAT ***" if (is_slot or is_slot_path) and resp.status == 200 else ""
                print(f"  [{resp.status}] {path}{marker}")
                if qs: print(f"        ?{qs[:100]}")
                print(f"        {body_str[:150]}")

                if marker:
                    slot_calls.append({"path": path, "qs": qs, "body": body})
            except: pass

        page.on("response", on_response)

        # 1. Seite laden
        print("1. Seite laden...")
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)

        # 2. Cookie
        for sel in ["#didomi-notice-agree-button", "button:has-text('Alle akzeptieren')"]:
            try:
                if await page.locator(sel).is_visible(timeout=2000):
                    await page.locator(sel).click()
                    await page.wait_for_timeout(1500)
                    print("   Cookie weggeklickt.")
                    break
            except: pass

        # 3. Scrollen zum Booking-Widget
        print("\n2. Zum Booking-Widget scrollen...")
        await page.evaluate("window.scrollTo(0, 600)")
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/slot_01_start.png")

        # 4. Patientenstatus auswählen – "bereits erfasst"
        print("\n3. Patientenstatus auswählen...")
        patient_selektoren = [
            "label:has-text('bereits')",
            "label:has-text('erfasst')",
            "input[value*='existing'] + label",
            "input[value*='returning'] + label",
            "[class*='radio']:has-text('bereits')",
            "button:has-text('bereits')",
            # Direktes Klicken auf Radio-Button
            "input[type='radio'] + label:has-text('bereits')",
            "input[type='radio'] + label:has-text('Patient')",
        ]
        patient_ok = False
        for sel in patient_selektoren:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=2000):
                    txt = await el.inner_text()
                    print(f"   Klick: '{txt.strip()[:50]}' via {sel}")
                    await el.click()
                    patient_ok = True
                    await page.wait_for_timeout(2000)
                    break
            except: pass

        if not patient_ok:
            # Alle sichtbaren Labels/Buttons zeigen
            print("   ⚠️  Kein Patientenstatus-Button gefunden. Sichtbare Elemente:")
            elems = await page.eval_on_selector_all(
                "label, [role='radio'], [role='option'], button",
                "els => els.filter(e => e.offsetParent && e.innerText.trim()).map(e => e.innerText.trim().substring(0,60))"
            )
            for e in elems[:15]:
                print(f"   → '{e}'")

        await page.screenshot(path="screenshots/slot_02_patient.png")

        # 5. Terminart auswählen – "Allgemein Physiotherapie" oder "30 min"
        print("\n4. Terminart auswählen...")
        await page.wait_for_timeout(1500)
        service_selektoren = [
            "label:has-text('Allgemein Physiotherapie')",
            "button:has-text('Allgemein Physiotherapie')",
            "label:has-text('Physiotherapie (30')",
            "button:has-text('Physiotherapie (30')",
            "[class*='service']:has-text('Physiotherapie')",
            "[class*='reason']:has-text('Physiotherapie')",
            "label:has-text('30 min')",
        ]
        service_ok = False
        for sel in service_selektoren:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=2000):
                    txt = await el.inner_text()
                    print(f"   Klick: '{txt.strip()[:50]}' via {sel}")
                    await el.click()
                    service_ok = True
                    await page.wait_for_timeout(3000)
                    break
            except: pass

        if not service_ok:
            print("   ⚠️  Kein Service gefunden. Sichtbare Elemente:")
            elems = await page.eval_on_selector_all(
                "label, button, [role='radio']",
                "els => els.filter(e => e.offsetParent && e.innerText.trim()).map(e => e.innerText.trim().substring(0,60))"
            )
            for e in elems[:20]:
                print(f"   → '{e}'")

        await page.screenshot(path="screenshots/slot_03_service.png")

        # 6. Warten auf Kalender
        print("\n5. Warte auf Kalender-Load...")
        await page.wait_for_timeout(5000)
        await page.screenshot(path="screenshots/slot_04_kalender.png", full_page=True)

        # 7. Ergebnis
        print(f"\n{'='*65}")
        print(f"ALLE API-CALLS: {len(alle_calls)}")
        print(f"SLOT-KANDIDATEN: {len(slot_calls)}")
        print(f"{'='*65}")

        if slot_calls:
            print("\n✓ SLOT-ENDPUNKT GEFUNDEN:")
            for c in slot_calls:
                print(f"\n  PATH:   {c['path']}")
                print(f"  PARAMS: {c['qs']}")
                print(f"  BODY:   {json.dumps(c['body'])[:300]}")
            with open("slot_endpoint_found.json", "w") as f:
                json.dump(slot_calls, f, ensure_ascii=False, indent=2)
            print("\nGespeichert: slot_endpoint_found.json")
        else:
            print("\n⚠️  Noch kein Slot-Call gefangen.")
            print("Alle Calls:")
            for c in alle_calls:
                print(f"  [{c['status']}] {c['path']}")

        with open("alle_api_calls.json", "w") as f:
            json.dump(alle_calls, f, ensure_ascii=False, indent=2)
        print("\nAlle Calls gespeichert: alle_api_calls.json")

        print("\nBrowser schliesst in 15s...")
        await page.wait_for_timeout(15000)
        await browser.close()

asyncio.run(find_slot_api())
