"""
The original Medtheris physio profile — preserves every behavior the
scraper had before the multi-profile refactor.

Anything that *was* hard-coded in `scraper/discovery.py`, `crm/mapper.py`,
or `scraper/extractor.py` for physio specifically lives here now, so
moving to a different vertical never silently inherits physio assumptions.
"""
from __future__ import annotations

from .base import Profile

PROFILE_PHYSIO = Profile(
    key="physio",
    label="Physiotherapie (Medtheris)",
    description=(
        "Schweizer Physiotherapie-Praxen für den Medtheris-Sales-Funnel. "
        "Discovery-Heuristik via Google-Maps-Types und Name-Keywords; "
        "LLM-Extraktion mit physio-spezifischem Prompt; CRM-Push in den "
        "Medtheris-Workspace."
    ),
    emoji="🩺",

    # --- discovery: identical to the legacy _looks_like_physio() ------
    base_queries=(
        "Physiotherapie",
        "Physiotherapeut",
        "Physio Praxis",
        "Rehabilitation Physiotherapie",
    ),
    allow_place_types=("physiotherapist", "health", "medical_health"),
    required_name_keywords=("physio", "therapie", "rehabilitation", "rehab"),
    specialties=(),  # no checkbox UI for physio

    # --- enrichment ---------------------------------------------------
    extract_with_llm=True,
    extractor_prompt_key="physio",
    detect_booking=True,

    # --- CRM target ---------------------------------------------------
    crm_workspace="medtheris",
    api_key_env="TWENTY_API_KEY",
    tenant_tag="medtheris",
    industry_label="physiotherapie",
    lead_source="google-maps-scraper",
    opportunity_label="Lead",
    role_keyword_map={
        "owner": "owner",
        "lead_therapist": "lead_therapist",
        "owner_and_lead_therapist": "owner_and_lead_therapist",
        "therapist": "therapist",
        "contact": "contact",
    },

    # --- lifecycle ----------------------------------------------------
    one_shot=False,
    default_canton=None,
    locked_canton=None,
)
