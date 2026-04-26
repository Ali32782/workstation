"""
Map scraper-shape practice dicts to the input shape expected by the Twenty
GraphQL mutations.

Decoupled from twenty_client.py so the mapping logic can be tested standalone
and so any future Twenty schema changes only touch one file.

Per practice we create:
  - 1 Company  (with all custom fields, plus the full team list as JSON)
  - 0..N People (Owner + Lead Therapist + every team_members entry, deduped;
                 fallback: Generic Contact from general_email if no person
                 was identified)
  - 1 Opportunity

Inferred (guessed) emails are pushed into Person.guessedEmail with the
'guess:' prefix so Sales-Reps know they're trying a probable but unverified
address. Confirmed emails (harvested from the website) always win and overwrite
the guess.
"""
import json
from typing import Any

from scraper.email_inference import domain_from_url, infer_email_candidates


def split_owner_name(full: str | None) -> tuple[str, str]:
    """Split 'Anna Müller' into ('Anna', 'Müller'). Falls back to ('', '')."""
    if not full or not full.strip():
        return ("", "")
    parts = full.strip().split(" ", 1)
    return (parts[0], parts[1] if len(parts) > 1 else "")


def practice_to_company_input(practice: dict, tenant: str) -> dict[str, Any]:
    """
    Build a CompanyCreateInput for Twenty.

    Required custom fields on Company (create once in Twenty Settings →
    Data Model → Companies → '+ Field'). The list grew with the v2 enricher;
    fields the API doesn't recognise are silently dropped by twenty_client
    when it strips Nones, but unknown-field errors abort the create — so add
    every field below to your workspace before running the scraper end-to-end:

      Identity / pipeline:
        tenant (Text), leadSource (Text)

      Booking integration:
        bookingSystem (Text)         — provider key (onedoc/doctolib/...)
        bookingConfidence (Text)     — high|medium|low|none
        bookingEvidence (Text)       — e.g. 'iframe-match=onedoc.ch'
        onlineBookingUrl (Link/Text) — direct deep link to the widget

      Website / tech-stack signals:
        websitePlatform (Text)        — wix|wordpress|squarespace|...
        websitePlatformEvidence (Text)

      Google Places:
        googleRating (Number), googleReviewCount (Number),
        openingHours (Text), googleMapsUrl (Link/Text), wheelchairAccessible (Boolean),
        geoLat (Number), geoLng (Number), plusCode (Text)

      LLM-extracted profile:
        employeeCountPhysio (Number), specializations (Text),
        languages (Text), trainingOffered (Text),
        insuranceAccepted (Text), yearFounded (Number),
        practiceLocations (Number), acceptsEmergency (Boolean),
        practiceSize (Text), generalEmail (Text)

      Owner / Lead Therapist:
        ownerName, ownerEmail, ownerSource, ownerTitle, ownerLinkedin,
        leadTherapistName, leadTherapistEmail

      Social channels (URLs):
        practiceLinkedin, practiceInstagram, practiceFacebook,
        practiceYoutube, practiceX, practiceTiktok, practiceXing

      Team (full roster as JSON for downstream automations):
        teamMembersJson (Text)

    Without `tenant` the leads land in the workspace but won't be filterable
    as MedTheris-vs-Corehub.
    """
    website = practice.get("website") or ""
    domain = ""
    if website:
        domain = (
            website.replace("https://", "")
            .replace("http://", "")
            .split("/", 1)[0]
            .strip()
        )

    team_json = None
    team = practice.get("team_members") or []
    if team:
        team_json = json.dumps(team, ensure_ascii=False, separators=(",", ":"))

    booking = practice.get("booking_detection") or {}
    platform = practice.get("website_platform_detection") or {}

    return {
        "name": practice.get("name") or "(unbenannte Praxis)",
        "domainName": {"primaryLinkUrl": website, "primaryLinkLabel": domain} if website else None,
        "address": {
            "addressStreet1": practice.get("address") or "",
            "addressCity": practice.get("city") or "",
            "addressPostcode": practice.get("plz") or "",
            "addressState": practice.get("canton") or "",
            "addressCountry": "Switzerland",
        },

        # --- pipeline tagging ---
        "tenant": tenant,
        "leadSource": "google-maps-scraper",

        # --- booking integration ---
        "bookingSystem": booking.get("provider") or practice.get("booking_system") or "none",
        "bookingConfidence": booking.get("confidence") or None,
        "bookingEvidence": booking.get("evidence") or None,
        "onlineBookingUrl": practice.get("online_booking_url") or None,

        # --- website tech stack ---
        "websitePlatform": platform.get("platform") or None,
        "websitePlatformEvidence": platform.get("platform_evidence") or None,

        # --- contact / Google Places ---
        "phone": practice.get("phone") or None,
        "googleRating": practice.get("rating"),
        "googleReviewCount": practice.get("review_count"),
        "openingHours": practice.get("opening_hours") or practice.get("opening_hours_summary") or None,
        "googleMapsUrl": practice.get("google_maps_url") or None,
        "wheelchairAccessible": practice.get("wheelchair_accessible"),
        "geoLat": practice.get("geo_lat"),
        "geoLng": practice.get("geo_lng"),
        "plusCode": practice.get("plus_code") or None,

        # --- LLM-extracted profile ---
        "employeeCountPhysio": practice.get("employee_count_physio"),
        "specializations": ", ".join(practice.get("specializations") or []) or None,
        "languages": ", ".join(practice.get("languages") or []) or None,
        "trainingOffered": ", ".join(practice.get("training_offered") or []) or None,
        "insuranceAccepted": practice.get("insurance_accepted") or None,
        "yearFounded": practice.get("year_founded"),
        "practiceLocations": practice.get("locations"),
        "acceptsEmergency": practice.get("accepts_emergency_appointments"),
        "practiceSize": practice.get("practice_size") or None,
        "generalEmail": practice.get("general_email") or None,

        # --- owner / leadership ---
        "ownerName": practice.get("owner_name") or None,
        "ownerEmail": practice.get("owner_email") or None,
        "ownerSource": practice.get("owner_source") or None,
        "ownerTitle": practice.get("owner_title") or None,
        "ownerLinkedin": (
            practice.get("owner_linkedin")
            or practice.get("owner_linkedin_from_site")
            or None
        ),
        "leadTherapistName": practice.get("lead_therapist_name") or None,
        "leadTherapistEmail": practice.get("lead_therapist_email") or None,

        # --- practice-level social channels ---
        "practiceLinkedin": (
            practice.get("practice_linkedin")
            or (practice.get("social_handles") or {}).get("linkedin_company")
            or None
        ),
        "practiceInstagram": (
            practice.get("practice_instagram")
            or (practice.get("social_handles") or {}).get("instagram")
            or None
        ),
        "practiceFacebook": (
            practice.get("practice_facebook")
            or (practice.get("social_handles") or {}).get("facebook")
            or None
        ),
        "practiceYoutube": (
            practice.get("practice_youtube")
            or (practice.get("social_handles") or {}).get("youtube")
            or None
        ),
        "practiceX": practice.get("practice_x") or None,
        "practiceTiktok": (
            practice.get("practice_tiktok")
            or (practice.get("social_handles") or {}).get("tiktok")
            or None
        ),
        "practiceXing": practice.get("practice_xing") or None,

        # --- team roster as JSON ---
        "teamMembersJson": team_json,
    }


def _person_input(name: str | None, email: str | None, phone: str | None,
                  company_id: str, tenant: str, role: str,
                  guessed_email: str | None = None,
                  practice_role_label: str | None = None,
                  linkedin_url: str | None = None,
                  title: str | None = None) -> dict[str, Any] | None:
    """
    Internal: build a PersonCreateInput. Returns None if neither name nor
    email is present (Twenty would reject an empty Person).

    Required Person custom fields in Twenty:
        tenant (Text), roleCustom (Text — owner|lead_therapist|
                                    owner_and_lead_therapist|therapist|contact),
        practiceRole (Text — e.g. 'Physiotherapeutin SRK'),
        guessedEmail (Text — comma-separated, prefixed 'guess:'),
        linkedinUrl (Text/Link — owner profile URL when known),
        personTitle (Text — academic/professional title like 'MSc, MAS')

    Note: 'role' is a reserved field name in Twenty, so we use 'roleCustom'.
    """
    if not name and not email:
        return None
    first, last = split_owner_name(name)
    out: dict[str, Any] = {
        "name": {
            "firstName": first or "(unbekannt)",
            "lastName": last or "(unbekannt)",
        },
        "companyId": company_id,
        "tenant": tenant,
        "roleCustom": role,
    }
    if practice_role_label:
        out["practiceRole"] = practice_role_label
    if email:
        out["emails"] = {"primaryEmail": email}
    if phone:
        out["phones"] = {"primaryPhoneNumber": phone}
    if guessed_email and not email:
        out["guessedEmail"] = f"guess:{guessed_email}"
    if linkedin_url:
        out["linkedinUrl"] = linkedin_url
    if title:
        out["personTitle"] = title
    return out


def _name_key(name: str | None) -> str:
    """Lowercase whitespace-normalised name for dedup."""
    return " ".join((name or "").lower().split())


def practice_to_people_inputs(practice: dict, company_id: str,
                              tenant: str) -> list[dict[str, Any]]:
    """
    Return PersonCreateInput dicts for a practice:
      - Owner (always if owner_name or owner_email present)
      - Lead Therapist (only if name differs from Owner)
      - Every team_members entry NOT already covered by Owner/Lead Therapist
      - Fallback: Generic contact from general_email if NOTHING was identified

    Phone-Logik: nur die LLM-extrahierte Direkt-/Mobilnummer wird auf die
    Person geschrieben. Die Praxis-Hauptnummer (practice.phone) lebt auf
    der Company, NICHT als fake Direct-Line auf jeder Person.

    Email-Inferenz: wenn Owner-Name vorhanden aber keine Owner-Email, wird
    aus {Vorname.Nachname @ website-domain} eine 'guess:...'-Adresse
    abgeleitet und in guessedEmail geschrieben. Sales-Reps sehen sofort,
    dass es ein heuristischer Vorschlag ist (nicht bestätigt).
    """
    website = practice.get("website") or ""
    domain = domain_from_url(website)
    known_emails = practice.get("emails_found") or []

    people: list[dict[str, Any]] = []
    seen_names: set[str] = set()

    owner_name = (practice.get("owner_name") or "").strip()
    owner_email = (practice.get("owner_email") or "").strip() or None
    owner_phone = (practice.get("owner_phone") or "").strip() or None
    lt_name = (practice.get("lead_therapist_name") or "").strip()
    lt_email = (practice.get("lead_therapist_email") or "").strip() or None
    lt_phone = (practice.get("lead_therapist_phone") or "").strip() or None

    role_owner = "owner"
    if owner_name and lt_name and _name_key(owner_name) == _name_key(lt_name):
        role_owner = "owner_and_lead_therapist"
        lt_name = ""
        lt_email = None
        lt_phone = None

    owner_linkedin = (
        (practice.get("owner_linkedin") or "").strip()
        or (practice.get("owner_linkedin_from_site") or "").strip()
        or None
    )
    owner_title = (practice.get("owner_title") or "").strip() or None

    if owner_name or owner_email:
        guesses = (
            ",".join(infer_email_candidates(owner_name, domain, known_emails))
            if owner_name and not owner_email and domain else None
        )
        owner_p = _person_input(
            name=owner_name or None, email=owner_email,
            phone=owner_phone, company_id=company_id,
            tenant=tenant, role=role_owner,
            guessed_email=guesses,
            linkedin_url=owner_linkedin,
            title=owner_title,
        )
        if owner_p:
            people.append(owner_p)
            seen_names.add(_name_key(owner_name))

    if lt_name or lt_email:
        guesses = (
            ",".join(infer_email_candidates(lt_name, domain, known_emails))
            if lt_name and not lt_email and domain else None
        )
        lt_p = _person_input(
            name=lt_name or None, email=lt_email,
            phone=lt_phone, company_id=company_id,
            tenant=tenant, role="lead_therapist",
            guessed_email=guesses,
        )
        if lt_p:
            people.append(lt_p)
            seen_names.add(_name_key(lt_name))

    # Add remaining team members (skip ones already covered)
    for tm in (practice.get("team_members") or []):
        tm_name = (tm.get("name") or "").strip()
        if not tm_name:
            continue
        if _name_key(tm_name) in seen_names:
            continue
        tm_email = (tm.get("email") or "").strip() or None
        tm_role_label = (tm.get("role") or "").strip() or None
        tm_linkedin = (tm.get("linkedin") or "").strip() or None
        guesses = (
            ",".join(infer_email_candidates(tm_name, domain, known_emails))
            if not tm_email and domain else None
        )
        tm_p = _person_input(
            name=tm_name, email=tm_email,
            phone=None, company_id=company_id,
            tenant=tenant, role="therapist",
            guessed_email=guesses,
            practice_role_label=tm_role_label,
            linkedin_url=tm_linkedin,
        )
        if tm_p:
            people.append(tm_p)
            seen_names.add(_name_key(tm_name))

    if not people:
        # Fallback: generic contact from general_email or first emails_found
        fallback_email = practice.get("general_email")
        if not fallback_email:
            fallback_email = known_emails[0] if known_emails else None
        if fallback_email:
            generic = _person_input(
                name=None, email=fallback_email,
                phone=practice.get("phone"),
                company_id=company_id,
                tenant=tenant, role="contact",
            )
            if generic:
                people.append(generic)

    return people


def practice_to_opportunity_input(practice: dict, company_id: str,
                                  tenant: str) -> dict[str, Any]:
    """Build an OpportunityCreateInput (lead) for the practice."""
    return {
        "name": f"Lead: {practice.get('name') or 'Praxis'}",
        "stage": "NEW",
        "companyId": company_id,
        "tenant": tenant,
        "source": "google-maps-scraper",
    }
