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


def discover_practices(
    api_key: str,
    canton_filter: str | None = None,
    max_plz: int | None = None,
    max_queries: int | None = None,
    max_pages: int = 3,
) -> list[dict]:
    """
    Discover unique physiotherapy practices via Google Maps Text Search.

    Returns "candidates" with only the cheap Text Search fields. Phone +
    website are NOT included here — call fetch_place_details(gmaps, place_id)
    after dedup/limit to populate them.

    Args:
        api_key: Google Maps API key (Places API enabled).
        canton_filter: If set, only PLZ entries with this canton are queried.
        max_plz: If set, limit to first N PLZ entries.
        max_queries: If set, limit to first N SEARCH_QUERIES.
        max_pages: Max result pages per (PLZ, query) combination.

    Returns:
        List of dicts with keys: place_id, name, address, rating,
        review_count, status, city, plz, canton.

    Cost (New Places API, 2026):
        cities * queries * pages * $0.032   (Text Search only)
    """
    gmaps = googlemaps.Client(key=api_key)
    results: list[dict] = []
    seen_place_ids: set[str] = set()

    cities = SWISS_PLZ_CITIES
    if canton_filter:
        cities = [c for c in cities if c["canton"] == canton_filter]
        if not cities:
            print(f"  WARN: kein Kanton '{canton_filter}' in config.SWISS_PLZ_CITIES")
            return []
    if max_plz:
        cities = cities[:max_plz]

    queries = SEARCH_QUERIES[:max_queries] if max_queries else SEARCH_QUERIES

    expected_calls = len(cities) * len(queries) * max_pages
    print(f"Discovery: {len(cities)} PLZ × {len(queries)} Queries × max {max_pages} Pages")
    print(f"  → höchstens {expected_calls} Text Search Calls "
          f"(~${expected_calls * 0.032:.2f}). Detail-Calls erst nach Cache+Limit.")

    for city_info in cities:
        city = city_info["city"]
        plz = city_info["plz"]
        canton = city_info["canton"]

        for query in queries:
            search_term = f"{query} {plz} {city}"
            print(f"  [{canton}] Suche: {search_term}")

            try:
                response = gmaps.places(query=search_term, language="de", region="ch")
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
                        region="ch",
                        page_token=next_token,
                    )
                    page_count += 1

            except Exception as exc:
                print(f"    Fehler bei '{search_term}': {exc}")

            time.sleep(0.5)

    print(f"Discovery fertig: {len(results)} Kandidaten "
          f"(noch ohne Telefon/Website — Detail-Calls erfolgen je verarbeiteter Praxis)")
    return results


def fetch_place_details(api_key_or_client, place_id: str) -> dict:
    """
    One Detail call per place_id — the expensive Google call ($0.037).

    Returns dict with keys: phone, website, types (and re-fetches name/address
    in case Text Search had truncated values). Empty dict on failure.

    Caller should pass either a googlemaps.Client OR an API key string.
    """
    if isinstance(api_key_or_client, str):
        gmaps = googlemaps.Client(key=api_key_or_client)
    else:
        gmaps = api_key_or_client
    try:
        detail = gmaps.place(
            place_id=place_id,
            fields=[
                "name", "formatted_address",
                "formatted_phone_number", "website",
                "rating", "user_ratings_total",
                "business_status", "type",
            ],
            language="de",
        )["result"]
    except Exception as exc:
        print(f"    Detail-Fehler {place_id}: {exc}")
        return {}
    return {
        "name": detail.get("name"),
        "address": detail.get("formatted_address"),
        "phone": detail.get("formatted_phone_number"),
        "website": detail.get("website"),
        "rating": detail.get("rating"),
        "review_count": detail.get("user_ratings_total"),
        "status": detail.get("business_status"),
        "types": detail.get("types"),
    }
