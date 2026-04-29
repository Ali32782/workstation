"""
Minimal GraphQL client for Twenty CRM.

Targets the public `/graphql` endpoint exposed by Twenty's NestJS server.
Authenticates with a workspace API key (Bearer token).

Schema drift (per-workspace custom fields):
    Twenty's GraphQL schema is partly generated per workspace, so a field
    the scraper writes (e.g. ``bookingConfidence``) only exists if an
    operator created it in Settings → Data Model. If we naïvely fail on
    the first schema mismatch, a single missing custom field blocks every
    push.

    Therefore the create_*() methods *self-heal* against this drift: on a
    "doesn't have any …" error from Twenty we strip the offending field
    from the payload and retry, up to N times. The dropped field names are
    logged and accumulated on the client (`self.dropped_fields`) so the
    operator sees once at the end of a run *which* fields are missing
    from their workspace and can decide whether to add them or accept
    the simpler payload.
"""
import re
from typing import Any

from gql import Client, gql
from gql.transport.requests import RequestsHTTPTransport


def _normalize_twenty_origin(api_url: str) -> str:
    """
    Twenty exposes GraphQL at {SERVER_URL}/graphql.

    Some deployments mistakenly set TWENTY_API_URL to …/api (copy-paste from
    other REST stacks). That yields …/api/graphql which returns 404 on Twenty.
    Strip a trailing /api so both styles work.
    """
    base = api_url.strip().rstrip("/")
    if base.lower().endswith("/api"):
        base = base[:-4].rstrip("/")
    return base


def _is_empty(value: Any) -> bool:
    """True for None / empty-string / empty container / dict-of-only-empties."""
    if value is None:
        return True
    if isinstance(value, str):
        return value.strip() == ""
    if isinstance(value, (list, tuple, set)):
        return len(value) == 0
    if isinstance(value, dict):
        return all(_is_empty(v) for v in value.values())
    return False


# Twenty's GraphQL error message looks like
#
#   Object company doesn't have any "bookingConfidence" field.
#
# but when gql raises this as an exception, str(exc) returns the *repr* of
# the GraphQL errors dict — which Python may render with backslash-escaped
# apostrophes (`doesn\'t`). So the character class around the quotes also
# accepts a literal backslash, and we don't anchor on the verb at all
# (different Twenty versions phrase it slightly differently).
_UNKNOWN_FIELD_RE = re.compile(
    r"have any\s+[\\\"\']+(?P<field>[A-Za-z_][\w]*)[\\\"\']+\s+field",
    re.IGNORECASE,
)
# Fallbacks for older / customised Twenty servers that say it differently.
_UNKNOWN_FIELD_FALLBACK_PATTERNS = (
    re.compile(r"Field\s+[\\\"\']?(?P<field>[A-Za-z_][\w]*)[\\\"\']?\s+is not defined", re.I),
    re.compile(r"unknown field\s+[\\\"\']?(?P<field>[A-Za-z_][\w]*)[\\\"\']?", re.I),
    re.compile(r"[\\\"\'](?P<field>[A-Za-z_][\w]*)[\\\"\']\s+is not a recognised", re.I),
)


def _extract_unknown_field(err_text: str) -> str | None:
    """Return the field name Twenty complained about, or None if unparsable."""
    if not err_text:
        return None
    m = _UNKNOWN_FIELD_RE.search(err_text)
    if m:
        return m.group("field")
    for rx in _UNKNOWN_FIELD_FALLBACK_PATTERNS:
        m = rx.search(err_text)
        if m:
            return m.group("field")
    return None


class TwentyClient:
    # Hard ceiling so a permanently-broken payload can't loop forever.
    _MAX_FIELD_DROPS = 12

    def __init__(self, api_url: str, api_key: str, timeout: int = 30):
        if not api_url or not api_key:
            raise ValueError("TwentyClient requires api_url and api_key")

        self.api_url = _normalize_twenty_origin(api_url)
        self.api_key = api_key
        # Set of field names the workspace doesn't have — populated lazily
        # as we see schema-drift errors. Future calls in the same process
        # pre-strip these, so we don't spam Twenty with the same failing
        # payloads when pushing 100 cached practices in a row.
        self.dropped_fields: set[str] = set()

        transport = RequestsHTTPTransport(
            url=f"{self.api_url}/graphql",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            timeout=timeout,
            verify=True,
            retries=2,
        )
        self.client = Client(transport=transport, fetch_schema_from_transport=False)

    # ---------------------- internals ---------------------------------

    def _execute_with_drift_retry(
        self,
        mutation,
        input_obj: dict[str, Any],
        result_key: str,
        label: str,
    ) -> dict[str, Any] | None:
        """
        Execute a Create/Update mutation, automatically dropping payload
        fields that the Twenty workspace schema doesn't recognise, and
        retrying. Returns the inner result dict (e.g. ``{id, name, …}``)
        or None if the mutation failed for a non-schema reason.

        ``input_obj`` is mutated in place — the caller's dict will
        reflect the actually-sent payload. That's intentional: the
        twenty_company_id we cache should correspond to the trimmed
        payload, and it lets `merge_company_fields` recompute deltas
        against the same shape next time.
        """
        cleaned = {
            k: v
            for k, v in input_obj.items()
            if v is not None and k not in self.dropped_fields
        }
        attempt = 0
        while attempt <= self._MAX_FIELD_DROPS:
            try:
                result = self.client.execute(
                    mutation, variable_values={"input": cleaned}
                )
                payload = result.get(result_key)
                if payload is None:
                    print(
                        f"  Twenty.{result_key} returned no payload for "
                        f"{label!r} (got: {result})"
                    )
                    return None
                return payload
            except Exception as exc:
                err = str(exc)
                bad = _extract_unknown_field(err)
                if bad and bad in cleaned:
                    cleaned.pop(bad, None)
                    self.dropped_fields.add(bad)
                    attempt += 1
                    print(
                        f"  Twenty.{result_key}: workspace hat kein '{bad}'-Feld — "
                        f"verwerfe es und versuche erneut "
                        f"(Drop {attempt}/{self._MAX_FIELD_DROPS})."
                    )
                    continue
                print(f"  Twenty.{result_key} failed for {label!r}: {exc}")
                return None
        print(
            f"  Twenty.{result_key} aufgegeben für {label!r}: "
            f"zu viele Schema-Drops ({self._MAX_FIELD_DROPS})."
        )
        return None

    # ---------------------- queries -----------------------------------

    def company_exists(self, name: str) -> bool:
        return self.find_company(name) is not None

    def find_company(self, name: str) -> dict[str, Any] | None:
        """
        Look up a company by exact name and return ALL the fields we care
        about so callers can decide which slots are still empty and need
        an enrichment write. Returns None when no match exists.
        """
        query = gql("""
        query FindCompany($filter: CompanyFilterInput) {
          companies(filter: $filter) {
            edges {
              node {
                id
                name
                domainName { primaryLinkUrl }
                address {
                  addressStreet1
                  addressStreet2
                  addressCity
                  addressPostcode
                  addressState
                  addressCountry
                }
                introVideo { primaryLinkUrl }
                linkedinLink { primaryLinkUrl }
                xLink { primaryLinkUrl }
                employees
                annualRecurringRevenue { amountMicros currencyCode }
                tagline
              }
            }
          }
        }
        """)
        try:
            result = self.client.execute(query, variable_values={
                "filter": {"name": {"eq": name}},
            })
            edges = (result.get("companies") or {}).get("edges") or []
            return edges[0]["node"] if edges else None
        except Exception as exc:
            # Fallback for older / customised Twenty schemas that don't
            # expose every field we just asked for: retry with the minimal
            # projection so the rest of the pipeline still works.
            print(f"  Twenty.find_company({name!r}) — full projection failed: {exc}")
            try:
                fallback = gql("""
                query FindCompanyMin($filter: CompanyFilterInput) {
                  companies(filter: $filter) {
                    edges { node { id name } }
                  }
                }
                """)
                result = self.client.execute(fallback, variable_values={
                    "filter": {"name": {"eq": name}},
                })
                edges = (result.get("companies") or {}).get("edges") or []
                return edges[0]["node"] if edges else None
            except Exception as exc2:
                print(f"  Twenty.find_company({name!r}) failed: {exc2}")
                return None

    # ---------------------- mutations ---------------------------------

    def create_company(self, data: dict[str, Any]) -> str | None:
        mutation = gql("""
        mutation CreateCompany($input: CompanyCreateInput!) {
          createCompany(data: $input) {
            id
            name
          }
        }
        """)
        payload = self._execute_with_drift_retry(
            mutation, data, "createCompany", str(data.get("name") or "?"),
        )
        return payload.get("id") if payload else None

    def create_person(self, data: dict[str, Any]) -> str | None:
        mutation = gql("""
        mutation CreatePerson($input: PersonCreateInput!) {
          createPerson(data: $input) {
            id
          }
        }
        """)
        # Persons don't carry a stable label like company.name; use the
        # email or first/last as the log hint instead.
        label = (
            data.get("emails")
            or f"{data.get('name', {}).get('firstName', '?')} {data.get('name', {}).get('lastName', '?')}".strip()
        )
        payload = self._execute_with_drift_retry(
            mutation, data, "createPerson", str(label),
        )
        return payload.get("id") if payload else None

    def update_company(self, company_id: str, data: dict[str, Any]) -> bool:
        """
        Patch a company. Only call with the SUBSET of fields you want to set
        — Twenty treats every field in `data` as authoritative and will
        overwrite the previous value, so callers must pre-filter.

        Schema drift is handled here too: if the workspace doesn't have a
        custom field the scraper wants to set, we drop the field and retry
        rather than abort the whole update.
        """
        if not data:
            return False
        mutation = gql("""
        mutation UpdateCompany($id: UUID!, $input: CompanyUpdateInput!) {
          updateCompany(id: $id, data: $input) { id }
        }
        """)
        cleaned = {
            k: v
            for k, v in data.items()
            if v is not None and k not in self.dropped_fields
        }
        attempt = 0
        while attempt <= self._MAX_FIELD_DROPS:
            try:
                self.client.execute(
                    mutation,
                    variable_values={"id": company_id, "input": cleaned},
                )
                return True
            except Exception as exc:
                err = str(exc)
                bad = _extract_unknown_field(err)
                if bad and bad in cleaned:
                    cleaned.pop(bad, None)
                    self.dropped_fields.add(bad)
                    attempt += 1
                    print(
                        f"  Twenty.update_company({company_id[:8]}…): workspace hat "
                        f"kein '{bad}'-Feld — verwerfe es."
                    )
                    if not cleaned:
                        return False
                    continue
                print(
                    f"  Twenty.update_company({company_id[:8]}…) failed: {exc}"
                )
                return False
        return False

    def merge_company_fields(
        self,
        existing: dict[str, Any],
        proposed: dict[str, Any],
    ) -> dict[str, Any]:
        """
        Compute the *additive* delta: only fields where the existing record
        is empty/null get the proposed value. Returns the dict that was
        actually pushed (may be empty if nothing was missing). Composite
        fields (address, domainName, …) are merged at sub-key granularity.
        """
        company_id = existing.get("id")
        if not company_id:
            return {}

        delta: dict[str, Any] = {}
        for key, new_val in proposed.items():
            if new_val is None:
                continue
            current = existing.get(key)

            if isinstance(new_val, dict) and isinstance(current, dict):
                sub_delta = {}
                for sub_key, sub_val in new_val.items():
                    if sub_val is None:
                        continue
                    if not _is_empty(current.get(sub_key)):
                        continue
                    sub_delta[sub_key] = sub_val
                if sub_delta:
                    delta[key] = sub_delta
            else:
                if _is_empty(current):
                    delta[key] = new_val

        if delta and self.update_company(company_id, delta):
            return delta
        return {}

    def create_opportunity(self, data: dict[str, Any]) -> str | None:
        mutation = gql("""
        mutation CreateOpportunity($input: OpportunityCreateInput!) {
          createOpportunity(data: $input) {
            id
          }
        }
        """)
        payload = self._execute_with_drift_retry(
            mutation, data, "createOpportunity", str(data.get("name") or "?"),
        )
        return payload.get("id") if payload else None
