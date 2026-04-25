"""
Email pattern inference: from {first_name, last_name, domain} guess the most
likely direct email addresses.

This is HEURISTIC — never overwrite a confirmed email with a guess. The CRM
mapper writes inferred emails into a separate field with the prefix "guess:"
so Sales-Reps know they're trying a probable but unverified address.

Common DACH-Physio patterns we test:
    anna.mueller@praxis.ch    (most common)
    a.mueller@praxis.ch
    anna@praxis.ch
    mueller@praxis.ch
    a.m@praxis.ch
"""
import re
import unicodedata


def _normalize(name: str) -> str:
    """Strip diacritics, lowercase, keep [a-z0-9]."""
    if not name:
        return ""
    n = unicodedata.normalize("NFKD", name)
    n = "".join(c for c in n if not unicodedata.combining(c))
    n = n.lower()
    n = re.sub(r"[^a-z0-9]", "", n)
    return n


def domain_from_url(url: str) -> str | None:
    """Extract the apex/host domain from a URL ('https://www.praxis.ch/' → 'praxis.ch')."""
    if not url:
        return None
    m = re.search(r"://(?:www\.)?([^/]+)", url)
    return m.group(1).lower() if m else None


def infer_email_candidates(full_name: str | None, domain: str | None,
                           known_emails: list[str] | None = None) -> list[str]:
    """
    Return a deduped list of plausible email addresses for `full_name @ domain`.

    Rules:
      - if no name or no domain: return []
      - if a known confirmed email already matches the local-part: skip the guess
        (we don't want to "guess" anna@praxis.ch when it was already harvested)
      - return at most 4 candidates ordered by likelihood
    """
    if not full_name or not domain:
        return []
    parts = full_name.strip().split()
    if not parts:
        return []
    first = _normalize(parts[0])
    last = _normalize(parts[-1]) if len(parts) > 1 else ""
    if not first:
        return []

    domain_l = domain.lower().lstrip("www.")
    known_locals = {
        e.split("@", 1)[0].lower()
        for e in (known_emails or []) if "@" in e
    }

    candidates_ordered: list[str] = []
    seen: set[str] = set()

    def add(local: str) -> None:
        local = local.strip(".")
        if not local or local in known_locals or local in seen:
            return
        candidates_ordered.append(f"{local}@{domain_l}")
        seen.add(local)

    if last:
        add(f"{first}.{last}")     # anna.mueller
        add(f"{first[0]}.{last}")  # a.mueller
        add(f"{first}{last}")      # annamueller
    add(first)                     # anna
    if last:
        add(last)                  # mueller

    return candidates_ordered[:4]
