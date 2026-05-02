#!/usr/bin/env python3
"""
HTTP-Endpunkt: manuell Scrape + Reporting, dann genau eine E-Mail an die klickende Person.

URL (pro Empfänger signiert):
  /report/refresh?e=<url-encoded-email>&s=<hmac-sha256-hex>

Env:
  REPORT_REFRESH_BASE_URL   (nur für Links in Mails; Server prüft Signatur)
  REPORT_REFRESH_SIGNING_SECRET  (empfohlen)
  REPORT_REFRESH_TOKEN      (Fallback als Secret, wenn SIGNING_SECRET fehlt)
  REPORT_REFRESH_PORT       (default: 8090)
  REPORT_REFRESH_BIND       (default: 127.0.0.1)
"""

from __future__ import annotations

import os
import subprocess
import sys
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).parent.resolve()
BIND = os.getenv("REPORT_REFRESH_BIND", "127.0.0.1").strip() or "127.0.0.1"
PORT = int(os.getenv("REPORT_REFRESH_PORT", "8090") or "8090")
PY = sys.executable


def _signing_secret() -> str:
    return (
        os.getenv("REPORT_REFRESH_SIGNING_SECRET", "").strip()
        or os.getenv("REPORT_REFRESH_TOKEN", "").strip()
    )


class RefreshHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.rstrip("/") != "/report/refresh":
            self.send_error(404, "Not Found")
            return

        if not _signing_secret():
            self.send_error(503, "Signing secret not configured")
            return

        qs = parse_qs(parsed.query)
        e_enc = (qs.get("e") or [""])[0]
        sig = (qs.get("s") or [""])[0]
        if not e_enc or not sig:
            self.send_error(400, "Missing e or s")
            return

        email = unquote(e_enc).strip()
        # Lazy import: lädt dieselbe .env-Logik wie der Mailversand
        from email_report import _load_local_env_file, load_config, resolve_recipients, verify_refresh_request

        _load_local_env_file()
        cfg = load_config()
        allowed = resolve_recipients(cfg)
        if not verify_refresh_request(email, sig, allowed):
            self.send_error(403, "Forbidden")
            return

        try:
            subprocess.run([PY, str(ROOT / "scraper_api.py"), "--all"], cwd=ROOT, check=True, timeout=3600)
            subprocess.run([PY, str(ROOT / "reporting.py")], cwd=ROOT, check=True, timeout=900)
        except subprocess.TimeoutExpired:
            self.send_error(504, "Timeout")
            return
        except subprocess.CalledProcessError as exc:
            self.send_error(500, f"Pipeline failed (exit {exc.returncode})")
            return
        except Exception as exc:
            self.send_error(500, str(exc))
            return

        try:
            subprocess.run(
                [PY, str(ROOT / "email_report.py"), "--to", email, "--on-demand"],
                cwd=ROOT,
                check=True,
                timeout=300,
            )
        except Exception as exc:
            sys.stderr.write("WARN: follow-up mail failed: %s\n" % exc)

        self.send_response(302)
        self.send_header("Location", "/report.html")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", "0")
        self.end_headers()


def main() -> None:
    if not _signing_secret():
        print("✗ REPORT_REFRESH_SIGNING_SECRET oder REPORT_REFRESH_TOKEN fehlt.", file=sys.stderr)
        sys.exit(1)
    httpd = HTTPServer((BIND, PORT), RefreshHandler)
    print(f"report_refresh_server listening on http://{BIND}:{PORT}/report/refresh")
    httpd.serve_forever()


if __name__ == "__main__":
    main()
