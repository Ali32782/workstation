"""
teams_report.py – Postet den Kineo Slot-Report in einen Microsoft Teams-Kanal.

Variante (mit Fallback):
1) Microsoft Graph mit Delegated Auth (bevorzugt; braucht einmaligen Login)
2) Incoming Webhook (Fallback, Text-only)

Delegated Auth läuft über Device-Code (Token-Cache wird gespeichert).
Auf dem Server einmal ausführen:
  `.venv/bin/python3 teams_report.py --auth`

Env (auf dem Server):
  TEAMS_GRAPH_TENANT_ID
  TEAMS_GRAPH_CLIENT_ID
  TEAMS_GRAPH_CLIENT_SECRET
  TEAMS_GRAPH_TEAM_ID
  TEAMS_GRAPH_CHANNEL_ID

Optional:
  TEAMS_GRAPH_SCOPE (default: "https://graph.microsoft.com/ChannelMessage.Send offline_access")
  TEAMS_GRAPH_TOKEN_CACHE_PATH (default: models/teams_graph_token.json)

Webhook:
  TEAMS_WEBHOOK_URL
"""

import base64
import json
import os
import sys
import time
from pathlib import Path
from typing import Any
from datetime import datetime, timezone
import urllib.request
import urllib.parse
import urllib.error

from email_report import (
    get_aktueller_stand,
    get_aenderungen_seit_letzter_messung,
)
from week_focus import rotate_slots_row, weekend_week_focus_active, reporting_now


def _load_local_env_file() -> None:
    """Lightweight .env loader to avoid fragile shell sourcing."""
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
        # Keep explicit env precedence, but replace empty placeholders.
        if not os.environ.get(key):
            os.environ[key] = value


_load_local_env_file()


def _teams_state_path() -> Path:
    return (Path(__file__).parent / "models" / "teams_state.json").resolve()


def _read_last_teams_slot() -> str:
    p = _teams_state_path()
    if not p.exists():
        return ""
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        return str(data.get("last_teams_slot", "") or "").strip()
    except Exception:
        return ""


def _slot_key_to_sqlite_end_ts(slot_key: str) -> str:
    # slot_key format from scheduler: YYYY-MM-DD HH
    try:
        dt = datetime.strptime(slot_key.strip(), "%Y-%m-%d %H")
    except Exception:
        return ""
    return dt.strftime("%Y-%m-%d %H:59:59")


def get_aenderungen_seit_letztem_teams_post(track_kw1: bool = False) -> tuple[list[dict], bool]:
    """
    Vergleicht aktuelle Werte mit dem letzten bekannten Teams-Slot aus models/teams_state.json.
    Returns: (changes, used_last_teams_baseline)
    """
    slot_key = _read_last_teams_slot()
    cutoff = _slot_key_to_sqlite_end_ts(slot_key) if slot_key else ""
    if not cutoff:
        return get_aenderungen_seit_letzter_messung(track_kw1=track_kw1), False

    expr = (
        "COALESCE(slots_kw1, naechste_14d - naechste_7d, 0)"
        if track_kw1
        else "COALESCE(slots_kw0, naechste_7d, 0)"
    )
    try:
        import sqlite3

        db_path = (Path(__file__).parent / "slots.db").resolve()
        conn = sqlite3.connect(db_path)
        conn.row_factory = sqlite3.Row
        rows = conn.execute(
            f"""
            SELECT cur.standort, cur.therapeut,
                   cur.wert AS aktuell,
                   base.wert AS vorher
            FROM (
                SELECT s1.standort, s1.therapeut, {expr} AS wert, s1.id
                FROM slot_snapshots s1
                JOIN (
                    SELECT standort, therapeut, MAX(id) AS max_id
                    FROM slot_snapshots
                    GROUP BY standort, therapeut
                ) latest ON latest.max_id = s1.id
            ) cur
            LEFT JOIN (
                SELECT s1.standort, s1.therapeut, {expr} AS wert, s1.id
                FROM slot_snapshots s1
                JOIN (
                    SELECT standort, therapeut, MAX(id) AS max_id
                    FROM slot_snapshots
                    WHERE datetime(created_at) <= datetime(?)
                    GROUP BY standort, therapeut
                ) b ON b.max_id = s1.id
            ) base ON base.standort = cur.standort AND base.therapeut = cur.therapeut
            ORDER BY cur.standort, cur.therapeut
            """,
            (cutoff,),
        ).fetchall()
        conn.close()
    except Exception:
        return get_aenderungen_seit_letzter_messung(track_kw1=track_kw1), False

    aenderungen: list[dict] = []
    for r in rows:
        if r["vorher"] is None:
            continue
        delta = int(r["aktuell"]) - int(r["vorher"])
        if delta == 0:
            continue
        typ = "↑ Mehr freie Slots" if delta > 0 else "↓ Weniger freie Slots"
        aenderungen.append(
            {
                "standort": r["standort"],
                "therapeut": r["therapeut"],
                "vorher": int(r["vorher"]),
                "aktuell": int(r["aktuell"]),
                "delta": delta,
                "typ": typ,
            }
        )
    return aenderungen, True


def _post_to_teams(webhook_url: str, payload: dict) -> None:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        webhook_url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        # Teams antwortet typischerweise mit 200 OK und leerem Body.
        _ = resp.read()


def _token_cache_path() -> Path:
    p = os.getenv("TEAMS_GRAPH_TOKEN_CACHE_PATH", "").strip()
    if p:
        return Path(p)
    return (Path(__file__).parent / "models" / "teams_graph_token.json").resolve()


def _graph_device_code_flow() -> dict[str, Any]:
    tenant_id = os.getenv("TEAMS_GRAPH_TENANT_ID", "").strip()
    client_id = os.getenv("TEAMS_GRAPH_CLIENT_ID", "").strip()
    client_secret = os.getenv("TEAMS_GRAPH_CLIENT_SECRET", "").strip()
    scope = os.getenv(
        "TEAMS_GRAPH_SCOPE",
        "https://graph.microsoft.com/ChannelMessage.Send offline_access",
    ).strip()

    if not (tenant_id and client_id and client_secret):
        raise RuntimeError("Graph Config fehlt (TEAMS_GRAPH_TENANT_ID/CLIENT_ID/CLIENT_SECRET).")

    device_code_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/devicecode"
    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"

    body = urllib.parse.urlencode({"client_id": client_id, "scope": scope}).encode("utf-8")
    req = urllib.request.Request(
        device_code_url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read().decode("utf-8", errors="ignore")
    parsed = json.loads(raw)

    device_code = parsed.get("device_code")
    user_code = parsed.get("user_code")
    verification_url = parsed.get("verification_uri")
    interval = int(parsed.get("interval", 5))
    expires_in = int(parsed.get("expires_in", 600))
    message = parsed.get("message")

    if not (device_code and user_code and verification_url):
        raise RuntimeError(f"Device-Code Flow fehlgeschlagen (response keys={list(parsed.keys())})")

    print("\n=== Microsoft Graph Device Login ===")
    print(message or "Bitte führe den Login aus:")
    print(f"User Code: {user_code}")
    print(f"URL: {verification_url}")
    print("Warte auf Bestätigung...\n")

    deadline = datetime.now(timezone.utc).timestamp() + expires_in
    while True:
        if datetime.now(timezone.utc).timestamp() > deadline:
            raise RuntimeError("Device-Code Flow abgelaufen.")

        time.sleep(interval)
        token_data = {
            "client_id": client_id,
            "client_secret": client_secret,
            "device_code": device_code,
            "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
        }
        token_body = urllib.parse.urlencode(token_data).encode("utf-8")
        token_req = urllib.request.Request(
            token_url,
            data=token_body,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(token_req, timeout=25) as resp2:
                raw2 = resp2.read().decode("utf-8", errors="ignore")
            tokens = json.loads(raw2)
            if tokens.get("access_token"):
                return tokens
        except urllib.error.HTTPError as exc:
            raw2 = exc.read().decode("utf-8", errors="ignore") if hasattr(exc, "read") else ""
            try:
                err = json.loads(raw2) if raw2 else {}
            except Exception:
                err = {}
            e = err.get("error")
            if e in ("authorization_pending", "slow_down"):
                if e == "slow_down":
                    interval += 5
                continue
            if e:
                raise RuntimeError(f"Graph Token Fehler: {e} ({err})")
            raise


def _graph_refresh_access_token(refresh_token: str) -> dict[str, Any]:
    tenant_id = os.getenv("TEAMS_GRAPH_TENANT_ID", "").strip()
    client_id = os.getenv("TEAMS_GRAPH_CLIENT_ID", "").strip()
    client_secret = os.getenv("TEAMS_GRAPH_CLIENT_SECRET", "").strip()

    if not (tenant_id and client_id and client_secret):
        raise RuntimeError("Graph Config fehlt (TEAMS_GRAPH_*).")

    token_url = f"https://login.microsoftonline.com/{tenant_id}/oauth2/v2.0/token"
    token_data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    body = urllib.parse.urlencode(token_data).encode("utf-8")
    req = urllib.request.Request(
        token_url,
        data=body,
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=25) as resp:
        raw = resp.read().decode("utf-8", errors="ignore")
    return json.loads(raw)


def _graph_get_access_token() -> str:
    cache_path = _token_cache_path()
    if not cache_path.exists():
        raise RuntimeError("Graph Token Cache fehlt. Bitte einmal `teams_report.py --auth` ausführen.")

    cache = json.loads(cache_path.read_text(encoding="utf-8"))
    refresh_token = cache.get("refresh_token", "")
    if not refresh_token:
        raise RuntimeError("Graph Token Cache hat keinen refresh_token. Bitte einmal `teams_report.py --auth` ausführen.")

    tokens = _graph_refresh_access_token(refresh_token)
    access_token = tokens.get("access_token")
    if not access_token:
        raise RuntimeError("Graph refresh lieferte keinen access_token.")

    if tokens.get("refresh_token"):
        cache["refresh_token"] = tokens["refresh_token"]
    cache["access_token"] = access_token
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps(cache, ensure_ascii=False), encoding="utf-8")
    return access_token


def _graph_request(method: str, url: str, payload: dict[str, Any] | None = None) -> dict[str, Any]:
    token = _graph_get_access_token()
    data = None
    headers = {"Authorization": f"Bearer {token}"}
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=30) as resp:
        raw = resp.read().decode("utf-8", errors="ignore")
    if not raw:
        return {}
    return json.loads(raw)


def _upload_report_via_graph(*, message_text: str, dry_run: bool) -> None:
    team_id = os.getenv("TEAMS_GRAPH_TEAM_ID", "").strip()
    channel_id = os.getenv("TEAMS_GRAPH_CHANNEL_ID", "").strip()
    if not (team_id and channel_id):
        raise RuntimeError("Graph Config fehlt (TEAMS_GRAPH_TEAM_ID/CHANNEL_ID).")

    report_path = Path(__file__).parent / "report.html"
    if not report_path.exists():
        raise FileNotFoundError(str(report_path))

    file_bytes = report_path.read_bytes()
    b64 = base64.b64encode(file_bytes).decode("ascii")

    title = os.getenv("TEAMS_TITLE", "Kineo Slot-Report").strip() or "Kineo Slot-Report"
    file_name = os.getenv("TEAMS_REPORT_FILE_NAME", "report.html").strip() or "report.html"

    # Teams-Channel Nachrichten unterstützen "attachments" als hosted contents (inline/hosted).
    # Wir verpacken den report.html als hostedContent und verlinken ihn im Message-Body.
    temp_id = "1"
    link_href = f"../hostedContents/{temp_id}/$value"
    body_html = message_text.replace("\n", "<br/>") + (
        f"<br/><br/><a href=\"{link_href}\">{file_name} (Download)</a>"
    )
    payload = {
        "body": {"contentType": "html", "content": body_html},
        "hostedContents": [
            {
                "@microsoft.graph.temporaryId": temp_id,
                "contentBytes": b64,
                "contentType": "text/html",
            }
        ],
    }

    if dry_run:
        print("Graph Upload Dry-run:")
        print("  team_id:", team_id)
        print("  channel_id:", channel_id)
        print("  message_text_len:", len(message_text))
        print("  file_bytes:", len(file_bytes))
        print("  file_b64_len:", len(b64))
        return

    url = f"https://graph.microsoft.com/v1.0/teams/{team_id}/channels/{channel_id}/messages"
    _graph_request("POST", url, payload=payload)
    print("✓ Teams-Upload via Graph gesendet.")


def build_message_text(
    stand: list[dict], aenderungen: list[dict], use_focus: bool, baseline_is_last_teams: bool
) -> str:
    jetzt = reporting_now().strftime("%d.%m.%Y %H:%M")
    total_slots = sum(r.get("slots_kw0", 0) for r in stand)

    focus_line = (
        "Wochenend-Fokus aktiv (KW1-KW4 statt KW1-KW?)"
        if use_focus
        else "Normaler Fokus (Woche 1)"
    )

    header = f"Kineo Slot-Report · {jetzt} · {len(stand)} Therapeuten · {total_slots} freie Slots"
    msg_lines = [header, focus_line]

    delta_label = (
        "seit letztem Teams-Update"
        if baseline_is_last_teams
        else "seit letzter Messung"
    )

    if aenderungen:
        top = sorted(aenderungen, key=lambda x: abs(x.get("delta", 0)), reverse=True)[:6]
        parts = []
        for a in top:
            typ = a.get("typ", "Änderung")
            ther = a.get("therapeut", "")
            standort = a.get("standort", "")
            v = a.get("vorher", "")
            k = a.get("aktuell", "")
            parts.append(f"{typ}: {ther} ({standort}) {v}->{k}")
        msg_lines.append(f"{len(aenderungen)} Änderungen {delta_label}. Top: " + " | ".join(parts))
    else:
        msg_lines.append(f"Keine relevanten Änderungen {delta_label} erkannt.")

    report_url = os.getenv("TEAMS_REPORT_URL", "").strip()
    if report_url:
        msg_lines.append(f"Report: {report_url}")
    else:
        msg_lines.append("Details: vollständiger Report ist als `report.html` auf dem Server vorhanden.")

    return "\n".join(msg_lines)


def send_teams_report(*, dry_run: bool = False) -> bool:
    # Priorität: Graph Upload wenn konfiguriert; sonst Webhook (Text-only).
    graph_ready = all(
        os.getenv(k, "").strip()
        for k in [
            "TEAMS_GRAPH_TENANT_ID",
            "TEAMS_GRAPH_CLIENT_ID",
            "TEAMS_GRAPH_CLIENT_SECRET",
            "TEAMS_GRAPH_TEAM_ID",
            "TEAMS_GRAPH_CHANNEL_ID",
        ]
    )

    use_focus = weekend_week_focus_active()
    stand = get_aktueller_stand()
    if use_focus:
        stand = [rotate_slots_row(dict(r)) for r in stand]
    aenderungen, used_last_teams = get_aenderungen_seit_letztem_teams_post(track_kw1=use_focus)

    title = os.getenv("TEAMS_TITLE", "Kineo Slot-Report").strip() or "Kineo Slot-Report"
    text = build_message_text(
        stand, aenderungen, use_focus=use_focus, baseline_is_last_teams=used_last_teams
    )

    if graph_ready:
        try:
            _upload_report_via_graph(message_text=text, dry_run=dry_run)
            return True
        except Exception as exc:
            # Bei "application permissions" ist Teams Channel posting häufig gesperrt.
            # Fallback auf Incoming Webhook, damit wenigstens der Text-Post kommt.
            print(f"Graph Upload fehlgeschlagen: {exc}")

    webhook_url = os.getenv("TEAMS_WEBHOOK_URL", "").strip()
    if not webhook_url and not dry_run:
        print("✗ TEAMS_WEBHOOK_URL fehlt (Incoming Webhook in Teams) und Graph ist nicht konfiguriert.")
        return False

    payload = {
        "title": title,
        "text": text,
    }

    if dry_run:
        print("Dry-run Teams Payload:\n" + json.dumps(payload, ensure_ascii=False, indent=2))
        return True

    _post_to_teams(webhook_url, payload)
    print("✓ Teams-Post gesendet.")
    return True


if __name__ == "__main__":
    if "--auth" in sys.argv:
        tokens = _graph_device_code_flow()
        cache_path = _token_cache_path()
        cache_path.parent.mkdir(parents=True, exist_ok=True)
        cache_path.write_text(json.dumps(tokens, ensure_ascii=False), encoding="utf-8")
        print(f"✓ Graph Token Cache gespeichert: {cache_path}")
        sys.exit(0)

    dry_run = "--dry-run" in sys.argv
    ok = send_teams_report(dry_run=dry_run)
    sys.exit(0 if ok else 1)

