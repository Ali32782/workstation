"""
Minimal GraphQL client for Twenty CRM.

Targets the public `/graphql` endpoint exposed by Twenty's NestJS server.
Authenticates with a workspace API key (Bearer token).

Note on schema: Twenty's GraphQL schema is partly per-workspace generated
(custom fields, custom objects), so some mutations may fail with
'CompanyCreateInput.<field> not defined' if you push a field that doesn't
exist in the workspace's schema. In that case: add the missing field in
Settings → Data Model and try again. mapper.py centralizes which fields the
scraper expects to exist.
"""
from typing import Any

from gql import Client, gql
from gql.transport.requests import RequestsHTTPTransport


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


class TwentyClient:
    def __init__(self, api_url: str, api_key: str, timeout: int = 30):
        if not api_url or not api_key:
            raise ValueError("TwentyClient requires api_url and api_key")

        self.api_url = api_url.rstrip("/")
        self.api_key = api_key

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
        try:
            cleaned = {k: v for k, v in data.items() if v is not None}
            result = self.client.execute(mutation, variable_values={"input": cleaned})
            return result["createCompany"]["id"]
        except Exception as exc:
            print(f"  Twenty.create_company failed for {data.get('name')!r}: {exc}")
            return None

    def create_person(self, data: dict[str, Any]) -> str | None:
        mutation = gql("""
        mutation CreatePerson($input: PersonCreateInput!) {
          createPerson(data: $input) {
            id
          }
        }
        """)
        try:
            cleaned = {k: v for k, v in data.items() if v is not None}
            result = self.client.execute(mutation, variable_values={"input": cleaned})
            return result["createPerson"]["id"]
        except Exception as exc:
            print(f"  Twenty.create_person failed: {exc}")
            return None

    def update_company(self, company_id: str, data: dict[str, Any]) -> bool:
        """
        Patch a company. Only call with the SUBSET of fields you want to set
        — Twenty treats every field in `data` as authoritative and will
        overwrite the previous value, so callers must pre-filter.
        """
        if not data:
            return False
        mutation = gql("""
        mutation UpdateCompany($id: UUID!, $input: CompanyUpdateInput!) {
          updateCompany(id: $id, data: $input) { id }
        }
        """)
        try:
            cleaned = {k: v for k, v in data.items() if v is not None}
            self.client.execute(mutation, variable_values={
                "id": company_id, "input": cleaned,
            })
            return True
        except Exception as exc:
            print(f"  Twenty.update_company({company_id[:8]}…) failed: {exc}")
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
        try:
            cleaned = {k: v for k, v in data.items() if v is not None}
            result = self.client.execute(mutation, variable_values={"input": cleaned})
            return result["createOpportunity"]["id"]
        except Exception as exc:
            print(f"  Twenty.create_opportunity failed: {exc}")
            return None
