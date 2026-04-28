# Portal (Next.js)

Kineo360-Portal: App Router, Keycloak (NextAuth v5), Helpdesk-, CRM- und weitere Integrationen.

## Entwicklungsserver

```bash
cd portal
npm install
npm run dev
```

Standard: [http://localhost:3000](http://localhost:3000).

### Umgebungsvariablen (lokal)

Lege **`portal/.env.local`** an (wird von Git ignoriert). Mindestens für Login:

| Variable | Bedeutung |
|----------|-----------|
| `AUTH_SECRET` | Starker Zufallswert (wie `PORTAL_AUTH_SECRET` in der Root-`.env`) |
| `KEYCLOAK_ISSUER` | z. B. `https://<dein-host>/realms/<realm>` |
| `KEYCLOAK_CLIENT_ID` | OAuth-Client (z. B. `portal`) |
| `KEYCLOAK_CLIENT_SECRET` | Passend zum Keycloak-Client |

Im Keycloak-Client **Valid redirect URIs** ergänzen:

`http://localhost:3000/api/auth/callback/keycloak`

Weitere Variablen (Zammad, Twenty, Mail, …) siehe **`../.env.example`** im Repo-Root — für reine UI-Arbeit reichen oft die Keycloak-Variablen; API-Routen brauchen je nach Feature die passenden Bridge-URLs und Tokens.

### Build (wie in Produktion)

```bash
npm run build
npm run start
```

`next.config.ts` nutzt `output: "standalone"` für Docker-Images.

## Backup & Staging

Tägliche Backups und Staging-Hinweise: [**`../docs/backup-staging.md`**](../docs/backup-staging.md) sowie **`../scripts/backup.sh`**.

Kurzreferenz Helpdesk/Zammad: **`./scripts/helpdesk-backup.sh`**.
