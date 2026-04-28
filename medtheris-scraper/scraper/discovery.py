"""
Google Maps Places API discovery.

Two-step pipeline (cost-optimized):
  1. discover_practices()    - Text Search only. Returns basic info from the
                               search response (name, address, types, rating).
                               No Detail calls = cheap.
  2. fetch_place_details()   - One Detail call per place_id. Called by main.py
                               only AFTER cache-dedup AND --limit have filtered
                               down the list, so we only pay for places we
                               actually process.

This avoids the previous behaviour where 20 Detail calls were made even with
--limit 3, costing ~$0.74 instead of ~$0.11.
"""
import time

import googlemaps

from config import SEARCH_QUERIES, SWISS_PLZ_CITIES


_PHYSIO_TYPE_HINTS = {"physiotherapist", "health", "medical_health"}
_PHYSIO_NAME_HINTS = ("physio", "therapie", "rehabilitation", "rehab")


def _looks_like_physio(name: str | None, types: list[str] | None) -> bool:
    name_lower = (name or "").lower()
    types = types or []
    return (
        any(t in _PHYSIO_TYPE_HINTS for t in types)
        or any(kw in name_lower for kw in _PHYSIO_NAME_HINTS)
    )


def _normalize(value: str | None) -> str:
    return (value or "").strip().casefold()


def discover_practices(
    api_key: str,
    canton_filter: str | None = None,
    max_plz: int | None = None,
    max_queries: int | None = None,
    max_pages: int = 3,
    country_filter: str | None = None,
    city_filter: str | None = None,
    plz_filter: str | None = None,
    extra_terms: list[str] | None = None,
) -> list[dict]:
    """
    Discover unique physiotherapy practices via Google Maps Text Search.

    Returns "candidates" with only the cheap Text Search fields. Phone +
    website are NOT included here — call fetch_place_details(gmaps, place_id)
    after dedup/limit to populate them.

    Args:
        api_key: Google Maps API key (Places API enabled).
        canton_filter: Restrict to a Swiss canton (or German Bundesland — same
            field; the discovery pipeline doesn't distinguish CH/DE here).
        max_plz: Limit to first N PLZ entries from the curated list.
        max_queries: Limit to first N SEARCH_QUERIES.
        max_pages: Max result pages per (PLZ, query) combination.
        country_filter: Two-letter region code passed to Google Maps
            (defaults to "ch"). Use "de", "at", … for cross-border runs.
        city_filter: Restrict to a city name (case-insensitive substring match
            against `SWISS_PLZ_CITIES[*].city`). If the city isn't in the
            curated list it is added on-the-fly as a single ad-hoc target.
        plz_filter: Restrict to one PLZ. If the PLZ isn't curated it is added
            ad-hoc with `city`/`canton` set to whatever the caller provided
            (or empty strings).
        extra_terms: Additional discovery search terms appended to the
            standard `SEARCH_QUERIES` list (de-duped, case-insensitive).

    Returns:
        List of dicts with keys: place_id, name, address, rating,
        review_count, status, city, plz, canton.

    Cost (New Places API, 2026):
        cities * queries * pages * $0.032   (Text Search only)
    """
    gmaps = googlemaps.Client(key=api_key)
    results: list[dict] = []
    seen_place_ids: set[str] = set()

    region = (country_filter or "ch").lower()
    cities = list(SWISS_PLZ_CITIES)

    if canton_filter:
        cities = [c for c in cities if _normalize(c["canton"]) == _normalize(canton_filter)]
    if city_filter:
        wanted = _normalize(city_filter)
        cities = [c for c in cities if wanted in _normalize(c["city"])]
    if plz_filter:
        wanted = (plz_filter or "").strip()
        cities = [c for c in cities if c["plz"] == wanted]
        if not cities:
            # Ad-hoc PLZ that isn't in our curated list — still discoverable.
            cities = [{
                "plz": wanted,
                "city": (city_filter or "").strip() or wanted,
                "canton": (canton_filter or "").strip(),
            }]

    if not cities and city_filter:
        # User asked for a city that's outside the curated list (e.g. "Bern Liebefeld").
        cities = [{
            "plz": "",
            "city": city_filter.strip(),
            "canton": (canton_filter or "").strip(),
        }]

    if not cities:
        print(
            f"  WARN: keine PLZ/City-Treffer für Filter "
            f"(country={country_filter}, canton={canton_filter}, "
            f"city={city_filter}, plz={plz_filter})"
        )
        return []

    if max_plz:
        cities = cities[:max_plz]

    base_queries = list(SEARCH_QUERIES)
    if extra_terms:
        for term in extra_terms:
            t = term.strip()
            if t and t.casefold() not in {q.casefold() for q in base_queries}:
                base_queries.append(t)
    queries = base_queries[:max_queries] if max_queries else base_queries

    expected_calls = len(cities) * len(queries) * max_pages
    print(f"Discovery: {len(cities)} PLZ × {len(queries)} Queries × max {max_pages} Pages")
    print(f"  → höchstens {expected_calls} Text Search Calls "
          f"(~${expected_calls * 0.032:.2f}). Detail-Calls erst nach Cache+Limit.")

    for city_info in cities:
        city = city_info["city"]
        plz = city_info["plz"]
        canton = city_info["canton"]

        for query in queries:
            # Build the most informative search term given the available
            # location pieces. Empty parts (e.g. ad-hoc city without PLZ) are
            # silently dropped so we don't end up with double-spaces.
            term_parts = [query, plz, city, canton]
            search_term = " ".join(p for p in term_parts if p)
            print(f"  [{canton or 'XX'}] Suche: {search_term}")

            try:
                response = gmaps.places(query=search_term, language="de", region=region)
                page_count = 1

                while True:
                    for place in response.get("results", []):
                        pid = place["place_id"]
                        if pid in seen_place_ids:
                            continue
                        seen_place_ids.add(pid)

                        if not _looks_like_physio(
                            place.get("name"), place.get("types")
                        ):
                            continue

                        results.append({
                            "place_id": pid,
                            "name": place.get("name"),
                            "address": place.get("formatted_address"),
                            "rating": place.get("rating"),
                            "review_count": place.get("user_ratings_total"),
                            "status": place.get("business_status"),
                            "city": city,
                            "plz": plz,
                            "canton": canton,
                        })

                    next_token = response.get("next_page_token")
                    if not next_token or page_count >= max_pages:
                        break
                    time.sleep(2)
                    response = gmaps.places(
                        query=search_term,
                        language="de",
                        region=region,
                        page_token=next_token,
                    )
                    page_count += 1

            except Exception as exc:
                print(f"    Fehler bei '{search_term}': {exc}")

            time.sleep(0.5)

    print(f"Discovery fertig: {len(results)} Kandidaten "
          f"(noch ohne Telefon/Website — Detail-Calls erfolgen je verarbeiteter Praxis)")
    return results


def _format_opening_hours(weekday_text: list[str] | None) -> str | None:
    """Compact one-liner from Google's per-day list, e.g. 'Mo: 07:00-19:00; ...'."""
    if not weekday_text:
        return None
    return "; ".join(line.strip() for line in weekday_text if line)


def fetch_place_details(api_key_or_client, place_id: str) -> dict:
    """
    One Detail call per place_id — the expensive Google call (~$0.04 with
    the extra fields we now request). Caller should pass either a
    googlemaps.Client OR an API key string.

    Returns flat dict with everything the rest of the pipeline needs:
        name, address, phone, intl_phone, website, rating, review_count,
        status, types, opening_hours, opening_hours_24h, geo_lat, geo_lng,
        plus_code, wheelchair_accessible, google_maps_url
    Empty dict on failure.
    """
    if isinstance(api_key_or_client, str):
        gmaps = googlemaps.Client(key=api_key_or_client)
    else:
        gmaps = api_key_or_client
    try:
        # Use top-level field names only. Nested paths like
        # `opening_hours/weekday_text` break on some Places API configurations
        # (invalid-fields error); the client still returns full objects.
        detail = gmaps.place(
            place_id=place_id,
            fields=[
                "name",
                "formatted_address",
                "formatted_phone_number",
                "international_phone_number",
                "website",
                "rating",
                "user_ratings_total",
                "business_status",
                "type",
                "opening_hours",
                "current_opening_hours",
                "geometry",
                "plus_code",
                "wheelchair_accessible_entrance",
                "url",
            ],
            language="de",
        )["result"]
    except Exception as exc:
        print(f"    Detail-Fehler {place_id}: {exc}")
        return {}

    location = (detail.get("geometry") or {}).get("location") or {}
    plus = (detail.get("plus_code") or {}).get("global_code")

    legacy_hours = (detail.get("opening_hours") or {}).get("weekday_text")
    current_hours = (detail.get("current_opening_hours") or {}).get("weekday_text")
    weekday_text = current_hours or legacy_hours
    open_now = (detail.get("opening_hours") or {}).get("open_now")

    return {
        "name": detail.get("name"),
        "address": detail.get("formatted_address"),
        "phone": detail.get("formatted_phone_number"),
        "intl_phone": detail.get("international_phone_number"),
        "website": detail.get("website"),
        "rating": detail.get("rating"),
        "review_count": detail.get("user_ratings_total"),
        "status": detail.get("business_status"),
        "types": detail.get("types"),
        "opening_hours": _format_opening_hours(weekday_text),
        "opening_hours_open_now": open_now,
        "geo_lat": location.get("lat"),
        "geo_lng": location.get("lng"),
        "plus_code": plus,
        "wheelchair_accessible": detail.get("wheelchair_accessible_entrance"),
        "google_maps_url": detail.get("url"),
    }
