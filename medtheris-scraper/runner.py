"""
Tiny HTTP runner for the MedTheris scraper.

Goal: let the portal admin trigger a scraper run from the browser without
having to SSH into the Hetzner host. Stays intentionally minimal — no
queue, no DB, no auth-server. One in-flight job at a time, bearer-token
protected, status persisted to a JSON file under /tmp.

Endpoints:
    GET  /healthz                    {ok: true, version: '...'}
    GET  /status                     {state: 'idle'|'running'|'done'|'error', ...}
    POST /trigger                    {canton?, limit?, dry_run?, no_extract?}

Environment:
    SCRAPER_RUNNER_TOKEN   — bearer token clients must send (`Authorization: Bearer …`)
    SCRAPER_RUNNER_PORT    — default 8088
    Plus all the normal scraper envs (GOOGLE_MAPS_API_KEY, TWENTY_API_*,
    ANTHROPIC_API_KEY, TENANT_TAG, …) — see README.md
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request

ROOT = Path(__file__).resolve().parent
STATE_FILE = Path(os.getenv("SCRAPER_RUNNER_STATE", "/tmp/scraper-state.json"))
LOG_FILE = Path(os.getenv("SCRAPER_RUNNER_LOG", "/tmp/scraper-run.log"))
TOKEN = os.getenv("SCRAPER_RUNNER_TOKEN", "")
PORT = int(os.getenv("SCRAPER_RUNNER_PORT", "8088"))

app = Flask(__name__)

# Module-level singleton. The runner spawns at most one subprocess at a time
# and tracks it here. Concurrent /trigger calls return 409 until the first
# one finishes.
_lock = threading.Lock()
_proc: subprocess.Popen[bytes] | None = None


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _read_state() -> dict[str, Any]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"state": "idle"}


def _write_state(state: dict[str, Any]) -> None:
    STATE_FILE.write_text(json.dumps(state, indent=2))


def _require_auth() -> tuple[bool, str]:
    if not TOKEN:
        return False, "runner has no SCRAPER_RUNNER_TOKEN configured"
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        return False, "missing bearer token"
    if auth.split(None, 1)[1].strip() != TOKEN:
        return False, "invalid bearer token"
    return True, ""


def _build_args(payload: dict[str, Any]) -> list[str]:
    args: list[str] = [sys.executable, str(ROOT / "main.py")]
    if payload.get("country"):
        args += ["--country", str(payload["country"]).lower()]
    if payload.get("canton") or payload.get("bundesland") or payload.get("state"):
        canton = payload.get("canton") or payload.get("bundesland") or payload.get("state")
        args += ["--canton", str(canton).strip()]
    if payload.get("city"):
        args += ["--city", str(payload["city"]).strip()]
    if payload.get("plz") or payload.get("postal_code"):
        args += ["--plz", str(payload.get("plz") or payload.get("postal_code")).strip()]
    if payload.get("terms"):
        # Either an array (preferred) or a comma-separated string from the UI.
        terms = payload["terms"]
        if isinstance(terms, list):
            terms = ",".join(str(t).strip() for t in terms if str(t).strip())
        args += ["--terms", str(terms)]
    if payload.get("limit"):
        args += ["--limit", str(int(payload["limit"]))]
    if payload.get("max_plz"):
        args += ["--max-plz", str(int(payload["max_plz"]))]
    if payload.get("max_queries"):
        args += ["--max-queries", str(int(payload["max_queries"]))]
    if payload.get("max_pages"):
        args += ["--max-pages", str(int(payload["max_pages"]))]
    if payload.get("dry_run"):
        args += ["--dry-run"]
    if payload.get("no_extract"):
        args += ["--no-extract"]
    if payload.get("no_merge"):
        # Default is to merge/append; only when the caller explicitly sets
        # `no_merge=true` do we skip CRM enrichment for existing companies.
        args += ["--no-merge"]
    return args


def _watch(proc: subprocess.Popen[bytes], started_at: str, params: dict[str, Any]) -> None:
    rc = proc.wait()
    state = {
        "state": "done" if rc == 0 else "error",
        "started_at": started_at,
        "finished_at": _now(),
        "exit_code": rc,
        "params": params,
        "log_tail": _tail_log(),
    }
    _write_state(state)
    global _proc
    with _lock:
        _proc = None


def _tail_log(lines: int = 200) -> str:
    if not LOG_FILE.exists():
        return ""
    try:
        with LOG_FILE.open("rb") as fh:
            # 64 KiB is comfortable for ~200 lines and still cheap.
            data = fh.read()[-64 * 1024:]
        text = data.decode("utf-8", errors="replace")
        return "\n".join(text.splitlines()[-lines:])
    except Exception:
        return ""


def _log_mtime() -> str | None:
    """ISO timestamp of when the log file was last modified, or None."""
    try:
        if not LOG_FILE.exists():
            return None
        return datetime.fromtimestamp(
            LOG_FILE.stat().st_mtime, tz=timezone.utc
        ).isoformat(timespec="seconds")
    except Exception:
        return None


def _log_size() -> int:
    try:
        return LOG_FILE.stat().st_size if LOG_FILE.exists() else 0
    except Exception:
        return 0


@app.get("/healthz")
def healthz() -> Any:
    return jsonify({"ok": True, "now": _now()})


@app.get("/status")
def status() -> Any:
    ok, err = _require_auth()
    if not ok:
        return jsonify({"error": err}), 401
    s = _read_state()
    s["log_tail"] = _tail_log()
    s["log_updated_at"] = _log_mtime()
    s["log_size"] = _log_size()
    s["server_now"] = _now()
    # `running` flag from the OS perspective — handy if the state file got
    # out of sync because of an OOM kill or other ungraceful shutdown.
    proc_alive = _proc is not None and _proc.poll() is None
    s["proc_alive"] = bool(proc_alive)
    return jsonify(s)


@app.post("/trigger")
def trigger() -> Any:
    ok, err = _require_auth()
    if not ok:
        return jsonify({"error": err}), 401

    global _proc
    with _lock:
        if _proc is not None and _proc.poll() is None:
            return jsonify({"error": "scraper already running"}), 409

        payload = request.get_json(silent=True) or {}
        cmd = _build_args(payload)
        started_at = _now()

        # Truncate the log so each run starts clean — easier to display the
        # last run's output in the portal.
        LOG_FILE.write_text("")

        log_fh = LOG_FILE.open("ab")
        env = os.environ.copy()
        env.setdefault("PYTHONUNBUFFERED", "1")
        proc = subprocess.Popen(
            cmd,
            cwd=str(ROOT),
            stdout=log_fh,
            stderr=subprocess.STDOUT,
            env=env,
        )
        _proc = proc

        _write_state({
            "state": "running",
            "started_at": started_at,
            "params": payload,
            "cmd": cmd,
        })

        threading.Thread(
            target=_watch,
            args=(proc, started_at, payload),
            daemon=True,
        ).start()

        return jsonify({"ok": True, "started_at": started_at, "params": payload})


if __name__ == "__main__":
    # Dev mode only — production should run via gunicorn (see Dockerfile).
    app.run(host="0.0.0.0", port=PORT, debug=False)
