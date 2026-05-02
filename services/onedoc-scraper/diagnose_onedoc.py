import asyncio, json, re
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2s/andrina-kumin"
Path("screenshots").mkdir(exist_ok=True)

async def diagnose():
    print(f"\n{'='*60}\nOneDoc DOM Diagnose\nURL: {URL}\n{'='*60}\n")
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=400)
        page = await (await browser.new_context(locale="de-CH", viewport={"width":1280,"height":900})).new_page()

        print("1. Seite laden...")
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/01_loaded.png")
        print("   Screenshot: screenshots/01_loaded.png")

        print("\n2. Cookie-Banner wegklicken...")
        for sel in ['#didomi-notice-agree-button','button:has-text("Alle akzeptieren")','button:has-text("Accept")']:
            try:
                if await page.locator(sel).first.is_visible(timeout=2000):
                    await page.locator(sel).first.click()
                    print(f"   Geklickt: {sel}")
                    await page.wait_for_timeout(1500)
                    break
            except: pass

        print("\n3. Scrollen & warten...")
        await page.evaluate("window.scrollTo(0, 500)")
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/02_scrolled.png")

        print("\n4. Slot-Buttons suchen...")
        buttons = await page.eval_on_selector_all("button", r"""
            els => els.filter(e => /^\d{1,2}:\d{2}/.test(e.innerText.trim()) && e.offsetParent !== null)
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

        print("\n5. Navigation-Buttons suchen...")
        for sel in ['button[aria-label*="next"]','button[aria-label*="nächst"]','[class*="next"] button','[class*="arrow"]']:
            try:
                n = await page.locator(sel).count()
                if n:
                    lbl = await page.locator(sel).first.get_attribute("aria-label") or ""
                    cls = await page.locator(sel).first.get_attribute("class") or ""
                    print(f"   GEFUNDEN: {sel} | aria-label='{lbl}' | class='{cls[:50]}'")
            except: pass

        await page.screenshot(path="screenshots/03_final.png", full_page=True)

        report = {"url": URL, "slot_buttons": len(buttons), "beispiele": buttons[:5]}
        with open("dom_report.json","w",encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"\n{'='*60}")
        print(f"ERGEBNIS: {len(buttons)} Slot-Buttons gefunden")
        print(f"Screenshots: screenshots/")
        print(f"Report:      dom_report.json")
        if not buttons:
            print("\n⚠️  Keine Slots gefunden – bitte screenshots/01_loaded.png anschauen")
        print(f"{'='*60}")
        print("Browser schliesst in 8 Sekunden...")
        await page.wait_for_timeout(8000)
        await browser.close()

asyncio.run(diagnose())