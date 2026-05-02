"""
diagnose_v2.py – Klickt durch die OneDoc-Auswahl und findet Slot-Selektoren.
Ausführen: python3 diagnose_v2.py
"""
import asyncio, json
from pathlib import Path
from playwright.async_api import async_playwright

URL = "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2s/andrina-kumin"
Path("screenshots").mkdir(exist_ok=True)

async def dump_buttons(page, label):
    """Gibt alle sichtbaren Buttons mit Text aus."""
    buttons = await page.eval_on_selector_all("button, [role='button'], [role='radio'], [role='option']", """
        els => els.filter(e => e.offsetParent !== null && e.innerText.trim().length > 0)
                  .map(e => ({
                      tag:     e.tagName,
                      text:    e.innerText.trim().substring(0, 60),
                      classes: e.className.substring(0, 80),
                      data:    Object.fromEntries(Array.from(e.attributes)
                                   .filter(a => a.name.startsWith("data-"))
                                   .map(a => [a.name, a.value])),
                      disabled: e.disabled
                  }))
    """)
    print(f"\n  [{label}] {len(buttons)} Buttons sichtbar:")
    for b in buttons:
        print(f"    {'[DIS]' if b['disabled'] else '[OK ]'} \"{b['text']}\" | cls: {b['classes'][:60]}")
    return buttons

async def diagnose():
    print(f"\n{'='*60}\nOneDoc Diagnose v2 – mit Auswahl-Durchklick\n{'='*60}\n")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=False, slow_mo=600)
        page = await (await browser.new_context(
            locale="de-CH", viewport={"width": 1280, "height": 900}
        )).new_page()

        # ── 1. Laden ──────────────────────────────────────────────────────
        print("1. Seite laden...")
        await page.goto(URL, wait_until="networkidle", timeout=30000)
        await page.wait_for_timeout(2000)
        await page.screenshot(path="screenshots/v2_01_start.png")

        # ── 2. Cookie ─────────────────────────────────────────────────────
        for sel in ["#didomi-notice-agree-button", "button:has-text('Alle akzeptieren')"]:
            try:
                if await page.locator(sel).is_visible(timeout=2000):
                    await page.locator(sel).click()
                    await page.wait_for_timeout(1000)
                    print("   Cookie weggeklickt.")
                    break
            except: pass

        # ── 3. Alle Buttons VOR Auswahl aufzeichnen ───────────────────────
        print("\n2. Buttons vor Auswahl:")
        await dump_buttons(page, "VOR Auswahl")
        await page.screenshot(path="screenshots/v2_02_vor_auswahl.png")

        # ── 4. Patient-Typ auswählen ("Bestehender Patient") ─────────────
        print("\n3. Patient-Typ suchen...")
        patient_selektoren = [
            "button:has-text('Bestehender Patient')",
            "button:has-text('bestehender')",
            "[role='radio']:has-text('Bestehend')",
            "label:has-text('Bestehend')",
            "button:has-text('Existing')",
            "button:has-text('existing')",
            "[data-value*='existing']",
            "[data-value*='returning']",
        ]
        patient_geklickt = False
        for sel in patient_selektoren:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=2000):
                    cls = await el.get_attribute("class") or ""
                    txt = await el.inner_text()
                    print(f"   GEFUNDEN: {sel}")
                    print(f"   Text: '{txt.strip()}' | class: {cls[:60]}")
                    await el.click()
                    patient_geklickt = True
                    await page.wait_for_timeout(1500)
                    break
            except: pass

        if not patient_geklickt:
            print("   ⚠️  Kein Patient-Button gefunden – alle Optionen anzeigen:")
            await dump_buttons(page, "Patient-Auswahl")

        await page.screenshot(path="screenshots/v2_03_patient_gewaehlt.png")

        # ── 5. Service auswählen ("Physiotherapie" / "30 min") ────────────
        print("\n4. Service suchen...")
        await page.wait_for_timeout(1000)
        service_selektoren = [
            "button:has-text('Physiotherapie')",
            "button:has-text('physio')",
            "button:has-text('30')",
            "[role='radio']:has-text('Physio')",
            "label:has-text('Physio')",
            "[data-value*='physio']",
        ]
        service_geklickt = False
        for sel in service_selektoren:
            try:
                el = page.locator(sel).first
                if await el.is_visible(timeout=2000):
                    txt = await el.inner_text()
                    cls = await el.get_attribute("class") or ""
                    print(f"   GEFUNDEN: {sel}")
                    print(f"   Text: '{txt.strip()}' | class: {cls[:60]}")
                    await el.click()
                    service_geklickt = True
                    await page.wait_for_timeout(1500)
                    break
            except: pass

        if not service_geklickt:
            print("   ⚠️  Kein Service-Button gefunden – alle Optionen anzeigen:")
            await dump_buttons(page, "Service-Auswahl")

        await page.screenshot(path="screenshots/v2_04_service_gewaehlt.png")

        # ── 6. Warten bis Kalender erscheint ─────────────────────────────
        print("\n5. Warte auf Kalender...")
        await page.wait_for_timeout(3000)
        await page.screenshot(path="screenshots/v2_05_kalender.png")

        # ── 7. Slot-Buttons suchen ────────────────────────────────────────
        print("\n6. Slot-Buttons suchen...")
        await dump_buttons(page, "NACH Auswahl")

        slots = await page.eval_on_selector_all("button, [role='button']", r"""
            els => els.filter(e => /^\d{1,2}:\d{2}/.test(e.innerText.trim()) && e.offsetParent !== null)
                      .map(e => ({
                          text:     e.innerText.trim(),
                          classes:  e.className,
                          data:     Object.fromEntries(Array.from(e.attributes)
                                        .filter(a => a.name.startsWith("data-"))
                                        .map(a => [a.name, a.value])),
                          disabled: e.disabled,
                          ariaLabel: e.getAttribute("aria-label") || ""
                      }))
        """)

        print(f"\n   Slot-Buttons (Uhrzeit-Format): {len(slots)}")
        for s in slots[:10]:
            status = "BELEGT" if s["disabled"] else "FREI"
            print(f"   [{status}] '{s['text']}' | cls: {s['classes'][:70]} | data: {s['data']}")

        # ── 8. HTML des Kalender-Bereichs speichern ───────────────────────
        print("\n7. Kalender-HTML extrahieren...")
        for sel in ["[class*='booking']", "[class*='calendar']", "[class*='slot']", "main"]:
            try:
                el = page.locator(sel).first
                if await el.count() > 0:
                    html = await el.inner_html()
                    if len(html) > 300:
                        Path("kalender_html.txt").write_text(html[:5000], encoding="utf-8")
                        print(f"   Gespeichert in kalender_html.txt ({len(html)} Zeichen) via '{sel}'")
                        break
            except: pass

        # ── 9. Report speichern ───────────────────────────────────────────
        report = {
            "url": URL,
            "patient_button_gefunden": patient_geklickt,
            "service_button_gefunden": service_geklickt,
            "slot_buttons_gefunden":   len(slots),
            "slot_beispiele":          slots[:8],
        }
        Path("dom_report_v2.json").write_text(
            json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
        )

        print(f"\n{'='*60}")
        print(f"ERGEBNIS")
        print(f"  Patient-Button geklickt: {'✓' if patient_geklickt else '✗'}")
        print(f"  Service-Button geklickt: {'✓' if service_geklickt else '✗'}")
        print(f"  Slot-Buttons gefunden:   {len(slots)}")
        print(f"  Screenshots: screenshots/v2_*.png")
        print(f"  Report:      dom_report_v2.json")
        if not slots:
            print("\n  ⚠️  Bitte screenshots/v2_05_kalender.png anschauen")
            print("      und mir den vollständigen Output hier schicken.")
        print(f"{'='*60}")
        print("Browser schliesst in 15 Sekunden...")
        await page.wait_for_timeout(15000)
        await browser.close()

asyncio.run(diagnose())
