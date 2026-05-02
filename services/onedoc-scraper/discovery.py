import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "slots.db"
INACTIVE_FAIL_STREAK = 8  # bei stündlichem Lauf ~1 Arbeitstag ohne valide Daten
INACTIVE_ZERO_STREAK = 21  # ~3 Wochen bei täglichem Lauf; konservativ bei stündlich

def init_discovery_tables():
    conn = sqlite3.connect(DB_PATH)
    for sql in [
        """CREATE TABLE IF NOT EXISTS discovery_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT, datum TEXT NOT NULL,
            ereignis TEXT NOT NULL, standort TEXT, therapeut TEXT,
            url TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')))""",
        """CREATE TABLE IF NOT EXISTS standorte (
            id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE,
            url TEXT NOT NULL, aktiv INTEGER DEFAULT 1,
            entdeckt_am TEXT, inaktiv_ab TEXT)""",
        """CREATE TABLE IF NOT EXISTS therapeuten (
            id INTEGER PRIMARY KEY AUTOINCREMENT, standort TEXT NOT NULL,
            name TEXT NOT NULL, url TEXT NOT NULL, aktiv INTEGER DEFAULT 1,
            entdeckt_am TEXT, inaktiv_ab TEXT, UNIQUE(standort, name))"""
    ]:
        conn.execute(sql)
    # Zusätzliche Statusfelder für API-basierte Aktivitätsprüfung
    for col_sql in [
        "ALTER TABLE therapeuten ADD COLUMN last_seen_datum TEXT",
        "ALTER TABLE therapeuten ADD COLUMN last_ok_datum TEXT",
        "ALTER TABLE therapeuten ADD COLUMN fail_streak INTEGER DEFAULT 0",
        "ALTER TABLE therapeuten ADD COLUMN zero_slot_streak INTEGER DEFAULT 0",
    ]:
        try:
            conn.execute(col_sql)
        except Exception:
            pass
    conn.commit(); conn.close()

def get_discovery_log(tage=60):
    try:
        conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
        seit = (datetime.now() - timedelta(days=tage)).strftime("%Y-%m-%d")
        rows = conn.execute("SELECT * FROM discovery_log WHERE datum >= ? ORDER BY created_at DESC", (seit,)).fetchall()
        conn.close(); return [dict(r) for r in rows]
    except: return []

def get_aktive_praxen():
    try:
        conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
        standorte = conn.execute("SELECT * FROM standorte WHERE aktiv = 1").fetchall()
        result = []
        for s in standorte:
            th = conn.execute("SELECT * FROM therapeuten WHERE standort = ? AND aktiv = 1", (s["name"],)).fetchall()
            result.append({"standort": s["name"], "url": s["url"],
                          "therapeuten": [{"name": t["name"], "url": t["url"]} for t in th]})
        conn.close(); return result
    except: return []

def log_ereignis(datum, ereignis, standort=None, therapeut=None, url=None, details=None):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("INSERT INTO discovery_log (datum,ereignis,standort,therapeut,url,details) VALUES (?,?,?,?,?,?)",
                    (datum, ereignis, standort, therapeut, url, details))
        conn.commit(); conn.close()
    except: pass


def sync_api_therapeuten(results, datum=None):
    """
    Synchronisiert Therapeutenstatus aus scraper_api-Ergebnissen.
    - markiert Therapeuten bei langer Fehlerstrecke als inaktiv
    - reaktiviert automatisch bei erfolgreichem Scrape
    """
    if not results:
        return
    datum = datum or datetime.now().strftime("%Y-%m-%d")
    init_discovery_tables()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    for r in results:
        standort = r.get("standort")
        name = r.get("name")
        if not standort or not name:
            continue

        synthetic_url = f"api://{standort}/{name}".replace(" ", "_")
        # Kein automatisches Deaktivieren anderer Standorte: Viele Therapeuten arbeiten
        # parallel an mehreren Praxen. Die frühere STANDORTWECHSEL-Logik hat fälschlich
        # z.B. Seefeld deaktiviert, sobald derselbe Name an Stauffacher gescraped wurde.

        conn.execute(
            """INSERT INTO therapeuten (standort, name, url, aktiv, entdeckt_am, last_seen_datum)
               VALUES (?, ?, ?, 1, ?, ?)
               ON CONFLICT(standort, name) DO UPDATE SET
                 last_seen_datum=excluded.last_seen_datum""",
            (standort, name, synthetic_url, datum, datum),
        )

        row = conn.execute(
            "SELECT aktiv, fail_streak, zero_slot_streak FROM therapeuten WHERE standort=? AND name=?",
            (standort, name),
        ).fetchone()
        if not row:
            continue

        was_active = int(row["aktiv"] or 0) == 1
        fail_streak = int(row["fail_streak"] or 0)
        zero_slot_streak = int(row["zero_slot_streak"] or 0)
        ok_now = bool(r.get("ok"))
        total_slots = (
            int(r.get("slots_kw0", 0) or 0)
            + int(r.get("slots_kw1", 0) or 0)
            + int(r.get("slots_kw2", 0) or 0)
            + int(r.get("slots_kw3", 0) or 0)
            + int(r.get("slots_kw4", 0) or 0)
        )

        if ok_now:
            if not was_active:
                log_ereignis(
                    datum,
                    "REAKTIVIERT_THERAPEUT",
                    standort=standort,
                    therapeut=name,
                    details="Automatisch reaktiviert (Scrape wieder erfolgreich).",
                )
            conn.execute(
                """UPDATE therapeuten
                   SET aktiv=1, inaktiv_ab=NULL, last_ok_datum=?, fail_streak=0, last_seen_datum=?, zero_slot_streak=?
                   WHERE standort=? AND name=?""",
                (datum, datum, (zero_slot_streak + 1 if total_slots == 0 else 0), standort, name),
            )
            # Konservative Zusatzregel: dauerhaft keine Slots trotz erfolgreichem Scrape.
            if was_active and total_slots == 0 and (zero_slot_streak + 1) >= INACTIVE_ZERO_STREAK:
                conn.execute(
                    """UPDATE therapeuten
                       SET aktiv=0, inaktiv_ab=?
                       WHERE standort=? AND name=?""",
                    (datum, standort, name),
                )
                log_ereignis(
                    datum,
                    "INAKTIV_THERAPEUT",
                    standort=standort,
                    therapeut=name,
                    details=f"Automatisch inaktiv gesetzt (zero_slot_streak={zero_slot_streak + 1}).",
                )
        else:
            new_fail = fail_streak + 1
            if was_active and new_fail >= INACTIVE_FAIL_STREAK:
                conn.execute(
                    """UPDATE therapeuten
                       SET aktiv=0, inaktiv_ab=?, fail_streak=?, last_seen_datum=?
                       WHERE standort=? AND name=?""",
                    (datum, new_fail, datum, standort, name),
                )
                log_ereignis(
                    datum,
                    "INAKTIV_THERAPEUT",
                    standort=standort,
                    therapeut=name,
                    details=f"Automatisch inaktiv gesetzt (fail_streak={new_fail}).",
                )
            else:
                conn.execute(
                    """UPDATE therapeuten
                       SET fail_streak=?, last_seen_datum=?, zero_slot_streak=0
                       WHERE standort=? AND name=?""",
                    (new_fail, datum, standort, name),
                )

    conn.commit()
    conn.close()


def reactivate_configured_therapeuten():
    """
    Setzt alle in scraper_api.PRAXEN gelisteten (standort, name) auf aktiv=1
    und setzt Fail-/Zero-Streaks zurück. Hilft nach Logikänderungen oder Datenreparatur.
    """
    from scraper_api import PRAXEN

    init_discovery_tables()
    conn = sqlite3.connect(DB_PATH)
    updated = 0
    for p in PRAXEN:
        standort = p["standort"]
        for t in p["therapeuten"]:
            name = t["name"]
            cur = conn.execute(
                """UPDATE therapeuten
                   SET aktiv=1, inaktiv_ab=NULL, fail_streak=0, zero_slot_streak=0
                   WHERE standort=? AND name=?""",
                (standort, name),
            )
            updated += cur.rowcount
    conn.commit()
    conn.close()
    return updated


if __name__ == "__main__":
    import argparse

    ap = argparse.ArgumentParser(description="Discovery / Therapeuten-DB")
    ap.add_argument(
        "--reactivate-config",
        action="store_true",
        help="Alle in scraper_api.PRAXEN konfigurierten Therapeuten auf aktiv=1 setzen",
    )
    args = ap.parse_args()
    if args.reactivate_config:
        n = reactivate_configured_therapeuten()
        print(f"Aktualisierte Zeilen: {n}")
