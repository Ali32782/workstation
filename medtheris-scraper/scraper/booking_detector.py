"""
Detect online-booking provider AND underlying website-platform of a practice.

The detector now consumes ALL signals the enricher captures:

    HTML (full merged), <a href> links, <iframe src>, <script src>,
    <form action>, <meta name="generator">

This matters because most modern practice sites embed a third-party booking
widget INSIDE an iframe; the iframe-src is by far the strongest signal of
which provider runs in the background. A homepage with "online buchen" copy
but no iframe/script signature is at best 'custom' (we should call them
manually to ask which system they use, or recommend onboarding into ours).

Returns a structured dict so the CRM mapper can write provider, confidence
and evidence as separate Twenty fields:

    {
        "provider": "onedoc" | ... | "custom" | "none",
        "confidence": "high" | "medium" | "low" | "none",
        "evidence": "iframe-src=onedoc.ch" | "script-src=cal.com" | ...,
        "platform": "wix" | "wordpress" | ... | "custom",
        "platform_evidence": "meta-generator=Wix.com" | ...,
    }
"""
from urllib.parse import urlparse

from config import (
    BOOKING_SIGNATURES,
    HIGH_CONFIDENCE_BOOKING_PROVIDERS,
    WEBSITE_PLATFORM_SIGNATURES,
)


_BOOKING_CTA_KEYWORDS = (
    "online buchen", "termin buchen", "termin online", "termin vereinbaren",
    "online termin", "online-termin", "jetzt buchen", "termin reservieren",
    "book online", "book appointment", "schedule appointment",
    "réserver", "prendre rendez-vous",
    "appuntamento", "prenotazione",
)


def _scan(signatures: list[str], haystacks: dict[str, str]) -> tuple[str, str] | None:
    """
    Scan each (label, blob) in haystacks for any of the signatures.
    Return (label, signature) of the first hit, or None.
    """
    for label, blob in haystacks.items():
        if not blob:
            continue
        for sig in signatures:
            if sig in blob:
                return label, sig
    return None


def _confidence_for(provider: str, source_label: str) -> str:
    """
    Confidence ranking:
      - high   : iframe/script/form match on a high-confidence physio provider
      - medium : iframe/script/form match on a horizontal scheduler (calendly etc.)
      - low    : html/link match only (could be just a "we use X" mention)
      - custom : generic CTA keyword fallback
    """
    if provider == "custom":
        return "low"
    is_strong_source = source_label in {"iframe", "script", "form"}
    if provider in HIGH_CONFIDENCE_BOOKING_PROVIDERS and is_strong_source:
        return "high"
    if is_strong_source:
        return "medium"
    if provider in HIGH_CONFIDENCE_BOOKING_PROVIDERS:
        return "medium"
    return "low"


def detect_booking_system(
    *,
    html: str = "",
    links: list[str] | None = None,
    iframes: list[str] | None = None,
    scripts: list[str] | None = None,
    form_actions: list[str] | None = None,
) -> dict:
    """
    Identify the online-booking provider and how strong the evidence is.

    Args are keyword-only because the historical signature was
    `detect_booking_system(links, html)` and we want the new caller path to
    fail loudly rather than silently flip the args.
    """
    haystacks = {
        "iframe": " ".join(iframes or []).lower(),
        "script": " ".join(scripts or []).lower(),
        "form":   " ".join(form_actions or []).lower(),
        "link":   " ".join(links or []).lower(),
        "html":   (html or "").lower(),
    }

    for provider, sigs in BOOKING_SIGNATURES.items():
        if provider in {"custom", "none"} or not sigs:
            continue
        hit = _scan(sigs, haystacks)
        if hit:
            label, sig = hit
            return {
                "provider": provider,
                "confidence": _confidence_for(provider, label),
                "evidence": f"{label}-match={sig}",
            }

    if any(kw in haystacks["html"] for kw in _BOOKING_CTA_KEYWORDS):
        return {
            "provider": "custom",
            "confidence": "low",
            "evidence": "html-cta-keyword",
        }

    return {"provider": "none", "confidence": "none", "evidence": ""}


def detect_website_platform(
    *,
    html: str = "",
    scripts: list[str] | None = None,
    meta_generators: list[str] | None = None,
) -> dict:
    """
    Identify which CMS / page-builder powers the practice website.

    Returns:
        {"platform": "<key>" or "custom", "platform_evidence": "<source>=<sig>"}
    """
    haystacks = {
        "meta-generator": " ".join((meta_generators or [])).lower(),
        "script":          " ".join(scripts or []).lower(),
        "html":            (html or "").lower(),
    }

    for platform, sigs in WEBSITE_PLATFORM_SIGNATURES.items():
        if platform == "custom" or not sigs:
            continue
        hit = _scan(sigs, haystacks)
        if hit:
            label, sig = hit
            return {"platform": platform, "platform_evidence": f"{label}={sig}"}

    return {"platform": "custom", "platform_evidence": ""}
