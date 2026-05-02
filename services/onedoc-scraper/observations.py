import ast
import json
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from collections import defaultdict

DB_PATH = Path(__file__).parent / "slots.db"

def init_observation_tables():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""CREATE TABLE IF NOT EXISTS slot_observations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        gemessen_am TEXT NOT NULL, datum TEXT NOT NULL, uhrzeit TEXT NOT NULL,
        standort TEXT NOT NULL, therapeut TEXT NOT NULL,
        freie_slots INTEGER NOT NULL, slots_detail TEXT,
        scrape_ok INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS slot_changes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        erkannt_am TEXT NOT NULL, datum TEXT NOT NULL,
        standort TEXT NOT NULL, therapeut TEXT NOT NULL,
        change_typ TEXT NOT NULL, anzahl INTEGER DEFAULT 1,
        vorher_slots INTEGER, nachher_slots INTEGER, delta INTEGER,
        created_at TEXT DEFAULT (datetime('now')))""")
    conn.execute("""CREATE TABLE IF NOT EXISTS alerts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        datum TEXT NOT NULL, alert_typ TEXT NOT NULL,
        standort TEXT, therapeut TEXT, message TEXT NOT NULL,
        gesendet INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')))""")
    conn.commit(); conn.close()


def _kw0_kw3_date_windows(anchor: date) -> list[tuple[date, date]]:
    """Kalenderwochen 0–3 wie im API-Scraper (Mo=0)."""
    wd = anchor.weekday()
    kw0_start = anchor
    kw0_end = anchor + timedelta(days=6 - wd)
    wins = [(kw0_start, kw0_end)]
    cur_end = kw0_end
    for _ in range(3):
        ns = cur_end + timedelta(days=1)
        ne = ns + timedelta(days=6)
        wins.append((ns, ne))
        cur_end = ne
    return wins


def _slot_keys_in_kw0_kw3(keys, anchor: date) -> set[str]:
    if not keys:
        return set()
    windows = _kw0_kw3_date_windows(anchor)
    out: set[str] = set()
    for k in keys:
        if "|" not in k:
            continue
        ds, _ = k.split("|", 1)
        try:
            d = datetime.strptime(ds, "%Y-%m-%d").date()
        except ValueError:
            continue
        for ws, we in windows:
            if ws <= d <= we:
                out.add(k)
                break
    return out


def _parse_obs_detail(raw) -> tuple[dict, list[str]]:
    if raw is None:
        return {}, []
    s = raw.decode("utf-8", errors="ignore") if isinstance(raw, bytes) else str(raw)
    s = s.strip()
    if not s:
        return {}, []
    try:
        o = json.loads(s)
        if isinstance(o, dict):
            days = o.get("days") if isinstance(o.get("days"), dict) else {}
            keys = o.get("keys", [])
            if not isinstance(keys, list):
                keys = []
            return days, [str(x) for x in keys if x is not None]
    except json.JSONDecodeError:
        pass
    try:
        d = ast.literal_eval(s)
        if isinstance(d, dict):
            if "keys" in d and isinstance(d.get("keys"), list):
                days = d.get("days") if isinstance(d.get("days"), dict) else {}
                return days, [str(x) for x in d["keys"] if x is not None]
            return d, []
    except (ValueError, SyntaxError):
        pass
    return {}, []


def _encode_detail_payload(slots_detail) -> str:
    if slots_detail is None:
        return json.dumps({"days": {}, "keys": []}, ensure_ascii=False)
    if isinstance(slots_detail, str):
        try:
            json.loads(slots_detail)
            return slots_detail
        except json.JSONDecodeError:
            return json.dumps({"days": {}, "keys": []}, ensure_ascii=False)
    if isinstance(slots_detail, dict) and "keys" in slots_detail:
        days = slots_detail.get("days") or {}
        keys = slots_detail.get("keys") or []
        if not isinstance(days, dict):
            days = {}
        if not isinstance(keys, list):
            keys = []
        return json.dumps(
            {"days": dict(days), "keys": [str(x) for x in keys if x is not None]},
            ensure_ascii=False,
        )
    return json.dumps({"days": dict(slots_detail), "keys": []}, ensure_ascii=False)


def save_observation(standort, therapeut, freie_slots, slots_detail=None, uhrzeit=None):
    jetzt = datetime.now()
    obs_datum = jetzt.date()
    detail_json = _encode_detail_payload(slots_detail)
    _, curr_keys = _parse_obs_detail(detail_json)

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    vorher = conn.execute("""SELECT freie_slots, slots_detail FROM slot_observations
        WHERE standort=? AND therapeut=?
        ORDER BY gemessen_am DESC LIMIT 1""", (standort, therapeut)).fetchone()
    conn.execute("""INSERT INTO slot_observations
        (gemessen_am, datum, uhrzeit, standort, therapeut, freie_slots, slots_detail)
        VALUES (?,?,?,?,?,?,?)""",
        (jetzt.strftime("%Y-%m-%dT%H:%M:%S"), jetzt.strftime("%Y-%m-%d"),
         uhrzeit or jetzt.strftime("%H:%M"), standort, therapeut, freie_slots, detail_json))
    aenderungen = []
    if vorher:
        vorher_slots = int(vorher["freie_slots"])
        delta = int(freie_slots) - vorher_slots
        if delta != 0:
            change_typ = "ABSAGE" if delta > 0 else "BUCHUNG"
            # Immer 1 Ereignis pro Messwechsel; die echte Differenz steht in delta.
            # Sonst würde SUM(anzahl) im Report „Slots“ statt „Vorgänge“ zählen.
            anzahl = 1
            conn.execute("""INSERT INTO slot_changes
                (erkannt_am, datum, standort, therapeut, change_typ, anzahl, vorher_slots, nachher_slots, delta)
                VALUES (?,?,?,?,?,?,?,?,?)""", (
                    jetzt.strftime("%Y-%m-%dT%H:%M:%S"),
                    jetzt.strftime("%Y-%m-%d"),
                    standort,
                    therapeut,
                    change_typ,
                    anzahl,
                    vorher_slots,
                    int(freie_slots),
                    delta,
                ))
            aenderungen.append({
                "change_typ": change_typ,
                "anzahl": anzahl,
                "vorher_slots": vorher_slots,
                "nachher_slots": int(freie_slots),
                "delta": delta,
            })

        _, prev_keys = _parse_obs_detail(vorher["slots_detail"])
        pk = _slot_keys_in_kw0_kw3(prev_keys, obs_datum)
        ck = _slot_keys_in_kw0_kw3(curr_keys, obs_datum)
        vanished = pk - ck
        buchungen_erkl = max(0, -delta) if delta < 0 else 0
        unexplained = max(0, len(vanished) - buchungen_erkl)
        if unexplained > 0:
            conn.execute("""INSERT INTO slot_changes
                (erkannt_am, datum, standort, therapeut, change_typ, anzahl, vorher_slots, nachher_slots, delta)
                VALUES (?,?,?,?,?,?,?,?,?)""", (
                    jetzt.strftime("%Y-%m-%dT%H:%M:%S"),
                    jetzt.strftime("%Y-%m-%d"),
                    standort,
                    therapeut,
                    "LUECKENVERLUST",
                    unexplained,
                    vorher_slots,
                    int(freie_slots),
                    0,
                ))
            aenderungen.append({
                "change_typ": "LUECKENVERLUST",
                "anzahl": unexplained,
                "vorher_slots": vorher_slots,
                "nachher_slots": int(freie_slots),
                "delta": 0,
            })
    conn.commit(); conn.close()
    return aenderungen

def get_cancellation_stats(tage=28):
    try:
        conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
        seit = (datetime.now() - timedelta(days=tage)).strftime("%Y-%m-%d")
        rows = conn.execute("""SELECT standort, therapeut,
            SUM(CASE WHEN change_typ='ABSAGE' THEN 1 ELSE 0 END) as absagen,
            SUM(CASE WHEN change_typ='BUCHUNG' THEN 1 ELSE 0 END) as buchungen
            FROM slot_changes WHERE datum >= ? GROUP BY standort, therapeut""", (seit,)).fetchall()
        conn.close()
        result = []
        for r in rows:
            gesamt = r["absagen"] + r["buchungen"]
            result.append({"standort": r["standort"], "therapeut": r["therapeut"],
                "absagen": r["absagen"], "buchungen": r["buchungen"],
                "absage_rate": round(r["absagen"]/gesamt*100,1) if gesamt else 0})
        return result
    except: return []

def get_lueckenverlust_stats(tage=28):
    """Summe 'LUECKENVERLUST': Slots, die zwischen zwei Messungen aus der API verschwanden,
    ohne dass die Gesamtzahl freier Slots um entsprechend viele Buchungen sank (Heuristik)."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        seit = (datetime.now() - timedelta(days=tage)).strftime("%Y-%m-%d")
        rows = conn.execute(
            """SELECT standort, therapeut,
                SUM(COALESCE(anzahl, 0)) as luecken_ungefuellt
            FROM slot_changes
            WHERE datum >= ? AND change_typ = 'LUECKENVERLUST'
            GROUP BY standort, therapeut""",
            (seit,),
        ).fetchall()
        conn.close()
        return [
            {
                "standort": r["standort"],
                "therapeut": r["therapeut"],
                "luecken_ungefuellt": int(r["luecken_ungefuellt"] or 0),
            }
            for r in rows
        ]
    except Exception:
        return []


def get_slot_overlap_last_two_map():
    """
    Pro (standort, therapeut): Schnittmenge der Slot-Keys (KW0–3) zwischen den zwei
    letzten Messungen. Anchor-Datum = Kalendertag der neueren Messung (wie bei LUECKENVERLUST).
    So sieht man, wie viele konkrete Termin-Fenster weiterhin frei angeboten wurden.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT standort, therapeut, datum, slots_detail, gemessen_am
            FROM slot_observations
            WHERE COALESCE(scrape_ok, 1) = 1
            ORDER BY standort, therapeut, gemessen_am DESC"""
        ).fetchall()
        conn.close()
    except Exception:
        return {}

    taken: dict[tuple[str, str], int] = {}
    pairs: dict[tuple[str, str], list] = defaultdict(list)
    for r in rows:
        key = (r["standort"], r["therapeut"])
        if taken.get(key, 0) >= 2:
            continue
        pairs[key].append(r)
        taken[key] = taken.get(key, 0) + 1

    out: dict[tuple[str, str], dict] = {}
    for key, lst in pairs.items():
        if len(lst) < 2:
            continue
        new_r, old_r = lst[0], lst[1]
        anchor = datetime.strptime(new_r["datum"], "%Y-%m-%d").date()
        _, k_new = _parse_obs_detail(new_r["slots_detail"])
        _, k_old = _parse_obs_detail(old_r["slots_detail"])
        pk = _slot_keys_in_kw0_kw3(k_old, anchor)
        ck = _slot_keys_in_kw0_kw3(k_new, anchor)
        if not pk and not ck:
            out[key] = {
                "frei_geblieben": None,
                "hat_einzel": False,
                "vorher": 0,
                "jetzt": 0,
            }
        else:
            out[key] = {
                "frei_geblieben": len(pk & ck),
                "hat_einzel": True,
                "vorher": len(pk),
                "jetzt": len(ck),
            }
    return out


def _date_from_slot_key(key: str) -> date | None:
    if not key or "|" not in key:
        return None
    ds = key.split("|", 1)[0].strip()
    try:
        return datetime.strptime(ds, "%Y-%m-%d").date()
    except ValueError:
        return None


def _calendar_prev_week_bounds(anchor: date) -> tuple[date, date]:
    """Abgeschlossene Kalenderwoche direkt vor der Woche, in der `anchor` liegt (Mo–So)."""
    mon_this = anchor - timedelta(days=anchor.weekday())
    prev_mon = mon_this - timedelta(days=7)
    prev_sun = prev_mon + timedelta(days=6)
    return prev_mon, prev_sun


def _analyze_prev_week_rows(rows: list, prev_mon: date, prev_sun: date) -> dict:
    """
    rows: aufsteigend nach gemessen_am, eine(r) Therapeut(in).
    """
    offered: set[str] = set()
    for r in rows:
        try:
            drow = datetime.strptime(r["datum"], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        if not (prev_mon <= drow <= prev_sun):
            continue
        _, keys = _parse_obs_detail(r["slots_detail"])
        for k in keys:
            dk = _date_from_slot_key(k)
            if dk and prev_mon <= dk <= prev_sun:
                offered.add(k)

    in_week = []
    for r in rows:
        try:
            drow = datetime.strptime(r["datum"], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        if prev_mon <= drow <= prev_sun:
            in_week.append(r)

    frei_letzter_scrape = 0
    if in_week:
        last_w = max(in_week, key=lambda x: x["gemessen_am"])
        _, keys_l = _parse_obs_detail(last_w["slots_detail"])
        frei_letzter_scrape = len(
            {
                k
                for k in keys_l
                if (dk := _date_from_slot_key(k)) and prev_mon <= dk <= prev_sun
            }
        )

    ungefuellt: set[str] = set()
    for i in range(len(rows) - 1):
        old, new = rows[i], rows[i + 1]
        try:
            anchor = datetime.strptime(new["datum"], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            continue
        _, ko = _parse_obs_detail(old["slots_detail"])
        _, kn = _parse_obs_detail(new["slots_detail"])
        pk = _slot_keys_in_kw0_kw3(ko, anchor)
        ck = _slot_keys_in_kw0_kw3(kn, anchor)
        vanished = sorted(pk - ck)
        if not vanished:
            continue
        try:
            delta = int(new["freie_slots"]) - int(old["freie_slots"])
        except (TypeError, ValueError):
            delta = 0
        buchungen_erkl = max(0, -delta) if delta < 0 else 0
        unexplained_tail = vanished[buchungen_erkl:]
        for k in unexplained_tail:
            dk = _date_from_slot_key(k)
            if dk and prev_mon <= dk <= prev_sun:
                ungefuellt.add(k)

    hat_einzel = bool(offered or ungefuellt or frei_letzter_scrape)
    return {
        "angeboten": len(offered),
        "frei_letzter_scrape": frei_letzter_scrape,
        "ungefuellt_verschwunden": len(ungefuellt),
        "hat_einzel": hat_einzel,
        "kein_scrape_in_vorwoche": len(in_week) == 0,
    }


def get_prev_week_unfilled_map(anchor: date | None = None) -> dict[tuple[str, str], dict]:
    """
    Analyse der abgeschlossenen Kalender-Vorwoche: Einzel-Slots (Termindatum in Mo–So Vorwoche),
    die in Messungen mit gespeicherten Keys vorkamen.

    - angeboten: Distinct Keys, die mindestens einmal an einem Mess-Tag (Kalendertag) in der
      Vorwoche als frei auftauchten.
    - frei_letzter_scrape: Keys noch frei beim letzten Messpunkt, dessen Kalendertag in der
      Vorwoche liegt (sichtbar „am Ende der Woche“ aus Sicht der Messungen).
    - ungefuellt_verschwunden: Keys, die zwischen zwei Messungen verschwanden, ohne dass
      die ersten N Verschwundenen durch N=-delta (Buchungssignal) erklärt werden
      (N wie bei LUECKENVERLUST; Zuordnung über sortierte Key-Liste).
    """
    anchor_d = anchor or datetime.now().date()
    prev_mon, prev_sun = _calendar_prev_week_bounds(anchor_d)
    load_lo = (prev_mon - timedelta(days=45)).strftime("%Y-%m-%d")
    load_hi = (prev_sun + timedelta(days=21)).strftime("%Y-%m-%d")
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT standort, therapeut, datum, freie_slots, slots_detail, gemessen_am
            FROM slot_observations
            WHERE COALESCE(scrape_ok, 1) = 1 AND datum >= ? AND datum <= ?
            ORDER BY standort, therapeut, gemessen_am ASC""",
            (load_lo, load_hi),
        ).fetchall()
        conn.close()
    except Exception:
        return {}

    by_th: dict[tuple[str, str], list] = defaultdict(list)
    for r in rows:
        by_th[(r["standort"], r["therapeut"])].append(r)

    out: dict[tuple[str, str], dict] = {}
    pm_s = prev_mon.strftime("%Y-%m-%d")
    ps_s = prev_sun.strftime("%Y-%m-%d")
    for key, lst in by_th.items():
        block = _analyze_prev_week_rows(lst, prev_mon, prev_sun)
        block["prev_mon_iso"] = pm_s
        block["prev_sun_iso"] = ps_s
        out[key] = block
    return out


def get_latest_einzelluecken_summary() -> dict:
    """
    Pro Therapeut: Anzahl konkreter freier Zeitfenster (Slot-Keys) im jeweils letzten Scrape,
    gefiltert auf KW0–3 wie beim Speichern. Summe = übergreifende „tatsächliche Lücken“ jetzt.
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            """SELECT o.standort, o.therapeut, o.datum, o.slots_detail
            FROM slot_observations o
            INNER JOIN (
                SELECT standort, therapeut, MAX(id) AS mid
                FROM slot_observations
                WHERE COALESCE(scrape_ok, 1) = 1
                GROUP BY standort, therapeut
            ) u ON u.mid = o.id"""
        ).fetchall()
        conn.close()
    except Exception:
        return {
            "by_pair": {},
            "summe": 0,
            "therapeuten_mit_einzel": 0,
            "therapeuten_ohne_einzel": 0,
        }

    by_pair: dict[tuple[str, str], int] = {}
    mit = 0
    oh = 0
    for r in rows:
        pkey = (r["standort"], r["therapeut"])
        try:
            anchor = datetime.strptime(r["datum"], "%Y-%m-%d").date()
        except (TypeError, ValueError):
            anchor = datetime.now().date()
        _, keys = _parse_obs_detail(r["slots_detail"])
        n = len(_slot_keys_in_kw0_kw3(keys, anchor))
        by_pair[pkey] = n
        if n > 0:
            mit += 1
        else:
            oh += 1
    return {
        "by_pair": by_pair,
        "summe": sum(by_pair.values()),
        "therapeuten_mit_einzel": mit,
        "therapeuten_ohne_einzel": oh,
    }


_TREND_RANK = {"niedrig": 0, "mittel": 1, "hoch": 2}


def _trend_from_near_weeks(near_free):
    """KW0+KW1: 0 freie Slots = Kalender voll -> hohe Auslastung."""
    if near_free <= 0:
        return "hoch"
    if near_free < 5:
        return "mittel"
    return "niedrig"


def _merge_auslastung(trend_obs, near_free):
    """
    Kalender (KW0+KW1) und Intraday-Beobachtung zusammenfuehren.
    Zwei Wochen ohne freie Slots = ausgebucht -> immer hoch (positiv).
    """
    if near_free is None:
        return trend_obs
    if near_free == 0:
        return "hoch"
    trend_snap = _trend_from_near_weeks(near_free)
    ro = _TREND_RANK.get(trend_obs, 1)
    rs = _TREND_RANK.get(trend_snap, 1)
    blended = round(0.55 * rs + 0.45 * ro)
    blended = max(0, min(2, blended))
    return ["niedrig", "mittel", "hoch"][blended]


def get_fill_speed(tage=28):
    try:
        conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
        seit = (datetime.now() - timedelta(days=tage)).strftime("%Y-%m-%d")
        rows = conn.execute("""SELECT datum, standort, therapeut,
            MIN(freie_slots) as min_slots, MAX(freie_slots) as max_slots,
            MAX(freie_slots)-MIN(freie_slots) as tages_delta, COUNT(*) as messungen
            FROM slot_observations WHERE datum >= ? AND scrape_ok=1
            GROUP BY datum, standort, therapeut HAVING messungen >= 1""", (seit,)).fetchall()
        buchungen = conn.execute("""SELECT standort, therapeut,
            SUM(ABS(COALESCE(delta, 0))) as total_buchungen
            FROM slot_changes
            WHERE datum >= ? AND change_typ='BUCHUNG'
            GROUP BY standort, therapeut""", (seit,)).fetchall()
        snap_rows = conn.execute("""
            SELECT s1.standort, s1.therapeut,
                COALESCE(s1.slots_kw0, 0) + COALESCE(s1.slots_kw1, 0) AS near_free
            FROM slot_snapshots s1
            JOIN (
                SELECT standort, therapeut, MAX(id) AS max_id
                FROM slot_snapshots
                GROUP BY standort, therapeut
            ) latest ON latest.max_id = s1.id
        """).fetchall()
        conn.close()
        by_th = defaultdict(list)
        for r in rows:
            by_th[(r["standort"], r["therapeut"])].append(dict(r))
        buchungen_map = {(r["standort"], r["therapeut"]): (r["total_buchungen"] or 0) for r in buchungen}
        near_map = {(r["standort"], r["therapeut"]): int(r["near_free"] or 0) for r in snap_rows}

        result = []
        for (standort, therapeut), tage_data in by_th.items():
            avg_min = sum(d["min_slots"] for d in tage_data) / len(tage_data)
            total_buchungen = buchungen_map.get((standort, therapeut), 0)
            trend_obs = "hoch" if avg_min < 2 else ("mittel" if avg_min < 5 else "niedrig")
            key = (standort, therapeut)
            near_free = near_map.get(key)
            trend = _merge_auslastung(trend_obs, near_free)
            result.append({
                "standort": standort,
                "therapeut": therapeut,
                "avg_buchungen_pro_tag": round(total_buchungen / max(tage, 1), 1),
                "avg_min_slots": round(avg_min, 1),
                "auslastung_trend": trend,
            })

        seen = {(x["standort"], x["therapeut"]) for x in result}
        for key, near_free in near_map.items():
            if key in seen:
                continue
            standort, therapeut = key
            total_buchungen = buchungen_map.get(key, 0)
            result.append({
                "standort": standort,
                "therapeut": therapeut,
                "avg_buchungen_pro_tag": round(total_buchungen / max(tage, 1), 1),
                "avg_min_slots": 0.0,
                "auslastung_trend": _trend_from_near_weeks(near_free),
            })
        return result
    except: return []

def get_intraday_verlauf(standort, therapeut, tage=7):
    try:
        conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
        seit = (datetime.now() - timedelta(days=tage)).strftime("%Y-%m-%d")
        rows = conn.execute("""SELECT datum, uhrzeit, freie_slots FROM slot_observations
            WHERE standort=? AND therapeut=? AND datum>=? AND scrape_ok=1
            ORDER BY gemessen_am""", (standort, therapeut, seit)).fetchall()
        conn.close(); return [dict(r) for r in rows]
    except: return []

def get_pending_alerts():
    try:
        conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM alerts WHERE gesendet=0 ORDER BY created_at DESC").fetchall()
        conn.close(); return [dict(r) for r in rows]
    except: return []

def get_tages_summary(datum=None):
    datum = datum or datetime.now().strftime("%Y-%m-%d")
    try:
        conn = sqlite3.connect(DB_PATH); conn.row_factory = sqlite3.Row
        changes = conn.execute("""SELECT standort, therapeut, change_typ, COUNT(*) as total
            FROM slot_changes WHERE datum=? GROUP BY standort, therapeut, change_typ""", (datum,)).fetchall()
        latest = conn.execute("""SELECT standort, therapeut, freie_slots, uhrzeit
            FROM slot_observations s1 WHERE datum=? AND gemessen_am=(
            SELECT MAX(gemessen_am) FROM slot_observations s2
            WHERE s2.standort=s1.standort AND s2.therapeut=s1.therapeut AND s2.datum=?)
            ORDER BY standort, therapeut""", (datum, datum)).fetchall()
        conn.close()
        return {"datum": datum, "changes": [dict(c) for c in changes], "latest": [dict(o) for o in latest]}
    except: return {"datum": datum, "changes": [], "latest": []}

def mark_alerts_gesendet(ids):
    if not ids: return
    conn = sqlite3.connect(DB_PATH)
    conn.execute(f"UPDATE alerts SET gesendet=1 WHERE id IN ({','.join('?'*len(ids))})", ids)
    conn.commit(); conn.close()
