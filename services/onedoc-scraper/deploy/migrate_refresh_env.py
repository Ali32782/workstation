#!/usr/bin/env python3
"""One-off: set REPORT_REFRESH_BASE_URL + REPORT_REFRESH_SIGNING_SECRET from legacy TOKEN."""
import re
from pathlib import Path

p = Path("/opt/onedoc_scraper/.env")
lines = p.read_text(encoding="utf-8").splitlines()
data: dict[str, str] = {}
for line in lines:
    ls = line.strip()
    if not ls or ls.startswith("#") or "=" not in ls:
        continue
    k, v = ls.split("=", 1)
    v = v.strip()
    if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
        v = v[1:-1]
    data[k.strip()] = v

token = data.get("REPORT_REFRESH_TOKEN", "")
secret = data.get("REPORT_REFRESH_SIGNING_SECRET", "")
if token and not secret:
    secret = token


def upsert(lines: list[str], key: str, val: str) -> list[str]:
    pat = re.compile(rf"^\s*{re.escape(key)}=")
    out: list[str] = []
    hit = False
    for line in lines:
        if pat.match(line):
            out.append(f"{key}={val}")
            hit = True
        else:
            out.append(line)
    if not hit:
        out.append(f"{key}={val}")
    return out


lines = [ln for ln in lines if not ln.strip().startswith("REPORT_REFRESH_URL=")]
lines = upsert(lines, "REPORT_REFRESH_BASE_URL", "http://128.140.96.217")
if secret:
    lines = upsert(lines, "REPORT_REFRESH_SIGNING_SECRET", secret)
p.write_text("\n".join(lines).rstrip() + "\n", encoding="utf-8")
print("OK migrate_refresh_env")
