# Kineo Workspace — Gap Report & Operations Dashboard im Portal

Das Portal kann unter **Workspace „Kineo“** zwei optionale Einträge einblenden, die externe Reporting-UIs per **iframe** laden:

| Umgebungsvariable | Sidebar-ID | Typische Quelle |
|-------------------|------------|-----------------|
| `NEXT_PUBLIC_KINEO_GAP_REPORT_URL` | Gap Report | z. B. dedizierte Reporting-App auf Hetzner („GapFillingReport“-VM) |
| `NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL` | Operations Dashboard | z. B. **Streamlit** aus dem Repo `Kineo_Dashboard` (`streamlit run streamlit_upload.py`) |

Wenn eine Variable **leer** ist, erscheint der entsprechende Menüpunkt **nicht**.

## Routing im Portal

- URLs: `/kineo/apps/gap-report` bzw. `/kineo/apps/ops-dashboard`
- Implementierung: `portal/src/lib/workspaces.ts` (`kineoEnvApps`, `resolveWorkspace`)
- Sidebar & `getWorkspace` nutzen `resolveWorkspace`, damit Server- und Client-Katalog übereinstimmen.

## Infrastruktur (Hetzner)

1. **Öffentliche HTTPS-URL** je Dienst (empfohlen: eigener Host unter `*.kineo360.work`, Proxy Host in **Nginx Proxy Manager**).
2. **Iframe-CSP**: Für jeden neuen Proxy-Host `scripts/npm-iframe-csp.sh` ausführen bzw. dieselbe `frame-ancestors`-Politik wie bei anderen eingebetteten Apps setzen (`docs/portal.md`).
3. **Streamlit**: Standardmäßig setzen viele Setups Header, die **Embedding verbieten**. Dann entweder Streamlit so konfigurieren, dass Einbettung erlaubt ist, oder Nutzer:innen nutzen **„In neuem Tab öffnen“** in der AppFrame-Leiste.

## Deployment

In Root-`.env` (oder Compose-`environment`) setzen und **`portal`-Image neu bauen** (`NEXT_PUBLIC_*` werden beim Build eingebettet):

```env
NEXT_PUBLIC_KINEO_GAP_REPORT_URL=https://…
NEXT_PUBLIC_KINEO_OPERATIONS_DASHBOARD_URL=https://…
```

Siehe auch `.env.example` und `docker-compose.yml` (Service `portal`).

## Chatbot / weitere Dienste

Der Chatbot unter **kineo360.work** ist **nicht** Teil dieser beiden URLs — bei Bedarf eigene Sidebar-App oder Verlinkung aus dem Dashboard ergänzen (gleiches Muster: env-gesteuerte URL + optional `workspaces.ts`).
