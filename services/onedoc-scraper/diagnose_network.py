"""
diagnose_network.py – Lauscht auf alle API-Calls während der Buchungsauswahl.
Findet die echte URL die OneDoc für Slots verwendet.

Ausführen: python3 diagnose_network.py
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2s/andrina-kumin"
Path("screenshots").mkdir(exist_ok=True)

async def sniff():
    print(f"\n{'='*60}")
    print("OneDoc Netzwerk-Analyse – lauscht auf API-Calls")
    print(f"{'='*60}\n")

    api_calls = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=800)
        page = await (await browser.new_context(
            locale="de-CH", viewport={"width": 1280, "height": 900}
        )).new_page()

        # Alle Netzwerk-Requests aufzeichnen
        async def on_request(req):
            url = req.url
            # Nur API/JSON-Calls, keine Assets
            if any(x in url for x in ["/api/", "slot", "avail", "booking", "calendar", "schedule"]):
                api_calls.append({
                    "method": req.method,
                    "url":    url,
                    "headers": dict(req.headers),
                })
                print(f"  → REQUEST: {req.method} {url[:100]}")

        async def on_response(resp):
            url = resp.url
            if any(x in url for x in ["/api/", "slot", "avail", "booking", "calendar", "schedule"]):
                try:
                    ct = resp.headers.get("content-type", "")
                    if "json" in ct:
                        body = await resp.json()
                        print(f"  ← RESPONSE [{resp.status}]: {url[:80]}")
                        print(f"             {json.dumps(body)[:150]}")
                        # Zum passenden Request suchen und Body speichern
                        for call in api_calls:
                            if call["url"] == url:
                                call["response_status"] = resp.status
                                call["response_body"]   = body
                except: pass

        page.on("request",  on_request)
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

        # 3. Scrollen damit Widget lädt
        print("\n2. Scrollen zum Buchungs-Widget...")
        await page.evaluate("window.scrollTo(0, 600)")
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/net_01_start.png")

        # 4. Alle klickbaren Elemente anzeigen
        print("\n3. Klickbare Elemente auf der Seite:")
        elems = await page.eval_on_selector_all(
            "button, [role='button'], [role='radio'], [role='tab'], "
            "[class*='service'], [class*='reason'], [class*='patient'], "
            "[class*='type'], [class*='chip'], [class*='card']",
            """els => els.filter(e => e.offsetParent !== null && e.innerText.trim())
                        .map(e => ({
                            tag:  e.tagName,
                            text: e.innerText.trim().substring(0, 50),
                            cls:  e.className.substring(0, 60),
                            role: e.getAttribute('role') || ''
                        }))"""
        )
        for e in elems[:20]:
            print(f"   <{e['tag']}> [{e['role']}] \"{e['text']}\" | {e['cls'][:50]}")

        # 5. Auf Buchungs-Widget scrollen und klicken
        print("\n4. Versuche Buchungs-Widget zu aktivieren...")

        # Häufige Selektoren für Patient-Auswahl bei OneDoc
        klick_versuche = [
            "[class*='BookingWidget']",
            "[class*='booking-widget']",
            "[class*='od-booking']",
            "[class*='Booking']",
            "[data-testid*='booking']",
            "iframe[src*='booking']",
            "iframe[src*='onedoc']",
        ]
        for sel in klick_versuche:
            try:
                n = await page.locator(sel).count()
                if n > 0:
                    print(f"   GEFUNDEN: {sel} ({n}x)")
                    src = await page.locator(sel).first.get_attribute("src") or ""
                    cls = await page.locator(sel).first.get_attribute("class") or ""
                    print(f"   src={src[:80]} | class={cls[:60]}")
            except: pass

        # iframe prüfen (OneDoc könnte Widget in iframe einbetten)
        iframes = await page.frames
        print(f"\n5. iFrames auf der Seite: {len(iframes)}")
        for i, frame in enumerate(iframes):
            if frame.url != URL and frame.url != "about:blank":
                print(f"   Frame {i}: {frame.url[:100]}")

        # 6. Nochmal warten und alle API-Calls sammeln
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/net_02_end.png", full_page=True)

        # 7. Report
        print(f"\n{'='*60}")
        print(f"GEFUNDENE API-CALLS: {len(api_calls)}")
        with_response = [c for c in api_calls if "response_body" in c]
        print(f"Davon mit JSON-Antwort: {len(with_response)}")
        print()
        for c in api_calls:
            print(f"  {c['method']} {c['url'][:100]}")
            if "response_body" in c:
                print(f"  → {json.dumps(c['response_body'])[:200]}")

        if api_calls:
            with open("network_calls.json", "w", encoding="utf-8") as f:
                json.dump(api_calls, f, ensure_ascii=False, indent=2)
            print(f"\nGespeichert: network_calls.json")
        else:
            print("Keine API-Calls gefangen.")
            print("→ Das Widget ist möglicherweise in einem iframe.")
        print(f"{'='*60}")

        print("\nBrowser schliesst in 15 Sekunden...")
        await page.wait_for_timeout(15000)
        await browser.close()

asyncio.run(sniff())
