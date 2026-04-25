"""
Playwright-based website enrichment.

Two-stage crawl:
  Stage 1: Homepage  →  pick MAX_SUBPAGES priority subpages
            (/impressum, /team, /kontakt, /standort-foo, …)
  Stage 2: From the team-page links, pick MAX_PERSON_PAGES person profile
            subpages (e.g. /jessica-kroeling). These are common on Wix/
            Squarespace sites where each therapist has their own URL —
            usually the first 2 are the owner + lead therapist.

For each visited page we collect:
  - merged HTML (for booking detector)
  - merged body innerText (truncated for LLM)
  - all <a href> links (for booking detector + email harvest)
  - email addresses found via regex (filtered for spam patterns)

Without subpage crawling the LLM extractor can only return generic info
because owner names + per-person emails almost never live on the homepage
of a Swiss physio site.
"""
import re
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright


_EMAIL_REGEX = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}"
)
_EMAIL_BLOCKLIST = (
    "noreply", "no-reply", "example", "test@", "spam", "yourname",
    "wixpress", "sentry", "wordpress", "domain.com", "sentry.io",
    "googlemail", "googleapis",
)

# URL path keywords that typically lead to team / contact / about pages.
# Score = priority (higher first). Impressum is by Swiss law obligated to
# contain the legal owner + address, so it gets the top score.
_SUBPAGE_PRIORITIES: dict[str, int] = {
    "impressum": 100,        # Swiss legal: must list owner
    "rechtlich": 95,
    "team": 90,
    "unser-team": 90,
    "therapeuten": 85,
    "physiotherapeuten": 85,
    "mitarbeiter": 80,
    "ueber-uns": 75,
    "ueber_uns": 75,
    "uberuns": 75,
    "about": 70,
    "praxis": 60,
    "leitung": 55,
    "kontakt": 50,
    "contact": 50,
    "ansprechpartner": 45,
    # Standort/Filiale variants — Wix sites often use these for branch pages
    "standort": 40,
    "filiale": 40,
    "niederlassung": 40,
}
MAX_SUBPAGES = 5
MAX_PERSON_PAGES = 2  # extra Stage-2 crawls: owner + lead therapist profiles

# Pattern for individual person-profile URLs: "/vorname-nachname" or
# "/dr-vorname-nachname" with no other path segments. We exclude obvious
# non-profile slugs (services, blog, jobs, …).
_PERSON_PATH_RE = re.compile(
    r"^/(?:dr-?|prof-?|prof\.dr-?)?[a-z]+-[a-z]+(?:-[a-z]+)?/?$"
)
_NON_PERSON_HINTS = (
    "physiotherapie", "therapie", "training", "behandlung", "termin",
    "kontakt", "impressum", "team", "preise", "blog", "newsletter",
    "jobs", "online", "buchen", "datenschutz", "agb", "kurse",
    "angebot", "praxis", "standort", "ueber", "haeufige", "privacy",
    "cookie", "imprint", "service", "sport", "manuelle", "lymph",
    "becken", "kiefer", "neuro", "stosswelle", "laser", "shop",
    "domizil", "rehabilitation", "rehab",
)


def _classify_subpage(url: str) -> int:
    """
    Score a URL by likelihood of containing person info.
    Higher = better candidate. 0 = skip.
    """
    path = urlparse(url).path.lower()
    if not path or path == "/":
        return 0
    return max(
        (score for kw, score in _SUBPAGE_PRIORITIES.items() if kw in path),
        default=0,
    )


def _is_person_profile_path(absolute_url: str) -> bool:
    """Heuristic: does this URL look like /vorname-nachname (a person page)?"""
    path = urlparse(absolute_url).path.lower().rstrip("/")
    if not _PERSON_PATH_RE.match(path + ("/" if not path.endswith("/") else "")):
        return False
    if any(hint in path for hint in _NON_PERSON_HINTS):
        return False
    return True


def _pick_subpages(homepage_url: str, links: list[str]) -> list[str]:
    """
    From the homepage's link list, pick the top-N subpages most likely to
    contain owner / team info. Same-domain only.
    """
    home_host = urlparse(homepage_url).netloc.lower().lstrip("www.")
    candidates: list[tuple[int, str]] = []
    seen: set[str] = set()
    for link in links:
        if not link or link.startswith(("mailto:", "tel:", "javascript:")):
            continue
        try:
            absolute = urljoin(homepage_url, link).split("#", 1)[0].rstrip("/")
        except Exception:
            continue
        host = urlparse(absolute).netloc.lower().lstrip("www.")
        if host != home_host:
            continue
        if absolute in seen or absolute == homepage_url.rstrip("/"):
            continue
        seen.add(absolute)
        score = _classify_subpage(absolute)
        if score > 0:
            candidates.append((score, absolute))
    candidates.sort(key=lambda t: -t[0])
    return [url for _, url in candidates[:MAX_SUBPAGES]]


def _pick_person_pages(base_url: str, links: list[str],
                       already_visited: set[str]) -> list[str]:
    """
    From a list of links (typically harvested from the team page), pick the
    first MAX_PERSON_PAGES URLs that look like individual person profiles.
    Order is preserved — on most team pages the owner/lead is listed first.
    Same-domain only, dedup against already_visited.
    """
    home_host = urlparse(base_url).netloc.lower().lstrip("www.")
    out: list[str] = []
    seen: set[str] = set(already_visited)
    for link in links:
        if not link or link.startswith(("mailto:", "tel:", "javascript:")):
            continue
        try:
            absolute = urljoin(base_url, link).split("#", 1)[0].rstrip("/")
        except Exception:
            continue
        host = urlparse(absolute).netloc.lower().lstrip("www.")
        if host != home_host or absolute in seen:
            continue
        if _is_person_profile_path(absolute):
            out.append(absolute)
            seen.add(absolute)
            if len(out) >= MAX_PERSON_PAGES:
                break
    return out


async def _scrape_page(page, url: str, timeout_ms: int) -> dict:
    """Visit one page, return its html/text/links/emails. Empty dict on error."""
    try:
        await page.goto(url, timeout=timeout_ms, wait_until="domcontentloaded")
        html = await page.content()
        text = await page.inner_text("body")
        links = await page.eval_on_selector_all(
            "a[href]", "els => els.map(e => e.href)"
        )
        emails = {
            e for e in _EMAIL_REGEX.findall(html)
            if not any(b in e.lower() for b in _EMAIL_BLOCKLIST)
        }
        # Also harvest mailto: links — they're cleaner than free-text matches
        for link in links:
            if link and link.lower().startswith("mailto:"):
                addr = link.split(":", 1)[1].split("?", 1)[0].strip()
                if addr and not any(b in addr.lower() for b in _EMAIL_BLOCKLIST):
                    emails.add(addr)
        return {
            "url": url,
            "html": html,
            "text": text,
            "links": links,
            "emails": list(emails),
        }
    except Exception as exc:
        return {"url": url, "error": str(exc)}


async def enrich_practice(url: str, timeout_ms: int = 15000) -> dict:
    """
    Visit a practice website + up to 3 subpages, return structured enrichment.

    Returns one of:
        {"html": ..., "text": ..., "links": [...], "emails_found": [...],
         "pages_scraped": [url1, url2, ...]}
        {"error": "..."} on failure (network, timeout, invalid URL).
    """
    if not url or not url.startswith(("http://", "https://")):
        return {"error": f"invalid url: {url!r}"}

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            context = await browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                viewport={"width": 1280, "height": 900},
            )
            page = await context.new_page()

            home = await _scrape_page(page, url, timeout_ms)
            if "error" in home:
                return {"error": home["error"]}

            subpages = _pick_subpages(url, home.get("links", []))
            page_blobs: list[dict] = [home]
            visited: set[str] = {url.rstrip("/")}
            team_link_pool: list[str] = []
            for sub in subpages:
                blob = await _scrape_page(page, sub, timeout_ms=10000)
                if "error" not in blob:
                    page_blobs.append(blob)
                    visited.add(sub.rstrip("/"))
                    # If this looks like a team/therapeut page, collect its
                    # links for Stage-2 person-profile picking.
                    if any(kw in urlparse(sub).path.lower()
                           for kw in ("team", "therapeut", "mitarbeiter")):
                        team_link_pool.extend(blob.get("links", []))

            # Stage 2: from team-page links, crawl up to MAX_PERSON_PAGES
            # individual person profiles (typically owner + lead therapist).
            if team_link_pool:
                person_pages = _pick_person_pages(url, team_link_pool, visited)
                for pp in person_pages:
                    blob = await _scrape_page(page, pp, timeout_ms=10000)
                    if "error" not in blob:
                        page_blobs.append(blob)
                        visited.add(pp.rstrip("/"))

            merged_text_parts: list[str] = []
            for blob in page_blobs:
                heading = f"\n\n=== {blob['url']} ===\n"
                merged_text_parts.append(heading + (blob.get("text") or ""))
            merged_text = "".join(merged_text_parts)

            merged_html = "\n".join(b.get("html", "") for b in page_blobs)
            merged_links = list({l for b in page_blobs for l in b.get("links", [])})
            merged_emails = list({e for b in page_blobs for e in b.get("emails", [])})

            return {
                "html": merged_html,
                "text": merged_text[:18000],  # raised from 8000 — Impressum at end was being clipped
                "links": merged_links,
                "emails_found": merged_emails,
                "pages_scraped": [b["url"] for b in page_blobs],
            }
        finally:
            await browser.close()
