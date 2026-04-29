"""
Scraper-Profile registry.

A *profile* bundles every vertical-specific decision the pipeline has to
make: which Google-Maps queries to run, which place-types to accept, which
LLM prompt to use for extraction, which Twenty-Workspace and tenant tag
to push into, and which CRM field-name vocabulary to write.

Profiles live as dataclass instances in their own module under this
package. Adding a new vertical is a copy-of-an-existing-profile job —
no edits in main.py, runner.py, or discovery.py needed beyond opting in.

Usage:
    from scraper.profiles import get_profile, list_profiles

    profile = get_profile("aerzte")           # raises if unknown
    for p in list_profiles():                 # for the UI dropdown
        print(p.key, p.label, p.one_shot)

Why a registry and not a plain import?
  * UI / runner code needs to enumerate profiles.
  * `get_profile` validates the key once and gives a single error
    surface (`UnknownProfileError`) instead of leaking ImportError
    deep into the pipeline.
"""
from __future__ import annotations

from .aerzte import PROFILE_AERZTE
from .base import Profile
from .physio import PROFILE_PHYSIO
from .sportvereine import PROFILE_SPORTVEREINE


class UnknownProfileError(KeyError):
    """Raised when a caller asks for a profile key we don't ship."""


_REGISTRY: dict[str, Profile] = {
    PROFILE_PHYSIO.key: PROFILE_PHYSIO,
    PROFILE_AERZTE.key: PROFILE_AERZTE,
    PROFILE_SPORTVEREINE.key: PROFILE_SPORTVEREINE,
}


def get_profile(key: str | None) -> Profile:
    """Resolve a profile by key. None / "" → default (physio)."""
    if not key:
        return PROFILE_PHYSIO
    profile = _REGISTRY.get(key.strip().lower())
    if profile is None:
        known = ", ".join(sorted(_REGISTRY))
        raise UnknownProfileError(
            f"unknown profile {key!r}; known profiles: {known}"
        )
    return profile


def list_profiles() -> list[Profile]:
    """All registered profiles, in stable display order (legacy first)."""
    return [PROFILE_PHYSIO, PROFILE_AERZTE, PROFILE_SPORTVEREINE]


__all__ = [
    "Profile",
    "UnknownProfileError",
    "get_profile",
    "list_profiles",
    "PROFILE_PHYSIO",
    "PROFILE_AERZTE",
    "PROFILE_SPORTVEREINE",
]
