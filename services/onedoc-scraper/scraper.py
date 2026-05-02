"""
OneDoc Therapie-Slot Scraper
Liest freie Termine pro Therapeut und Standort von onedoc.ch aus.
Speichert Ergebnisse in SQLite für historisches Reporting.
"""

import asyncio
import sqlite3
import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from playwright.async_api import async_playwright
from discovery import run_discovery, get_aktive_praxen, init_discovery_tables
from observations import save_observation, init_observation_tables

# ── Konfiguration ─────────────────────────────────────────────────────────────

# Deine Praxis-Standorte und Therapeuten
PRAXEN = [
    {
        "standort": "Seefeld",
        "url": "https://www.onedoc.ch/de/physiotherapiepraxis/zurich/ebdl1/kineo-zurich-seefeld",
        "therapeuten": [
            # {"name": "Felica Kossendey", ...},  # ausgeschieden März 2026
            {"name": "Andrina Kümin",    "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy2s/andrina-kumin"},
            {"name": "Joëlle Ramseier",  "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/pc1ac/joelle-ramseier"},
            {"name": "Helen Schwank",    "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcwfb/helen-schwank"},
            {"name": "Noah Stierli",     "url": "https://www.onedoc.ch/de/physiotherapeut/zurich/pcycf/noah-stierli"},
            {"name": "Sereina Urech",    "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcy7e/sereina-urech"},
            {"name": "Meike Vogel",      "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/pcyc1/meike-vogel"},
        ]
    },
    {
        "standort": "Wipkingen",
        "url": "https://www.onedoc.ch/de/physiotherapiepraxis/zurich/ebdl4/kineo-wipkingen",
        "therapeuten": [
            # Therapeuten von der Wipkingen-Seite (OneDoc-Snippets): Eva Danko, Raphael Hahner,
            # Sonia Montero, Eve Schreurs, Barbara Victorio + Elisabeth Märzweiler (Personal Training)
            # ⚠️ Individuelle Profil-URLs bitte auf onedoc.ch verifizieren und ergänzen
            {"name": "Eva Danko",            "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/ebdl4-eva-danko"},
            {"name": "Raphael Hahner",       "url": "https://www.onedoc.ch/de/physiotherapeut/zurich/ebdl4-raphael-hahner"},
            {"name": "Sonia Montero",        "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/ebdl4-sonia-montero"},
            {"name": "Eve Schreurs",         "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/ebdl4-eve-schreurs"},
            {"name": "Barbara Victorio",     "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/ebdl4-barbara-victorio"},
            {"name": "Elisabeth Märzweiler", "url": "https://www.onedoc.ch/de/personal-trainerin/zurich/ebdl4-elisabeth-maerzweiler"},
        ]
    },
    {
        "standort": "Stauffacher",
        "url": "https://www.onedoc.ch/de/physiotherapiepraxis/zurich/ebdl2/kineo-zurich-stauffacher",
        "therapeuten": [
            # ⚠️ Therapeuten bitte auf onedoc.ch/de/.../kineo-zurich-stauffacher → Team verifizieren
            # Bekannt aus Bewertungen: Carmen (Physiotherapie)
            {"name": "Carmen",  "url": "https://www.onedoc.ch/de/physiotherapeutin/zurich/ebdl2-carmen"},
        ]
    },
    {
        "standort": "Escher Wyss",
        "url": "https://www.onedoc.ch/de/physiotherapiepraxis/zurich/ebdvs/kineo-escher-wyss",
        "therapeuten": [
            # ⚠️ Therapeuten bitte auf onedoc.ch/de/.../kineo-escher-wyss → Team verifizieren
            {"name": "Placeholder Escher Wyss", "url": "https://www.onedoc.ch/de/physiotherapeut/zurich/ebdvs-placeholder"},
        ]
    },
    {
        "standort": "Zollikon",
        "url": "https://www.onedoc.ch/de/physiotherapiepraxis/zollikon/ebdl5/kineo-zollikon",
        "therapeuten": [
            # Bekannt aus Bewertungen: Patrick Jahn, Helen Schwank
            {"name": "Patrick Jahn",  "url": "https://www.onedoc.ch/de/physiotherapeut/zollikon/ebdl5-patrick-jahn"},
            {"name": "Helen Schwank", "url": "https://www.onedoc.ch/de/physiotherapeutin/zollikon/pcwfb/helen-schwank"},
        ]
    },
    {
        "standort": "Thalwil",
        "url": "https://www.onedoc.ch/de/physiotherapiepraxis/thalwil/ebdl6/kineo-thalwil",
        "therapeuten": [
            # Bekannt: Theresa Bitterlich
            {"name": "Theresa Bitterlich", "url": "https://www.onedoc.ch/de/physiotherapeutin/thalwil/pcy1f/theresa-bitterlich"},
        ]
    },
]

DB_PATH = Path(__file__).parent / "slots.db"
LOG_PATH = Path(__file__).parent / "scraper.log"

# Wieviele Wochen voraus sollen freie Slots gezählt werden?
WOCHEN_VORAUS = 2

# ── Logging ───────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.FileHandler(LOG_PATH),
        logging.StreamHandler()
    ]
)
log = logging.getLogger(__name__)

# ── Datenbank Setup ───────────────────────────────────────────────────────────

def init_db():
    """Erstellt die SQLite-Datenbank und Tabellen falls nicht vorhanden."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS slot_snapshots (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            datum        TEXT NOT NULL,           -- Datum des Scrapings (YYYY-MM-DD)
            standort     TEXT NOT NULL,           -- z.B. "Kineo Seefeld"
            therapeut    TEXT NOT NULL,           -- z.B. "Felica Kossendey"
            naechste_7d  INTEGER DEFAULT 0,       -- Freie Slots nächste 7 Tage
            naechste_14d INTEGER DEFAULT 0,       -- Freie Slots nächste 14 Tage
            naechste_30d INTEGER DEFAULT 0,       -- Freie Slots nächste 30 Tage
            slots_json   TEXT,                    -- Rohdaten (Datum → Anzahl)
            scrape_ok    INTEGER DEFAULT 1,       -- 1 = erfolgreich, 0 = Fehler
            fehler_msg   TEXT,                    -- Fehlermeldung falls scrape_ok=0
            created_at   TEXT DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_datum_therapeut
        ON slot_snapshots(datum, standort, therapeut)
    """)
    conn.commit()
    conn.close()
    log.info(f"Datenbank initialisiert: {DB_PATH}")


def save_snapshot(datum, standort, therapeut, slots_dict, fehler=None):
    """Speichert einen Slot-Snapshot in die Datenbank."""
    heute = datetime.now().date()
    naechste_7d  = sum(v for k, v in slots_dict.items() if (datetime.strptime(k, "%Y-%m-%d").date() - heute).days <= 7)
    naechste_14d = sum(v for k, v in slots_dict.items() if (datetime.strptime(k, "%Y-%m-%d").date() - heute).days <= 14)
    naechste_30d = sum(v for k, v in slots_dict.items())

    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        INSERT INTO slot_snapshots
            (datum, standort, therapeut, naechste_7d, naechste_14d, naechste_30d, slots_json, scrape_ok, fehler_msg)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        datum, standort, therapeut,
        naechste_7d, naechste_14d, naechste_30d,
        json.dumps(slots_dict, ensure_ascii=False),
        0 if fehler else 1,
        fehler
    ))
    conn.commit()
    conn.close()

# ── Playwright Scraper ────────────────────────────────────────────────────────

async def scrape_therapeut(page, standort: str, therapeut: dict, datum: str):
    """
    Öffnet die OneDoc-Profilseite eines Therapeuten und liest
    alle freien Slots für die nächsten WOCHEN_VORAUS Wochen aus.
    """
    url = therapeut["url"]
    name = therapeut["name"]
    log.info(f"  Scraping: {name} @ {standort}")

    slots_dict = {}

    try:
        await page.goto(url, wait_until="networkidle", timeout=30000)

        # Warte bis Kalender-Widget geladen ist
        await page.wait_for_selector('[data-testid="slot"], .slot, button[class*="slot"], [class*="time-slot"], [class*="appointment"]', timeout=15000)

        # Slots für mehrere Wochen sammeln
        for woche in range(WOCHEN_VORAUS):
            if woche > 0:
                # Nächste Woche klicken
                next_btn = page.locator('[aria-label*="nächste"], [aria-label*="next"], button[class*="next"], [data-testid="next-week"]').first
                if await next_btn.count() > 0:
                    await next_btn.click()
                    await page.wait_for_timeout(1500)

            # Alle sichtbaren freien Slots sammeln
            # OneDoc zeigt Slots als Buttons mit Uhrzeiten
            slot_buttons = page.locator('button[class*="slot"]:not([disabled]), [data-testid="slot"]:not([disabled]), [class*="time-slot"]:not([disabled])')
            count = await slot_buttons.count()

            # Datum-Header der aktuellen Woche lesen
            day_headers = page.locator('[class*="day-header"], [class*="date-header"], th[class*="day"]')
            headers_count = await day_headers.count()

            # Slots pro Datum zählen
            for i in range(count):
                slot = slot_buttons.nth(i)
                # Versuche Datum-Attribut oder nächstliegenden Header zu lesen
                slot_date = await slot.get_attribute("data-date")
                if not slot_date:
                    slot_date = await slot.get_attribute("data-day")

                if slot_date and slot_date not in slots_dict:
                    slots_dict[slot_date] = 0
                if slot_date:
                    slots_dict[slot_date] = slots_dict.get(slot_date, 0) + 1
                else:
                    # Fallback: Gesamtzählung für die Woche
                    woche_key = (datetime.now() + timedelta(weeks=woche)).strftime("%Y-W%W")
                    slots_dict[woche_key] = slots_dict.get(woche_key, 0) + 1

            log.info(f"    Woche {woche+1}: {count} Slots gefunden")

        log.info(f"  → {name}: {sum(slots_dict.values())} freie Slots total")
        save_snapshot(datum, standort, name, slots_dict)
        # Stufe 2: Intraday-Observation speichern & Änderungen erkennen
        aenderungen = save_observation(standort, name, sum(slots_dict.values()), slots_dict)
        return {"therapeut": name, "standort": standort, "slots": slots_dict,
                "ok": True, "aenderungen": aenderungen}

    except Exception as e:
        fehler = str(e)
        log.error(f"  FEHLER bei {name}: {fehler}")
        save_snapshot(datum, standort, name, {}, fehler=fehler)
        save_observation(standort, name, 0, {})
        return {"therapeut": name, "standort": standort, "slots": {}, "ok": False, "fehler": fehler}


async def run_scraper():
    """
    Hauptfunktion: 
    1. Auto-Discovery (neue/ausgeschiedene Standorte & Therapeuten erkennen)
    2. Alle aktiven Therapeuten scrapen
    """
    datum = datetime.now().strftime("%Y-%m-%d")
    log.info(f"=== Scraper Start: {datum} ===")

    init_db()
    init_discovery_tables()
    init_observation_tables()
    ergebnisse = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--no-sandbox", "--disable-dev-shm-usage"]
        )
        context = await browser.new_context(
            locale="de-CH",
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        )
        page = await context.new_page()

        # ── Schritt 1: Auto-Discovery ──────────────────────────────────────
        log.info("\n--- Phase 1: Auto-Discovery ---")
        discovery_summary = await run_discovery(page)

        # ── Schritt 2: Alle aktiven Therapeuten scrapen ────────────────────
        log.info("\n--- Phase 2: Slot-Scraping ---")
        praxen = get_aktive_praxen()

        if not praxen:
            log.warning("Keine aktiven Standorte in der DB – Discovery hat nichts gefunden?")
        
        for praxis in praxen:
            standort = praxis["standort"]
            log.info(f"\nStandort: {standort} ({len(praxis['therapeuten'])} Therapeuten)")

            if not praxis["therapeuten"]:
                log.warning(f"  Keine aktiven Therapeuten für {standort}")
                continue

            for therapeut in praxis["therapeuten"]:
                ergebnis = await scrape_therapeut(page, standort, therapeut, datum)
                ergebnisse.append(ergebnis)
                await asyncio.sleep(2)

        await browser.close()

    ok = sum(1 for e in ergebnisse if e.get("ok"))
    log.info(f"\n=== Scraper Ende: {ok}/{len(ergebnisse)} OK ===")
    return ergebnisse, discovery_summary


if __name__ == "__main__":
    asyncio.run(run_scraper())
