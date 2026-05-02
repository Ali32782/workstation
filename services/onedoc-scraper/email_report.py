"""
email_report.py – Sendet nach jeder Messung eine E-Mail mit:
  - Kurze Textzusammenfassung (wer hat wie viele Slots)
  - report.html als Anhang

Konfiguration einmalig:
  python3 email_report.py --setup

Danach läuft es automatisch nach jedem Scraping.
"""

import hashlib
import hmac
import sqlite3, json, smtplib, os
from email.mime.multipart import MIMEMultipart
from urllib.parse import quote
from week_focus import (
    reporting_now,
    rotate_slots_row,
    weekend_week_focus_active,
)
from email.mime.text import MIMEText
from email.mime.base import MIMEBase
from email import encoders
from email.utils import formatdate
from datetime import datetime
from pathlib import Path

DB_PATH     = Path(__file__).parent / "slots.db"
CONFIG_PATH = Path(__file__).parent / "email_config.json"
REPORT_PATH = Path(__file__).parent / "report.html"


def refresh_report_file_for_mail() -> bool:
    """
    Schreibt report.html neu, damit Anhang und „Stand:“-Zeit nicht eine alte
    Cron-Datei (z. B. 06:00) zeigen, während der Mail-Body schon „jetzt“ hat.
    """
    try:
        from reporting import generate_html_report

        generate_html_report(open_browser=False)
        return True
    except Exception as exc:
        print(f"⚠ Report-HTML konnte nicht vor Versand neu erzeugt werden: {exc}")
        return False


def _load_local_env_file() -> None:
    """Lädt `.env` wie der Scheduler (fehlende/leere ENV-Keys werden gesetzt)."""
    env_path = Path(__file__).parent / ".env"
    if not env_path.exists():
        return
    for raw in env_path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("'", '"'):
            value = value[1:-1]
        cur = os.environ.get(key)
        if cur is None or not str(cur).strip():
            os.environ[key] = value


def _refresh_signing_secret() -> str:
    return (
        os.getenv("REPORT_REFRESH_SIGNING_SECRET", "").strip()
        or os.getenv("REPORT_REFRESH_TOKEN", "").strip()
    )


def refresh_url_for_recipient(recipient_email: str) -> str:
    """Signierter Refresh-Link nur für diese Adresse (e + s)."""
    base = os.getenv("REPORT_REFRESH_BASE_URL", "").strip().rstrip("/")
    secret = _refresh_signing_secret()
    if not base or not secret:
        return ""
    norm = recipient_email.strip().lower()
    sig = hmac.new(secret.encode("utf-8"), norm.encode("utf-8"), hashlib.sha256).hexdigest()
    e = quote(norm, safe="")
    return f"{base}/report/refresh?e={e}&s={sig}"


def verify_refresh_request(email: str, sig: str, allowed_recipients: list[str]) -> bool:
    """Prüft Signatur und ob die Adresse zu den Report-Empfängern gehört."""
    secret = _refresh_signing_secret()
    if not secret or not email.strip() or not sig.strip():
        return False
    allowed_l = {a.strip().lower() for a in allowed_recipients if a and str(a).strip()}
    if email.strip().lower() not in allowed_l:
        return False
    expected = hmac.new(secret.encode("utf-8"), email.strip().lower().encode("utf-8"), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)


def _refresh_cta_block(for_recipient_email: str) -> str:
    """
    Persönlicher Klick-Link: Refresh + anschließend Mail nur an diese Adresse.
    Konfiguration: REPORT_REFRESH_BASE_URL + REPORT_REFRESH_SIGNING_SECRET
    (Fallback: REPORT_REFRESH_TOKEN als Secret).
    """
    url = refresh_url_for_recipient(for_recipient_email)
    if not url:
        return ""
    href = url.replace("&", "&amp;")
    return f"""
        <div style="margin:0 0 16px">
            <a href="{href}" style="display:inline-block;background:#1a1a2e;color:#fff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;font-size:13px">
                Report aktualisieren
            </a>
        </div>"""


# ── Konfiguration ─────────────────────────────────────────────────────────────
DEFAULT_RECIPIENTS = [
    "ali.peters@kineo.swiss",
    "sereina.urech@kineo.swiss",
    "martino.crivelli@kineo.swiss",
]

def load_config():
    if CONFIG_PATH.exists():
        return json.loads(CONFIG_PATH.read_text())
    return {}


def resolve_smtp_password(cfg):
    """
    Passwort wird bevorzugt aus ENV gelesen.
    Fallback auf config nur für Rückwärtskompatibilität.
    """
    env_pass = os.getenv("ONEDOC_SMTP_PASS", "").strip()
    if env_pass:
        return env_pass
    return (cfg.get("smtp_pass") or "").strip()


def _dedupe_recipients(items: list[str]) -> list[str]:
    """Entfernt doppelte Empfänger robust (case-insensitive), Reihenfolge bleibt."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in items:
        mail = str(raw).strip()
        if not mail:
            continue
        key = mail.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(mail)
    return out


def resolve_recipients(cfg) -> list[str]:
    """
    Priority:
      1) ONEDOC_MAIL_TO / MAIL_TO env (comma-separated)
      2) email_config.json "empfaenger"
      3) DEFAULT_RECIPIENTS
    """
    raw = (os.getenv("ONEDOC_MAIL_TO", "").strip() or os.getenv("MAIL_TO", "").strip())
    if raw:
        lst = _dedupe_recipients([e.strip() for e in raw.split(",") if e.strip()])
        if lst:
            return lst

    lst = cfg.get("empfaenger") if isinstance(cfg, dict) else None
    if isinstance(lst, list) and any(str(x).strip() for x in lst):
        return _dedupe_recipients([str(x).strip() for x in lst if str(x).strip()])

    return _dedupe_recipients(list(DEFAULT_RECIPIENTS))


def setup():
    print("\n=== E-Mail Konfiguration ===\n")
    print("Für Gmail: App-Passwort unter https://myaccount.google.com/apppasswords erstellen")
    print("(Nicht das normale Passwort – ein spezielles App-Passwort)\n")

    print("Empfohlen: Passwort NICHT in Datei speichern, sondern ENV setzen:")
    print("  export ONEDOC_SMTP_PASS='...'\n")

    cfg = {
        "smtp_host":  input("SMTP Host [smtp.gmail.com]: ").strip() or "smtp.gmail.com",
        "smtp_port":  int(input("SMTP Port [587]: ").strip() or "587"),
        "smtp_user":  input("Deine E-Mail-Adresse: ").strip(),
        "smtp_pass":  "",
        "empfaenger": [e.strip() for e in input("Empfänger (kommagetrennt): ").split(",") if e.strip()],
        "aktiv":      True,
    }
    pw = input("App-Passwort (optional, Enter = nur ENV): ").strip()
    if pw:
        save_plain = input("Passwort in email_config.json speichern? (j/N): ").strip().lower() == "j"
        if save_plain:
            cfg["smtp_pass"] = pw
    CONFIG_PATH.write_text(json.dumps(cfg, indent=2, ensure_ascii=False))
    print(f"\n✓ Konfiguration gespeichert: {CONFIG_PATH}")

    # Test-Mail senden
    antwort = input("\nTest-Mail senden? (j/n): ").strip().lower()
    if antwort == "j":
        ok = send_report(cfg, test=True)
        print("✓ Test-Mail gesendet!" if ok else "✗ Fehler – Konfiguration prüfen")


# ── Daten aus DB ──────────────────────────────────────────────────────────────

def get_aktueller_stand():
    """Holt den neuesten Snapshot pro Therapeut (gleiche Logik wie reporting.get_stats: MAX(id))."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        try:
            conn.execute("ALTER TABLE slot_snapshots ADD COLUMN slots_kw4 INTEGER DEFAULT 0")
        except sqlite3.OperationalError:
            pass
        rows = conn.execute("""
            SELECT s1.standort, s1.therapeut,
                   COALESCE(s1.slots_kw0, s1.naechste_7d, 0) as slots_kw0,
                   COALESCE(s1.slots_kw1, s1.naechste_14d - s1.naechste_7d, 0) as slots_kw1,
                   COALESCE(s1.slots_kw2, s1.naechste_30d - s1.naechste_14d, 0) as slots_kw2,
                   COALESCE(s1.slots_kw3, 0) as slots_kw3,
                   COALESCE(s1.slots_kw4, 0) as slots_kw4,
                   s1.datum, s1.created_at
            FROM slot_snapshots s1
            INNER JOIN (
                SELECT standort, therapeut, MAX(id) AS max_id
                FROM slot_snapshots
                GROUP BY standort, therapeut
            ) latest ON latest.max_id = s1.id
            ORDER BY s1.standort, s1.slots_kw0 DESC
        """).fetchall()
        conn.close()
        return [dict(r) for r in rows]
    except Exception:
        return []

def get_aenderungen_seit_letzter_messung(track_kw1=False):
    """Vergleicht letzte zwei Messungen pro Therapeut (KW0 oder bei Wochenend-Fokus KW1)."""
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        expr = (
            "COALESCE(slots_kw1, naechste_14d - naechste_7d, 0)"
            if track_kw1
            else "COALESCE(slots_kw0, naechste_7d, 0)"
        )
        rows = conn.execute(
            f"""
            SELECT standort, therapeut,
                   {expr} as aktuell,
                   LAG({expr}) OVER (PARTITION BY standort, therapeut ORDER BY created_at) as vorher
            FROM slot_snapshots
            ORDER BY created_at DESC
        """
        ).fetchall()
        conn.close()
        aenderungen = []
        gesehen = set()
        for r in rows:
            key = (r["standort"], r["therapeut"])
            if key in gesehen or r["vorher"] is None:
                continue
            gesehen.add(key)
            delta = r["aktuell"] - r["vorher"]
            if delta != 0:
                typ = "↑ Mehr freie Slots" if delta > 0 else "↓ Weniger freie Slots"
                aenderungen.append({
                    "standort":  r["standort"],
                    "therapeut": r["therapeut"],
                    "vorher":    r["vorher"],
                    "aktuell":   r["aktuell"],
                    "delta":     delta,
                    "typ":       typ,
                })
        return aenderungen
    except:
        return []


# ── E-Mail HTML aufbauen ──────────────────────────────────────────────────────

def build_html(
    stand,
    aenderungen,
    test=False,
    use_focus=False,
    refresh_for_email: str | None = None,
    jetzt: str | None = None,
):
    if jetzt is None:
        jetzt = reporting_now().strftime("%d.%m.%Y %H:%M")

    # Slots nach Standort gruppieren
    by_standort = {}
    for r in stand:
        by_standort.setdefault(r["standort"], []).append(r)

    # Standort-Tabellen
    standort_html = ""
    for standort, therapeuten in by_standort.items():
        zeilen = ""
        for t in therapeuten:
            farbe = "#e8f5e9" if t["slots_kw0"] > 5 else "#fff8e1" if t["slots_kw0"] > 0 else "#fafafa"
            zeilen += f"""<tr style="background:{farbe}">
                <td style="padding:6px 12px">{t['therapeut']}</td>
                <td style="padding:6px 12px;text-align:center"><b>{t['slots_kw0']}</b></td>
                <td style="padding:6px 12px;text-align:center">{t['slots_kw1']}</td>
                <td style="padding:6px 12px;text-align:center">{t['slots_kw2']}</td>
                <td style="padding:6px 12px;text-align:center">{t['slots_kw3']}</td>
            </tr>"""
        standort_html += f"""
        <h3 style="color:#1a1a2e;margin:20px 0 6px;font-size:14px">{standort}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:8px">
            <thead><tr style="background:#e8eaf6">
                <th style="padding:6px 12px;text-align:left">Therapeut</th>
                <th style="padding:6px 12px;text-align:center">Woche 1</th>
                <th style="padding:6px 12px;text-align:center">Woche 2</th>
                <th style="padding:6px 12px;text-align:center">Woche 3</th>
                <th style="padding:6px 12px;text-align:center">Woche 4</th>
            </tr></thead>
            <tbody>{zeilen}</tbody>
        </table>"""

    # Änderungen
    aend_html = ""
    if aenderungen:
        zeilen = ""
        for a in aenderungen:
            farbe = "#fff8e1" if a["delta"] > 0 else "#e8f5e9"
            zeilen += f"""<tr style="background:{farbe}">
                <td style="padding:5px 10px">{a['standort']}</td>
                <td style="padding:5px 10px">{a['therapeut']}</td>
                <td style="padding:5px 10px">{a['typ']}</td>
                <td style="padding:5px 10px;text-align:center">{a['vorher']} → {a['aktuell']}</td>
            </tr>"""
        aend_title = (
            "Änderungen seit letzter Messung (Fokus: Folgewoche / KW1)"
            if use_focus
            else "Änderungen seit letzter Messung"
        )
        aend_html = f"""
        <h3 style="color:#1a1a2e;margin:20px 0 6px;font-size:14px">{aend_title}</h3>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
            <thead><tr style="background:#fff3e0">
                <th style="padding:5px 10px;text-align:left">Standort</th>
                <th style="padding:5px 10px;text-align:left">Therapeut</th>
                <th style="padding:5px 10px;text-align:left">Trend</th>
                <th style="padding:5px 10px;text-align:center">Verlauf</th>
            </tr></thead>
            <tbody>{zeilen}</tbody>
        </table>"""

    total_slots = sum(r["slots_kw0"] for r in stand)
    test_banner = '<div style="background:#fff3cd;padding:8px 12px;margin-bottom:16px;border-radius:4px;font-size:12px">⚠️ Test-Mail</div>' if test else ""
    focus_banner = (
        '<div style="background:#e8eeff;padding:8px 12px;margin-bottom:12px;border-radius:4px;font-size:12px;color:#1a1a2e">'
        "<strong>Wochenend-Fokus:</strong> Vier Spalten = nächste vier volle Kalenderwochen (KW1–KW4).</div>"
        if use_focus
        else ""
    )
    w1_hint = "Woche 1 (Fokus Folgewoche)" if use_focus else "Woche 1"
    refresh_block = _refresh_cta_block(refresh_for_email) if refresh_for_email else ""

    return f"""
    <div style="font-family:system-ui,sans-serif;max-width:700px;margin:0 auto;padding:20px">
        {test_banner}
        <div style="background:#1a1a2e;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
            <h2 style="margin:0;font-size:18px;font-weight:500">Kineo Slot-Report</h2>
            <span style="opacity:0.7;font-size:13px">{jetzt} · {len(stand)} Therapeuten · {total_slots} freie Slots total ({w1_hint})</span>
        </div>
        {focus_banner}
        <div style="border:1px solid #eee;border-top:none;padding:16px 20px;border-radius:0 0 8px 8px">
            {refresh_block}
            {aend_html}
            {standort_html}
            <p style="color:#aaa;font-size:11px;margin-top:20px">
                Automatisch generiert · Kineo Slot-Bot · Report als Anhang
            </p>
        </div>
    </div>"""


# ── E-Mail senden ─────────────────────────────────────────────────────────────

def _send_one_report_mail(
    cfg: dict,
    *,
    recipient: str,
    html_body: str,
    jetzt: str,
    total: int,
    use_focus: bool,
    test: bool,
    on_demand: bool,
    smtp_pass: str,
) -> bool:
    msg = MIMEMultipart("mixed")
    focus_tag = " [Fokus Folgewoche]" if use_focus else ""
    prefix = ""
    if test:
        prefix = "[TEST] "
    if on_demand:
        prefix = "[Aktualisiert] " + prefix
    msg["Subject"] = f"{prefix}Kineo Slots – {jetzt} – {total} freie Slots (Woche 1){focus_tag}"
    msg["From"] = cfg["smtp_user"]
    msg["To"] = recipient
    msg["Date"] = formatdate(localtime=True)

    msg.attach(MIMEText(html_body, "html", "utf-8"))

    if REPORT_PATH.exists():
        part = MIMEBase("application", "octet-stream")
        part.set_payload(REPORT_PATH.read_bytes())
        encoders.encode_base64(part)
        part.add_header(
            "Content-Disposition",
            f'attachment; filename="kineo_report_{datetime.now().strftime("%Y%m%d_%H%M")}.html"',
        )
        msg.attach(part)

    try:
        with smtplib.SMTP(cfg["smtp_host"], cfg["smtp_port"]) as s:
            s.starttls()
            s.login(cfg["smtp_user"], smtp_pass)
            refused = s.sendmail(cfg["smtp_user"], [recipient], msg.as_string())
        if refused:
            print("✗ SMTP hat Empfänger abgelehnt:")
            for rcpt, info in refused.items():
                try:
                    code, msgb = info
                except Exception:
                    code, msgb = info, b""
                detail = msgb.decode("utf-8", errors="ignore") if isinstance(msgb, (bytes, bytearray)) else str(msgb)
                print(f"  - {rcpt}: {code} {detail}".rstrip())
            return False
        print(f"✓ E-Mail gesendet an {recipient}")
        return True
    except Exception as e:
        print(f"✗ E-Mail Fehler ({recipient}): {e}")
        return False


def send_report(cfg=None, test=False):
    _load_local_env_file()
    cfg = cfg or load_config()
    if not cfg or not cfg.get("aktiv"):
        print("E-Mail nicht konfiguriert. Ausführen: python3 email_report.py --setup")
        return False

    use_focus = weekend_week_focus_active()
    stand = get_aktueller_stand()
    if use_focus:
        stand = [rotate_slots_row(dict(r)) for r in stand]
    aenderungen = get_aenderungen_seit_letzter_messung(track_kw1=use_focus)
    jetzt = reporting_now().strftime("%d.%m.%Y %H:%M")
    total = sum(r["slots_kw0"] for r in stand)
    smtp_pass = resolve_smtp_password(cfg)
    if not smtp_pass:
        print("✗ SMTP Passwort fehlt. Bitte ONEDOC_SMTP_PASS setzen oder --setup nutzen.")
        return False
    recipients = resolve_recipients(cfg)
    if not recipients:
        print("✗ Keine Empfänger konfiguriert (ONEDOC_MAIL_TO / MAIL_TO / email_config.json).")
        return False

    refresh_report_file_for_mail()

    ok_all = True
    for recipient in recipients:
        html_body = build_html(
            stand,
            aenderungen,
            test=test,
            use_focus=use_focus,
            refresh_for_email=recipient,
            jetzt=jetzt,
        )
        if not _send_one_report_mail(
            cfg,
            recipient=recipient,
            html_body=html_body,
            jetzt=jetzt,
            total=total,
            use_focus=use_focus,
            test=test,
            on_demand=False,
            smtp_pass=smtp_pass,
        ):
            ok_all = False
    return ok_all


def send_report_to_one(to_email: str, *, on_demand: bool = False, test: bool = False) -> bool:
    """Versand an genau eine Adresse (muss in resolve_recipients erlaubt sein)."""
    _load_local_env_file()
    cfg = load_config()
    if not cfg or not cfg.get("aktiv"):
        print("E-Mail nicht konfiguriert.")
        return False
    allowed = resolve_recipients(cfg)
    if to_email.strip().lower() not in {a.strip().lower() for a in allowed}:
        print("✗ Adresse ist kein konfigurierter Report-Empfänger.")
        return False
    smtp_pass = resolve_smtp_password(cfg)
    if not smtp_pass:
        print("✗ SMTP Passwort fehlt.")
        return False

    refresh_report_file_for_mail()

    use_focus = weekend_week_focus_active()
    stand = get_aktueller_stand()
    if use_focus:
        stand = [rotate_slots_row(dict(r)) for r in stand]
    aenderungen = get_aenderungen_seit_letzter_messung(track_kw1=use_focus)
    jetzt = reporting_now().strftime("%d.%m.%Y %H:%M")
    html_body = build_html(
        stand,
        aenderungen,
        test=test,
        use_focus=use_focus,
        refresh_for_email=to_email.strip(),
        jetzt=jetzt,
    )
    total = sum(r["slots_kw0"] for r in stand)
    return _send_one_report_mail(
        cfg,
        recipient=to_email.strip(),
        html_body=html_body,
        jetzt=jetzt,
        total=total,
        use_focus=use_focus,
        test=test,
        on_demand=on_demand,
        smtp_pass=smtp_pass,
    )


if __name__ == "__main__":
    import sys
    if "--setup" in sys.argv:
        setup()
    elif "--to" in sys.argv:
        i = sys.argv.index("--to")
        to = sys.argv[i + 1]
        on_demand = "--on-demand" in sys.argv
        test = "--test" in sys.argv
        ok = send_report_to_one(to, on_demand=on_demand, test=test)
        sys.exit(0 if ok else 1)
    else:
        send_report()
