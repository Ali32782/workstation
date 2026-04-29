-- Local SQLite cache for scraper deduplication.
--
-- Each row in `practices` represents one Google Places place_id we've
-- already pushed (or attempted to push) to Twenty CRM. is_processed=1
-- means: don't push again.
--
-- Multi-profile: rows now also carry the profile that produced them
-- (`physio` / `aerzte` / `sportvereine`), so the cache can be filtered
-- by vertical and the same place_id never collides if it's relevant
-- to two profiles. The implicit default for legacy rows is `physio`.
--
-- The `profile_runs` ledger tracks one-shot enforcement: profiles with
-- `one_shot=True` (Sportvereine ZH) are blocked after a successful
-- first run unless the operator passes `--force-rerun` on the CLI.

CREATE TABLE IF NOT EXISTS practices (
    place_id        TEXT PRIMARY KEY,
    name            TEXT,
    website         TEXT,
    canton          TEXT,
    plz             TEXT,
    city            TEXT,
    twenty_company_id TEXT,
    is_processed    INTEGER NOT NULL DEFAULT 1,
    payload_json    TEXT,
    profile         TEXT NOT NULL DEFAULT 'physio',
    processed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_practices_canton  ON practices(canton);
-- idx_practices_profile is created by db.local_db._apply_additive_migrations
-- AFTER the `profile` column has been added to legacy tables, so a
-- downgrade-then-upgrade cycle never fails on a missing column.

-- One-shot ledger. Each profile (`physio`, `aerzte`, `sportvereine`,
-- …) gets at most one row. `run_count` increments every successful run
-- so the UI can show "Letzter Lauf: 12.04.2026, 3 Läufe insgesamt".
-- `last_force_at` is set whenever a one-shot profile was re-run via
-- `--force-rerun`, so it's auditable separately from regular runs.
CREATE TABLE IF NOT EXISTS profile_runs (
    profile        TEXT PRIMARY KEY,
    first_run_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_run_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_force_at  DATETIME,
    run_count      INTEGER NOT NULL DEFAULT 1,
    last_status    TEXT
);
