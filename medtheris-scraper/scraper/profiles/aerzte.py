"""
Ärzte-Profile für den Kineo-Workspace.

Zielgruppe: niedergelassene Ärzt:innen in der Deutschschweiz, mit
konfigurierbaren Fachgebieten. Im UI bekommt der Operator pro Lauf
eine Checkbox-Liste der Specialties (Hausarzt, Orthopädie, …) — die
Default-Auswahl liegt auf dem Sport-/Bewegungs-Funnel, weil der
näher am Kineo-Pitch ist als allgemeine Hausärzte.

Discovery-Strategie:
  * Google-Place-Type ``doctor`` ist der starke Anker.
  * Name-Keywords sind permissiv (viele Praxen tragen "Praxis Dr." im
    Namen), die eigentliche Fachgebiet-Filterung passiert über die
    Such-Strings ("Hausarzt Zürich", "Orthopäde Bern", …).
  * Blocklist filtert Tierärzte und Zahnärzte raus, weil Google's
    ``doctor``-Type beides matcht.

CRM-Mapping:
  * Workspace = ``kineo`` (separater API-Key in der .env).
  * Industry = ``arztpraxis``, leadSource = ``google-maps-scraper-aerzte``.
  * Owner-Rolle bleibt ``owner`` — Twenty führt das als generisches Label.
"""
from __future__ import annotations

from .base import Profile, Specialty

# --- Specialty palette -----------------------------------------------
# Each specialty contributes its own discovery queries. The default
# selection (`enabled_by_default=True`) sticks to the sport-/bewegungs-
# fokus that's closest to Kineo's pitch — Hausarzt is opt-in because
# it's a much larger, less-targeted funnel.
SPECIALTIES: tuple[Specialty, ...] = (
    Specialty(
        key="hausarzt",
        label="Hausarzt / Allgemeinmedizin",
        queries=(
            "Hausarzt",
            "Hausärztin",
            "Allgemeinmedizin",
            "Hausarztpraxis",
        ),
        name_keywords=("hausarzt", "allgemeinmedizin"),
        enabled_by_default=False,
    ),
    Specialty(
        key="orthopaedie",
        label="Orthopädie",
        queries=(
            "Orthopäde",
            "Orthopädin",
            "Orthopädische Praxis",
            "Orthopädisches Zentrum",
        ),
        name_keywords=("orthopäd", "orthopadie", "orthopaed"),
        enabled_by_default=True,
    ),
    Specialty(
        key="sportmedizin",
        label="Sportmedizin",
        queries=(
            "Sportmediziner",
            "Sportmedizin",
            "Sportarzt",
            "Sportärztin",
        ),
        name_keywords=("sportmed", "sportarzt", "sportärzt"),
        enabled_by_default=True,
    ),
    Specialty(
        key="rehabilitation",
        label="Rehabilitation / Reha",
        queries=(
            "Rehabilitationsmedizin",
            "Rehaklinik",
            "Reha-Zentrum",
        ),
        name_keywords=("reha", "rehabilitation"),
        enabled_by_default=True,
    ),
    Specialty(
        key="rheumatologie",
        label="Rheumatologie",
        queries=(
            "Rheumatologe",
            "Rheumatologin",
            "Rheumatologie",
        ),
        name_keywords=("rheumatolog",),
        enabled_by_default=False,
    ),
    Specialty(
        key="innere_medizin",
        label="Innere Medizin",
        queries=(
            "Internist",
            "Internistin",
            "Innere Medizin",
        ),
        name_keywords=("internist", "innere medizin"),
        enabled_by_default=False,
    ),
    Specialty(
        key="neurologie",
        label="Neurologie",
        queries=(
            "Neurologe",
            "Neurologin",
            "Neurologische Praxis",
        ),
        name_keywords=("neurolog",),
        enabled_by_default=False,
    ),
)


PROFILE_AERZTE = Profile(
    key="aerzte",
    label="Ärzte (Kineo)",
    description=(
        "Niedergelassene Ärzt:innen in der Deutschschweiz für den "
        "Kineo-Workspace. Fachgebiete (Hausarzt, Orthopädie, Sportmedizin, "
        "Reha, …) sind pro Lauf wählbar — Default-Auswahl liegt auf dem "
        "Sport-/Bewegungs-Funnel. CRM-Push in den Kineo-Workspace."
    ),
    emoji="🥼",

    # --- discovery ----------------------------------------------------
    # base_queries leaves blank: the per-specialty queries cover everything
    # so an empty specialty selection (= no defaults active) doesn't
    # accidentally fan out into a generic "Arzt" dragnet.
    base_queries=(),
    allow_place_types=("doctor", "health", "hospital"),
    required_name_keywords=(
        "praxis", "dr.", "dr ", "ärzt", "arzt", "med",
        "klinik", "medizin", "ortho", "rheuma", "internist",
    ),
    blocked_name_keywords=(
        "tierarzt", "tierärzt", "tierklinik", "veterinär",
        "zahnarzt", "zahnärzt", "kieferorthopäd", "dental",
        "apotheke", "drogerie",
        "physio", "physiotherapie",  # belongs to the physio profile
    ),
    specialties=SPECIALTIES,

    # --- enrichment ---------------------------------------------------
    extract_with_llm=True,
    extractor_prompt_key="aerzte",
    # Ärzte-Praxen haben deutlich seltener echte Online-Booking-Widgets
    # als Physios (häufiger Telefon-Termin via MPA). Detection bleibt
    # trotzdem an, weil OneDoc/Doctolib-Integrationen einen klaren
    # Sales-Hebel darstellen.
    detect_booking=True,

    # --- CRM target ---------------------------------------------------
    crm_workspace="kineo",
    api_key_env="TWENTY_KINEO_API_KEY",
    tenant_tag="kineo",
    industry_label="arztpraxis",
    lead_source="google-maps-scraper-aerzte",
    opportunity_label="Lead Arzt",
    role_keyword_map={
        "owner": "owner",          # Praxis-Inhaber:in
        "lead_therapist": "lead_doctor",
        "owner_and_lead_therapist": "owner_and_lead_doctor",
        "therapist": "doctor",     # Team-Ärzt:in
        "contact": "contact",
    },

    # --- lifecycle ----------------------------------------------------
    one_shot=False,
    default_canton="ZH",
    locked_canton=None,
)
