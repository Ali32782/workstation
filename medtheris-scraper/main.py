"""
Multi-vertical prospecting scraper — CLI entry point.

Pipeline per entity (vertical = profile):
    1. Discover via Google Maps Places (config.SWISS_PLZ_CITIES + profile)
    2. Enrich website with Playwright (HTML, links, emails)
    3. Detect online-booking provider (booking_detector) — profile-gated
    4. Extract structured data with Claude (extractor) — profile-prompted
    5. Push to Twenty CRM as Company + Person + Opportunity (twenty_client)
    6. Cache place_id in SQLite to skip on re-runs
    7. Record successful run in profile_runs ledger (one-shot enforcement)

Profiles (April 2026):
    physio          — Schweizer Physiotherapie-Praxen → medtheris workspace
    aerzte          — Niedergelassene Ärzt:innen      → kineo workspace
    sportvereine    — Sportvereine ZH (one-shot)      → kineo workspace

Run modes (all examples assume profile=physio for backwards compatibility):
    python main.py --profile aerzte --canton ZH --dry-run
    python main.py --profile sportvereine --dry-run
    python main.py --canton ZH                              # legacy = physio
    python main.py --push-cache --profile aerzte            # drain Ärzte cache

Environment variables (see .env.example):
    GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY,
    TWENTY_API_URL, TWENTY_API_KEY,                    # medtheris workspace
    TWENTY_KINEO_API_KEY,                              # kineo workspace
    TENANT_TAG (default 'medtheris', overridden per profile).
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
from scraper.booking_detector import detect_booking_system, detect_website_platform
from scraper.discovery import discover_practices, fetch_place_details
from scraper.enricher import enrich_practice
from scraper.extractor import extract_structured_data
from scraper.profiles import (
    Profile,
    UnknownProfileError,
    get_profile,
    list_profiles,
)
from scraper.social_finder import find_owner_linkedin, promote_website_socials
from scraper.contact_heuristics import supplement_contacts_from_enrichment


load_dotenv()
_OUTPUT_DIR = Path(__file__).parent / "output"
_NO_EXTRACT = False  # set from CLI in main()


def _resolve_twenty_credentials(profile: Profile) -> tuple[str | None, str | None]:
    """Pick the Twenty (URL, API-Key) pair for the profile's workspace.

    All profiles share the same Twenty SERVER URL — a single Twenty instance
    hosts multiple workspaces (medtheris, kineo, …) and they're addressed by
    swapping the API-Key. So the URL always comes from `TWENTY_API_URL`,
    while the key comes from `profile.api_key_env`.

    Returns (None, None) when the workspace isn't configured — main() then
    aborts with a precise error pointing at the right env var.
    """
    api_url = os.getenv("TWENTY_API_URL")
    api_key = os.getenv(profile.api_key_env)
    return api_url, api_key


async def process_practice(
    practice: dict,
    twenty: TwentyClient | None,
    db: LocalDB,
    tenant: str,
    profile: Profile,
    google_key: str,
    merge_existing: bool = True,
) -> dict:
    """
    Run details-fetch + enrichment + extraction + (optional) Twenty push.

    Returns the (mutated) practice dict including enriched fields, so the
    caller can also dump it to CSV/JSON regardless of whether Twenty was
    contacted.
    """
    place_id = practice["place_id"]

    if db.is_processed(place_id, profile=profile.key) and not merge_existing:
        print(f"  Skip (cache hit): {practice.get('name')}")
        return practice

    print(f"  → {practice.get('name')}  ({practice.get('city')})")

    detail = fetch_place_details(google_key, place_id)
    for field in ("phone", "website", "rating", "review_count", "status"):
        if detail.get(field) and not practice.get(field):
            practice[field] = detail[field]
    for field in (
        "intl_phone", "opening_hours", "opening_hours_open_now",
        "geo_lat", "geo_lng", "plus_code",
        "wheelchair_accessible", "google_maps_url", "types",
    ):
        if detail.get(field) is not None:
            practice[field] = detail[field]

    if practice.get("website"):
        enriched = await enrich_practice(practice["website"])
        if "error" in enriched:
            print(f"    enrich error: {enriched['error']}")
        else:
            practice["emails_found"] = enriched.get("emails_found", [])
            practice["pages_scraped"] = enriched.get("pages_scraped", [])
            practice["socials"] = enriched.get("socials", {}) or {}

            if profile.detect_booking:
                booking = detect_booking_system(
                    html=enriched.get("html", ""),
                    links=enriched.get("links", []),
                    iframes=enriched.get("iframes", []),
                    scripts=enriched.get("scripts", []),
                    form_actions=enriched.get("form_actions", []),
                )
                practice["booking_detection"] = booking
                practice["booking_system"] = booking["provider"]
            else:
                booking = {"provider": "n/a", "confidence": "n/a"}

            platform = detect_website_platform(
                html=enriched.get("html", ""),
                scripts=enriched.get("scripts", []),
                meta_generators=enriched.get("meta_generators", []),
            )
            practice["website_platform_detection"] = platform
            practice["website_platform"] = platform["platform"]

            print(
                f"    {len(practice['pages_scraped'])} Seiten gecrawlt, "
                f"{len(practice['emails_found'])} Emails, "
                f"booking={booking['provider']} ({booking['confidence']}), "
                f"platform={platform['platform']}"
            )

            practice.update(promote_website_socials(practice))

            supplement_contacts_from_enrichment(
                practice,
                enriched.get("html") or "",
            )

            if (
                profile.extract_with_llm
                and not _NO_EXTRACT
                and os.getenv("ANTHROPIC_API_KEY")
            ):
                try:
                    practice.update(extract_structured_data(
                        enriched.get("text", ""),
                        practice.get("name", ""),
                        emails_found=practice["emails_found"],
                        prompt_key=profile.extractor_prompt_key,
                    ))
                except Exception as exc:
                    print(f"    extractor error: {exc}")

            try:
                extra_social = find_owner_linkedin(practice)
                if extra_social:
                    practice.update(extra_social)
                    print(
                        f"    LinkedIn (web_search): "
                        f"owner={'yes' if extra_social.get('owner_linkedin') else 'no'}, "
                        f"company={'yes' if extra_social.get('practice_linkedin') else 'no'}"
                    )
            except Exception as exc:
                print(f"    social_finder error: {exc}")

    company_id = _push_practice_to_twenty(
        practice, twenty, tenant, profile=profile, merge_existing=merge_existing
    )

    db.mark_processed(
        place_id, practice,
        twenty_company_id=company_id,
        profile=profile.key,
    )
    return practice


def _push_practice_to_twenty(
    practice: dict,
    twenty: TwentyClient | None,
    tenant: str,
    profile: Profile,
    merge_existing: bool = True,
) -> str | None:
    """
    Idempotent Twenty push for one entity (practice/Arztpraxis/Sportverein).

    Extracted from process_practice() so the --push-cache mode can re-use
    exactly the same find-or-create-or-merge logic without paying for
    Discovery / Detail-Calls / Enrichment / LLM again.

    Returns the Twenty company_id if known, or None.
    """
    if twenty is None:
        return None

    existing = twenty.find_company(practice["name"])
    company_input = practice_to_company_input(practice, tenant=tenant, profile=profile)
    if existing is None:
        company_id = twenty.create_company(company_input)
        if company_id:
            people = practice_to_people_inputs(
                practice, company_id, tenant=tenant, profile=profile
            )
            for person in people:
                twenty.create_person(person)
            twenty.create_opportunity(
                practice_to_opportunity_input(
                    practice, company_id, tenant=tenant, profile=profile
                )
            )
            print(f"    CRM: {profile.opportunity_label} angelegt "
                  f"(company={company_id[:8]}…, {len(people)} Person:innen)")
        return company_id

    company_id = existing.get("id")
    if merge_existing and company_id:
        merged = twenty.merge_company_fields(existing, company_input)
        if merged:
            print(f"    CRM: Company existiert → angereichert "
                  f"({len(merged)} Felder neu gesetzt)")
        else:
            print(f"    CRM: Company existiert → bereits vollständig, "
                  f"keine Änderung")
    else:
        print(f"    CRM: Company existiert → übersprungen (--no-merge)")
    return company_id


def push_cached_practices(
    twenty: TwentyClient,
    db: LocalDB,
    tenant: str,
    profile: Profile,
    canton: str | None,
    city: str | None,
    plz: str | None,
    limit: int | None,
    merge_existing: bool,
) -> tuple[int, int, int]:
    """
    Drain the local cache (scoped to one profile): every entry that's
    is_processed=1 but has no `twenty_company_id` is pushed using the
    already-enriched payload — no Google Maps / web-crawl / LLM cost.

    Returns (total_unpushed, pushed_now, errors).
    """
    candidates = db.list_unpushed(
        canton=canton, city=city, plz=plz, profile=profile.key, limit=limit
    )
    total = len(candidates)
    if not total:
        print(
            f"Cache-Push [{profile.key}]: nichts zu tun — keine ungepushten "
            f"Einträge (canton={canton or '*'}, city={city or '*'}, "
            f"plz={plz or '*'})."
        )
        return 0, 0, 0

    print(
        f"Cache-Push [{profile.key}]: {total} Einträge aus dem lokalen Cache "
        f"(canton={canton or '*'}, city={city or '*'}, plz={plz or '*'}, "
        f"merge={merge_existing}). Keine Discovery/Detail/Crawl-Kosten."
    )

    pushed = 0
    errors = 0
    for i, practice in enumerate(candidates, start=1):
        place_id = practice.get("_cached_place_id") or practice.get("place_id")
        practice.pop("_cached_place_id", None)
        practice.pop("_profile", None)
        name = practice.get("name", "(no name)")
        loc = (
            f"{practice.get('canton') or '?'} "
            f"{practice.get('plz') or ''} "
            f"{practice.get('city') or ''}"
        ).strip()
        print(f"[{i}/{total}] {loc} — {name}")
        try:
            company_id = _push_practice_to_twenty(
                practice, twenty, tenant,
                profile=profile, merge_existing=merge_existing,
            )
            db.mark_processed(
                place_id, practice,
                twenty_company_id=company_id,
                profile=profile.key,
            )
            if company_id:
                pushed += 1
        except Exception as exc:
            errors += 1
            print(f"    Cache-Push Fehler: {exc}")

    print(f"\nCache-Push fertig: {pushed}/{total} ins CRM ({errors} Fehler).")
    if twenty.dropped_fields:
        joined = ", ".join(sorted(twenty.dropped_fields))
        print(
            f"\nHinweis: Twenty-Workspace hatte keine Felder: {joined}.\n"
            f"  → optional in Settings → Data Model → Companies anlegen, "
            f"damit beim nächsten Push diese Felder mitgeschrieben werden."
        )
    return total, pushed, errors


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


def _list_profiles_action() -> int:
    """`--list-profiles` shortcut for the CLI: prints the registry."""
    print("Verfügbare Profile:")
    for p in list_profiles():
        marker = " [one-shot]" if p.one_shot else ""
        print(f"  {p.key:<14} {p.label}{marker}")
        if p.specialties:
            print("    Fachgebiete:")
            for s in p.specialties:
                star = " *default" if s.enabled_by_default else ""
                print(f"      - {s.key:<14} {s.label}{star}")
    return 0


async def main() -> int:
    parser = argparse.ArgumentParser(description="Multi-vertical prospecting scraper")
    parser.add_argument("--profile", default=os.getenv("SCRAPER_DEFAULT_PROFILE", "physio"),
                        help="Welches Profil scrapen? (physio | aerzte | sportvereine). "
                             "Default 'physio' für Backwards-Compat mit Medtheris-Läufen.")
    parser.add_argument("--specialties",
                        help="Komma-separierte Fachgebiet-Keys (nur für aerzte). "
                             "Beispiel: 'orthopaedie,sportmedizin'. Leer = Profile-Defaults.")
    parser.add_argument("--list-profiles", action="store_true",
                        help="Verfügbare Profile + Fachgebiete auflisten und beenden.")
    parser.add_argument("--country", default="ch",
                        help="Land/Region-Code für Google Maps Suche (default 'ch').")
    parser.add_argument("--canton", "--bundesland", dest="canton",
                        help="Schweizer Kanton (ZH, BE, …) oder DE-Bundesland.")
    parser.add_argument("--city", help="Stadt-Filter (Substring).")
    parser.add_argument("--plz", help="PLZ-Filter.")
    parser.add_argument("--terms", help="Zusätzliche Suchbegriffe (komma-separiert).")
    parser.add_argument("--dry-run", action="store_true",
                        help="Discovery + Enrichment, KEIN Twenty-Push")
    parser.add_argument("--limit", type=int, default=None,
                        help="Maximum Einträge zu verarbeiten (greift NACH discovery)")
    parser.add_argument("--max-plz", type=int, default=None,
                        help="Discovery: nur erste N PLZ (Cost-Bremse)")
    parser.add_argument("--max-queries", type=int, default=None,
                        help="Discovery: nur erste N Queries (Cost-Bremse)")
    parser.add_argument("--max-pages", type=int, default=3,
                        help="Discovery: max Result-Pages pro PLZ×Query (default 3)")
    parser.add_argument("--no-extract", action="store_true",
                        help="Keine LLM-Extraktion (spart Anthropic-Tokens)")
    parser.add_argument("--no-merge", action="store_true",
                        help="Existierende CRM-Companies NICHT anreichern.")
    parser.add_argument("--push-cache", action="store_true",
                        help="Nur die lokale Cache-DB an Twenty pushen — keine Discovery, "
                             "keine Web-Crawls, keine LLM. Profile-scoped.")
    parser.add_argument("--force-rerun", action="store_true",
                        help="Bei one-shot Profilen (z.B. Sportvereine ZH) den Lock "
                             "ignorieren und einen weiteren Lauf erlauben. "
                             "ACHTUNG: dupliziert Discovery-Kosten.")
    args = parser.parse_args()

    if args.list_profiles:
        return _list_profiles_action()

    try:
        profile = get_profile(args.profile)
    except UnknownProfileError as exc:
        print(f"FEHLER: {exc}")
        return 2

    # Locked-canton enforcement (Sportvereine ZH).
    if profile.locked_canton:
        if args.canton and args.canton.strip().upper() != profile.locked_canton:
            print(
                f"FEHLER: Profil '{profile.key}' ist auf Kanton "
                f"{profile.locked_canton} festgenagelt — "
                f"--canton={args.canton} wird abgelehnt."
            )
            return 2
        if not args.canton:
            args.canton = profile.locked_canton

    # One-shot enforcement.
    db = LocalDB()
    if profile.one_shot and not args.dry_run and not args.push_cache:
        prior = db.get_profile_run(profile.key)
        if prior and prior.get("last_status") == "ok" and not args.force_rerun:
            print(
                f"FEHLER: Profil '{profile.key}' ist one-shot und wurde bereits "
                f"erfolgreich am {prior['last_run_at']} ausgeführt "
                f"({prior['run_count']} Lauf/Läufe insgesamt). "
                f"--force-rerun setzen, um trotzdem zu starten."
            )
            return 2

    selected_specialties = (
        [s.strip() for s in args.specialties.split(",") if s.strip()]
        if args.specialties else None
    )

    global _NO_EXTRACT
    _NO_EXTRACT = args.no_extract

    # Per-profile tenant: explicit env override still wins (legacy escape-hatch
    # for ad-hoc runs), otherwise we use the profile's default tag.
    tenant = os.getenv("TENANT_TAG") or profile.tenant_tag

    print(f"=== Profile: {profile.key} ({profile.label}) → tenant={tenant} ===")

    # --- Cache-Push: drain queued cache entries to CRM, no discovery -----
    if args.push_cache:
        api_url, api_key = _resolve_twenty_credentials(profile)
        if not api_url or not api_key:
            print(
                f"FEHLER: --push-cache braucht TWENTY_API_URL und "
                f"{profile.api_key_env} in der .env "
                f"(Workspace: {profile.crm_workspace})."
            )
            return 2
        twenty = TwentyClient(api_url=api_url, api_key=api_key)
        print(f"Cache: {db.count(profile=profile.key)} Einträge im Profil-Bucket")
        merge_mode = not args.no_merge
        push_cached_practices(
            twenty, db, tenant, profile,
            canton=args.canton, city=args.city, plz=args.plz,
            limit=args.limit, merge_existing=merge_mode,
        )
        # No profile-run record for cache-push: it doesn't move the
        # one-shot needle, just drains an earlier discovery's payload.
        return 0

    google_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if not google_key:
        print("FEHLER: GOOGLE_MAPS_API_KEY ist nicht gesetzt (.env).")
        return 2

    twenty: TwentyClient | None = None
    if not args.dry_run:
        api_url, api_key = _resolve_twenty_credentials(profile)
        if not api_url or not api_key:
            print(
                f"FEHLER: --dry-run nicht gesetzt aber TWENTY_API_URL oder "
                f"{profile.api_key_env} fehlt (Workspace: {profile.crm_workspace}). "
                f"Setze sie in .env oder nutze --dry-run."
            )
            return 2
        twenty = TwentyClient(api_url=api_url, api_key=api_key)

    print(f"Cache: {db.count(profile=profile.key)} Einträge im Profil-Bucket")

    extra_terms = (
        [t.strip() for t in args.terms.split(",") if t.strip()]
        if args.terms else None
    )
    practices = discover_practices(
        google_key,
        profile=profile,
        canton_filter=args.canton,
        country_filter=args.country,
        city_filter=args.city,
        plz_filter=args.plz,
        max_plz=args.max_plz,
        max_queries=args.max_queries,
        max_pages=args.max_pages,
        extra_terms=extra_terms,
        selected_specialties=selected_specialties,
    )
    if args.limit:
        practices = practices[: args.limit]

    print(f"\nVerarbeite {len(practices)} Einträge "
          f"(profile={profile.key}, dry-run={args.dry_run}, tenant={tenant})\n")

    processed: list[dict] = []
    merge_mode = not args.no_merge
    run_status = "ok"
    for i, p in enumerate(practices, start=1):
        try:
            print(f"[{i}/{len(practices)}]", end=" ")
            result = await process_practice(
                p, twenty, db, tenant, profile, google_key, merge_existing=merge_mode
            )
            processed.append(result)
        except KeyboardInterrupt:
            print("\nAbgebrochen — Cache wurde laufend geschrieben.")
            run_status = "interrupted"
            break
        except Exception as exc:
            print(f"  unerwarteter Fehler: {exc}")
            run_status = "partial"
            continue

    _OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    csv_path = _OUTPUT_DIR / (
        f"leads-{profile.key}-{args.canton or 'all'}"
        f"{'-dryrun' if args.dry_run else ''}.csv"
    )
    write_csv(processed, csv_path)
    print(f"\nFertig. CSV: {csv_path}  "
          f"(Cache profile={profile.key}: {db.count(profile=profile.key)} total)")

    # Record the run in the ledger — even partial/interrupted, so the
    # one-shot lock can distinguish "never ran" from "ran but errored".
    # `forced=True` is set here when --force-rerun was used, so the
    # admin UI can surface "letzter Force-Rerun: ..." separately.
    if not args.dry_run and processed:
        db.record_profile_run(
            profile=profile.key,
            status=run_status,
            forced=args.force_rerun,
        )

    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
