#!/usr/bin/env python3
"""
bootstrap.py – Einmalig ausführen.
Erstellt alle Projektdateien im aktuellen Ordner.

Ausführen:
  cd ~/onedoc_scraper
  python3 bootstrap.py
"""

import os

DATEIEN = {}

DATEIEN["diagnose_onedoc.py"] = '''
import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2q/felica-kossendey"
Path("screenshots").mkdir(exist_ok=True)

async def diagnose():
    print(f"\\n{'='*60}\\nOneDoc DOM Diagnose\\nURL: {URL}\\n{'='*60}\\n")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=400)
        page = await (await browser.new_context(locale="de-CH", viewport={"width":1280,"height":900})).new_page()

        print("1. Seite laden...")
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/01_loaded.png")
        print("   Screenshot: screenshots/01_loaded.png")

        print("\\n2. Cookie-Banner wegklicken...")
        for sel in ['#didomi-notice-agree-button','button:has-text("Alle akzeptieren")','button:has-text("Accept")']:
            try:
                if await page.locator(sel).first.is_visible(timeout=2000):
                    await page.locator(sel).first.click()
                    print(f"   Geklickt: {sel}")
                    await page.wait_for_timeout(1500)
                    break
            except: pass

        print("\\n3. Scrollen & warten...")
        await page.evaluate("window.scrollTo(0, 500)")
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/02_scrolled.png")

        print("\\n4. Slot-Buttons suchen...")
        buttons = await page.eval_on_selector_all("button", """
            els => els.filter(e => /^\\d{1,2}:\\d{2}/.test(e.innerText.trim()) && e.offsetParent !== null)
                      .map(e => ({
                          text: e.innerText.trim(),
                          classes: e.className,
                          data: Object.fromEntries(Array.from(e.attributes).filter(a=>a.name.startsWith("data-")).map(a=>[a.name,a.value])),
                          disabled: e.disabled
                      }))
        """)

        print(f"   {len(buttons)} Slot-Buttons gefunden:")
        for b in buttons[:8]:
            status = "BELEGT" if b["disabled"] else "FREI"
            print(f"   [{status}] '{b['text']}' | class: {b['classes'][:60]} | data: {b['data']}")

        print("\\n5. Navigation-Buttons suchen...")
        for sel in ['button[aria-label*="next"]','button[aria-label*="nächst"]','[class*="next"] button','[class*="arrow"]']:
            try:
                n = await page.locator(sel).count()
                if n:
                    lbl = await page.locator(sel).first.get_attribute("aria-label") or ""
                    cls = await page.locator(sel).first.get_attribute("class") or ""
                    print(f"   GEFUNDEN: {sel} | aria-label=\'{lbl}\' | class=\'{cls[:50]}\'")
            except: pass

        await page.screenshot(path="screenshots/03_final.png", full_page=True)

        report = {"url": URL, "slot_buttons": len(buttons), "beispiele": buttons[:5]}
        with open("dom_report.json","w",encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"\\n{'='*60}")
        print(f"ERGEBNIS: {len(buttons)} Slot-Buttons gefunden")
        print(f"Screenshots: screenshots/")
        print(f"Report:      dom_report.json")
        if not buttons:
            print("\\n⚠️  Keine Slots gefunden – bitte screenshots/01_loaded.png anschauen")
        print(f"{'='*60}")
        print("Browser schliesst in 8 Sekunden...")
        await page.wait_for_timeout(8000)
        await browser.close()

asyncio.run(diagnose())
'''.strip()


DATEIEN["requirements.txt"] = "playwright>=1.40.0\n"


def main():
    basis = os.path.dirname(os.path.abspath(__file__))
    print(f"\n{'='*50}")
    print("  Kineo Slot-Bot – Bootstrap")
    print(f"{'='*50}")
    print(f"\nOrdner: {basis}\n")

    erstellt = 0
    for name, inhalt in DATEIEN.items():
        pfad = os.path.join(basis, name)
        if os.path.exists(pfad):
            print(f"  ⏭  {name} (bereits vorhanden, übersprungen)")
            continue
        with open(pfad, "w", encoding="utf-8") as f:
            f.write(inhalt)
        print(f"  ✓  {name}")
        erstellt += 1

    os.makedirs(os.path.join(basis, "screenshots"), exist_ok=True)
    os.makedirs(os.path.join(basis, "logs"), exist_ok=True)

    print(f"\n{erstellt} Datei(en) erstellt.")
    print(f"\n{'='*50}")
    print("  Nächste Schritte:")
    print(f"{'='*50}")
    print("\n  1. Playwright installieren (falls noch nicht):")
    print("     python3 -m pip install playwright")
    print("     python3 -m playwright install chromium")
    print("\n  2. Diagnose starten:")
    print("     python3 diagnose_onedoc.py")
    print("\n  → Ein Browser öffnet sich automatisch.")
    print(f"{'='*50}\n")


if __name__ == "__main__":
    main()
