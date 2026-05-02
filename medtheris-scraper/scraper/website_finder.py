"""
Find a practice website when Google Maps doesn't list one.

Roughly half of the Swiss physio practices the discovery layer turns up
have NO `website` field in their Google Places payload — but a sizeable
fraction of those (especially the ones with 100+ Google reviews) DO have
their own homepage; it's just not pinned in Maps. Without a website the
whole enrichment pipeline (booking detection, LLM extraction, email
harvest, owner LinkedIn lookup) is blocked, so the resulting CRM entry
is effectively skeleton data.

This module mirrors `social_finder.py`: a single LLM web_search round-
trip, gated behind an env flag (``ENABLE_WEBSITE_LOOKUP=1``), that asks
Claude to find the practice's own homepage and return a URL plus a
self-reported confidence. We trust the answer only if:

  1. URL is parseable, http/https, no obvious aggregator host
     (gelbeseiten.ch / search.ch / local.ch / linkedin.com / facebook.com /
     google.com / yelp.com / …).
  2. The hostname plausibly matches the practice — at least one
     "interesting token" (≥4 chars, ASCII-folded, lowercased) from the
     practice or owner name appears in the registrable domain. This kills
     hallucinations like the LLM returning a random Wix-template URL.
  3. Confidence is high or medium. Low-confidence guesses are dropped.

Costs: ~$0.03 / call on Sonnet (the same as social_finder). At 100
practices that's ~$3.

The caller updates `practice["website"]` and adds bookkeeping fields
(``website_source``, ``website_lookup_confidence``,
``website_lookup_reasoning``) so we can audit which leads got their
URL via fallback vs. directly from Google.
"""
from __future__ import annotations

import json
import os
import random
import re
import time
from urllib.parse import urlparse

import anthropic


# Anthropic enforces an org-wide tokens-per-minute budget on Sonnet 4.5
# (default 30k input / min on the free tier, more on paid). A retry-mode
# run that bursts 100+ web_search calls back-to-back trips this within
# ~60 seconds. We sleep _RATE_LIMIT_COOLDOWN_S between retries so the
# bucket has time to refill, and add a tiny jitter so multiple practices
# whose lookups happen at the exact same wall-clock minute don't all
# wake up together and re-hit the limit.
_ANTHROPIC_RATE_LIMIT_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"rate[\s_-]*limit", re.IGNORECASE),
    re.compile(r"\b429\b"),
    re.compile(r"tokens per minute", re.IGNORECASE),
)
_ANTHROPIC_COOLDOWN_S: float = 65.0
_ANTHROPIC_MAX_RETRIES: int = 4
_ANTHROPIC_MIN_DELAY_S: float = 0.4   # gentle pacing between calls

_last_call_at: float = 0.0


def _is_anthropic_rate_limit(exc: Exception) -> bool:
    """Detect Anthropic's 429 / rate-limit-error response.

    Both the SDK's typed error (RateLimitError) and the generic
    Exception fallback contain the phrase "rate_limit_error" or "429"
    in their str(), so a regex check on the message is enough.
    """
    return any(rx.search(str(exc)) for rx in _ANTHROPIC_RATE_LIMIT_PATTERNS)


def _pace() -> None:
    """Sleep just enough to keep the call rate below ~150/min globally.

    Without this, the discovery loop can fire dozens of calls in <10 s
    and burn the per-minute token budget faster than necessary. Each
    web_search round-trip is ~2-3k tokens on Sonnet, so 0.4 s pacing
    keeps us at roughly 6-7k tokens/s sustained — well under the limit
    on the standard tier.
    """
    global _last_call_at
    elapsed = time.monotonic() - _last_call_at
    if elapsed < _ANTHROPIC_MIN_DELAY_S:
        time.sleep(_ANTHROPIC_MIN_DELAY_S - elapsed)
    _last_call_at = time.monotonic()


# Hosts that are aggregators / directories / social, not the practice
# itself. The LLM sometimes returns these instead of the practice site;
# treat them as a non-find rather than a hallucination so we don't
# pollute the CRM with directory URLs.
_AGGREGATOR_HOSTS: tuple[str, ...] = (
    "gelbeseiten.ch",
    "local.ch",
    "search.ch",
    "doctolib.ch",
    "doctolib.com",
    "onedoc.ch",
    "yelp.com",
    "yelp.ch",
    "linkedin.com",
    "facebook.com",
    "instagram.com",
    "youtube.com",
    "x.com",
    "twitter.com",
    "tiktok.com",
    "google.com",
    "google.ch",
    "google.de",
    "moneyhouse.ch",
    "zefix.ch",
    "zefix.admin.ch",
    "physioswiss.ch",  # member directory — useful seed but not the practice site
    "openingtimes.ch",
    "tripadvisor.com",
    "instagram.com",
    "wikipedia.org",
)

# Tokens that frequently appear in *every* physio practice name and would
# therefore false-positive any hostname match. We strip them when we
# look for "interesting" tokens. The list is conservative — anything
# longer/more specific stays in.
_GENERIC_TOKENS: frozenset[str] = frozenset({
    "physio",
    "physiotherapie",
    "physiotherapy",
    "praxis",
    "therapie",
    "therapy",
    "praxisgemeinschaft",
    "praxiszentrum",
    "zentrum",
    "center",
    "centre",
    "klinik",
    "klinikum",
    "gesundheit",
    "gesundheitszentrum",
    "rehabilitation",
    "reha",
    "ambulant",
    "schweiz",
    "switzerland",
    "ag",
    "gmbh",
    "and",
    "und",
    "der",
    "die",
    "das",
    "fuer",
    "für",
    "und",
    "in",
    "die",
    "the",
    "of",
})


def _ascii_fold(s: str) -> str:
    """Lowercase + collapse common german/french accents to ASCII so a
    domain like ``mueller-physio.ch`` matches a name spelled "Müller".
    """
    table = str.maketrans({
        "ä": "ae", "ö": "oe", "ü": "ue", "ß": "ss",
        "Ä": "ae", "Ö": "oe", "Ü": "ue",
        "à": "a", "â": "a", "á": "a",
        "é": "e", "è": "e", "ê": "e", "ë": "e",
        "í": "i", "ì": "i", "î": "i",
        "ó": "o", "ò": "o", "ô": "o",
        "ú": "u", "ù": "u", "û": "u",
        "ç": "c",
    })
    return s.lower().translate(table)


def _camelcase_split(token: str) -> list[str]:
    """Split CamelCase / mixed-case compound names into their parts.

    "PhysioBasel"  → ["Physio", "Basel"]
    "physiobasel"  → ["physiobasel"]   (no caps, can't split deterministically)
    "MeineGuteBasel" → ["Meine", "Gute", "Basel"]

    Practice names like "PhysioBasel AG" or "OrthoCenterZurich" are common
    and the simple word splitter misses them — without this, the hostname
    matcher rejects perfectly good URLs.
    """
    # Split on the position right before each uppercase letter that
    # follows a lowercase letter. Doesn't split runs of uppercase.
    parts = re.findall(r"[A-Z][a-z]+|[A-Z]+(?![a-z])|[a-z]+|\d+", token)
    return parts or [token]


def _interesting_tokens(text: str) -> set[str]:
    """Return the set of ≥4-char tokens after dropping generics.

    Used both for the practice name and the owner name (when present)
    so a domain like ``maier-physiotherapie-zh.ch`` matches a name
    "Maier Physiotherapie" or owner "Anna Maier".

    Splits both on whitespace/punctuation AND on CamelCase boundaries
    so compound names ("PhysioBasel", "OrthoCenterZurich") get matched.
    """
    parts = re.split(r"[^A-Za-z0-9]+", text)
    expanded: list[str] = []
    for p in parts:
        expanded.extend(_camelcase_split(p))
    folded = [_ascii_fold(p) for p in expanded]
    return {p for p in folded if len(p) >= 4 and p not in _GENERIC_TOKENS}


def _token_root(token: str) -> str:
    """Stable 5-char prefix of a folded token, used for fuzzy matching.

    Swiss practice names often differ from the domain by a vowel or
    suffix:  Schiffländi → schifflaendi (folded)  vs. domain
    physio-schifflaende.ch  (no trailing -i). A hard substring match
    fails. Comparing the first 5 ASCII chars catches the overlap.
    """
    return _ascii_fold(token)[:5]


def _registrable_domain(url: str) -> str | None:
    """Return the host minus a leading ``www.``, or None on parse error.

    We don't bother with the public-suffix list here — for our hostname
    plausibility check, the full host string is enough; we just want to
    test for substring overlap with practice tokens.
    """
    try:
        host = (urlparse(url).hostname or "").lower()
    except Exception:
        return None
    if not host:
        return None
    if host.startswith("www."):
        host = host[4:]
    return host


def _is_aggregator(host: str) -> bool:
    return any(host == h or host.endswith("." + h) for h in _AGGREGATOR_HOSTS)


def _hostname_matches_practice(host: str, name: str, owner: str = "") -> bool:
    """At least one strong token from name+owner has to appear in host.

    Two-stage check:
      1. Direct substring of a ≥4-char token in the host (fast path,
         catches the obvious cases).
      2. Fuzzy 5-char prefix match — the token's first 5 folded chars
         have to appear somewhere in the host. Covers Swiss spelling
         variants like "Schiffländi" vs. domain "schifflaende".

    Examples that pass:
      host=physio-mueller.ch          name="Physio Müller"        → "mueller" ✓
      host=physio-basel.ch            name="PhysioBasel AG"       → CamelCase split → "basel" ✓
      host=physio-schifflaende.ch     name="Physio zur Schiffländi" → 5-char prefix "schif" ✓
      host=jessica-kroeling.ch        owner="Jessica Kroeling"    → "kroeling" ✓

    Examples that don't:
      host=top-physiotherapie.ch      name="Praxis Müller"        → no overlap
    """
    folded_host = _ascii_fold(host)
    tokens = _interesting_tokens(name) | _interesting_tokens(owner)
    if not tokens:
        return False
    # Fast path: full-token substring.
    if any(t in folded_host for t in tokens):
        return True
    # Fuzzy fallback: 5-char prefix has to appear in host. Only counts
    # if the prefix is at least 5 chars long (shorter prefixes match
    # too aggressively — e.g. "phys" matches "physiotherapie" in any
    # site).
    for t in tokens:
        root = _token_root(t)
        if len(root) >= 5 and root in folded_host:
            return True
    return False


def _build_prompt(name: str, city: str, canton: str, phone: str,
                  rating: float | None, reviews: int | None) -> str:
    review_hint = ""
    if rating and reviews:
        review_hint = f"  Google      : {rating}★ ({reviews} Bewertungen)\n"
    return f"""\
Finde die offizielle Website (Homepage) der folgenden Schweizer Praxis.
Verwende das web_search-Tool. Versuche dabei mehrere Suchabfragen
nacheinander wenn nötig (z. B. Name + Stadt, Name + Telefon, Name + Kanton).

Praxis-Daten:
  Name        : {name}
  Stadt       : {city}
  Kanton      : {canton}
  Telefon     : {phone or '(nicht hinterlegt)'}
{review_hint}
Gib NUR ein JSON-Objekt zurück, KEIN Markdown:

{{
  "url": "https://eigene-praxis-domain.ch/" oder null,
  "confidence": "high" | "medium" | "low",
  "reasoning": "kurzer Satz, woran du erkennst dass diese URL zur Praxis gehört"
}}

Strenge Regeln:
- Nur die EIGENE Domain der Praxis — KEINE Verzeichnisse (search.ch, local.ch,
  gelbeseiten.ch, doctolib.ch), KEIN Social Media (LinkedIn, Facebook, Instagram),
  KEIN Google Business Profile, KEIN physioswiss.ch-Eintrag.
- Wenn du nicht sicher bist, ob die URL zur richtigen Praxis gehört: gib null
  zurück. Niemals raten.
- Hostname/Domain muss plausibel zum Praxisnamen oder Inhaber:in passen.
- Wenn die Praxis Teil einer Kette/eines Netzwerks ist (z. B. Medbase,
  Santewell), darf die Netzwerk-Domain (medbase.ch, santewell.ch) zurück-
  gegeben werden — vermerke das in reasoning.
"""


def find_practice_website(
    practice: dict,
    model: str | None = None,
    min_confidence: str = "medium",
) -> dict:
    """Search the web for the practice's homepage.

    Skip conditions:
      * `ENABLE_WEBSITE_LOOKUP` env var is not set to "1" (default: skip
        so cron runs don't burn LLM budget unintentionally).
      * Practice already has a `website` (we never overwrite Google's
        answer; that should always win).
      * No `ANTHROPIC_API_KEY` in environment.
      * No practice name (nothing to search for).

    Returns a dict suitable for `practice.update(...)`:
        {
          "website": "<url>",
          "website_source": "web_search",
          "website_lookup_confidence": "high" | "medium",
          "website_lookup_reasoning": "<llm explanation>",
        }
    or {} if no acceptable URL was found / the lookup was skipped.
    """
    if os.getenv("ENABLE_WEBSITE_LOOKUP") != "1":
        return {}
    if (practice.get("website") or "").strip():
        return {}
    if not os.getenv("ANTHROPIC_API_KEY"):
        return {}

    name = (practice.get("name") or "").strip()
    if not name:
        return {}

    city = (practice.get("city") or "").strip()
    canton = (practice.get("canton") or "").strip()
    phone = (practice.get("phone") or "").strip()
    owner = (practice.get("owner_name") or "").strip()
    rating = practice.get("rating")
    reviews = practice.get("review_count")

    prompt = _build_prompt(name, city, canton, phone, rating, reviews)

    client = anthropic.Anthropic()
    msg = None
    last_exc: Exception | None = None
    for attempt in range(_ANTHROPIC_MAX_RETRIES + 1):
        _pace()
        try:
            msg = client.messages.create(
                model=model or os.getenv(
                    "ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929",
                ),
                max_tokens=600,
                tools=[{"type": "web_search_20250305", "name": "web_search"}],
                messages=[{"role": "user", "content": prompt}],
            )
            break
        except Exception as exc:
            last_exc = exc
            if _is_anthropic_rate_limit(exc) and attempt < _ANTHROPIC_MAX_RETRIES:
                wait = _ANTHROPIC_COOLDOWN_S + random.uniform(0, 5)
                print(
                    f"    website_finder: Anthropic rate limit (attempt "
                    f"{attempt + 1}/{_ANTHROPIC_MAX_RETRIES + 1}), "
                    f"warte {wait:.0f}s und versuche es erneut…"
                )
                time.sleep(wait)
                continue
            # Non-rate-limit error, or out of retries — surface a sentinel
            # so the caller can keep the lead in the "try again later"
            # bucket instead of caching it as a permanent miss.
            print(f"    website_finder: web_search failed: {exc}")
            return {"_rate_limited": True} if _is_anthropic_rate_limit(exc) else {}

    if msg is None:
        # Should be unreachable (we either break or return inside the
        # loop) but guard anyway so a future refactor doesn't slip past.
        return {"_rate_limited": True} if last_exc and _is_anthropic_rate_limit(last_exc) else {}

    raw = "".join(
        b.text for b in msg.content if hasattr(b, "text")
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

    url = parsed.get("url")
    confidence = (parsed.get("confidence") or "low").lower()
    reasoning = parsed.get("reasoning") or ""

    if not isinstance(url, str) or not url.startswith(("http://", "https://")):
        return {}

    host = _registrable_domain(url)
    if not host:
        return {}

    if _is_aggregator(host):
        # The LLM returned a directory entry, not the practice itself.
        # We don't want this in the CRM.
        return {}

    if confidence == "low":
        return {}
    if min_confidence == "high" and confidence != "high":
        return {}

    if not _hostname_matches_practice(host, name, owner):
        # Plausibility check failed — treat as miss to avoid hallucinated
        # "looks-physio-ish" URLs slipping through. We return a sentinel
        # `_rejected_by_hostname_check` so the caller can decide to NOT
        # mark the lead as "tried" — a future improvement to the matcher
        # might let us pick this lead up next time.
        print(
            f"    website_finder: rejecting {url!r} — host {host!r} "
            f"doesn't match practice tokens (name={name!r}, owner={owner!r})"
        )
        return {"_rejected_by_hostname_check": True}

    return {
        "website": url,
        "website_source": "web_search",
        "website_lookup_confidence": confidence,
        "website_lookup_reasoning": reasoning[:240],
    }
