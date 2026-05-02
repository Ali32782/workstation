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

Rate-limit handling:
    Twenty enforces ~100 mutations / 60 s on the workspace. The scraper
    fires up to ~10 mutations per practice (find + create company +
    create N people + create opportunity), so any cache-push of more
    than 10 practices in a row hits the cap and Twenty answers with
    ``Limit reached (100 tokens per 60000 ms)``. We treat that as a
    transient failure: sleep until the window resets, then retry the
    SAME mutation. A small client-side delay (`MIN_MUTATION_DELAY_S`)
    smooths the request rate so we rarely hit the limit in the first
    place. Rate-limit retries are NOT counted as schema drops.
"""
import re
import time
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

# Twenty's rate-limit response is recognisable by either the friendly
# subCode or the "X tokens per Y ms" phrase. We match liberally because
# the same client also has to work against custom Twenty forks.
_RATE_LIMIT_PATTERNS = (
    re.compile(r"LIMIT_REACHED", re.IGNORECASE),
    re.compile(r"Rate\s+limit\s+reached", re.IGNORECASE),
    re.compile(r"Limit\s+reached\s*\(\s*\d+\s+tokens?\s+per\s+\d+\s*ms", re.IGNORECASE),
    re.compile(r"\b429\b"),
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


def _is_rate_limit_error(err_text: str) -> bool:
    """True if Twenty answered with a "Rate limit reached" / 429 style error.

    The actual cool-down window is 60 s but we wait a touch longer (see
    `_RATE_LIMIT_COOLDOWN_S`) to avoid hammering the limit boundary.
    """
    if not err_text:
        return False
    return any(rx.search(err_text) for rx in _RATE_LIMIT_PATTERNS)


# Twenty surfaces UNIQUE-constraint conflicts in two flavours:
#   1. userFriendlyMessage: "This <Field Name> value is already in use…"
#   2. message: "A duplicate entry was detected"
# We match the friendly message because it includes the field's display
# label (which we can map back to the API name) and the GraphQL response
# also gives us `conflictingObjectNameSingular` for context. Empirically
# the only field this fires on is `domainName` (chain branches share a
# website), so the mapping is a small table.
_DUPLICATE_FIELD_LABEL_RE = re.compile(
    r"This\s+(?P<label>[A-Za-z][A-Za-z0-9 ]+?)\s+value\s+is\s+already\s+in\s+use",
    re.IGNORECASE,
)
_DUPLICATE_FIELD_LABEL_TO_API: dict[str, str] = {
    "domain name": "domainName",
    "name": "name",
    "linkedin link": "linkedinLink",
    "linkedin": "linkedinLink",
}


def _extract_unique_conflict_field(err_text: str) -> str | None:
    """Return the API field name a duplicate-entry error refers to.

    Returns None if the error isn't a UNIQUE conflict or we don't know
    how to map the friendly label back to its API name. Callers should
    fall back to the generic "operation failed" path on None.
    """
    if not err_text:
        return None
    m = _DUPLICATE_FIELD_LABEL_RE.search(err_text)
    if not m:
        return None
    label = m.group("label").strip().lower()
    return _DUPLICATE_FIELD_LABEL_TO_API.get(label)


class TwentyClient:
    # Hard ceiling so a permanently-broken payload can't loop forever.
    # Sized larger than the total number of optional custom fields the
    # mapper writes, so a workspace that misses ALL of them still reaches
    # a successful create instead of being aborted (the previous value
    # of 12 cut off well-extracted leads with many filled custom fields,
    # e.g. "PHYSIOZENTRUM St. Gallen Marktplatz" in the April push).
    _MAX_FIELD_DROPS = 40
    # How long to sleep when Twenty answers "Limit reached". Matches the
    # 60 s window in the error message + 5 s buffer so we land on the
    # other side of the bucket reset.
    _RATE_LIMIT_COOLDOWN_S = 65
    # How many cool-downs we accept per single mutation before giving up.
    # Two is enough in practice — Twenty's bucket is 60 s wide, so two
    # cool-downs == 130 s, and if it's still throttled the operator
    # almost certainly has another job hammering the same workspace.
    _MAX_RATE_LIMIT_RETRIES = 2
    # Minimum delay between mutations. The Twenty bucket is 100 ops /
    # 60 s, i.e. 1.67 mutations / s. We aim for ~1 mutation every 0.7 s
    # which keeps us comfortably under the cap and still finishes a
    # 50-practice push in roughly 6 minutes.
    MIN_MUTATION_DELAY_S = 0.7

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
        # Counters — surfaced at the end of a run so an operator can see
        # how often we hit the rate limit and how much wall-clock time
        # we burned waiting for cool-downs.
        self.rate_limit_hits: int = 0
        self.rate_limit_wait_s: float = 0.0
        # Wall-clock of the previous mutation; used for client-side
        # throttling so we don't spam Twenty into the rate-limit wall.
        self._last_mutation_at: float = 0.0

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

    # ---------------------- pacing ------------------------------------

    def _throttle(self) -> None:
        """Sleep just enough to keep mutation pacing below Twenty's limit.

        Called at the start of every Create/Update execution. The first
        call is a no-op (`_last_mutation_at == 0`). Cheap to call: max
        sleep is ~MIN_MUTATION_DELAY_S, and only when the previous
        request finished very recently.
        """
        if self.MIN_MUTATION_DELAY_S <= 0:
            return
        now = time.monotonic()
        gap = now - self._last_mutation_at
        if self._last_mutation_at and gap < self.MIN_MUTATION_DELAY_S:
            time.sleep(self.MIN_MUTATION_DELAY_S - gap)
        self._last_mutation_at = time.monotonic()

    def _cool_down_for_rate_limit(self, label: str, result_key: str) -> None:
        """Block until Twenty's per-minute mutation budget resets.

        Logs once per cool-down so a `--push-cache` of 50 practices that
        bumps the limit twice produces 2 log lines, not 50.
        """
        self.rate_limit_hits += 1
        self.rate_limit_wait_s += self._RATE_LIMIT_COOLDOWN_S
        print(
            f"  Twenty.{result_key}: Rate-Limit erreicht für {label!r} — "
            f"warte {self._RATE_LIMIT_COOLDOWN_S}s und versuche erneut. "
            f"(insgesamt {self.rate_limit_hits} Limits in diesem Lauf)"
        )
        time.sleep(self._RATE_LIMIT_COOLDOWN_S)
        # Reset throttle baseline so the very next request goes immediately.
        self._last_mutation_at = 0.0

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
        rate_limit_attempts = 0
        while attempt <= self._MAX_FIELD_DROPS:
            self._throttle()
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
                # 1) Schema-drift: Twenty doesn't know one of our custom
                #    fields. Drop it from the payload and try again. Doesn't
                #    count against the rate-limit retry budget.
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
                # 2) Rate-limit: Twenty's per-minute mutation budget is
                #    exhausted. Sleep through the window and retry the
                #    SAME payload — important: don't decay attempt or
                #    drop fields, because nothing was wrong with the
                #    request itself.
                if (
                    _is_rate_limit_error(err)
                    and rate_limit_attempts < self._MAX_RATE_LIMIT_RETRIES
                ):
                    rate_limit_attempts += 1
                    self._cool_down_for_rate_limit(label, result_key)
                    continue
                # 3) Anything else: give up on this entity.
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
        # Both projections are tried with rate-limit retry — Twenty
        # counts reads against the same per-minute bucket, so a long
        # `--push-cache` run is just as likely to be throttled on
        # find_company() as on createCompany().
        def _run_with_rl(q, label: str):
            rl_attempts = 0
            while True:
                self._throttle()
                try:
                    return self.client.execute(q, variable_values={
                        "filter": {"name": {"eq": name}},
                    })
                except Exception as exc:
                    if (
                        _is_rate_limit_error(str(exc))
                        and rl_attempts < self._MAX_RATE_LIMIT_RETRIES
                    ):
                        rl_attempts += 1
                        self._cool_down_for_rate_limit(name, label)
                        continue
                    raise

        try:
            result = _run_with_rl(query, "find_company")
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
                result = _run_with_rl(fallback, "find_company")
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
        rate_limit_attempts = 0
        # Twenty enforces UNIQUE on `domainName` — a chain like Santewell
        # has multiple branches that legitimately share a domain. When
        # the conflict shows up we drop just that field on the second
        # branch and retry, instead of failing the whole update.
        unique_dropped: set[str] = set()
        while attempt <= self._MAX_FIELD_DROPS:
            self._throttle()
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
                conflict = _extract_unique_conflict_field(err)
                if conflict and conflict in cleaned and conflict not in unique_dropped:
                    cleaned.pop(conflict, None)
                    unique_dropped.add(conflict)
                    attempt += 1
                    print(
                        f"  Twenty.update_company({company_id[:8]}…): "
                        f"'{conflict}' ist bereits an einer anderen Company "
                        f"vergeben (Filiale derselben Kette?) — verwerfe es "
                        f"und sende den Rest."
                    )
                    if not cleaned:
                        return False
                    continue
                if (
                    _is_rate_limit_error(err)
                    and rate_limit_attempts < self._MAX_RATE_LIMIT_RETRIES
                ):
                    rate_limit_attempts += 1
                    self._cool_down_for_rate_limit(
                        f"update {company_id[:8]}…", "update_company",
                    )
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
