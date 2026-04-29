"""
Heuristic extraction of phone / email from raw HTML when structured fields
are still empty after the main enricher (e.g. number only in footer tel: link).
"""
from __future__ import annotations

import re
import urllib.parse


_TEL_HREF = re.compile(r"""href\s*=\s*['"]tel:([^'">\s]+)""", re.I)
_MAILTO_HREF = re.compile(r"""href\s*=\s*['"]mailto:([^'">\s?]+)""", re.I)
_EMAIL_RE = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)
_EMAIL_BLOCK = (
    "noreply", "no-reply", "example", "wixpress", "sentry", "wordpress",
)


def _decode_tel(href_val: str) -> str | None:
    raw = urllib.parse.unquote(href_val.strip())
    raw = re.sub(r"^tel:", "", raw, flags=re.I).strip()
    if not raw:
        return None
    digits = re.sub(r"[^\d+]", "", raw)
    if len(digits) < 6:
        return None
    return raw if raw.startswith("+") else digits


def _clean_email(addr: str) -> str | None:
    a = urllib.parse.unquote(addr.strip().split("?", 1)[0]).lower()
    if not a or "@" not in a:
        return None
    for b in _EMAIL_BLOCK:
        if b in a:
            return None
    return a


def supplement_contacts_from_enrichment(practice: dict, html: str | None) -> None:
    """
    Mutate `practice` in place: fill `phone` / `general_email` / `emails_found`
    from `html` when those signals are still missing.
    """
    if not html or not isinstance(html, str):
        return

    if not (practice.get("phone") or "").strip():
        for m in _TEL_HREF.finditer(html):
            num = _decode_tel(m.group(1))
            if num:
                practice["phone"] = num
                break

    if not (practice.get("general_email") or "").strip():
        for m in _MAILTO_HREF.finditer(html):
            em = _clean_email(m.group(1))
            if em:
                practice["general_email"] = em
                found = list(practice.get("emails_found") or [])
                if em not in found:
                    found.append(em)
                practice["emails_found"] = found
                return

    if not (practice.get("general_email") or "").strip():
        found = list(practice.get("emails_found") or [])
        for m in _EMAIL_RE.finditer(html):
            em = _clean_email(m.group(0))
            if not em or em in found:
                continue
            if any(b in em for b in _EMAIL_BLOCK):
                continue
            practice["general_email"] = em
            found.append(em)
            practice["emails_found"] = found
            break
