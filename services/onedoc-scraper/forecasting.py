import json
import math
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "slots.db"
MODEL_DIR = Path(__file__).parent / "models"
MODEL_PATH = MODEL_DIR / "forecast_model.json"

# Prognose im HTML-Report erst ab dieser Spanne ab frühestem Snapshot in slot_snapshots.
FORECAST_UI_MIN_DAYS = 42


def get_forecast_ui_state(db_path=None) -> dict:
    """
    Steuert die Anzeige der Füllungsprognose im Frontend (report.html).

    Rückgabe:
      show          – True ab FORECAST_UI_MIN_DAYS Kalendertagen nach erstem Snapshot
      first_datum   – YYYY-MM-DD oder None
      ab_datum      – erstes Datum, ab dem die Prognose angezeigt wird (YYYY-MM-DD oder None)
      tage_seit_start – ganze Tage seit first_datum (-1 wenn unbekannt)
    """
    p = Path(db_path or DB_PATH)
    out = {
        "show": False,
        "first_datum": None,
        "ab_datum": None,
        "tage_seit_start": -1,
    }
    try:
        conn = sqlite3.connect(p)
        row = conn.execute("SELECT MIN(datum) FROM slot_snapshots").fetchone()
        conn.close()
        if not row or not row[0]:
            return out
        first_s = str(row[0])
        first = datetime.strptime(first_s, "%Y-%m-%d").date()
        heute = datetime.now().date()
        tage = (heute - first).days
        ab = first + timedelta(days=FORECAST_UI_MIN_DAYS)
        out["first_datum"] = first_s
        out["ab_datum"] = ab.strftime("%Y-%m-%d")
        out["tage_seit_start"] = tage
        out["show"] = tage >= FORECAST_UI_MIN_DAYS
        return out
    except Exception:
        return out
    """P(X >= min_count) for Poisson(lam)."""
    if min_count <= 0:
        return 1.0
    if lam <= 0:
        return 0.0
    # P(X >= k) = 1 - sum_{i=0..k-1} e^-lam * lam^i / i!
    cdf = 0.0
    term = math.exp(-lam)  # i=0
    cdf += term
    for i in range(1, min_count):
        term *= lam / i
        cdf += term
    return max(0.0, min(1.0, 1.0 - cdf))


def _confidence_label(score):
    if score >= 0.75:
        return "hoch"
    if score >= 0.45:
        return "mittel"
    return "niedrig"


def init_forecast_table():
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS forecast_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            generated_at TEXT NOT NULL,
            standort TEXT NOT NULL,
            therapeut TEXT NOT NULL,
            horizon_days INTEGER NOT NULL,
            target_slots INTEGER NOT NULL,
            expected_fill REAL NOT NULL,
            prob_fill_target REAL NOT NULL,
            confidence REAL NOT NULL,
            model_version TEXT DEFAULT 'learned_rate_v1'
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS forecast_training_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            trained_at TEXT NOT NULL,
            lookback_weeks INTEGER NOT NULL,
            samples_total INTEGER NOT NULL,
            entities_trained INTEGER NOT NULL,
            global_daily_fill_rate REAL NOT NULL,
            model_path TEXT NOT NULL,
            model_version TEXT DEFAULT 'learned_rate_v1'
        )"""
    )
    conn.commit()
    conn.close()


def _load_model():
    if not MODEL_PATH.exists():
        return None
    try:
        return json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def get_forecast_model_info():
    """
    Metadaten für Report-Hinweis. `quality`-Stufen:
    no_file       – forecast_model.json fehlt (Training nie gelaufen oder anderer Host)
    empty_model   – Datei da, aber 0 trainierbare Wochenpaare (zu wenig/karge Historie)
    low_samples   – Modell da, aber <20 Wochenpaaren (Banner bis genug Daten da sind)
    ok            – ausreichend Samples für stabilere Prognose
    """
    if not MODEL_PATH.exists():
        return {
            "available": False,
            "total_samples": 0,
            "entities_trained": 0,
            "trained_at": None,
            "quality": "no_file",
        }
    model = _load_model()
    if not model:
        return {
            "available": False,
            "total_samples": 0,
            "entities_trained": 0,
            "trained_at": None,
            "quality": "no_file",
        }
    ts = int(model.get("total_samples", 0))
    et = int(model.get("entities_trained", 0))
    if ts <= 0:
        q = "empty_model"
    elif ts < 20:
        q = "low_samples"
    else:
        q = "ok"
    return {
        "available": True,
        "total_samples": ts,
        "entities_trained": et,
        "trained_at": model.get("trained_at"),
        "quality": q,
    }


def _week_start(date_str):
    d = datetime.strptime(date_str, "%Y-%m-%d").date()
    return d - timedelta(days=d.weekday())


def _build_weekly_series(conn, lookback_weeks=26):
    since = (datetime.now().date() - timedelta(weeks=lookback_weeks + 2)).strftime("%Y-%m-%d")
    rows = conn.execute(
        """
        SELECT standort, therapeut, datum, id,
               COALESCE(slots_kw0, naechste_7d, 0) as slots_kw0,
               COALESCE(slots_kw1, naechste_14d - naechste_7d, 0) as slots_kw1
        FROM slot_snapshots
        WHERE datum >= ? AND scrape_ok = 1
        ORDER BY standort, therapeut, datum ASC, id ASC
        """,
        (since,),
    ).fetchall()

    weekly_latest = {}
    for r in rows:
        key = (r["standort"], r["therapeut"])
        wstart = _week_start(r["datum"]).strftime("%Y-%m-%d")
        wk = (key, wstart)
        weekly_latest[wk] = {
            "standort": r["standort"],
            "therapeut": r["therapeut"],
            "week_start": wstart,
            "slots_kw0": int(r["slots_kw0"] or 0),
            "slots_kw1": int(r["slots_kw1"] or 0),
        }

    by_key = {}
    for (_, _), item in weekly_latest.items():
        key = (item["standort"], item["therapeut"])
        by_key.setdefault(key, []).append(item)

    for key in by_key:
        by_key[key].sort(key=lambda x: x["week_start"])
    return by_key


def train_week_fill_model(lookback_weeks=26, shrink_k=5):
    """
    Lernt aus historischen Wochen:
    start_slots (kw1 der Vorwoche) -> wie viele davon in der Zielwoche gefüllt wurden.
    """
    init_forecast_table()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    series = _build_weekly_series(conn, lookback_weeks=lookback_weeks)
    samples = []

    for key, weeks in series.items():
        for i in range(len(weeks) - 1):
            w = weeks[i]
            nxt = weeks[i + 1]
            target_slots = max(0, int(w["slots_kw1"]))
            if target_slots <= 0:
                continue
            remaining = max(0, int(nxt["slots_kw0"]))
            filled = max(0, target_slots - remaining)
            samples.append({
                "key": key,
                "target_slots": target_slots,
                "filled_slots": min(filled, target_slots),
            })

    if samples:
        global_daily_rate = sum(s["filled_slots"] for s in samples) / (len(samples) * 7.0)
    else:
        global_daily_rate = 0.0

    grouped = {}
    for s in samples:
        grouped.setdefault(s["key"], []).append(s)

    per_key = {}
    for key, rows in grouped.items():
        local_daily = sum(r["filled_slots"] for r in rows) / (len(rows) * 7.0)
        n = len(rows)
        # Bayesian Shrinkage Richtung globalem Mittel.
        learned_daily = ((shrink_k * global_daily_rate) + (n * local_daily)) / (shrink_k + n)
        per_key[f"{key[0]}|{key[1]}"] = {
            "daily_fill_rate": learned_daily,
            "samples": n,
        }

    model = {
        "version": "learned_rate_v1",
        "trained_at": datetime.now().strftime("%Y-%m-%dT%H:%M:%S"),
        "lookback_weeks": lookback_weeks,
        "global_daily_fill_rate": global_daily_rate,
        "total_samples": len(samples),
        "entities_trained": len(per_key),
        "per_key": per_key,
    }
    MODEL_PATH.write_text(json.dumps(model, ensure_ascii=False, indent=2), encoding="utf-8")

    conn.execute(
        """INSERT INTO forecast_training_runs
            (trained_at, lookback_weeks, samples_total, entities_trained, global_daily_fill_rate, model_path)
           VALUES (?,?,?,?,?,?)""",
        (
            model["trained_at"],
            lookback_weeks,
            model["total_samples"],
            model["entities_trained"],
            model["global_daily_fill_rate"],
            str(MODEL_PATH),
        ),
    )
    conn.commit()
    conn.close()
    return model


def get_week_fill_forecasts(lookback_days=56, horizon_days=7):
    """
    Gibt Prognosen pro (standort, therapeut) zurück:
    Wahrscheinlichkeit, dass freie Slots der nächsten Woche gefüllt werden.
    """
    init_forecast_table()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row

    model = _load_model()
    if not model:
        model = train_week_fill_model(lookback_weeks=max(8, lookback_days // 7))
    since = (datetime.now().date() - timedelta(days=lookback_days)).strftime("%Y-%m-%d")

    latest_rows = conn.execute(
        """
        SELECT s1.standort, s1.therapeut,
               COALESCE(s1.slots_kw1, s1.naechste_14d - s1.naechste_7d, 0) as target_slots
        FROM slot_snapshots s1
        JOIN (
            SELECT standort, therapeut, MAX(id) as max_id
            FROM slot_snapshots
            GROUP BY standort, therapeut
        ) latest
        ON latest.max_id = s1.id
        """
    ).fetchall()

    booking_rows = conn.execute(
        """
        SELECT standort, therapeut,
               SUM(ABS(COALESCE(delta, 0))) as buchungen,
               COUNT(*) as booking_events
        FROM slot_changes
        WHERE datum >= ? AND change_typ='BUCHUNG'
        GROUP BY standort, therapeut
        """,
        (since,),
    ).fetchall()

    obs_rows = conn.execute(
        """
        SELECT standort, therapeut, COUNT(DISTINCT datum) as obs_days
        FROM slot_observations
        WHERE datum >= ?
        GROUP BY standort, therapeut
        """,
        (since,),
    ).fetchall()

    booking_map = {(r["standort"], r["therapeut"]): dict(r) for r in booking_rows}
    obs_map = {(r["standort"], r["therapeut"]): dict(r) for r in obs_rows}

    generated_at = datetime.now().strftime("%Y-%m-%dT%H:%M:%S")
    result = {}

    for row in latest_rows:
        key = (row["standort"], row["therapeut"])
        target_slots = max(0, int(row["target_slots"] or 0))

        model_key = f"{row['standort']}|{row['therapeut']}"
        learned = (model.get("per_key") or {}).get(model_key, {})
        learned_rate = float(learned.get("daily_fill_rate", model.get("global_daily_fill_rate", 0.0)))
        learned_samples = int(learned.get("samples", 0))

        # Fallback-Signal aus jüngsten Änderungen (hilft bei driftenden Mustern).
        b = booking_map.get(key, {})
        o = obs_map.get(key, {})
        total_bookings = int(b.get("buchungen") or 0)
        booking_events = int(b.get("booking_events") or 0)
        obs_days = int(o.get("obs_days") or 0)
        recent_rate = (total_bookings / obs_days) if obs_days > 0 else learned_rate

        blend = 0.75 if learned_samples >= 4 else 0.5
        daily_rate = blend * learned_rate + (1.0 - blend) * recent_rate
        expected_fill = daily_rate * horizon_days
        prob_fill_target = _poisson_prob_ge(target_slots, expected_fill)

        # Confidence steigt mit Trainingssamples, Beobachtungstagen und Events.
        conf_train = min(1.0, learned_samples / 12.0)
        conf_obs = min(1.0, obs_days / 21.0)
        conf_evt = min(1.0, booking_events / 20.0)
        confidence = (0.5 * conf_train) + (0.3 * conf_obs) + (0.2 * conf_evt)

        result[key] = {
            "target_slots": target_slots,
            "expected_fill": round(expected_fill, 1),
            "prob_fill_target_pct": round(prob_fill_target * 100, 1),
            "confidence": round(confidence, 2),
            "confidence_label": _confidence_label(confidence),
            "learned_samples": learned_samples,
            "obs_days": obs_days,
            "booking_events": booking_events,
        }

        conn.execute(
            """INSERT INTO forecast_scores
                (generated_at, standort, therapeut, horizon_days, target_slots,
                 expected_fill, prob_fill_target, confidence)
               VALUES (?,?,?,?,?,?,?,?)""",
            (
                generated_at,
                row["standort"],
                row["therapeut"],
                horizon_days,
                target_slots,
                expected_fill,
                prob_fill_target,
                confidence,
            ),
        )

    conn.commit()
    conn.close()
    return result
