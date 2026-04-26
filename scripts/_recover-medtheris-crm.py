"""
Recover the medtheris physio leads that were accidentally hard-deleted
from the kineo workspace and re-import them into the MEDTHERIS workspace.

Sources:
  • medtheris-scraper/db/scraper.sqlite — original scraper cache with full
    Google Maps + LLM-enriched payload for each practice.
  • the kineo workspace's metadata API — to mirror custom fields
    (tenant, practiceRole, employeeCountPhysio, …) into medtheris.

Steps:
  1. Mirror the 22 custom field definitions from kineo → medtheris via
     POST /rest/metadata/fields.
  2. For every cached practice, build a `Company` payload and POST it.
  3. For every team member in the practice payload, build a `Person`
     payload and POST it (linked to the new company).
  4. For every practice, create an `Opportunity` linked to the company.

Run from the repo root:

  KINEO_TOKEN=... MEDT_TOKEN=... python3 scripts/_recover-medtheris-crm.py

Both tokens can be pulled from the server's /opt/corelab/.env:
  KINEO_TOKEN = $TWENTY_BRIDGE_API_TOKEN
  MEDT_TOKEN  = $TWENTY_WORKSPACE_MEDTHERIS_TOKEN
"""

import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

KINEO_TOKEN = os.environ["KINEO_TOKEN"]
MEDT_TOKEN = os.environ["MEDT_TOKEN"]
BASE = "https://crm.kineo360.work/rest"

SCRAPER_DB = Path(__file__).resolve().parent.parent / "medtheris-scraper" / "db" / "scraper.sqlite"
if not SCRAPER_DB.exists():
    print(f"scraper db not found: {SCRAPER_DB}")
    sys.exit(1)


def req(method: str, path: str, token: str, body=None):
    url = path if path.startswith("http") else BASE + path
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("Authorization", "Bearer " + token)
    r.add_header("Content-Type", "application/json")
    try:
        resp = urllib.request.urlopen(r, timeout=45)
        return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {"raw": str(e)}


# ----- 1. mirror custom fields kineo → medtheris ------------------------

def list_objects(token):
    status, body = req("GET", "/metadata/objects", token)
    if status >= 300:
        print(f"  list_objects failed: {status} {body}")
        return []
    return body.get("data", {}).get("objects", [])


def list_fields(token, object_id):
    status, body = req("GET", f"/metadata/objects/{object_id}", token)
    if status >= 300:
        print(f"  list_fields failed: {status} {body}")
        return []
    return body.get("data", {}).get("object", {}).get("fields", [])


def map_objects_by_name(token):
    return {o["nameSingular"]: o for o in list_objects(token)}


print("=== Loading object/field metadata from both workspaces ===")
kineo_objects = map_objects_by_name(KINEO_TOKEN)
medt_objects = map_objects_by_name(MEDT_TOKEN)

TARGET_OBJECTS = ("company", "person", "opportunity")
for ns in TARGET_OBJECTS:
    if ns not in kineo_objects or ns not in medt_objects:
        print(f"  ! object '{ns}' missing from one workspace, abort")
        sys.exit(1)

# Pull custom fields from kineo, create in medtheris if missing.
print()
print("=== Mirroring custom fields kineo → medtheris ===")
created_fields = 0
skipped_fields = 0
for ns in TARGET_OBJECTS:
    k_obj = kineo_objects[ns]
    m_obj = medt_objects[ns]
    k_fields = list_fields(KINEO_TOKEN, k_obj["id"])
    m_fields = list_fields(MEDT_TOKEN, m_obj["id"])
    m_field_names = {f["name"] for f in m_fields}
    custom = [f for f in k_fields if f.get("isCustom")]
    print(f"  [{ns}] kineo has {len(custom)} custom fields, medt has {len(m_fields)} total")
    for fld in custom:
        name = fld["name"]
        if name in m_field_names:
            skipped_fields += 1
            continue
        payload = {
            "name": name,
            "label": fld.get("label") or name,
            "type": fld.get("type"),
            "description": fld.get("description") or "",
            "icon": fld.get("icon"),
            "isNullable": fld.get("isNullable", True),
            "objectMetadataId": m_obj["id"],
        }
        if fld.get("defaultValue") is not None:
            payload["defaultValue"] = fld["defaultValue"]
        if fld.get("options"):
            payload["options"] = fld["options"]
        status, body = req("POST", "/metadata/fields", MEDT_TOKEN, payload)
        if status < 300:
            created_fields += 1
            print(f"    + {ns}.{name} ({fld['type']})")
        else:
            print(f"    ! {ns}.{name} failed: {status} {json.dumps(body)[:200]}")

print(f"\n  created={created_fields}  skipped={skipped_fields}")

# Twenty caches its GraphQL schema; the field tables get extended on the
# next request that touches the object. Give the server a couple of seconds
# to materialize the columns before we start writing.
time.sleep(3)


# ----- 2. read scraper cache and build payloads --------------------------

print()
print("=== Reading scraper cache ===")
conn = sqlite3.connect(SCRAPER_DB)
rows = conn.execute(
    "SELECT place_id, name, payload_json FROM practices WHERE is_processed = 1"
).fetchall()
conn.close()
practices = []
for place_id, name, payload_json in rows:
    try:
        practices.append(json.loads(payload_json))
    except Exception as e:
        print(f"  ! bad payload for {name}: {e}")
print(f"  loaded {len(practices)} practices")


def email_or_none(addr):
    if not addr:
        return None
    addr = addr.strip()
    return addr if "@" in addr else None


def domain_from_url(url):
    if not url:
        return ""
    try:
        parsed = urllib.parse.urlparse(url)
        return parsed.netloc or url
    except Exception:
        return url


def build_company(p):
    addr = (p.get("address") or "").strip()
    out = {
        "name": p["name"],
        "tenant": "medtheris",
        "leadSource": "google-maps-scraper",
    }
    if p.get("website"):
        out["domainName"] = {
            "primaryLinkLabel": domain_from_url(p["website"]),
            "primaryLinkUrl": p["website"],
            "secondaryLinks": [],
        }
    if addr or p.get("plz") or p.get("city") or p.get("canton"):
        out["address"] = {
            "addressStreet1": addr,
            "addressStreet2": "",
            "addressCity": p.get("city") or "",
            "addressPostcode": p.get("plz") or "",
            "addressState": p.get("canton") or "",
            "addressCountry": "Switzerland",
            "addressLat": None,
            "addressLng": None,
        }
    if p.get("phone"):
        out["phone"] = p["phone"]
    if p.get("emails_found"):
        out["generalEmail"] = p["emails_found"][0]
    if p.get("rating") is not None:
        out["googleRating"] = p["rating"]
    if p.get("review_count") is not None:
        out["googleReviewCount"] = p["review_count"]
    if p.get("booking_system"):
        out["bookingSystem"] = p["booking_system"]
    if p.get("owner_name"):
        out["ownerName"] = p["owner_name"]
    if p.get("owner_source"):
        out["ownerSource"] = p["owner_source"]
    if email_or_none(p.get("owner_email")):
        out["ownerEmail"] = p["owner_email"]
    if p.get("lead_therapist_name"):
        out["leadTherapistName"] = p["lead_therapist_name"]
    if email_or_none(p.get("lead_therapist_email")):
        out["leadTherapistEmail"] = p["lead_therapist_email"]
    if p.get("team_members"):
        all_specs = []
        for tm in p["team_members"]:
            for s in tm.get("specializations") or []:
                if s not in all_specs:
                    all_specs.append(s)
        if all_specs:
            out["specializations"] = ", ".join(all_specs)
        out["employeeCountPhysio"] = sum(
            1 for tm in p["team_members"]
            if "physio" in (tm.get("role") or "").lower()
        )
        out["teamMembersJson"] = json.dumps(p["team_members"], ensure_ascii=False)
    return out


def build_person(tm: dict, company_id: str):
    full = (tm.get("name") or "").strip()
    if not full:
        return None
    parts = full.split(maxsplit=1)
    out = {
        "companyId": company_id,
        "name": {
            "firstName": parts[0],
            "lastName": parts[1] if len(parts) > 1 else "",
        },
        "tenant": "medtheris",
    }
    if tm.get("role"):
        out["practiceRole"] = tm["role"]
    if tm.get("specializations"):
        # store as comma-list in roleCustom (kineo did the same)
        out["roleCustom"] = ", ".join(tm["specializations"])
    if email_or_none(tm.get("email")):
        out["emails"] = {
            "primaryEmail": tm["email"],
            "additionalEmails": [],
        }
    return out


def build_opportunity(p: dict, company_id: str, contact_id: str | None):
    out = {
        "companyId": company_id,
        "name": f"Lead: {p['name']}",
        "tenant": "medtheris",
        "source": "google-maps-scraper",
    }
    if contact_id:
        out["pointOfContactId"] = contact_id
    return out


# ----- 3. import companies + persons + opportunities --------------------

print()
print("=== Importing into MEDTHERIS workspace ===")

ok_companies = ok_persons = ok_opps = 0
failed = []
for p in practices:
    cdata = build_company(p)
    status, body = req("POST", "/companies", MEDT_TOKEN, cdata)
    if status >= 300:
        failed.append(("company", p["name"], status, body))
        print(f"  ! company {p['name']} failed: {status} {json.dumps(body)[:300]}")
        continue
    company_id = body.get("data", {}).get("createCompany", {}).get("id")
    ok_companies += 1
    print(f"  + company {p['name']} -> {company_id}")

    main_contact_id = None
    for tm in p.get("team_members") or []:
        pdata = build_person(tm, company_id)
        if not pdata:
            continue
        status, body = req("POST", "/people", MEDT_TOKEN, pdata)
        if status >= 300:
            failed.append(("person", tm.get("name"), status, body))
            print(f"    ! person {tm.get('name')} failed: {status} {json.dumps(body)[:200]}")
            continue
        pid = body.get("data", {}).get("createPerson", {}).get("id")
        ok_persons += 1
        if main_contact_id is None and (
            tm.get("name") == p.get("owner_name")
            or tm.get("name") == p.get("lead_therapist_name")
        ):
            main_contact_id = pid

    odata = build_opportunity(p, company_id, main_contact_id)
    status, body = req("POST", "/opportunities", MEDT_TOKEN, odata)
    if status >= 300:
        failed.append(("opportunity", p["name"], status, body))
        print(f"    ! opportunity for {p['name']} failed: {status} {json.dumps(body)[:200]}")
        continue
    ok_opps += 1

print()
print("=== DONE ===")
print(f"  imported: companies={ok_companies}  persons={ok_persons}  opportunities={ok_opps}")
print(f"  failed: {len(failed)}")
if failed:
    for kind, name, status, body in failed[:5]:
        print(f"   - {kind} {name}: {status} {json.dumps(body)[:150]}")
