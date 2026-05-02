#!/usr/bin/env python3
"""
check_twenty_schema.py — verify that every custom field the scraper writes
                        exists on the live Twenty workspace.

Run me whenever you point the scraper at a new Twenty workspace, or in CI
before merging a mapper change. The scraper's self-heal logic (twenty_client.py)
handles missing fields gracefully at runtime, but silently dropped fields mean
silently-degraded leads — better to know upfront.

Usage:
    export TWENTY_API_URL=https://crm.kineo360.work/graphql
    export TWENTY_API_KEY=eyJhbGciOi…
    python medtheris-scraper/scripts/check_twenty_schema.py

Exit codes:
    0  — all expected fields present
    1  — at least one expected field missing
    2  — could not reach Twenty (network / auth / config)

The expected-fields lists below are derived from medtheris-scraper/crm/mapper.py.
Keep them in sync — drift here = false greens in CI.
"""
from __future__ import annotations

import json
import os
import sys
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

# -----------------------------------------------------------------------------
# Expected custom fields per Twenty entity. Update when mapper.py changes.
# Built-in fields (name, address, phone, …) are not in this list — we only
# care about workspace-defined custom fields.
# -----------------------------------------------------------------------------
EXPECTED_COMPANY = {
    # identity / pipeline
    "tenant", "leadSource", "industry",
    # booking integration
    "bookingSystem", "bookingConfidence", "bookingEvidence", "onlineBookingUrl",
    # website / tech stack
    "websitePlatform", "websitePlatformEvidence",
    # google places
    "googleRating", "googleReviewCount", "openingHours", "googleMapsUrl",
    "wheelchairAccessible", "geoLat", "geoLng", "plusCode",
    # llm-extracted profile
    "employeeCountPhysio", "specializations", "languages", "trainingOffered",
    "insuranceAccepted", "yearFounded", "practiceLocations",
    "acceptsEmergency", "practiceSize", "generalEmail",
    # owner / leadership
    "ownerName", "ownerEmail", "ownerSource", "ownerTitle", "ownerLinkedin",
    "leadTherapistName", "leadTherapistEmail",
    # social
    "practiceLinkedin", "practiceInstagram", "practiceFacebook",
    "practiceYoutube", "practiceX", "practiceTiktok", "practiceXing",
    # team
    "teamMembersJson",
}

EXPECTED_PERSON = {
    "tenant",
    "roleCustom",       # 'role' is reserved in Twenty, so we use roleCustom
    "practiceRole",
    "guessedEmail",
    "linkedinUrl",
    "personTitle",
}

EXPECTED_OPPORTUNITY = {
    "tenant",
    "source",
}


# -----------------------------------------------------------------------------
# Probing
# -----------------------------------------------------------------------------
INTROSPECTION_QUERY = """
query Introspect($name: String!) {
  __type(name: $name) {
    name
    fields { name }
    inputFields { name }
  }
}
"""


def fetch_type_fields(api_url: str, token: str, type_name: str) -> set[str]:
    """Return the set of GraphQL field names on a type (or empty if not found)."""
    req = Request(
        url=api_url,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        },
        data=json.dumps(
            {
                "query": INTROSPECTION_QUERY,
                "variables": {"name": type_name},
            }
        ).encode("utf-8"),
    )
    with urlopen(req, timeout=15) as resp:
        body = json.load(resp)
    if "errors" in body:
        raise RuntimeError(f"GraphQL errors for {type_name}: {body['errors']}")
    t = (body.get("data") or {}).get("__type")
    if t is None:
        return set()
    out: set[str] = set()
    for kind in ("fields", "inputFields"):
        for f in t.get(kind) or []:
            out.add(f["name"])
    return out


def normalize_api_url(raw: str) -> str:
    """Match twenty_client._normalize_twenty_origin behaviour."""
    base = raw.strip().rstrip("/")
    if base.lower().endswith("/api"):
        base = base[: -len("/api")]
    if not base.endswith("/graphql"):
        base = f"{base}/graphql"
    return base


def main() -> int:
    api_url_raw = os.environ.get("TWENTY_API_URL", "").strip()
    token = os.environ.get("TWENTY_API_KEY", "").strip()
    if not api_url_raw or not token:
        print("ERROR: TWENTY_API_URL and TWENTY_API_KEY must be set.", file=sys.stderr)
        return 2

    api_url = normalize_api_url(api_url_raw)
    print(f"==> Twenty endpoint: {api_url}")

    checks = [
        ("Company",     EXPECTED_COMPANY),
        ("Person",      EXPECTED_PERSON),
        ("Opportunity", EXPECTED_OPPORTUNITY),
    ]

    missing_total = 0
    extra_warnings: list[tuple[str, set[str]]] = []
    for type_name, expected in checks:
        try:
            present = fetch_type_fields(api_url, token, type_name)
        except (HTTPError, URLError) as e:
            print(f"ERROR: could not reach Twenty for {type_name}: {e}", file=sys.stderr)
            return 2
        except RuntimeError as e:
            print(f"ERROR: {e}", file=sys.stderr)
            return 2

        if not present:
            print(f"  [{type_name}] type not found on workspace — Twenty schema mismatch?")
            missing_total += len(expected)
            continue

        missing = sorted(expected - present)
        # We never ERROR on extras — they're someone else's fields, not ours.
        # But we list them in --verbose so the operator notices unused fields.
        extras = sorted(present - expected - _twenty_builtins())

        ok_count = len(expected) - len(missing)
        status = "OK" if not missing else "MISSING"
        print(f"  [{type_name}] {ok_count}/{len(expected)} expected fields present  →  {status}")
        for m in missing:
            print(f"      - {m}")
        if extras:
            extra_warnings.append((type_name, set(extras)))
        missing_total += len(missing)

    if extra_warnings and "--verbose" in sys.argv:
        print()
        print("Extra fields on the workspace (informational, not an error):")
        for type_name, extras in extra_warnings:
            print(f"  [{type_name}] {len(extras)} extra: {', '.join(sorted(extras)[:10])}{'…' if len(extras) > 10 else ''}")

    print()
    if missing_total == 0:
        print(f"==> OK: all expected custom fields present.")
        return 0
    print(f"==> FAIL: {missing_total} expected field(s) missing.")
    print("    Add them in Twenty → Settings → Data Model → <Object> → '+ Field'.")
    return 1


def _twenty_builtins() -> set[str]:
    """
    A loose deny-list of fields the scraper does NOT own — we never want to
    flag these as 'extra' in the workspace introspection diff.
    Keeps the noise down without being exhaustive.
    """
    return {
        "id", "createdAt", "updatedAt", "deletedAt", "name", "email", "emails",
        "phone", "phones", "address", "domainName", "linkedinLink",
        "linkedinUrl", "xLink", "facebookLink", "instagramLink", "youtubeLink",
        "annualRecurringRevenue", "employees", "idealCustomerProfile",
        "accountOwner", "accountOwnerId", "people", "opportunities", "notes",
        "favorites", "noteTargets", "taskTargets", "messageParticipants",
        "calendarEventParticipants", "stage", "amount", "closeDate",
        "pointOfContact", "pointOfContactId", "company", "companyId",
        "city", "position", "createdBy", "searchVector",
    }


if __name__ == "__main__":
    sys.exit(main())
