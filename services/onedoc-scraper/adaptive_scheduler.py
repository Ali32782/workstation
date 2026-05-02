import argparse
import json
import logging
import os
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

ROOT = Path(__file__).parent
LOG_PATH = ROOT / "scheduler.log"
STATE_PATH = ROOT / "models" / "training_state.json"
MAIL_STATE_PATH = ROOT / "models" / "mail_state.json"
MAIL_STATE_PATH = ROOT / "models" / "mail_state.json"
TEAMS_STATE_PATH = ROOT / "models" / "teams_state.json"

DAY_START_HOUR = 7
DAY_END_HOUR = 22  # exklusiv: bis 21:59 stündlich
MAIL_TZ_NAME = os.getenv("MAIL_TZ", "Europe/Zurich")


def _parse_weekday_hours(spec: str) -> dict[int, set[int]]:
    """
    Parses schedule like: "0-4:7,13,17;6:18"
    weekday(): Mo=0 ... So=6
    """
    spec = (spec or "").strip().replace("|", ";")
    if len(spec) >= 2 and spec[0] == spec[-1] and spec[0] in ("'", '"'):
        spec = spec[1:-1].strip()

    out: dict[int, set[int]] = {}
    if not spec:
        return out

    for seg in spec.split(";"):
        seg = seg.strip()
        if not seg or ":" not in seg:
            continue
        day_spec, hours_spec = seg.split(":", 1)
        day_spec = day_spec.strip()
        hours_spec = hours_spec.strip()

        days: set[int] = set()
        if "-" in day_spec:
            a, b = day_spec.split("-", 1)
            if a.strip().isdigit() and b.strip().isdigit():
                da = int(a.strip())
                db = int(b.strip())
                if 0 <= da <= 6 and 0 <= db <= 6:
                    if da <= db:
                        days = set(range(da, db + 1))
                    else:
                        days = set(range(da, 7)) | set(range(0, db + 1))
        elif day_spec.isdigit():
            d = int(day_spec)
            if 0 <= d <= 6:
                days = {d}

        hours: set[int] = set()
        for h in hours_spec.split(","):
            h = h.strip()
            if h.isdigit():
                hh = int(h)
                if 0 <= hh <= 23:
                    hours.add(hh)

        if days and hours:
            for d in days:
                out.setdefault(d, set()).update(hours)

    return out


# Mail-Sendezeitplan
# Default (wie vorher Teams): Mo..Fr 07/13/17, So 18
MAIL_SEND_WEEKDAY_HOURS: dict[int, set[int]] = _parse_weekday_hours(
    os.getenv("MAIL_SEND_SCHEDULE", "0-4:7,13,17;6:18")
)

# Teams-Posting-Zeitplan
TEAMS_POST_WEEKDAY_HOURS: dict[int, set[int]] = _parse_weekday_hours(
    os.getenv("TEAMS_POST_SCHEDULE", "0-6:7")
)

if not TEAMS_POST_WEEKDAY_HOURS:
    # Backward-compatible fallback (Mo..Fr + TEAMS_POST_HOURS)
    _raw_teams_hours = (os.getenv("TEAMS_POST_HOURS", "7").strip() or "7")
    _hours = set()
    for _p in _raw_teams_hours.split(","):
        _p = _p.strip()
        if _p.isdigit():
            _h = int(_p)
            if 0 <= _h <= 23:
                _hours.add(_h)
    if not _hours:
        _hours = {7}
    for _d in (0, 1, 2, 3, 4):
        TEAMS_POST_WEEKDAY_HOURS[_d] = set(_hours)


def _resolve_tz():
    try:
        return ZoneInfo(MAIL_TZ_NAME)
    except ZoneInfoNotFoundError:
        return None


LOCAL_TZ = _resolve_tz()


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(LOG_PATH)],
)
log = logging.getLogger(__name__)


def now_local():
    if LOCAL_TZ is None:
        return datetime.now()
    return datetime.now(LOCAL_TZ)


def run_pipeline(open_report=False):
    """Führt Scraper + Report in fester Reihenfolge aus."""
    # Mail-Zeitslot nach Startstunde (nicht nach Ende): sonst entfällt die 7:00-Mail,
    # wenn Scraper+Report länger als bis zur nächsten vollen Stunde laufen.
    pipeline_started = now_local()
    mail_slot_key = pipeline_started.strftime("%Y-%m-%d %H")
    log.info("Pipeline start (mail_slot=%s)", mail_slot_key)
    subprocess.run(["python3", "scraper_api.py", "--all"], cwd=ROOT, check=True)
    run_training_if_due()
    subprocess.run(["python3", "reporting.py"], cwd=ROOT, check=True)
    # Browser vom Hauptprozess öffnen (nicht aus reporting-Kindprozess): unter macOS/Cursor
    # reagiert `open` dort zuverlässiger als im Subprocess.
    if open_report:
        try:
            from reporting import _open_report_file

            _open_report_file(ROOT / "report.html")
        except Exception as exc:
            log.warning("Report konnte nicht im Browser geöffnet werden: %s", exc)
    send_mail_if_due(mail_slot_key=mail_slot_key)
    send_teams_if_due(mail_slot_key=mail_slot_key)
    log.info("Pipeline done")


def run_training_if_due():
    """
    Tägliches Re-Training (frühestens ab 02:00), genau einmal pro Kalendertag.
    """
    now = now_local()
    if now.hour < 2:
        return

    STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    last_date = ""
    if STATE_PATH.exists():
        try:
            data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
            last_date = data.get("last_training_date", "")
        except Exception:
            last_date = ""

    today = now.strftime("%Y-%m-%d")
    if last_date == today:
        return

    log.info("Starte tägliches Forecast-Training")
    subprocess.run(["python3", "train_forecast_model.py"], cwd=ROOT, check=True)
    STATE_PATH.write_text(json.dumps({"last_training_date": today}, ensure_ascii=False), encoding="utf-8")
    log.info("Forecast-Training abgeschlossen")


def send_mail_if_due(mail_slot_key=None):
    """
    Versandzeiten gemäß `MAIL_SEND_SCHEDULE` (Startstunde des Pipeline-Laufs, Europe/Zurich).
    Pro Slot maximal eine Mail (auch bei Neustarts).
    """
    now = now_local()
    slot_key = mail_slot_key if mail_slot_key is not None else now.strftime("%Y-%m-%d %H")
    try:
        slot_hour = int(slot_key.split()[1], 10)
    except (IndexError, ValueError):
        slot_hour = now.hour

    allowed_hours = MAIL_SEND_WEEKDAY_HOURS.get(now.weekday())
    if not allowed_hours:
        return
    if slot_hour not in allowed_hours:
        return

    MAIL_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    last_slot = ""
    if MAIL_STATE_PATH.exists():
        try:
            data = json.loads(MAIL_STATE_PATH.read_text(encoding="utf-8"))
            last_slot = data.get("last_mail_slot", "")
        except Exception:
            last_slot = ""

    if last_slot == slot_key:
        return

    log.info("Sende Reporting-Mail (Slot %s:00)", slot_hour)
    res = subprocess.run(["python3", "email_report.py"], cwd=ROOT, check=False)
    if res.returncode != 0:
        log.error("Reporting-Mail fehlgeschlagen (exit=%s).", res.returncode)
        return
    MAIL_STATE_PATH.write_text(json.dumps({"last_mail_slot": slot_key}, ensure_ascii=False), encoding="utf-8")
    log.info("Reporting-Mail versendet")


def send_teams_if_due(mail_slot_key=None):
    """
    Teams-Posting gemäß `TEAMS_POST_SCHEDULE` (oder Fallback via `TEAMS_POST_HOURS`).
    """
    now = now_local()
    slot_key = mail_slot_key if mail_slot_key is not None else now.strftime("%Y-%m-%d %H")
    try:
        slot_hour = int(slot_key.split()[1], 10)
    except (IndexError, ValueError):
        slot_hour = now.hour

    allowed_hours = TEAMS_POST_WEEKDAY_HOURS.get(now.weekday())
    if not allowed_hours:
        return
    if slot_hour not in allowed_hours:
        return

    TEAMS_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
    last_slot = ""
    if TEAMS_STATE_PATH.exists():
        try:
            data = json.loads(TEAMS_STATE_PATH.read_text(encoding="utf-8"))
            last_slot = data.get("last_teams_slot", "")
        except Exception:
            last_slot = ""

    if last_slot == slot_key:
        return

    log.info("Sende Teams-Post (Slot %s:00)", slot_hour)
    res = subprocess.run(["python3", "teams_report.py"], cwd=ROOT, check=False)
    if res.returncode != 0:
        log.error("Teams-Post fehlgeschlagen (exit=%s).", res.returncode)
        return
    TEAMS_STATE_PATH.write_text(
        json.dumps({"last_teams_slot": slot_key}, ensure_ascii=False),
        encoding="utf-8",
    )
    log.info("Teams-Post versendet")


def is_daytime(now):
    return DAY_START_HOUR <= now.hour < DAY_END_HOUR


def next_run_at(now):
    """Berechnet den nächsten Trigger-Zeitpunkt (volle Stunde oder 3h-Raster)."""
    on_hour = now.replace(minute=0, second=0, microsecond=0)
    if now.minute == 0 and now.second == 0 and now.microsecond == 0:
        base = on_hour
    else:
        base = on_hour + timedelta(hours=1)

    # Wichtig: Für die Tagesschwelle betrachten wir den "naechsten vollen Stunden-Takt"
    # (also `base`) und nicht nur `now`. Sonst kann es beim Uebergang 06:xx -> 07:00
    # passieren, dass der 07:00-Slot uebersprungen wird.
    if is_daytime(base):
        # Tagsüber jede volle Stunde.
        return base

    # Nachts auf 3h-Raster: 00:00, 03:00, 06:00, ...
    h = base.hour
    next_h = ((h + 2) // 3) * 3
    day_shift = 0
    if next_h >= 24:
        next_h -= 24
        day_shift = 1
    return base.replace(hour=next_h, minute=0, second=0, microsecond=0) + timedelta(days=day_shift)


def loop(run_immediately=True):
    if run_immediately:
        try:
            run_pipeline(open_report=False)
        except subprocess.CalledProcessError as exc:
            log.error("Pipeline failed (exit=%s)", exc.returncode)

    while True:
        now = now_local()
        nxt = next_run_at(now)
        sleep_s = max(1, int((nxt - now).total_seconds()))
        mode = "stündlich" if is_daytime(now) else "alle 3 Stunden"
        log.info("Nächster Lauf: %s (%s, in %ss)", nxt.strftime("%Y-%m-%d %H:%M:%S"), mode, sleep_s)
        time.sleep(sleep_s)
        try:
            run_pipeline(open_report=False)
        except subprocess.CalledProcessError as exc:
            log.error("Pipeline failed (exit=%s)", exc.returncode)


def main():
    parser = argparse.ArgumentParser(description="Adaptiver Scheduler für Scraper + Report")
    parser.add_argument("--once", action="store_true", help="Nur einen Lauf ausführen und beenden")
    parser.add_argument("--no-immediate", action="store_true", help="Nicht sofort laufen, erst zum nächsten Slot")
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Bei --once: report.html nicht im Browser öffnen",
    )
    args = parser.parse_args()
    tz_label = MAIL_TZ_NAME if LOCAL_TZ is not None else "system-local (MAIL_TZ ungültig)"
    log.info("Scheduler Zeitzone: %s", tz_label)

    if args.once:
        run_pipeline(open_report=not args.no_open)
        return

    loop(run_immediately=not args.no_immediate)


if __name__ == "__main__":
    main()
