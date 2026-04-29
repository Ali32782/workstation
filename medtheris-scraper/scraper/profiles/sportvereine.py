"""
Sportvereine ZH — One-Shot-Kampagne für den Kineo-Workspace.

Zielgruppe: Sport-/Turn-/Spielvereine im Kanton Zürich. Im Gegensatz
zu Ärzten/Physios ist das eine *einmalige* Discovery — der Markt ist
endlich (~2-3k aktive Vereine ZH-weit) und die Daten ändern sich
langsam. Deshalb:

  * ``one_shot=True`` → der Runner blockt einen zweiten Trigger nach
    dem ersten erfolgreichen Lauf, ausser ``--force-rerun`` ist gesetzt
    (CLI-only, im UI nicht erreichbar).
  * ``locked_canton="ZH"`` → die Trigger-Payload muss canton="ZH" oder
    leer schicken; alles andere returned 400.

Discovery-Strategie:
  * Place-Type-Filter ist absichtlich leer: viele Vereine erscheinen
    bei Google nur als ``establishment`` / ``point_of_interest``,
    seltener als ``stadium`` oder ``gym``. Wir filtern stattdessen über
    Name-Keywords ("verein", "fc ", "tv ", "sc ", "turnverein", …).
  * Blocklist filtert kommerzielle Fitnessstudios und Tanzschulen
    raus, die nicht-vereins-organisiert sind.
  * Booking-Detection ist aus — Vereine haben praktisch nie
    Online-Booking-Widgets, der Aufruf wäre reine Kosten ohne Signal.

CRM-Mapping:
  * Workspace = ``kineo`` (gleicher API-Key wie Ärzte).
  * Industry = ``sportverein``, leadSource = ``google-maps-scraper-sportverein``.
  * Owner-Rolle = ``vorstand`` statt ``owner`` — passt zur
    Vereinsführung; Twenty führt das als generisches Label.
"""
from __future__ import annotations

from .base import Profile

# Discovery-Queries — bewusst breit gestreut, weil Google nicht eine
# einzelne kanonische Vereinsklassifikation hat. Mehrere Sportarten +
# generische "Sportverein"/"Verein"-Begriffe holen den Long Tail rein.
_QUERIES: tuple[str, ...] = (
    # Allgemein
    "Sportverein",
    "Sportclub",
    "Sportgemeinschaft",
    # Mannschaftssport
    "Fussballclub",
    "FC",
    "Handballclub",
    "Volleyballclub",
    "Basketballclub",
    "Unihockeyclub",
    "Eishockeyclub",
    # Individualsport
    "Tennisclub",
    "Tennisverein",
    "Badmintonclub",
    "Schwimmclub",
    "Schwimmverein",
    "Leichtathletikclub",
    "Leichtathletikverein",
    "Turnverein",
    "Turnverein Damen",
    "Männerturnverein",
    # Kampf-/Trendsport
    "Karateclub",
    "Judoclub",
    "Kletterverein",
    "Radclub",
    "Velo-Club",
    # Ältere Schweizer Begriffe
    "Sektion",
    "STV",
    "TV",
)


PROFILE_SPORTVEREINE = Profile(
    key="sportvereine",
    label="Sportvereine ZH (Kineo, einmalig)",
    description=(
        "Einmalige Discovery aller Sport-/Turn-/Spielvereine im Kanton "
        "Zürich für den Kineo-Workspace. Nach dem ersten erfolgreichen "
        "Lauf gesperrt — Re-Run nur via CLI mit --force-rerun."
    ),
    emoji="⚽",

    # --- discovery ----------------------------------------------------
    base_queries=_QUERIES,
    # Keine place-type Allowlist: Vereine sind bei Google bunt
    # klassifiziert (oft nur establishment/point_of_interest).
    allow_place_types=(),
    required_name_keywords=(
        "verein", "club", "vereinigung",
        "fc ", "fc-", "sc ", "sc-",
        "tv ", "stv ", "tsv ", "mtv ",
        "turnverein", "männerturnverein", "damenturnverein",
        "sportgemeinschaft", "sport-",
        "sektion",
    ),
    blocked_name_keywords=(
        # Kommerzielle Fitness/Studios sind keine Vereine
        "fitnessstudio", "fitness-studio", "fitness center", "gym ",
        "mcfit", "kieser", "non-stop fitness", "update fitness",
        # Tanzschulen + kommerzielle Sportzentren ohne Vereinsstruktur
        "tanzschule", "ballettschule",
        "physio", "physiotherapie",   # gehören ins physio-Profil
        "praxis dr",                   # gehören ins aerzte-Profil
    ),
    specialties=(),

    # Vereine haben eine endliche, leicht aufzuzählende ZH-PLZ-Liste.
    # Die seed_locations_filter wird in discovery.py konsumiert: sie
    # zwingt die curated PLZ-Liste auf den ZH-Subset.
    seed_locations_filter=("ZH",),

    # --- enrichment ---------------------------------------------------
    extract_with_llm=True,
    extractor_prompt_key="sportverein",
    # Vereine: kein Booking — Trainings sind nicht öffentlich buchbar.
    detect_booking=False,

    # --- CRM target ---------------------------------------------------
    crm_workspace="kineo",
    api_key_env="TWENTY_KINEO_API_KEY",
    tenant_tag="kineo",
    industry_label="sportverein",
    lead_source="google-maps-scraper-sportverein",
    opportunity_label="Lead Verein",
    role_keyword_map={
        "owner": "vorstand",
        "lead_therapist": "trainer",          # generic mapping fallback
        "owner_and_lead_therapist": "vorstand",
        "therapist": "trainer",
        "contact": "kontakt",
    },

    # --- lifecycle ----------------------------------------------------
    one_shot=True,
    default_canton="ZH",
    locked_canton="ZH",
)
