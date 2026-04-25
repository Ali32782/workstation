"""
SQLite-backed dedup cache.

The scraper is interruptible: re-running picks up where it stopped because
already-processed place_ids are skipped. The cache also stores the Twenty
company_id so we can update existing records later if we add an "update"
mode.
"""
import json
import os
import sqlite3
from pathlib import Path


_DB_PATH = Path(os.getenv("SCRAPER_DB_PATH", Path(__file__).with_name("scraper.sqlite")))
_SCHEMA_PATH = Path(__file__).with_name("schema.sql")


class LocalDB:
    def __init__(self, path: Path = _DB_PATH) -> None:
        self.path = path
        self._init_db()

    def _init_db(self) -> None:
        conn = sqlite3.connect(self.path)
        try:
            with open(_SCHEMA_PATH) as fh:
                conn.executescript(fh.read())
            conn.commit()
        finally:
            conn.close()

    def is_processed(self, place_id: str) -> bool:
        conn = sqlite3.connect(self.path)
        try:
            cur = conn.execute(
                "SELECT 1 FROM practices WHERE place_id = ? AND is_processed = 1",
                (place_id,),
            )
            return cur.fetchone() is not None
        finally:
            conn.close()

    def mark_processed(
        self,
        place_id: str,
        practice: dict,
        twenty_company_id: str | None = None,
    ) -> None:
        conn = sqlite3.connect(self.path)
        try:
            conn.execute(
                """
                INSERT INTO practices
                  (place_id, name, website, canton, plz, city,
                   twenty_company_id, is_processed, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
                ON CONFLICT(place_id) DO UPDATE SET
                  name=excluded.name,
                  website=excluded.website,
                  canton=excluded.canton,
                  plz=excluded.plz,
                  city=excluded.city,
                  twenty_company_id=COALESCE(excluded.twenty_company_id, practices.twenty_company_id),
                  is_processed=1,
                  payload_json=excluded.payload_json,
                  processed_at=CURRENT_TIMESTAMP
                """,
                (
                    place_id,
                    practice.get("name"),
                    practice.get("website"),
                    practice.get("canton"),
                    practice.get("plz"),
                    practice.get("city"),
                    twenty_company_id,
                    json.dumps(practice, ensure_ascii=False, default=str),
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def count(self) -> int:
        conn = sqlite3.connect(self.path)
        try:
            return conn.execute("SELECT COUNT(*) FROM practices").fetchone()[0]
        finally:
            conn.close()
