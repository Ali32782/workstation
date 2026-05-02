#!/usr/bin/env python3
"""
discover_diff.py — runs OneDoc discovery and alerts on new/removed therapists.

Approach:
  1. Read the current `praxen_config.json` (active baseline).
  2. Re-run `discover_all_v2.discover_therapeuten()` (which fetches every
     Kineo OneDoc practice page, follows each therapist profile link, parses
     prof_id + calendar_id, and writes the result back to praxen_config.json).
  3. Diff baseline vs. fresh: any new entry is logged + announced to
     Rocket.Chat (when ROCKETCHAT_DISCOVERY_WEBHOOK is set) + recorded in the
     `discovery_log` SQLite table.
  4. Removed entries are logged but not auto-deactivated — a therapist may
     simply be on vacation, and the existing fail-streak logic in
     discovery.sync_api_therapeuten handles the slow inactivation case.

This script is *not* a replacement for the slot scraper (`scraper_api.py`); it
is a once-a-day reconciliation step. New therapists still need their prof_id
and calendar_id added to the hardcoded `PRAXEN` list in `scraper_api.py` for
the slot scraping to pick them up — the alert email/Rocket.Chat message
includes a copy-paste-ready snippet for that.

Run manually:   python3 discover_diff.py
Run via timer:  systemd unit `onedoc-discovery.timer` (06:30 daily)
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).parent
PRAXEN_FILE = ROOT / "praxen_config.json"
DB_PATH = ROOT / "slots.db"
LOG_PATH = ROOT / "logs" / "discover_diff.log"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(), logging.FileHandler(LOG_PATH)],
)
log = logging.getLogger("discover_diff")


def _flatten(praxen: list[dict]) -> dict[tuple[str, str], dict]:
    """
    Flatten praxen_config to a dict keyed by (standort, prof_id) so we can
    diff stably. We deliberately key on prof_id (not name) so a therapist
    rename does not register as "removed + added".
    """
    out: dict[tuple[str, str], dict] = {}
    for p in praxen:
        standort = p.get("standort", "")
        for t in p.get("therapeuten", []):
            prof_id = str(t.get("prof_id") or "").strip()
            if not prof_id:
                continue
            out[(standort, prof_id)] = {
                "standort": standort,
                "name": t.get("name", "").strip(),
                "prof_id": prof_id,
                "calendar_id": str(t.get("calendar_id") or "").strip(),
                "url": t.get("url", ""),
                "entity_id": p.get("entity_id", ""),
            }
    return out


def _read_baseline() -> list[dict]:
    if not PRAXEN_FILE.exists():
        log.warning("praxen_config.json fehlt — Baseline ist leer")
        return []
    try:
        return json.loads(PRAXEN_FILE.read_text())
    except Exception as exc:
        log.error("praxen_config.json kaputt (%s) — Baseline leer behandelt", exc)
        return []


def _post_rocketchat(text: str) -> None:
    webhook = os.environ.get("ROCKETCHAT_DISCOVERY_WEBHOOK", "").strip()
    if not webhook:
        log.info("Kein ROCKETCHAT_DISCOVERY_WEBHOOK gesetzt — überspringe Notification")
        return
    body = json.dumps({"text": text}).encode("utf-8")
    req = urllib.request.Request(
        webhook,
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as resp:
            log.info("Rocket.Chat-Notification gesendet (status=%s)", resp.status)
    except urllib.error.URLError as exc:
        log.error("Rocket.Chat-Notification fehlgeschlagen: %s", exc)


def _record_in_db(events: list[dict]) -> None:
    """Append discovery events to the `discovery_log` table (created by discovery.py)."""
    if not events:
        return
    try:
        from discovery import init_discovery_tables, log_ereignis  # type: ignore
    except Exception as exc:
        log.error("Konnte discovery.py nicht importieren: %s", exc)
        return
    init_discovery_tables()
    datum = datetime.now().strftime("%Y-%m-%d")
    for ev in events:
        log_ereignis(
            datum=datum,
            ereignis=ev["ereignis"],
            standort=ev.get("standort"),
            therapeut=ev.get("therapeut"),
            url=ev.get("url"),
            details=json.dumps(ev.get("details", {}), ensure_ascii=False),
        )


def _format_alert(added: list[dict], removed: list[dict]) -> str:
    lines: list[str] = []
    if added:
        lines.append(f"*{len(added)} neue Therapeut/in via OneDoc-Discovery erkannt:*")
        for t in added:
            lines.append(
                f"• {t['name']} @ {t['standort']} "
                f"— `prof_id={t['prof_id']} cal_id={t['calendar_id']}`"
            )
        lines.append("")
        lines.append("Damit Slot-Scraping ihn/sie aufnimmt, in `scraper_api.py` PRAXEN ergänzen:")
        lines.append("```")
        for t in added:
            lines.append(
                f'# {t["standort"]}: {{"name": "{t["name"]}", '
                f'"prof_id": "{t["prof_id"]}", "calendar_id": "{t["calendar_id"]}"}},'
            )
        lines.append("```")
    if removed:
        lines.append("")
        lines.append(f"*{len(removed)} Therapeut/in nicht mehr auf OneDoc-Praxisseite gelistet:*")
        for t in removed:
            lines.append(f"• {t['name']} @ {t['standort']} (prof_id={t['prof_id']})")
        lines.append(
            "_Hinweis: Inaktivierung läuft normalerweise automatisch über fail-streak; "
            "manuelle Aktion nicht zwingend nötig._"
        )
    return "\n".join(lines)


def main() -> int:
    log.info("=== OneDoc Discovery-Diff Start ===")

    baseline = _flatten(_read_baseline())
    log.info("Baseline: %d Therapeut/innen, %d Standorte", len(baseline),
             len({k[0] for k in baseline}))

    # Re-run the discovery (writes praxen_config.json in-place).
    sys.path.insert(0, str(ROOT))
    try:
        import discover_all_v2  # type: ignore
    except Exception as exc:
        log.error("import discover_all_v2 fehlgeschlagen: %s", exc)
        return 2

    try:
        discover_all_v2.discover_therapeuten()
    except Exception as exc:
        log.error("Discovery selbst geworfen: %s", exc)
        return 3

    fresh = _flatten(_read_baseline())
    log.info("Fresh:    %d Therapeut/innen, %d Standorte", len(fresh),
             len({k[0] for k in fresh}))

    added_keys = set(fresh) - set(baseline)
    removed_keys = set(baseline) - set(fresh)

    added = [fresh[k] for k in sorted(added_keys)]
    removed = [baseline[k] for k in sorted(removed_keys)]

    if not added and not removed:
        log.info("Keine Änderungen — alle %d Therapeut/innen unverändert.", len(fresh))
        return 0

    log.info("Diff: +%d / -%d", len(added), len(removed))

    events: list[dict] = []
    for t in added:
        events.append({
            "ereignis": "therapeut_neu_entdeckt",
            "standort": t["standort"],
            "therapeut": t["name"],
            "url": t["url"],
            "details": {"prof_id": t["prof_id"], "calendar_id": t["calendar_id"]},
        })
    for t in removed:
        events.append({
            "ereignis": "therapeut_nicht_mehr_gelistet",
            "standort": t["standort"],
            "therapeut": t["name"],
            "url": t["url"],
            "details": {"prof_id": t["prof_id"]},
        })
    _record_in_db(events)

    alert = _format_alert(added, removed)
    log.info("Alert:\n%s", alert)
    _post_rocketchat(alert)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
