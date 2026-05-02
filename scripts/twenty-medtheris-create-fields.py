#!/usr/bin/env python3
"""Create the 26 missing custom fields on the MedTheris Twenty workspace.

The medtheris-scraper writes 50+ custom fields on Company / Person, but
the workspace currently only has ~25 of them; the rest get silently
dropped by twenty_client._execute_with_drift_retry. This script closes
that gap by hitting Twenty's metadata GraphQL API to create the missing
fields once. It's idempotent: existing fields are kept as-is.

Usage:
    # On the server (Twenty env vars are already set in the scraper container):
    docker compose exec -T medtheris-scraper python3 /tmp/twenty_create_fields.py

    # Or locally with explicit credentials:
    TWENTY_METADATA_URL=https://crm.kineo360.work/metadata \\
    TWENTY_API_KEY="$(cat path/to/medtheris-api-key)" \\
        python3 scripts/twenty-medtheris-create-fields.py [--dry-run]

Env:
    TWENTY_METADATA_URL  default: derived from TWENTY_API_URL by appending /metadata
    TWENTY_API_URL       fallback for METADATA URL discovery
    TWENTY_API_KEY       Bearer token of the MedTheris workspace
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request


# -- Field plan -----------------------------------------------------------
#
# Type mapping comes from how `medtheris-scraper/crm/mapper.py` actually
# sends the value — a plain string lands as TEXT (not LINKS), even when
# the field semantically is a URL, because the mapper stringifies it
# directly. Switching them to LINKS would force a mapper rewrite, which
# we don't want to do under-the-hood.
COMPANY_FIELDS = [
    # Booking / detection
    ("bookingConfidence", "TEXT", "Booking Confidence",
     "high|medium|low|none — wie sicher booking_detector ist."),
    ("bookingEvidence", "TEXT", "Booking Evidence",
     "Beweisstring fürs CRM-Audit, z. B. iframe-match=onedoc.ch"),
    ("onlineBookingUrl", "TEXT", "Online Booking URL",
     "Direktlink auf den Online-Buchungs-Widget."),

    # Website / tech-stack signals
    ("websitePlatform", "TEXT", "Website Platform",
     "wordpress|wix|squarespace|typo3|custom — welche Software."),
    ("websitePlatformEvidence", "TEXT", "Website Platform Evidence",
     "Beweisstring (z. B. meta-generator=WordPress 6.4)."),

    # LLM-extracted profile
    ("acceptsEmergency", "BOOLEAN", "Accepts Emergency",
     "LLM: nimmt Notfall-Termine an."),
    ("industry", "TEXT", "Industry",
     "physiotherapie|arztpraxis|sportverein (Profile-Tag)."),
    ("insuranceAccepted", "TEXT", "Insurance Accepted",
     "LLM: akzeptierte Krankenkassen / Tarife."),
    ("openingHours", "TEXT", "Opening Hours",
     "Google Places — Klartext-Zeile."),
    ("ownerTitle", "TEXT", "Owner Title",
     "Akademischer/Fachtitel der Inhaber:in (z. B. MSc, MAS)."),
    ("practiceLocations", "NUMBER", "Practice Locations",
     "LLM: Anzahl Standorte (1 = single-site)."),
    ("practiceSize", "TEXT", "Practice Size",
     "LLM: solo|small|medium|large."),
    ("trainingOffered", "TEXT", "Training Offered",
     "LLM: angebotene Fortbildungen (Komma-Liste)."),
    ("yearFounded", "NUMBER", "Year Founded",
     "LLM: Gründungsjahr."),

    # Google Places
    ("geoLat", "NUMBER", "Geo Latitude",
     "Google Places — Latitude."),
    ("geoLng", "NUMBER", "Geo Longitude",
     "Google Places — Longitude."),
    ("googleMapsUrl", "TEXT", "Google Maps URL",
     "Direktlink zum Google-Maps-Eintrag."),
    ("plusCode", "TEXT", "Plus Code",
     "Google plus_code (Adress-Disambiguierung)."),
    ("wheelchairAccessible", "BOOLEAN", "Wheelchair Accessible",
     "Google Places — rollstuhl-zugänglich."),

    # Social channels
    ("ownerLinkedin", "TEXT", "Owner LinkedIn",
     "LinkedIn-Profil der Inhaber:in (URL)."),
    ("practiceFacebook", "TEXT", "Facebook",
     "Praxis-Facebook-Seite (URL)."),
    ("practiceInstagram", "TEXT", "Instagram",
     "Praxis-Instagram-Account (URL)."),
    ("practiceLinkedin", "TEXT", "LinkedIn",
     "LinkedIn Company Page (URL)."),
    ("practiceTiktok", "TEXT", "TikTok",
     "Praxis-TikTok-Account (URL)."),
    ("practiceX", "TEXT", "X / Twitter",
     "Praxis-X-Account (URL)."),
    ("practiceYoutube", "TEXT", "YouTube",
     "Praxis-YouTube-Channel (URL)."),
]

PERSON_FIELDS = [
    ("personTitle", "TEXT", "Title",
     "Akademischer/Fachtitel (z. B. Dr. med. oder Physiotherapeutin SRK)."),
]


# -- API helpers ----------------------------------------------------------

def _meta_url() -> str:
    explicit = os.getenv("TWENTY_METADATA_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    base = (os.getenv("TWENTY_API_URL") or "").strip().rstrip("/")
    if not base:
        sys.exit(
            "FEHLER: TWENTY_METADATA_URL oder TWENTY_API_URL muss gesetzt sein."
        )
    # Same trick as twenty_client._normalize_twenty_origin: drop a trailing /api
    if base.lower().endswith("/api"):
        base = base[:-4].rstrip("/")
    return f"{base}/metadata"


def _gql(api_key: str, url: str, query: str, variables: dict | None = None) -> dict:
    """POST a GraphQL request and return the parsed JSON `data` block.

    Raises RuntimeError on transport / GraphQL error so the caller can
    decide whether to abort (object discovery) or continue (per-field
    create — one bad field shouldn't kill the others).
    """
    body = json.dumps({"query": query, "variables": variables or {}}).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        raise RuntimeError(f"HTTP {exc.code}: {raw[:500]}") from exc
    except urllib.error.URLError as exc:
        raise RuntimeError(f"Transport: {exc}") from exc

    if "errors" in payload and payload["errors"]:
        msg = payload["errors"][0].get("message") or str(payload["errors"][0])
        raise RuntimeError(msg)
    return payload.get("data") or {}


def discover_object_id(api_key: str, url: str, name: str) -> str:
    """Resolve nameSingular → objectMetadataId (uuid).

    ObjectFilter on this Twenty version doesn't expose `nameSingular`,
    so we fetch all objects (capped 200) and filter client-side. There
    are typically <30 objects per workspace.
    """
    data = _gql(
        api_key, url,
        "query Q{ objects(paging:{first:200}){ "
        "edges{ node{ id nameSingular } } } }",
    )
    edges = ((data.get("objects") or {}).get("edges")) or []
    for e in edges:
        node = e.get("node") or {}
        if node.get("nameSingular") == name:
            return node["id"]
    raise RuntimeError(f"Object '{name}' nicht gefunden im Workspace.")


def list_existing_field_names(api_key: str, url: str, object_id: str) -> set[str]:
    """All field names already on the object (custom + system)."""
    data = _gql(
        api_key, url,
        "query Q($filter: FieldFilter){ fields(filter:$filter, paging:{first:200}){ "
        "edges{ node{ name } } } }",
        {"filter": {"objectMetadataId": {"eq": object_id}}},
    )
    edges = ((data.get("fields") or {}).get("edges")) or []
    return {e["node"]["name"] for e in edges}


def create_field(api_key: str, url: str, object_id: str, name: str,
                 type_: str, label: str, description: str) -> str:
    """Create one custom field. Returns the new field id."""
    mutation = (
        "mutation M($input: CreateOneFieldMetadataInput!){ "
        "createOneField(input:$input){ id name type } }"
    )
    variables = {
        "input": {
            "field": {
                "objectMetadataId": object_id,
                "type": type_,
                "name": name,
                "label": label,
                "description": description,
                "isCustom": True,
                "isActive": True,
                "isNullable": True,
            }
        }
    }
    data = _gql(api_key, url, mutation, variables)
    return ((data.get("createOneField") or {}).get("id")) or ""


# -- Main -----------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(
        description="Create missing MedTheris custom fields in Twenty.",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Nur prüfen welche Felder fehlen, NICHT anlegen.",
    )
    args = parser.parse_args()

    api_key = (os.getenv("TWENTY_API_KEY") or "").strip()
    if not api_key:
        sys.exit("FEHLER: TWENTY_API_KEY muss gesetzt sein.")
    url = _meta_url()
    print(f"Twenty Metadata API: {url}")
    print(f"Modus: {'DRY-RUN (no writes)' if args.dry_run else 'CREATE'}")
    print()

    # --- discover object IDs --------------------------------------------
    company_id = discover_object_id(api_key, url, "company")
    person_id = discover_object_id(api_key, url, "person")
    print(f"  company objectMetadataId = {company_id}")
    print(f"  person  objectMetadataId = {person_id}")
    print()

    # --- inventory ------------------------------------------------------
    company_existing = list_existing_field_names(api_key, url, company_id)
    person_existing = list_existing_field_names(api_key, url, person_id)
    print(
        f"  company hat aktuell {len(company_existing)} Felder, "
        f"person hat {len(person_existing)} Felder."
    )
    print()

    plan: list[tuple[str, str, str, str, str, str]] = []
    for (name, type_, label, descr) in COMPANY_FIELDS:
        plan.append((company_id, "company", name, type_, label, descr))
    for (name, type_, label, descr) in PERSON_FIELDS:
        plan.append((person_id, "person", name, type_, label, descr))

    # --- act ------------------------------------------------------------
    created = 0
    skipped = 0
    failed: list[tuple[str, str, str]] = []
    for (obj_id, obj_name, name, type_, label, descr) in plan:
        existing = (
            company_existing if obj_name == "company" else person_existing
        )
        if name in existing:
            skipped += 1
            print(f"  ✓ {obj_name}.{name} ({type_}) — existiert bereits")
            continue
        if args.dry_run:
            print(f"  + {obj_name}.{name} ({type_}) — würde angelegt werden "
                  f"(label='{label}')")
            created += 1
            continue
        try:
            new_id = create_field(api_key, url, obj_id, name, type_, label, descr)
            created += 1
            print(f"  + {obj_name}.{name} ({type_}) — angelegt (id={new_id[:8]}…)")
        except Exception as exc:
            failed.append((obj_name, name, str(exc)))
            print(f"  ✗ {obj_name}.{name} ({type_}) — FEHLER: {exc}")

    print()
    print(
        f"Fertig: {skipped} bereits vorhanden, "
        f"{created} {'(simuliert) ' if args.dry_run else ''}neu, "
        f"{len(failed)} Fehler."
    )
    if failed:
        print("\nFehlgeschlagene Felder:")
        for obj_name, name, err in failed:
            print(f"  - {obj_name}.{name}: {err}")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
