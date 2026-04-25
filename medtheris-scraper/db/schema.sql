-- Local SQLite cache for scraper deduplication.
-- Each row represents a Google Places place_id we've already pushed (or
-- attempted to push) to Twenty CRM. is_processed=1 means: don't push again.

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
    processed_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_practices_canton ON practices(canton);
