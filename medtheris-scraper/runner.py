"""
Tiny HTTP runner for the multi-vertical scraper.

Goal: let the portal admin trigger a scraper run from the browser without
having to SSH into the Hetzner host. Stays intentionally minimal — no
queue, no DB, no auth-server. One in-flight job at a time, bearer-token
protected, status persisted to a JSON file under /tmp.

Endpoints:
    GET  /healthz                    {ok: true, version: '...'}
    GET  /preflight?profile=aerzte   {ok, missing[], present[], details{}}
    GET  /cache_summary?profile=…    {total, pushed, unpushed, by_canton[],
                                      by_profile[]}
    GET  /profiles                   {profiles: [...]}
    GET  /profile_status             {profiles: [{key,label,one_shot,
                                      already_run,last_run_at,run_count,…}]}
    GET  /status                     {state: 'idle'|'running'|'done'|'error', ...}
    POST /trigger                    {profile?, specialties?, canton?, limit?,
                                      dry_run?, no_extract?, push_cache?,
                                      force_rerun?}

Environment:
    SCRAPER_RUNNER_TOKEN   — bearer token clients must send
    SCRAPER_RUNNER_PORT    — default 8088
    Plus the normal scraper envs (GOOGLE_MAPS_API_KEY, TWENTY_API_*,
    TWENTY_KINEO_API_KEY, ANTHROPIC_API_KEY, …) — see README.md
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from flask import Flask, jsonify, request

# Make sure scraper.* imports work when the runner is started from /opt/...
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from scraper.profiles import (  # noqa: E402 — sys.path setup before import
    Profile,
    UnknownProfileError,
    get_profile,
    list_profiles,
)

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


def _resolve_profile(payload: dict[str, Any]) -> Profile:
    """
    Pick the profile from the trigger payload.

    Defaults to `physio` (legacy Medtheris flow). Raises
    `UnknownProfileError` if the caller sent an unknown key — the HTTP
    handler turns that into a 400.
    """
    return get_profile(payload.get("profile"))


def _build_args(payload: dict[str, Any]) -> tuple[list[str], Profile]:
    """
    Translate JSON trigger payload → main.py CLI args.

    Returns the CLI argv plus the resolved profile, so the trigger
    handler can record which profile is running for /status display.
    """
    profile = _resolve_profile(payload)

    args: list[str] = [sys.executable, str(ROOT / "main.py")]
    args += ["--profile", profile.key]

    if payload.get("specialties"):
        spec = payload["specialties"]
        if isinstance(spec, list):
            spec = ",".join(str(s).strip() for s in spec if str(s).strip())
        args += ["--specialties", str(spec)]

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
        args += ["--no-merge"]
    if payload.get("push_cache"):
        args += ["--push-cache"]
    if payload.get("force_rerun"):
        args += ["--force-rerun"]
    return args, profile


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
            data = fh.read()[-64 * 1024:]
        text = data.decode("utf-8", errors="replace")
        return "\n".join(text.splitlines()[-lines:])
    except Exception:
        return ""


def _log_mtime() -> str | None:
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


# Required env vars for ANY scraper run, regardless of profile.
_REQUIRED_BASE_ENVS: tuple[str, ...] = (
    "GOOGLE_MAPS_API_KEY",
    "TWENTY_API_URL",
)
# Optional envs we still surface so the operator can see whether
# expensive features (LLM, social lookup) are available.
_OPTIONAL_ENVS: tuple[str, ...] = (
    "ANTHROPIC_API_KEY",
    "ENABLE_SOCIAL_LOOKUP",
)


def _mask(v: str) -> str:
    if not v:
        return ""
    return f"{v[:4]}…(len={len(v)})"


@app.get("/profiles")
def profiles_list() -> Any:
    """List every registered profile + its UI metadata.

    No auth required — purely descriptive. The trigger endpoint is the
    only thing that actually starts work, and that one is bearer-locked.
    """
    out = []
    for p in list_profiles():
        out.append({
            "key": p.key,
            "label": p.label,
            "description": p.description,
            "emoji": p.emoji,
            "one_shot": p.one_shot,
            "default_canton": p.default_canton,
            "locked_canton": p.locked_canton,
            "crm_workspace": p.crm_workspace,
            "tenant_tag": p.tenant_tag,
            "industry_label": p.industry_label,
            "extract_with_llm": p.extract_with_llm,
            "detect_booking": p.detect_booking,
            "specialties": [
                {
                    "key": s.key,
                    "label": s.label,
                    "enabled_by_default": s.enabled_by_default,
                }
                for s in p.specialties
            ],
        })
    return jsonify({"profiles": out})


@app.get("/preflight")
def preflight() -> Any:
    """Surface required-env state for the requested profile.

    `?profile=aerzte` resolves to the profile's `api_key_env`
    (TWENTY_KINEO_API_KEY) so the UI banner shows the *right* missing
    key — Medtheris-only and Kineo-only env vars are independent.
    """
    ok, err = _require_auth()
    if not ok:
        return jsonify({"error": err}), 401

    try:
        profile = get_profile(request.args.get("profile"))
    except UnknownProfileError as exc:
        return jsonify({"error": str(exc)}), 400

    required = list(_REQUIRED_BASE_ENVS)
    # Profile-specific API key. Adding it here means the UI's "Trigger
    # gesperrt" banner correctly fires when only the OTHER workspace's
    # key is missing.
    if profile.api_key_env not in required:
        required.append(profile.api_key_env)
    # `TENANT_TAG` is no longer strictly required because main.py falls
    # back to profile.tenant_tag; we still surface it as optional so the
    # operator can see the override status.

    present: list[str] = []
    missing: list[str] = []
    details: dict[str, dict[str, Any]] = {}
    for name in required:
        val = os.getenv(name, "")
        if val:
            present.append(name)
            details[name] = {"required": True, "set": True, "hint": _mask(val)}
        else:
            missing.append(name)
            details[name] = {"required": True, "set": False, "hint": ""}
    for name in _OPTIONAL_ENVS + ("TENANT_TAG",):
        val = os.getenv(name, "")
        details[name] = {
            "required": False,
            "set": bool(val),
            "hint": _mask(val) if val else "",
        }

    return jsonify({
        "profile": profile.key,
        "ok": len(missing) == 0,
        "missing": missing,
        "present": present,
        "details": details,
        "checked_at": _now(),
    })


@app.get("/cache_summary")
def cache_summary() -> Any:
    """
    Local cache stats — optionally scoped to one profile.

    `?profile=aerzte` returns only the Ärzte rows; without a filter the
    UI gets the full mix plus a `by_profile` breakdown so it can render
    the per-profile badges.
    """
    ok, err = _require_auth()
    if not ok:
        return jsonify({"error": err}), 401
    profile_key = request.args.get("profile")
    if profile_key:
        try:
            get_profile(profile_key)
        except UnknownProfileError as exc:
            return jsonify({"error": str(exc)}), 400
    try:
        from db.local_db import LocalDB  # noqa: WPS433 — intentional lazy
        return jsonify(LocalDB().cache_summary(profile=profile_key))
    except Exception as exc:
        return jsonify({"error": f"cache_summary failed: {exc}"}), 500


@app.get("/profile_status")
def profile_status() -> Any:
    """
    Per-profile run history + one-shot lock state.

    Used by the UI to disable the trigger button for `sportvereine` once
    the first successful run is recorded — and to show "letzter Lauf:
    YYYY-MM-DD" on every profile card.
    """
    ok, err = _require_auth()
    if not ok:
        return jsonify({"error": err}), 401
    try:
        from db.local_db import LocalDB  # noqa: WPS433
        db = LocalDB()
        out = []
        for p in list_profiles():
            run = db.get_profile_run(p.key) or {}
            already_run = run.get("last_status") == "ok"
            out.append({
                "key": p.key,
                "label": p.label,
                "one_shot": p.one_shot,
                "locked": bool(p.one_shot and already_run),
                "first_run_at": run.get("first_run_at"),
                "last_run_at": run.get("last_run_at"),
                "last_force_at": run.get("last_force_at"),
                "run_count": run.get("run_count") or 0,
                "last_status": run.get("last_status"),
            })
        return jsonify({"profiles": out, "checked_at": _now()})
    except Exception as exc:
        return jsonify({"error": f"profile_status failed: {exc}"}), 500


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
    proc_alive = _proc is not None and _proc.poll() is None
    s["proc_alive"] = bool(proc_alive)
    return jsonify(s)


def _check_one_shot(profile: Profile, payload: dict[str, Any]) -> tuple[bool, str | None]:
    """
    Enforce one-shot lock at the runner layer (defence in depth — main.py
    also checks, but a hard 409 here gives the UI a clean error before
    we even spawn a subprocess).

    Honours:
      * `dry_run=True` → never blocked (cost-free reconnaissance).
      * `push_cache=True` → never blocked (just drains an existing run's
        payload; doesn't re-discover).
      * `force_rerun=True` → bypass the lock (CLI-style escape hatch).

    Returns (allowed, reason). reason is filled when allowed=False.
    """
    if not profile.one_shot:
        return True, None
    if payload.get("dry_run") or payload.get("push_cache"):
        return True, None
    if payload.get("force_rerun"):
        return True, None
    try:
        from db.local_db import LocalDB  # noqa: WPS433
        prior = LocalDB().get_profile_run(profile.key)
    except Exception:
        # If we can't read the ledger we err on the SAFE side: no lock.
        # A subsequent successful run would record itself anyway.
        return True, None
    if not prior or prior.get("last_status") != "ok":
        return True, None
    return False, (
        f"profile '{profile.key}' is one-shot and was already run "
        f"successfully on {prior['last_run_at']} ({prior['run_count']} runs)."
    )


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
        try:
            cmd, profile = _build_args(payload)
        except UnknownProfileError as exc:
            return jsonify({"error": str(exc)}), 400

        # Locked-canton check at runner layer — gives a clean 400 with
        # explanation rather than letting main.py exit-2 ten seconds in.
        if profile.locked_canton:
            sent_canton = (
                (payload.get("canton") or payload.get("bundesland")
                 or payload.get("state") or "")
            ).strip().upper()
            if sent_canton and sent_canton != profile.locked_canton:
                return jsonify({
                    "error": (
                        f"profile {profile.key!r} is locked to canton "
                        f"{profile.locked_canton}; got {sent_canton!r}"
                    ),
                }), 400

        allowed, reason = _check_one_shot(profile, payload)
        if not allowed:
            return jsonify({
                "error": reason,
                "code": "one_shot_locked",
                "profile": profile.key,
                "hint": (
                    "Use force_rerun=true on the trigger payload to bypass "
                    "(CLI-only in production UIs)."
                ),
            }), 409

        started_at = _now()

        # Truncate the log so each run starts clean.
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

        params = {**payload, "_resolved_profile": profile.key}
        _write_state({
            "state": "running",
            "started_at": started_at,
            "params": params,
            "cmd": cmd,
        })

        threading.Thread(
            target=_watch,
            args=(proc, started_at, params),
            daemon=True,
        ).start()

        return jsonify({
            "ok": True,
            "started_at": started_at,
            "profile": profile.key,
            "params": params,
        })


if __name__ == "__main__":
    # Dev mode only — production runs via gunicorn (see Dockerfile).
    app.run(host="0.0.0.0", port=PORT, debug=False)
