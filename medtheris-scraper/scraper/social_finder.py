"""
Social media + LinkedIn lookup for owners and practices.

Two paths to a LinkedIn URL:
  1. CHEAP, always-on: scan the practice website's outbound links for hosts
     in linkedin.com / instagram.com / facebook.com / x.com / youtube.com /
     tiktok.com / xing.com / threads.net. The enricher already harvests these
     into `practice["socials"]` — we just promote them onto the practice
     payload as flat fields.
  2. OPTIONAL, costs an API call: if the website didn't link to the owner's
     LinkedIn, ask Claude (with the built-in `web_search` tool) to search
     "<owner-name> <practice-name> <city> linkedin" and return the best URL.

Path 2 is gated behind ENABLE_SOCIAL_LOOKUP=1 (default off) so cron runs
don't burn LLM budget unintentionally. A typical web_search call is ~$0.03
on Sonnet 4.5 — at 100 practices that's $3, at 1000 it's $30.

Usage from main.py:

    practice = await enrich_practice(url)
    practice.update(extract_structured_data(...))
    practice.update(promote_website_socials(practice))   # Path 1, always
    if os.getenv("ENABLE_SOCIAL_LOOKUP") == "1":
        practice.update(find_owner_linkedin(practice))   # Path 2, opt-in
"""
import json
import os
import re

import anthropic


_LINKEDIN_RE = re.compile(
    r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/(?:in|pub)/[A-Za-z0-9\-_%]+/?",
    re.IGNORECASE,
)
_LINKEDIN_COMPANY_RE = re.compile(
    r"https?://(?:[a-z]{2,3}\.)?linkedin\.com/company/[A-Za-z0-9\-_%]+/?",
    re.IGNORECASE,
)


def promote_website_socials(practice: dict) -> dict:
    """
    Move the {channel: url} dict the enricher captured into top-level flat
    fields the CRM mapper consumes (one Twenty custom field per channel).

    LinkedIn is split into 'practice_linkedin' (a /company/ page if found,
    otherwise the most generic linkedin.com link) so it doesn't collide with
    'owner_linkedin' which is per-person.
    """
    socials = practice.get("socials") or {}
    out: dict[str, str | None] = {}

    for channel in ("instagram", "facebook", "youtube", "x", "tiktok",
                    "xing", "threads"):
        out[f"practice_{channel}"] = socials.get(channel) or None

    li = socials.get("linkedin")
    if li:
        if _LINKEDIN_COMPANY_RE.match(li):
            out["practice_linkedin"] = li
        else:
            # Personal LinkedIn linked from the practice site → likely the
            # owner. Promote it to owner_linkedin and leave practice_linkedin
            # empty (we'll try to find it via Path 2 if web_search is on).
            out["owner_linkedin_from_site"] = li
            out["practice_linkedin"] = None
    else:
        out["practice_linkedin"] = None

    return out


def find_owner_linkedin(practice: dict, model: str | None = None) -> dict:
    """
    Use Claude's web_search tool to locate the owner's LinkedIn profile and
    (optionally) the practice's LinkedIn company page.

    Skip conditions:
      - no owner_name extracted (nothing to search for)
      - already have owner_linkedin_from_site (Path 1 already won)
      - no ANTHROPIC_API_KEY in environment
    """
    if os.getenv("ENABLE_SOCIAL_LOOKUP") != "1":
        return {}
    if practice.get("owner_linkedin_from_site"):
        return {"owner_linkedin": practice["owner_linkedin_from_site"]}
    if not os.getenv("ANTHROPIC_API_KEY"):
        return {}

    owner = (practice.get("owner_name") or "").strip()
    if not owner:
        return {}

    pname = practice.get("name") or ""
    city = practice.get("city") or ""
    canton = practice.get("canton") or ""
    domain = (practice.get("website") or "").replace("https://", "").replace(
        "http://", ""
    ).split("/", 1)[0]

    prompt = f"""\
Finde das LinkedIn-Profil und ggf. die LinkedIn-Firmenseite für:

  Person      : {owner}
  Praxis      : {pname}
  Stadt/Region: {city} ({canton}), Schweiz
  Website     : {domain or '(unbekannt)'}

Nutze das web_search-Tool. Gib NUR ein JSON-Objekt zurück, KEIN Markdown:

{{
  "owner_linkedin": "https://www.linkedin.com/in/<slug>/" oder null,
  "practice_linkedin": "https://www.linkedin.com/company/<slug>/" oder null,
  "confidence": "high" | "medium" | "low",
  "reasoning": "kurzer Satz, warum dieses Profil zu der Person passt"
}}

Regeln:
- Nur Treffer übernehmen, wenn Name UND Praxis-/Stadt-Bezug eindeutig sind.
- Niemals raten — wenn du nichts findest, gib für die jeweilige URL null.
- "/in/" für Personen, "/company/" für Firmen — Slug-Strings nicht erfinden.
"""

    client = anthropic.Anthropic()
    try:
        msg = client.messages.create(
            model=model or os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"),
            max_tokens=600,
            tools=[{"type": "web_search_20250305", "name": "web_search"}],
            messages=[{"role": "user", "content": prompt}],
        )
    except Exception as exc:
        print(f"    social_finder: web_search failed: {exc}")
        return {}

    raw = "".join(
        block.text for block in msg.content if hasattr(block, "text")
    ).strip()

    parsed: dict = {}
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{.*?\}", raw, re.DOTALL)
        if m:
            try:
                parsed = json.loads(m.group(0))
            except json.JSONDecodeError:
                parsed = {}

    out: dict = {}
    o = parsed.get("owner_linkedin")
    if isinstance(o, str) and _LINKEDIN_RE.match(o):
        out["owner_linkedin"] = o
        out["owner_linkedin_confidence"] = parsed.get("confidence") or "low"
    p = parsed.get("practice_linkedin")
    if isinstance(p, str) and _LINKEDIN_COMPANY_RE.match(p):
        out["practice_linkedin"] = p

    return out
