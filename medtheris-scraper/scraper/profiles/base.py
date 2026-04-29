"""
Profile dataclass — the contract every vertical implements.

A profile is a *pure data object*: it carries no behavior, just
configuration the pipeline reads at runtime. That keeps profiles
trivially testable (just construct one and assert its fields) and
keeps the dispatch logic in `discovery.py`, `extractor.py`, etc.
inspectable in one place per concern.

The `Specialty` sub-type lets the Ärzte profile expose a
checkbox-list to the UI (Hausarzt vs Orthopädie vs Sportmedizin …)
without forcing every other profile to grow that machinery.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable


@dataclass(frozen=True)
class Specialty:
    """A user-selectable sub-vertical inside a profile.

    Used by the Ärzte profile to let the operator pick "only Orthopädie +
    Sportmedizin" before kicking off a run. Sportvereine and Physio don't
    use this — they just have an empty `specialties` tuple.
    """

    key: str                       # stable id for the UI/CLI ("orthopaedie")
    label: str                     # human-friendly ("Orthopädie")
    queries: tuple[str, ...]       # extra Google-Maps query strings
    name_keywords: tuple[str, ...] = ()  # optional discovery filter additions
    enabled_by_default: bool = False     # UI default checkbox state


@dataclass(frozen=True)
class Profile:
    """
    All vertical-specific config for one scraper run.

    Field meaning groups:

    * **identity** (``key``, ``label``, ``description``, ``emoji``):
      shown in the UI dropdown / banner.

    * **discovery** (``base_queries``, ``allow_place_types``,
      ``required_name_keywords``, ``specialties``, ``seed_locations_filter``):
      input space for Google Maps Text Search and the candidate filter.

    * **enrichment** (``extract_with_llm``, ``extractor_prompt_key``,
      ``detect_booking``): which subset of the enrichment chain runs.

    * **CRM target** (``crm_workspace``, ``api_key_env``, ``tenant_tag``,
      ``industry_label``, ``lead_source``, ``role_keyword_map``,
      ``allowed_company_fields``, ``opportunity_label``):
      which Twenty workspace + tenant the leads land in, and the
      vocabulary used in mappings.

    * **lifecycle** (``one_shot``, ``default_canton``, ``locked_canton``):
      Sportvereine for example is a one-shot ZH-only campaign; the runner
      enforces both via its profile_runs ledger.

    Frozen so a profile can be hashed / used as a dict key and so
    accidental mutation in some pipeline stage doesn't bleed into the
    next run.
    """

    # --- identity -----------------------------------------------------
    key: str
    label: str
    description: str
    emoji: str = ""

    # --- discovery ----------------------------------------------------
    base_queries: tuple[str, ...] = ()
    allow_place_types: tuple[str, ...] = ()
    required_name_keywords: tuple[str, ...] = ()
    blocked_name_keywords: tuple[str, ...] = ()
    specialties: tuple[Specialty, ...] = ()
    # If non-empty, the curated PLZ list is restricted to these cantons
    # *before* any --canton filter from the CLI. None = no restriction.
    seed_locations_filter: tuple[str, ...] | None = None

    # --- enrichment / LLM --------------------------------------------
    extract_with_llm: bool = True
    extractor_prompt_key: str = "physio"     # tells extractor which prompt
    detect_booking: bool = True

    # --- CRM target ---------------------------------------------------
    crm_workspace: str = "medtheris"
    # Env var name of the Twenty API KEY for this workspace's API user.
    # The Twenty SERVER URL stays the same across workspaces (one Twenty
    # instance, multiple workspaces).
    api_key_env: str = "TWENTY_API_KEY"
    tenant_tag: str = "medtheris"
    industry_label: str = "physiotherapie"
    lead_source: str = "google-maps-scraper"
    opportunity_label: str = "Lead"
    # Maps well-known scraper roles to the Twenty `roleCustom` value.
    # Pluggable so e.g. Sportvereine can rename "owner" → "vorstand".
    role_keyword_map: dict[str, str] = field(default_factory=dict)

    # --- lifecycle ----------------------------------------------------
    # Sportvereine is one-shot: after the first successful run the runner
    # blocks new triggers unless --force-rerun is set.
    one_shot: bool = False
    default_canton: str | None = None
    # If set, the UI MUST send this canton (or none) — anything else is
    # rejected by runner._build_args. Sportvereine ZH is locked.
    locked_canton: str | None = None

    # ----------------------------------------------------------------
    # Helpers — small, pure, easy to unit-test.
    # ----------------------------------------------------------------

    def matches_candidate(self, name: str | None, types: Iterable[str] | None) -> bool:
        """
        Apply the profile's discovery filter to one Google-Maps row.

        Returns True if the place looks like an in-scope target for this
        vertical. The filter is permissive: a hit on EITHER place-types OR
        name-keywords is enough — Google's `types` are noisy (a clinic
        might only carry `point_of_interest`), so we don't AND them.

        If the profile defines `blocked_name_keywords`, those override
        positive matches (Sportvereine excludes "fitnessstudio", "gym",
        etc. that look like clubs but aren't).
        """
        name_lower = (name or "").lower()
        types_set = {t.lower() for t in (types or [])}

        if self.blocked_name_keywords and any(
            kw in name_lower for kw in self.blocked_name_keywords
        ):
            return False

        if not self.allow_place_types and not self.required_name_keywords:
            # Profile didn't constrain at all → accept everything.
            return True

        type_hit = bool(self.allow_place_types) and any(
            t in types_set for t in self.allow_place_types
        )
        keyword_hit = bool(self.required_name_keywords) and any(
            kw in name_lower for kw in self.required_name_keywords
        )
        return type_hit or keyword_hit

    def queries_for(self, selected_specialty_keys: Iterable[str] | None = None) -> list[str]:
        """
        Compute the effective Google-Maps query list for this profile.

        Combines `base_queries` with the queries from any selected
        specialties. If `selected_specialty_keys` is None / empty the
        defaults (`enabled_by_default=True`) are used.

        De-dupes case-insensitively while preserving the first occurrence
        order so the most-distinctive queries run first (cheaper to hit
        rate limits late than early).
        """
        chosen: list[Specialty]
        if selected_specialty_keys:
            wanted = {k.strip().lower() for k in selected_specialty_keys if k}
            chosen = [s for s in self.specialties if s.key in wanted]
        else:
            chosen = [s for s in self.specialties if s.enabled_by_default]

        seen: set[str] = set()
        out: list[str] = []
        for q in list(self.base_queries) + [q for s in chosen for q in s.queries]:
            key = q.casefold()
            if key in seen:
                continue
            seen.add(key)
            out.append(q)
        return out

    def role_for(self, scraper_role: str) -> str:
        """
        Translate a generic scraper role ("owner", "lead_therapist", …)
        into the workspace-specific `roleCustom` value.

        Falls back to the input value when no mapping exists, so adding
        a new role to the pipeline doesn't silently lose data.
        """
        return self.role_keyword_map.get(scraper_role, scraper_role)
