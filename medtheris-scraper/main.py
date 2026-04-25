"""
MedTheris Physio Prospecting Scraper — CLI entry point.

Pipeline per practice:
    1. Discover via Google Maps Places (config.SWISS_PLZ_CITIES)
    2. Enrich website with Playwright (HTML, links, emails)
    3. Detect online-booking provider (booking_detector)
    4. Extract structured data with Claude (extractor)
    5. Push to Twenty CRM as Company + Person + Opportunity (twenty_client)
    6. Cache place_id in SQLite to skip on re-runs

Run modes:
    python main.py --canton ZH --dry-run    # discover + enrich, no CRM push
    python main.py --canton ZH              # full pipeline, only Zürich
    python main.py                          # full Swiss coverage (slow!)

Environment variables (see .env.example):
    GOOGLE_MAPS_API_KEY, TWENTY_API_URL, TWENTY_API_KEY, ANTHROPIC_API_KEY,
    TENANT_TAG (default 'medtheris').
"""
import argparse
import asyncio
import csv
import json
import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from crm.mapper import (
    practice_to_company_input,
    practice_to_opportunity_input,
    practice_to_people_inputs,
)
from crm.twenty_client import TwentyClient
from db.local_db import LocalDB
from scraper.booking_detector import detect_booking_system
from scraper.discovery import discover_practices, fetch_place_details
from scraper.enricher import enrich_practice
from scraper.extractor import extract_structured_data


load_dotenv()
_OUTPUT_DIR = Path(__file__).parent / "output"
_NO_EXTRACT = False  # set from CLI in main()


async def process_practice(
    practice: dict,
    twenty: TwentyClient | None,
    db: LocalDB,
    tenant: str,
    google_key: str,
) -> dict:
    """
    Run details-fetch + enrichment + extraction + (optional) Twenty push.

    Returns the (mutated) practice dict including enriched fields, so the
    caller can also dump it to CSV/JSON regardless of whether Twenty was
    contacted.
    """
    place_id = practice["place_id"]

    if db.is_processed(place_id):
        print(f"  Skip (cache hit): {practice.get('name')}")
        return practice

    print(f"  → {practice.get('name')}  ({practice.get('city')})")

    # Detail-Call NOW (after cache check) — pays only for processed practices.
    detail = fetch_place_details(google_key, place_id)
    for field in ("phone", "website", "rating", "review_count", "status"):
        if detail.get(field) and not practice.get(field):
            practice[field] = detail[field]

    if practice.get("website"):
        enriched = await enrich_practice(practice["website"])
        if "error" in enriched:
            print(f"    enrich error: {enriched['error']}")
        else:
            practice["emails_found"] = enriched.get("emails_found", [])
            practice["pages_scraped"] = enriched.get("pages_scraped", [])
            practice["booking_system"] = detect_booking_system(
                enriched.get("links", []), enriched.get("html", "")
            )
            print(f"    {len(practice['pages_scraped'])} Seiten gecrawlt, "
                  f"{len(practice['emails_found'])} Emails gefunden")
            if not _NO_EXTRACT and os.getenv("ANTHROPIC_API_KEY"):
                try:
                    practice.update(extract_structured_data(
                        enriched.get("text", ""),
                        practice.get("name", ""),
                        emails_found=practice["emails_found"],
                    ))
                except Exception as exc:
                    print(f"    extractor error: {exc}")

    company_id: str | None = None

    if twenty is not None:
        if twenty.company_exists(practice["name"]):
            print(f"    CRM: Company exists, skipping create")
        else:
            company_id = twenty.create_company(
                practice_to_company_input(practice, tenant)
            )
            if company_id:
                people = practice_to_people_inputs(practice, company_id, tenant)
                for person in people:
                    twenty.create_person(person)
                twenty.create_opportunity(
                    practice_to_opportunity_input(practice, company_id, tenant)
                )
                print(f"    CRM: Lead angelegt (company={company_id[:8]}…, "
                      f"{len(people)} Person:innen)")

    db.mark_processed(place_id, practice, twenty_company_id=company_id)
    return practice


def write_csv(rows: list[dict], path: Path) -> None:
    if not rows:
        return
    keys = sorted({k for r in rows for k in r.keys()})
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=keys)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: (json.dumps(v) if isinstance(v, (list, dict)) else v)
                             for k, v in row.items()})


async def main() -> int:
    parser = argparse.ArgumentParser(description="MedTheris Physio Scraper")
    parser.add_argument("--canton", help="Nur einen Kanton scrapen, z.B. ZH/BE")
    parser.add_argument("--dry-run", action="store_true",
                        help="Discovery + Enrichment, KEIN Twenty-Push")
    parser.add_argument("--limit", type=int, default=None,
                        help="Maximum Praxen zu verarbeiten (greift NACH discovery)")
    parser.add_argument("--max-plz", type=int, default=None,
                        help="Discovery: nur erste N PLZ (Cost-Bremse)")
    parser.add_argument("--max-queries", type=int, default=None,
                        help="Discovery: nur erste N SEARCH_QUERIES (Cost-Bremse)")
    parser.add_argument("--max-pages", type=int, default=3,
                        help="Discovery: max Result-Pages pro PLZ×Query (default 3, =60 Treffer)")
    parser.add_argument("--no-extract", action="store_true",
                        help="Keine LLM-Extraktion (spart Anthropic-Tokens)")
    args = parser.parse_args()

    global _NO_EXTRACT
    _NO_EXTRACT = args.no_extract

    google_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not google_key:
        print("FEHLER: GOOGLE_MAPS_API_KEY ist nicht gesetzt (.env).")
        return 2

    tenant = os.getenv("TENANT_TAG", "medtheris")

    twenty: TwentyClient | None = None
    if not args.dry_run:
        api_url = os.getenv("TWENTY_API_URL")
        api_key = os.getenv("TWENTY_API_KEY")
        if not api_url or not api_key:
            print("FEHLER: --dry-run nicht gesetzt aber TWENTY_API_URL / "
                  "TWENTY_API_KEY fehlen. Setze sie in .env oder nutze --dry-run.")
            return 2
        twenty = TwentyClient(api_url=api_url, api_key=api_key)

    db = LocalDB()
    print(f"Cache: {db.count()} Praxen bereits in der lokalen DB")

    practices = discover_practices(
        google_key,
        canton_filter=args.canton,
        max_plz=args.max_plz,
        max_queries=args.max_queries,
        max_pages=args.max_pages,
    )
    if args.limit:
        practices = practices[: args.limit]

    print(f"\nVerarbeite {len(practices)} Praxen "
          f"(dry-run={args.dry_run}, tenant={tenant})\n")

    processed: list[dict] = []
    for i, p in enumerate(practices, start=1):
        try:
            print(f"[{i}/{len(practices)}]", end=" ")
            result = await process_practice(p, twenty, db, tenant, google_key)
            processed.append(result)
        except KeyboardInterrupt:
            print("\nAbgebrochen — Cache wurde laufend geschrieben.")
            break
        except Exception as exc:
            print(f"  unerwarteter Fehler: {exc}")
            continue

    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = _OUTPUT_DIR / (
        f"leads-{args.canton or 'all'}{'-dryrun' if args.dry_run else ''}.csv"
    )
    write_csv(processed, csv_path)
    print(f"\nFertig. CSV: {csv_path}  (Cache: {db.count()} total)")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
