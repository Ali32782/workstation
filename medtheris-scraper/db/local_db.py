"""
SQLite-backed dedup cache + profile-run ledger.

The scraper is interruptible: re-running picks up where it stopped
because already-processed place_ids are skipped. The cache also stores
the Twenty company_id so we can update existing records later.

Multi-profile additions (April 2026):
  * Every row carries the profile that produced it (`physio`,
    `aerzte`, `sportvereine`). Existing rows from the legacy schema
    are migrated to `profile='physio'` on first run.
  * A separate `profile_runs` ledger tracks one-shot enforcement:
    `Sportvereine` is locked after the first successful run unless
    `--force-rerun` is set.

The migrations here are deliberately additive (`ADD COLUMN`, no
backfill of "real" data) so a downgrade to the previous scraper
version still reads its own rows back.
"""
import json
import os
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


_DB_PATH = Path(os.getenv("SCRAPER_DB_PATH", Path(__file__).with_name("scraper.sqlite")))
_SCHEMA_PATH = Path(__file__).with_name("schema.sql")

# Default profile for rows that pre-date the multi-profile refactor.
# Anything pushed before April 2026 was a Medtheris physio run, so this
# is the only value that doesn't break historical analytics.
_LEGACY_PROFILE = "physio"


class LocalDB:
    def __init__(self, path: Path = _DB_PATH) -> None:
        self.path = path
        self._init_db()

    def _init_db(self) -> None:
        # Order matters here:
        #   1. Run the schema script (creates tables on a fresh DB; no-op on
        #      existing ones because every CREATE uses IF NOT EXISTS).
        #   2. Apply additive migrations (ADD COLUMN, then dependent
        #      indexes). The index-on-profile MUST come after the column
        #      add or it fails on a legacy DB that pre-dates the refactor.
        conn = sqlite3.connect(self.path)
        try:
            with open(_SCHEMA_PATH) as fh:
                conn.executescript(fh.read())
            self._apply_additive_migrations(conn)
            conn.commit()
        finally:
            conn.close()

    def _apply_additive_migrations(self, conn: sqlite3.Connection) -> None:
        """
        Add columns / indexes the schema picked up over time.

        ``CREATE TABLE IF NOT EXISTS`` is a no-op on existing tables, so
        new columns have to be applied explicitly here. Each step uses
        the introspection-based ``info(<table>)`` check pattern instead
        of ``IF NOT EXISTS`` (sqlite doesn't support that on ADD COLUMN
        until 3.35) so these migrations are idempotent across versions.
        """
        cols = {row[1] for row in conn.execute("PRAGMA table_info(practices)").fetchall()}
        if "profile" not in cols:
            conn.execute(
                f"ALTER TABLE practices ADD COLUMN profile TEXT NOT NULL "
                f"DEFAULT '{_LEGACY_PROFILE}'"
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_practices_profile "
                "ON practices(profile)"
            )

    # --------------------------- practices --------------------------

    def is_processed(self, place_id: str, profile: str | None = None) -> bool:
        """
        Has this place_id already been processed for the given profile?

        Profile-scoped on purpose: the same `place_id` (a Google Maps
        identifier) might appear in two profiles' funnels (e.g. a
        rehab clinic that's relevant for physio AND aerzte) and we
        want each vertical to enrich it on its own.
        """
        sql = "SELECT 1 FROM practices WHERE place_id = ? AND is_processed = 1"
        params: list = [place_id]
        if profile:
            sql += " AND profile = ?"
            params.append(profile)
        conn = sqlite3.connect(self.path)
        try:
            cur = conn.execute(sql, params)
            return cur.fetchone() is not None
        finally:
            conn.close()

    def mark_processed(
        self,
        place_id: str,
        practice: dict,
        twenty_company_id: str | None = None,
        profile: str = _LEGACY_PROFILE,
    ) -> None:
        conn = sqlite3.connect(self.path)
        try:
            conn.execute(
                """
                INSERT INTO practices
                  (place_id, name, website, canton, plz, city,
                   twenty_company_id, is_processed, payload_json, profile)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
                ON CONFLICT(place_id) DO UPDATE SET
                  name=excluded.name,
                  website=excluded.website,
                  canton=excluded.canton,
                  plz=excluded.plz,
                  city=excluded.city,
                  twenty_company_id=COALESCE(excluded.twenty_company_id, practices.twenty_company_id),
                  is_processed=1,
                  payload_json=excluded.payload_json,
                  profile=excluded.profile,
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
                    profile,
                ),
            )
            conn.commit()
        finally:
            conn.close()

    def count(self, profile: str | None = None) -> int:
        sql = "SELECT COUNT(*) FROM practices"
        params: list = []
        if profile:
            sql += " WHERE profile = ?"
            params.append(profile)
        conn = sqlite3.connect(self.path)
        try:
            return conn.execute(sql, params).fetchone()[0]
        finally:
            conn.close()

    def cache_summary(self, profile: str | None = None) -> dict:
        """
        Aggregate counts per canton plus a global total/pushed/unpushed
        split. Optionally scoped to one profile so the UI can render
        a per-profile cache panel without mixing verticals.

        Always returns a `by_profile` breakdown too, so the UI can show
        which profiles have data even when no specific scope is set.

        Returns:
            {
              "total": int, "pushed": int, "unpushed": int,
              "by_canton": [{canton, total, pushed, unpushed}, ...],
              "by_profile": [{profile, total, pushed, unpushed}, ...],
              "profile": str | None,   # echo of the filter used
            }
        """
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            # Profile filter clause used by every aggregate below.
            where = ""
            params: list = []
            if profile:
                where = " WHERE profile = ?"
                params = [profile]

            tot = conn.execute(
                f"SELECT COUNT(*) AS n FROM practices{where}", params
            ).fetchone()
            pushed = conn.execute(
                f"SELECT COUNT(*) AS n FROM practices "
                f"WHERE twenty_company_id IS NOT NULL AND twenty_company_id != ''"
                + (f" AND profile = ?" if profile else ""),
                params,
            ).fetchone()
            rows = conn.execute(
                f"""
                SELECT COALESCE(NULLIF(canton, ''), '?') AS canton,
                       COUNT(*) AS n,
                       SUM(CASE WHEN twenty_company_id IS NOT NULL
                                 AND twenty_company_id != ''
                                THEN 1 ELSE 0 END) AS in_crm
                  FROM practices
                  {where}
                 GROUP BY canton
                 ORDER BY n DESC
                """,
                params,
            ).fetchall()
            by_canton = [
                {
                    "canton": r["canton"],
                    "total": r["n"],
                    "pushed": int(r["in_crm"] or 0),
                    "unpushed": r["n"] - int(r["in_crm"] or 0),
                }
                for r in rows
            ]

            # Always compute the per-profile breakdown — cheap and the
            # UI uses it to render the profile picker badges (e.g. "12
            # ungepusht"). Doesn't honour the filter so the UI sees
            # every profile even when it currently displays only one.
            prof_rows = conn.execute(
                """
                SELECT profile,
                       COUNT(*) AS n,
                       SUM(CASE WHEN twenty_company_id IS NOT NULL
                                 AND twenty_company_id != ''
                                THEN 1 ELSE 0 END) AS in_crm
                  FROM practices
                 GROUP BY profile
                 ORDER BY n DESC
                """
            ).fetchall()
            by_profile = [
                {
                    "profile": r["profile"] or _LEGACY_PROFILE,
                    "total": r["n"],
                    "pushed": int(r["in_crm"] or 0),
                    "unpushed": r["n"] - int(r["in_crm"] or 0),
                }
                for r in prof_rows
            ]

            return {
                "total": tot["n"],
                "pushed": pushed["n"],
                "unpushed": tot["n"] - pushed["n"],
                "by_canton": by_canton,
                "by_profile": by_profile,
                "profile": profile,
            }
        finally:
            conn.close()

    def list_unpushed(
        self,
        canton: str | None = None,
        city: str | None = None,
        plz: str | None = None,
        profile: str | None = None,
        limit: int | None = None,
    ) -> list[dict]:
        """
        Cached practices that have **never** been pushed to Twenty.

        Each row is the parsed `payload_json` plus the cached canton/city/
        plz/profile and a sentinel `_cached_place_id` so the caller can
        update the cache row after a successful push. Filters AND-combine.
        """
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            sql = (
                "SELECT place_id, canton, city, plz, profile, payload_json "
                "FROM practices "
                "WHERE (twenty_company_id IS NULL OR twenty_company_id = '')"
            )
            params: list = []
            if canton:
                sql += " AND canton = ? COLLATE NOCASE"
                params.append(canton)
            if city:
                sql += " AND city LIKE ? COLLATE NOCASE"
                params.append(f"%{city}%")
            if plz:
                sql += " AND plz = ?"
                params.append(plz)
            if profile:
                sql += " AND profile = ?"
                params.append(profile)
            sql += " ORDER BY rowid ASC"
            if limit:
                sql += " LIMIT ?"
                params.append(int(limit))

            out: list[dict] = []
            for r in conn.execute(sql, params).fetchall():
                try:
                    payload = json.loads(r["payload_json"]) if r["payload_json"] else {}
                except json.JSONDecodeError:
                    payload = {}
                payload.setdefault("place_id", r["place_id"])
                payload.setdefault("canton", r["canton"])
                payload.setdefault("city", r["city"])
                payload.setdefault("plz", r["plz"])
                payload["_cached_place_id"] = r["place_id"]
                payload["_profile"] = r["profile"] or _LEGACY_PROFILE
                out.append(payload)
            return out
        finally:
            conn.close()

    # ------------------------ profile_runs --------------------------

    def get_profile_run(self, profile: str) -> dict | None:
        """Return the ledger row for a profile, or None if never run."""
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            r = conn.execute(
                "SELECT profile, first_run_at, last_run_at, last_force_at, "
                "run_count, last_status FROM profile_runs WHERE profile = ?",
                (profile,),
            ).fetchone()
            if not r:
                return None
            return {
                "profile": r["profile"],
                "first_run_at": r["first_run_at"],
                "last_run_at": r["last_run_at"],
                "last_force_at": r["last_force_at"],
                "run_count": r["run_count"],
                "last_status": r["last_status"],
            }
        finally:
            conn.close()

    def list_profile_runs(self) -> list[dict]:
        """All ledger rows — for the UI's profile-status panel."""
        conn = sqlite3.connect(self.path)
        conn.row_factory = sqlite3.Row
        try:
            rows = conn.execute(
                "SELECT profile, first_run_at, last_run_at, last_force_at, "
                "run_count, last_status FROM profile_runs ORDER BY last_run_at DESC"
            ).fetchall()
            return [dict(r) for r in rows]
        finally:
            conn.close()

    def record_profile_run(
        self,
        profile: str,
        status: str = "ok",
        forced: bool = False,
    ) -> None:
        """
        Record a successful (or failed) profile invocation.

        Called by main.py at the end of a non-dry-run pipeline. The
        ledger row is what the runner consults to enforce one-shot
        semantics — see `runner._check_one_shot()`.
        """
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        conn = sqlite3.connect(self.path)
        try:
            conn.execute(
                """
                INSERT INTO profile_runs
                  (profile, first_run_at, last_run_at, last_force_at,
                   run_count, last_status)
                VALUES (?, ?, ?, ?, 1, ?)
                ON CONFLICT(profile) DO UPDATE SET
                  last_run_at=excluded.last_run_at,
                  last_force_at=COALESCE(excluded.last_force_at, profile_runs.last_force_at),
                  run_count=profile_runs.run_count + 1,
                  last_status=excluded.last_status
                """,
                (
                    profile,
                    now,
                    now,
                    now if forced else None,
                    status,
                ),
            )
            conn.commit()
        finally:
            conn.close()
