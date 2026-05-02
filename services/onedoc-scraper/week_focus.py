"""
Ab Freitag 18:00 (Europe/Zurich bzw. REPORT_TZ/MAIL_TZ) sowie Sa/So:
Vier Spalten = die nächsten vier vollen Kalenderwochen (API KW1–KW4).
Die laufende Woche (KW0) ist für das Wochenend-Planning ausgeblendet.
Dafür liefert der Scraper eine zusätzliche KW4-Zählung in der DB.
"""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta

try:
    from zoneinfo import ZoneInfo
except ImportError:
    ZoneInfo = None  # type: ignore


def report_timezone_name() -> str:
    return os.environ.get("REPORT_TZ") or os.environ.get("MAIL_TZ") or "Europe/Zurich"


def _zone():
    name = report_timezone_name()
    if ZoneInfo is None:
        return None, name
    try:
        return ZoneInfo(name), name
    except Exception:
        return None, name


def reporting_now() -> datetime:
    tz, _ = _zone()
    if tz is not None:
        return datetime.now(tz)
    return datetime.now()


def reporting_today() -> date:
    return reporting_now().date()


def weekend_week_focus_active(at: datetime | None = None) -> bool:
    """
    True ab Freitag 18:00 sowie ganz Samstag und Sonntag (in REPORT_TZ/MAIL_TZ).
    """
    tz, _ = _zone()
    if at is None:
        now = reporting_now()
    elif tz is not None and at.tzinfo is None:
        now = at.replace(tzinfo=tz)
    elif tz is not None:
        now = at.astimezone(tz)
    else:
        now = at
    wd = now.weekday()
    hr = now.hour
    if wd == 4 and hr >= 18:
        return True
    if wd in (5, 6):
        return True
    return False


def focus_week_labels(today: date, use_focus: bool) -> list[str]:
    monday_this = today - timedelta(days=today.weekday())
    start = monday_this + timedelta(days=7) if use_focus else monday_this
    return [f"Woche von {(start + timedelta(days=7 * i)).strftime('%d.%m.')}" for i in range(4)]


def rotate_slots_row(rec: dict) -> dict:
    """Wochenend-Fokus: Anzeige-Spalten = API KW1…KW4 (ohne laufende KW0)."""
    out = dict(rec)
    k1 = int(rec.get("slots_kw1") or 0)
    k2 = int(rec.get("slots_kw2") or 0)
    k3 = int(rec.get("slots_kw3") or 0)
    k4 = int(rec.get("slots_kw4") or 0)
    out["slots_kw0"] = k1
    out["slots_kw1"] = k2
    out["slots_kw2"] = k3
    out["slots_kw3"] = k4
    return out


def rotate_stats_list(stats: list) -> list:
    return [rotate_slots_row(s) for s in stats]


def rotate_multi_standort(multi_standort: dict) -> dict:
    if not multi_standort:
        return multi_standort
    out = {}
    for name, m in multi_standort.items():
        ps = [rotate_slots_row(e) for e in m["per_standort"]]
        out[name] = {
            **m,
            "per_standort": ps,
            "slots_kw0_total": sum(int(e["slots_kw0"] or 0) for e in ps),
            "slots_kw1_total": sum(int(e["slots_kw1"] or 0) for e in ps),
            "slots_kw2_total": sum(int(e["slots_kw2"] or 0) for e in ps),
            "slots_kw3_total": sum(int(e["slots_kw3"] or 0) for e in ps),
        }
    return out
