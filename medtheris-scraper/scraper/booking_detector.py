"""
Detect online-booking provider used by a practice website.

Checks:
1. Known signatures from BOOKING_SIGNATURES (onedoc, doctolib, samedi, ...).
2. Generic booking-CTA keywords ("online buchen", "réserver", "appuntamento")
   → returns "custom" if any match.
3. Otherwise "none".

Returns the detected provider key. Use mapper.py to map this to Twenty's
opportunity stage / lead-priority later.
"""
from config import BOOKING_SIGNATURES


_BOOKING_CTA_KEYWORDS = (
    "online buchen", "termin buchen", "termin online", "termin vereinbaren",
    "book online", "book appointment", "réserver", "prendre rendez-vous",
    "appuntamento", "prenotazione",
)


def detect_booking_system(links: list[str], html: str) -> str:
    html_lower = (html or "").lower()
    links_joined = " ".join(links or []).lower()

    for system, signatures in BOOKING_SIGNATURES.items():
        if system in {"custom", "none"}:
            continue
        for sig in signatures:
            if sig in html_lower or sig in links_joined:
                return system

    if any(kw in html_lower for kw in _BOOKING_CTA_KEYWORDS):
        return "custom"

    return "none"
