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
        query = gql("""
        query FindCompany($filter: CompanyFilterInput) {
          companies(filter: $filter) {
            edges { node { id name } }
          }
        }
        """)
        try:
            result = self.client.execute(query, variable_values={
                "filter": {"name": {"eq": name}},
            })
            return bool(result.get("companies", {}).get("edges"))
        except Exception as exc:
            print(f"  Twenty.company_exists failed for {name!r}: {exc}")
            return False

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
