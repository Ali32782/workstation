"""
OneDoc Slot Reporting
Liest die gesammelten Daten aus der SQLite-DB und erstellt
Statistiken + HTML-Report pro Therapeut und Standort.
"""

from week_focus import (
    focus_week_labels,
    reporting_now,
    reporting_today,
    rotate_multi_standort,
    rotate_stats_list,
    weekend_week_focus_active,
    report_timezone_name,
)
from observations import get_cancellation_stats, get_fill_speed, get_intraday_verlauf
from forecasting import get_forecast_model_info, get_forecast_ui_state, get_week_fill_forecasts
import sqlite3
import json
import os
import re
import subprocess
import sys
import webbrowser
from datetime import date, datetime, timedelta
from pathlib import Path
from collections import defaultdict

DB_PATH = Path(__file__).parent / "slots.db"
REPORT_PATH = Path(__file__).parent / "report.html"


def _open_report_file(path: Path) -> bool:
    """
    Öffnet report.html im Standard-Browser.
    Gibt True zurück, wenn mindestens ein Versuch gemacht wurde (macOS: open liefert oft 0).
    """
    path = path.resolve()
    if not path.is_file():
        print(f"Hinweis: Datei fehlt: {path}", file=sys.stderr)
        return False

    uri = path.as_uri()
    env = os.environ.copy()

    def _darwin_open() -> bool:
        # Eigenständige Session: hilft, wenn der Aufruf aus einem Kindprozess (IDE/Scheduler) kommt
        for cmd in (
            ["/usr/bin/open", str(path)],
            ["/usr/bin/open", "-a", "Safari", str(path)],
        ):
            try:
                p = subprocess.Popen(
                    cmd,
                    env=env,
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                    start_new_session=True,
                )
                p.wait(timeout=30)
                if p.returncode == 0:
                    return True
            except (OSError, subprocess.TimeoutExpired):
                continue
        try:
            if webbrowser.open(uri):
                return True
        except Exception:
            pass
        return False

    ok = False
    try:
        if sys.platform == "darwin":
            ok = _darwin_open()
        elif os.name == "nt":
            os.startfile(str(path))
            ok = True
        else:
            ok = bool(webbrowser.open(uri))
    except Exception as exc:
        print(f"Hinweis: Browser konnte nicht gestartet werden ({exc})", file=sys.stderr)
        ok = False

    if not ok:
        print(
            f"Hinweis: Report manuell öffnen:\n  {uri}\n"
            f"Oder im Terminal: open '{path}'",
            file=sys.stderr,
        )
    else:
        print(f"Report im Browser geöffnet (oder Standard-App): {path}")
    return ok


def _safe_dom_id(*parts):
    raw = "_".join(str(p) for p in parts)
    return re.sub(r"[^a-zA-Z0-9_-]", "_", raw)[:120]


_WD_DE_SHORT = ("Mo", "Di", "Mi", "Do", "Fr", "Sa", "So")


def _api_kw_windows(anchor: date) -> list[tuple[date, date]]:
    """KW0..KW4 Kalenderfenster wie in scraper_api.scrape_therapeut (Mo=0)."""
    wd = anchor.weekday()
    kw0_start = anchor
    kw0_end = anchor + timedelta(days=6 - wd)
    windows = [(kw0_start, kw0_end)]
    cur_end = kw0_end
    for _ in range(4):
        nxt_start = cur_end + timedelta(days=1)
        nxt_end = nxt_start + timedelta(days=6)
        windows.append((nxt_start, nxt_end))
        cur_end = nxt_end
    return windows


def _first_column_date_window(anchor: date, use_focus: bool) -> tuple[date, date]:
    """Erste Report-Spalte: ohne Fokus = KW0 (heute–So), mit Wochenend-Fokus = nächste volle Woche (API-KW1)."""
    w = _api_kw_windows(anchor)
    return w[1] if use_focus else w[0]


def slots_json_weekday_breakdown(slots_json_raw: str | None, w_start: date, w_end: date) -> str:
    """
    Aus slots_json (Datum -> Anzahl) eine Zeile wie "3 Di, 2 Mi, 2 Do" für Tage mit Slots > 0.
    """
    if not slots_json_raw or not str(slots_json_raw).strip():
        return ""
    try:
        raw = json.loads(slots_json_raw)
    except (json.JSONDecodeError, TypeError):
        return ""
    if not isinstance(raw, dict):
        return ""
    parts: list[str] = []
    d = w_start
    while d <= w_end:
        key = d.strftime("%Y-%m-%d")
        n = raw.get(key)
        try:
            n_int = int(n) if n is not None else 0
        except (TypeError, ValueError):
            n_int = 0
        if n_int > 0:
            parts.append(f"{n_int} {_WD_DE_SHORT[d.weekday()]}")
        d += timedelta(days=1)
    return ", ".join(parts)


def get_stats(wochen_rueckblick=4):
    """
    Holt Statistiken aus der DB pro (standort, therapeut).
    Therapeuten die an mehreren Standorten arbeiten erscheinen mehrfach –
    einmal pro Standort, plus eine aggregierte Zeile.
    """
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("ALTER TABLE slot_snapshots ADD COLUMN slots_kw4 INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass
    aktuell = conn.execute("""
        SELECT s1.standort, s1.therapeut,
               s1.naechste_7d, s1.naechste_14d, s1.naechste_30d,
               COALESCE(s1.slots_kw0, s1.naechste_7d) as slots_kw0,
               COALESCE(s1.slots_kw1, s1.naechste_14d - s1.naechste_7d, 0) as slots_kw1,
               COALESCE(s1.slots_kw2, s1.naechste_30d - s1.naechste_14d, 0) as slots_kw2,
               COALESCE(s1.slots_kw3, 0) as slots_kw3,
               COALESCE(s1.slots_kw4, 0) as slots_kw4,
               s1.datum, s1.scrape_ok, s1.fehler_msg, s1.slots_json
        FROM slot_snapshots s1
        JOIN (
            SELECT standort, therapeut, MAX(id) as max_id
            FROM slot_snapshots
            GROUP BY standort, therapeut
        ) latest
        ON latest.max_id = s1.id
        LEFT JOIN therapeuten t
          ON t.standort = s1.standort AND t.name = s1.therapeut
        WHERE COALESCE(t.aktiv, 1) = 1
        ORDER BY s1.standort, s1.therapeut
    """).fetchall()

    conn.close()

    stats = []
    for row in aktuell:
        stats.append({
            "standort":      row["standort"],
            "therapeut":     row["therapeut"],
            "slots_7d":      row["naechste_7d"],
            "slots_14d":     row["naechste_14d"],
            "slots_30d":     row["naechste_30d"],
            "slots_kw0":     row["slots_kw0"],
            "slots_kw1":     row["slots_kw1"],
            "slots_kw2":     row["slots_kw2"],
            "slots_kw3":     row["slots_kw3"],
            "slots_kw4":     row["slots_kw4"],
            "slots_json":    row["slots_json"],
            "letzter_check": row["datum"],
            "scrape_ok":     row["scrape_ok"],
            "fehler":        row["fehler_msg"],
        })

    # Therapeuten an mehreren Standorten: aggregierte Zeile berechnen
    by_name = defaultdict(list)
    for s in stats:
        by_name[s["therapeut"]].append(s)

    multi_standort = {}
    for name, eintraege in by_name.items():
        if len(eintraege) > 1:
            multi_standort[name] = {
                "therapeut":    name,
                "standorte":    [e["standort"] for e in eintraege],
                "slots_kw0_total": sum(e["slots_kw0"] for e in eintraege),
                "slots_kw1_total": sum(e["slots_kw1"] for e in eintraege),
                "slots_kw2_total": sum(e["slots_kw2"] for e in eintraege),
                "slots_kw3_total": sum(e["slots_kw3"] for e in eintraege),
                "per_standort": eintraege,
            }

    return stats, multi_standort


def get_verlauf(standort, therapeut, tage=28):
    """Gibt den täglichen Slot-Verlauf für einen Therapeuten zurück."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    seit = (datetime.now().date() - timedelta(days=tage)).strftime("%Y-%m-%d")
    rows = conn.execute("""
        SELECT datum, naechste_7d as slots
        FROM slot_snapshots
        WHERE standort = ? AND therapeut = ? AND datum >= ? AND scrape_ok = 1
        ORDER BY datum
    """, (standort, therapeut, seit)).fetchall()
    conn.close()
    return [{"datum": r["datum"], "slots": r["slots"]} for r in rows]


def generate_html_report(wochen_rueckblick=4, open_browser=False):
    """Erstellt einen vollständigen HTML-Report."""
    stats_raw, multi_raw = get_stats(wochen_rueckblick)
    jetzt = reporting_now().strftime("%d.%m.%Y %H:%M")
    heute = reporting_today()
    use_focus = weekend_week_focus_active()

    cancel_stats = {(c["standort"], c["therapeut"]): c for c in get_cancellation_stats(tage=wochen_rueckblick*7)}
    fill_stats   = {(f["standort"], f["therapeut"]): f for f in get_fill_speed(tage=wochen_rueckblick*7)}
    forecast_ui = get_forecast_ui_state()
    show_forecast_ui = bool(forecast_ui.get("show"))
    if show_forecast_ui:
        forecast_stats = get_week_fill_forecasts(lookback_days=max(28, wochen_rueckblick * 7), horizon_days=7)
        forecast_meta = get_forecast_model_info()
    else:
        forecast_stats = {}
        forecast_meta = {
            "available": False,
            "total_samples": 0,
            "entities_trained": 0,
            "trained_at": None,
            "quality": "no_file",
        }

    total_absagen  = sum(c.get("absagen", 0) for c in cancel_stats.values())
    total_buchungen= sum(c.get("buchungen", 0) for c in cancel_stats.values())
    gesamt_rate    = round(total_absagen / (total_absagen + total_buchungen) * 100, 1) if (total_absagen + total_buchungen) > 0 else 0
    total_kw0_count = sum(s.get("slots_kw0", 0) for s in stats_raw)
    total_kw1_count = sum(s.get("slots_kw1", 0) for s in stats_raw)
    quality_warnings = []
    if total_kw0_count == 0 and total_kw1_count > 0:
        quality_warnings.append("Aktuelle Woche hat 0 Slots, Folgewoche aber >0 (moeglicher API-/Zeitfenster-Effekt).")
    total_active = len([s for s in stats_raw if s["scrape_ok"]])
    if total_active > 0:
        zero_share = len([
            s for s in stats_raw if s["scrape_ok"]
            and (s["slots_kw0"] + s["slots_kw1"] + s["slots_kw2"] + s["slots_kw3"] == 0)
        ]) / total_active
        if zero_share >= 0.7:
            quality_warnings.append(f"Viele Nullwerte erkannt ({round(zero_share * 100)}% der aktiven Therapeuten).")
    top_alerts = []
    for s in stats_raw:
        ckey = (s["standort"], s["therapeut"])
        prob = forecast_stats.get(ckey, {}).get("prob_fill_target_pct", 0) if show_forecast_ui else 100
        if show_forecast_ui and s["slots_kw1"] >= 8 and prob < 40:
            top_alerts.append(f"{s['therapeut']} @ {s['standort']}: {s['slots_kw1']} freie Slots naechste Woche, nur {prob}% Fill-Wahrscheinlichkeit")
        ar = cancel_stats.get(ckey, {}).get("absage_rate", 0)
        if ar >= 30:
            top_alerts.append(f"{s['therapeut']} @ {s['standort']}: hohe Absagequote ({ar}%)")
    top_alerts = top_alerts[:6]

    if use_focus:
        stats = rotate_stats_list(stats_raw)
        multi_standort = rotate_multi_standort(multi_raw)
    else:
        stats = stats_raw
        multi_standort = multi_raw
    week_labels = focus_week_labels(heute, use_focus)

    by_standort = defaultdict(list)
    for s in stats:
        by_standort[s["standort"]].append(s)

    verlauf_data = {}
    for s in stats:
        key = f"{s['standort']}|{s['therapeut']}"
        verlauf_data[key] = get_verlauf(s["standort"], s["therapeut"])

    tz_note = report_timezone_name()
    focus_banner_html = (
        f"""
  <div class="summary" style="border-left:4px solid #4a6cf7;padding-left:16px;margin-bottom:20px">
    <p style="font-size:13px;color:#444;line-height:1.5">
      <strong>Wochenend-Fokus (ab Fr 18:00, Sa/So):</strong>
      Alle vier Spalten = <strong>nächste vier volle Kalenderwochen</strong> (API KW1–KW4); die laufende Woche wird nicht angezeigt.
      Zeitzone: {tz_note}.
    </p>
  </div>"""
        if use_focus
        else ""
    )
    summary_kw0_label = (
        "Freie Slots Woche 1 (Fokus Folgewoche)" if use_focus else "Freie Slots aktuelle Woche"
    )

    html = f"""<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Therapie Slot Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js"></script>
  <style>
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{ font-family: system-ui, sans-serif; background: #f5f5f5; color: #333; }}
    header {{ background: #1a1a2e; color: #fff; padding: 20px 32px; display: flex; justify-content: space-between; align-items: center; }}
    header h1 {{ font-size: 20px; font-weight: 500; }}
    header span {{ font-size: 13px; opacity: 0.7; }}
    .container {{ max-width: 1100px; margin: 0 auto; padding: 24px 16px; }}
    .standort-block {{ margin-bottom: 32px; }}
    .standort-title {{ font-size: 16px; font-weight: 600; color: #1a1a2e; border-left: 4px solid #4a6cf7; padding-left: 12px; margin-bottom: 16px; }}
    .grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 16px; }}
    .card {{ background: #fff; border-radius: 12px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }}
    .card-header {{ display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 16px; }}
    .card-name {{ font-weight: 600; font-size: 15px; }}
    .badge {{ font-size: 11px; padding: 3px 8px; border-radius: 20px; font-weight: 500; }}
    .badge-ok {{ background: #e8f5e9; color: #2e7d32; }}
    .badge-err {{ background: #fce4ec; color: #c62828; }}
    .metrics {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }}
    .metric {{ background: #f8f9ff; border-radius: 8px; padding: 12px; }}
    .metric-val {{ font-size: 24px; font-weight: 700; color: #4a6cf7; }}
    .metric-label {{ font-size: 11px; color: #888; margin-top: 2px; }}
    .metric-hist {{ background: #f5f5f5; }}
    .metric-hist .metric-val {{ color: #555; font-size: 20px; }}
    .chart-wrap {{ height: 80px; margin-top: 8px; }}
    .updated {{ font-size: 11px; color: #aaa; text-align: right; margin-top: 8px; }}
    .summary {{ background: #fff; border-radius: 12px; padding: 20px; margin-bottom: 24px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }}
    .summary h2 {{ font-size: 14px; font-weight: 600; margin-bottom: 12px; color: #555; text-transform: uppercase; letter-spacing: 0.05em; }}
    .summary-grid {{ display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px; }}
    .summary-item {{ text-align: center; }}
    .summary-val {{ font-size: 32px; font-weight: 700; color: #1a1a2e; }}
    .summary-label {{ font-size: 12px; color: #888; }}
    .toolbar {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 20px; padding: 12px 16px; background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.06); }}
    .toolbar button {{ font-size: 12px; padding: 8px 12px; border-radius: 8px; border: 1px solid #ddd; background: #f8f9fa; cursor: pointer; }}
    .toolbar button:hover {{ background: #eef1ff; border-color: #4a6cf7; color: #1a1a2e; }}
    .toolbar span {{ font-size: 11px; color: #888; margin-right: 8px; }}
    details.panel {{ margin-bottom: 16px; }}
    details.panel > summary {{ list-style: none; cursor: pointer; font-size: 14px; font-weight: 600; color: #1a1a2e; padding: 10px 14px; background: #fff; border-radius: 10px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }}
    details.panel > summary::-webkit-details-marker {{ display: none; }}
    details.panel[open] > summary {{ border-bottom-left-radius: 0; border-bottom-right-radius: 0; }}
    .panel-body {{ padding: 12px 14px 16px; background: #fafafa; border-radius: 0 0 10px 10px; border: 1px solid #eee; border-top: none; }}
    details.standort-panel {{ margin-bottom: 20px; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); background: #fff; }}
    details.standort-panel > summary.standort-summary {{ list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 14px 16px; font-size: 17px; font-weight: 600; color: #1a1a2e; border-left: 4px solid #4a6cf7; background: #fff; }}
    details.standort-panel > summary::-webkit-details-marker {{ display: none; }}
    .standort-meta {{ font-size: 12px; font-weight: 500; color: #666; }}
    .standort-inner {{ padding: 16px; background: #f5f5f5; }}
    details.card-collapsible {{ background: #fff; border-radius: 12px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); margin-bottom: 12px; overflow: hidden; }}
    details.card-collapsible > summary.card-summary {{ list-style: none; cursor: pointer; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 14px 16px; }}
    details.card-collapsible > summary::-webkit-details-marker {{ display: none; }}
    .card-summary-left {{ display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }}
    .card-kpis {{ font-size: 12px; color: #666; }}
    .card-inner {{ padding: 0 16px 16px; }}
  </style>
</head>
<body>
<header>
  <h1>Therapie Slot Reporting</h1>
  <span>Stand: {jetzt}</span>
</header>
<div class="container">
  <div class="toolbar">
    <span>Ansicht:</span>
    <button type="button" id="btn-expand-standorte">Standorte aufklappen</button>
    <button type="button" id="btn-collapse-standorte">Standorte zuklappen</button>
    <button type="button" id="btn-expand-therapeuten">Therapeuten aufklappen</button>
    <button type="button" id="btn-collapse-therapeuten">Therapeuten zuklappen</button>
  </div>
{focus_banner_html}
"""

    # Summary
    total_kw0 = sum(s["slots_kw0"] for s in stats if s["scrape_ok"])
    total_therapeuten = len([s for s in stats if s["scrape_ok"]])
    total_standorte = len(by_standort)
    html += f"""
  <div class="summary">
    <h2>Übersicht</h2>
    <div class="summary-grid">
      <div class="summary-item">
        <div class="summary-val">{total_kw0}</div>
        <div class="summary-label">{summary_kw0_label}</div>
      </div>
      <div class="summary-item">
        <div class="summary-val">{total_therapeuten}</div>
        <div class="summary-label">Therapeuten erfasst</div>
      </div>
      <div class="summary-item">
        <div class="summary-val">{total_standorte}</div>
        <div class="summary-label">Standorte</div>
      </div>
      <div class="summary-item">
        <div class="summary-val" style="color:{'#e65100' if gesamt_rate > 20 else '#2e7d32'}">{gesamt_rate}%</div>
        <div class="summary-label">Absagequote (letzte {wochen_rueckblick}W)</div>
      </div>
      <div class="summary-item">
        <div class="summary-val">{total_absagen}</div>
        <div class="summary-label">Absagen erkannt</div>
      </div>
      <div class="summary-item">
        <div class="summary-val">{total_buchungen}</div>
        <div class="summary-label">Buchungen erkannt</div>
      </div>
    </div>
  </div>
"""
    if top_alerts:
        html += """
  <div class="summary" style="border-left:4px solid #ef4444;padding-left:16px">
    <h2 style="color:#991b1b">Top Alerts</h2>
    <ul style="margin-left:18px;color:#7f1d1d;font-size:13px;line-height:1.6">
"""
        for a in top_alerts:
            html += f"<li>{a}</li>"
        html += """
    </ul>
  </div>
"""
    if quality_warnings:
        html += """
  <div class="summary" style="border-left:4px solid #f59e0b;padding-left:16px">
    <h2 style="color:#92400e">Datenqualitaet</h2>
    <ul style="margin-left:18px;color:#7c2d12;font-size:13px;line-height:1.6">
"""
        for w in quality_warnings:
            html += f"<li>{w}</li>"
        html += """
    </ul>
  </div>
"""
    if show_forecast_ui:
        _fq = forecast_meta.get("quality", "low_samples")
        _ts = forecast_meta.get("total_samples", 0)
        _et = forecast_meta.get("entities_trained", 0)
        if _fq in ("no_file", "empty_model", "low_samples"):
            if _fq == "no_file":
                _fmsg = (
                    "<strong>Kein Prognose-Modell auf diesem Rechner:</strong> Die Datei "
                    "<code>models/forecast_model.json</code> fehlt. Training z.&nbsp;B. auf dem Server: "
                    "<code>cd /opt/onedoc_scraper &amp;&amp; .venv/bin/python3 train_forecast_model.py</code> "
                    "(der Scheduler startet das normalerweise täglich nach 02:00). "
                    "Hinweis: Der Ordner <code>models/</code> wird per rsync oft nicht mitkopiert – "
                    "das Modell entsteht dort durch Training, nicht durch Deploy vom Mac."
                )
            elif _fq == "empty_model":
                _fmsg = (
                    f"<strong>Modell vorhanden, aber noch ohne nutzbare Wochenpaare</strong> "
                    f"(Samples: {_ts}, Therapeut:innen im Modell: {_et}). "
                    "Die Prognose lernt aus aufeinanderfolgenden Kalenderwochen, in der ersten Woche "
                    "freie Slots in <strong>KW1</strong> (Folgewoche) vorkommen. "
                    "Nach einigen Wochen regulärem Scraping sollten Samples ansteigen; sonst Snapshot-Historie prüfen."
                )
            else:
                _fmsg = (
                    f"<strong>Noch wenig Trainingshistorie</strong> (Wochenpaare: {_ts}, "
                    f"Therapeut:innen: {_et}). Die Prozentwerte werden mit mehr Wochen automatisch zuverlässiger."
                )
            html += f"""
  <div class="summary" style="border-left:4px solid #f59e0b;padding-left:16px">
    <h2 style="color:#92400e">Hinweis Prognosequalität</h2>
    <p style="font-size:13px;color:#666;line-height:1.55">
      {_fmsg}
    </p>
  </div>
"""
    else:
        _ab = forecast_ui.get("ab_datum")
        _fd = forecast_ui.get("first_datum")
        if _ab and _fd:
            ab_de = datetime.strptime(_ab, "%Y-%m-%d").strftime("%d.%m.%Y")
            fd_de = datetime.strptime(_fd, "%Y-%m-%d").strftime("%d.%m.%Y")
            _hold_msg = (
                f"Die <strong>Slot-Füllungsprognose</strong> (Prozent, KI-Hinweis in den Karten) wird "
                f"erst ab <strong>{ab_de}</strong> angezeigt (früheste Messung: {fd_de}; "
                f"mindestens 6 Wochen fortlaufende Snapshots)."
            )
        else:
            _hold_msg = (
                "Die <strong>Slot-Füllungsprognose</strong> erscheint hier, sobald mindestens "
                "<strong>6 Wochen</strong> fortlaufende Einträge in <code>slot_snapshots</code> vorliegen."
            )
        html += f"""
  <div class="summary" style="border-left:4px solid #94a3b8;padding-left:16px">
    <h2 style="color:#475569">Prognose</h2>
    <p style="font-size:13px;color:#666;line-height:1.55">
      {_hold_msg}
    </p>
  </div>
"""

    # Multi-Standort Sektion
    if multi_standort:
        html += f"""
  <details class="panel" open>
    <summary>Therapeuten an mehreren Standorten</summary>
    <div class="panel-body" style="border-left:4px solid #f59e0b">
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin-top:10px">
      <thead><tr style="background:#fef3c7">
        <th style="padding:7px 10px;text-align:left;color:#92400e">Name</th>
        <th style="padding:7px 10px;text-align:left;color:#92400e">Standorte</th>
        <th style="padding:7px 10px;text-align:center;color:#92400e">{week_labels[0]} total</th>
        <th style="padding:7px 10px;text-align:center;color:#92400e">{week_labels[1]} total</th>
        <th style="padding:7px 10px;text-align:center;color:#92400e">{week_labels[2]} total</th>
        <th style="padding:7px 10px;text-align:center;color:#92400e">{week_labels[3]} total</th>
        <th style="padding:7px 10px;text-align:left;color:#92400e">Aufschlüsselung</th>
      </tr></thead>
      <tbody>
"""
        for name, m in multi_standort.items():
            aufschluesselung = " · ".join(
                f"{e['standort']}: {e['slots_kw0']}/{e['slots_kw1']}/{e['slots_kw2']}/{e['slots_kw3']}" for e in m["per_standort"]
            )
            html += f"""
        <tr style="border-bottom:1px solid #fef3c7">
          <td style="padding:7px 10px;font-weight:600">{name}</td>
          <td style="padding:7px 10px">{' + '.join(m['standorte'])}</td>
          <td style="padding:7px 10px;text-align:center;font-weight:700;color:#d97706">{m['slots_kw0_total']}</td>
          <td style="padding:7px 10px;text-align:center">{m['slots_kw1_total']}</td>
          <td style="padding:7px 10px;text-align:center">{m['slots_kw2_total']}</td>
          <td style="padding:7px 10px;text-align:center">{m['slots_kw3_total']}</td>
          <td style="padding:7px 10px;color:#888;font-size:12px">{aufschluesselung}</td>
        </tr>"""
        html += """
      </tbody>
    </table>
    </div>
  </details>
"""

    # Pro Standort und Therapeut
    html += """
  <h2 style="font-size:15px;font-weight:600;color:#555;margin:28px 0 12px;text-transform:uppercase;letter-spacing:0.05em">Therapeuten nach Standort</h2>
"""
    for standort, therapeuten in by_standort.items():
        scored = []
        for s in therapeuten:
            ckey = (s["standort"], s["therapeut"])
            prob = (
                forecast_stats.get(ckey, {}).get("prob_fill_target_pct", 0)
                if show_forecast_ui
                else 100
            )
            risk = (s["slots_kw1"] * (100 - prob) / 100.0) + (cancel_stats.get(ckey, {}).get("absage_rate", 0) / 10.0)
            scored.append((risk, s))
        therapeuten_sorted = [x[1] for x in sorted(scored, key=lambda x: x[0], reverse=True)]
        sum_kw0 = sum(s["slots_kw0"] for s in therapeuten_sorted)
        n_th = len(therapeuten_sorted)
        html += f"""
  <details class="standort-panel" open>
    <summary class="standort-summary">
      <span>{standort}</span>
      <span class="standort-meta">{n_th} Therapeuten · {sum_kw0} freie Slots {week_labels[0]}</span>
    </summary>
    <div class="standort-inner">
    <div class="grid">
"""
        for s in therapeuten_sorted:
            badge_cls = "badge-ok" if s["scrape_ok"] else "badge-err"
            badge_txt = "OK" if s["scrape_ok"] else "Fehler"
            chart_id = f"chart_{_safe_dom_id(s['standort'], s['therapeut'])}"
            key = f"{s['standort']}|{s['therapeut']}"
            verlauf = verlauf_data.get(key, [])
            chart_labels = json.dumps([v["datum"][-5:] for v in verlauf])
            chart_data   = json.dumps([v["slots"] for v in verlauf])

            # Stufe-2-Metriken
            ckey = (s["standort"], s["therapeut"])
            cs   = cancel_stats.get(ckey, {})
            fs   = fill_stats.get(ckey, {})
            absagen      = cs.get("absagen", 0)
            buchungen    = cs.get("buchungen", 0)
            absage_rate  = cs.get("absage_rate", 0)
            auslastung   = fs.get("auslastung_trend", "–")
            avg_buchungen= fs.get("avg_buchungen_pro_tag", 0)
            fcst = forecast_stats.get(ckey, {}) if show_forecast_ui else {}
            prob_fill = fcst.get("prob_fill_target_pct", 0) if show_forecast_ui else 100
            conf_label = fcst.get("confidence_label", "niedrig").upper()
            expected_fill = fcst.get("expected_fill", 0)
            target_slots = fcst.get("target_slots", s["slots_kw1"])
            absage_farbe = "#e65100" if absage_rate > 25 else "#2e7d32" if absage_rate < 10 else "#e65100"
            # Hoch = volle Auslastung (positiv) -> gruen; niedrig = viele freie Slots -> rot
            auslastung_farbe = {"hoch": "#2e7d32", "mittel": "#e65100", "niedrig": "#c62828"}.get(auslastung, "#888")
            forecast_farbe = (
                "#2e7d32"
                if prob_fill >= 70
                else "#e65100"
                if prob_fill >= 40
                else "#c62828"
            )
            kpi_prognose = (
                f" · Prognose: {prob_fill}%"
                if show_forecast_ui
                else ""
            )
            forecast_metric_html = ""
            if show_forecast_ui:
                forecast_metric_html = f"""
          <div class="metric" style="background:#e8f4ff">
            <div class="metric-val" style="font-size:18px;color:{forecast_farbe}">{prob_fill}%</div>
            <div class="metric-label">Prognose: {target_slots} Slots in {week_labels[1]} gefuellt (KI {conf_label}, Erwartung: {expected_fill}; Basis: {fcst.get('learned_samples', 0)} Wochen, {fcst.get('booking_events', 0)} Events)</div>
          </div>"""
            k0 = int(s.get("slots_kw0") or 0)
            k1 = int(s.get("slots_kw1") or 0)
            k2 = int(s.get("slots_kw2") or 0)
            k3 = int(s.get("slots_kw3") or 0)
            # Risiko-Gewichte: erste drei Anzeige-Wochen (k0–k2) tragen; vierte Spalte (k3) nur leicht.
            _w0, _w1, _w2 = 2.5, 2.0, 1.25
            kern_gewichtet = k0 * _w0 + k1 * _w1 + k2 * _w2
            _leerstand_div = 7.5
            _leerstand_k3_k = 0.03
            _leerstand_k3_cap = 1.35
            leerstand_k3 = min(_leerstand_k3_cap, k3 * _leerstand_k3_k)
            leerstand_risk = min(10.0, kern_gewichtet / _leerstand_div + leerstand_k3)
            _ref_kapazitaet = 36.0
            _kap_k3 = 0.14
            kap_blend = kern_gewichtet + _kap_k3 * k3
            kapazitaetsfaktor = (
                min(1.0, kap_blend / _ref_kapazitaet) if kap_blend > 0 else 0.0
            )
            absage_risk = (absage_rate / 10.0) * kapazitaetsfaktor
            prognose_risk = kern_gewichtet * (100 - prob_fill) / 100.0
            risk_score = absage_risk + prognose_risk + leerstand_risk
            if risk_score >= 8:
                priority_label, priority_bg, priority_color = "KRITISCH", "#fee2e2", "#991b1b"
            elif risk_score >= 4:
                priority_label, priority_bg, priority_color = "BEOBACHTEN", "#fff7ed", "#9a3412"
            else:
                priority_label, priority_bg, priority_color = "STABIL", "#ecfdf5", "#166534"
            delta_kw1_vs_kw0 = s["slots_kw1"] - s["slots_kw0"]
            delta_kw2_vs_kw1 = s["slots_kw2"] - s["slots_kw1"]
            delta_kw3_vs_kw2 = s["slots_kw3"] - s["slots_kw2"]

            w0_a, w0_b = _first_column_date_window(heute, use_focus)
            kw0_break = slots_json_weekday_breakdown(s.get("slots_json"), w0_a, w0_b)
            kw0_metric_label = (
                f"Freie Slots {week_labels[0]} – {kw0_break}"
                if kw0_break
                else f"Freie Slots {week_labels[0]}"
            )

            html += f"""
      <details class="card-collapsible" open>
        <summary class="card-summary">
          <div class="card-summary-left">
            <span class="card-name" style="font-weight:600;font-size:15px">{s['therapeut']}</span>
            <span class="badge {badge_cls}">{badge_txt}</span>
            <span style="font-size:11px;padding:4px 8px;border-radius:16px;background:{priority_bg};color:{priority_color};font-weight:600">{priority_label}</span>
          </div>
          <span class="card-kpis">{week_labels[0]}: {s['slots_kw0']} · {week_labels[1]}: {s['slots_kw1']}{kpi_prognose}</span>
        </summary>
        <div class="card-inner">
        <div class="metrics">
          <div class="metric">
            <div class="metric-val">{s['slots_kw0']}</div>
            <div class="metric-label">{kw0_metric_label}</div>
          </div>
          <div class="metric">
            <div class="metric-val">{s['slots_kw1']}</div>
            <div class="metric-label">Freie Slots {week_labels[1]} ({delta_kw1_vs_kw0:+d} vs linke Spalte, ein Abruf)</div>
          </div>
          <div class="metric">
            <div class="metric-val">{s['slots_kw2']}</div>
            <div class="metric-label">Freie Slots {week_labels[2]} ({delta_kw2_vs_kw1:+d} vs linke Spalte)</div>
          </div>
          <div class="metric">
            <div class="metric-val">{s['slots_kw3']}</div>
            <div class="metric-label">Freie Slots {week_labels[3]} ({delta_kw3_vs_kw2:+d} vs linke Spalte)</div>
          </div>
          <div class="metric metric-hist">
            <div class="metric-val">{avg_buchungen}</div>
            <div class="metric-label">Ø Buchungen/Tag</div>
          </div>
          <div class="metric" style="background:#fff8e1">
            <div class="metric-val" style="font-size:18px;color:{absage_farbe}">{absage_rate}%</div>
            <div class="metric-label">Absagequote ({absagen} Absagen)</div>
          </div>
          <div class="metric" style="background:#f3e5f5">
            <div class="metric-val" style="font-size:18px;color:{auslastung_farbe}">{auslastung.upper() if auslastung != '–' else '–'}</div>
            <div class="metric-label">Auslastungstrend</div>
          </div>
{forecast_metric_html}
        </div>
        <div class="chart-wrap">
          <canvas id="{chart_id}"></canvas>
        </div>
        <div class="updated">Letzter Check: {s['letzter_check']}</div>
        </div>
      </details>
      <script>
        (function() {{
          var ctx = document.getElementById('{chart_id}').getContext('2d');
          new Chart(ctx, {{
            type: 'bar',
            data: {{
              labels: {chart_labels},
              datasets: [{{ data: {chart_data}, backgroundColor: '#4a6cf730', borderColor: '#4a6cf7', borderWidth: 1, borderRadius: 3 }}]
            }},
            options: {{
              plugins: {{ legend: {{ display: false }} }},
              scales: {{
                x: {{ ticks: {{ font: {{ size: 9 }} }}, grid: {{ display: false }} }},
                y: {{ ticks: {{ font: {{ size: 9 }}, stepSize: 1 }}, grid: {{ color: '#f0f0f0' }} }}
              }}
            }}
          }});
        }})();
      </script>
"""
        html += "    </div>\n    </div>\n  </details>\n"

    html += """
  <script>
  (function() {
    function all(sel) { return Array.prototype.slice.call(document.querySelectorAll(sel)); }
    document.getElementById('btn-expand-standorte').addEventListener('click', function() {
      all('details.standort-panel').forEach(function(d) { d.open = true; });
    });
    document.getElementById('btn-collapse-standorte').addEventListener('click', function() {
      all('details.standort-panel').forEach(function(d) { d.open = false; });
    });
    document.getElementById('btn-expand-therapeuten').addEventListener('click', function() {
      all('details.card-collapsible').forEach(function(d) { d.open = true; });
    });
    document.getElementById('btn-collapse-therapeuten').addEventListener('click', function() {
      all('details.card-collapsible').forEach(function(d) { d.open = false; });
    });
  })();
  </script>
</div></body></html>
"""

    REPORT_PATH.write_text(html, encoding="utf-8")
    print(f"Report gespeichert: {REPORT_PATH}")
    if open_browser:
        _open_report_file(REPORT_PATH)
    return REPORT_PATH


if __name__ == "__main__":
    import argparse

    p = argparse.ArgumentParser(description="Therapie Slot Reporting (HTML)")
    p.add_argument("--open", action="store_true", help="Report im Standard-Browser öffnen")
    p.add_argument(
        "--no-open",
        action="store_true",
        help="Browser nicht öffnen (überschreibt interaktives Standardverhalten)",
    )
    args = p.parse_args()
    open_browser = args.open or (not args.no_open and sys.stdout.isatty())
    generate_html_report(open_browser=open_browser)
