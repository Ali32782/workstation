# Security Debt — offen

Diese Liste wird abgebaut bevor echte Patientendaten in das System
einfließen (spätestens vor Onboarding erster externer Praxis).

## Current State (Setup-Phase)

**Datum:** 2026-04-24
**Status:** Shared Admin-Credentials akzeptiert für schnellen Setup

### Akzeptierte Debt

| Asset | Current | Target |
|---|---|---|
| Keycloak Master Admin `ali` | Password `Neuro8008logie` | 20+ Zeichen + TOTP MFA |
| Nextcloud Corehub `Ali` | gleich | SSO via Keycloak |
| Nextcloud Medtheris `ali` | gleich | SSO via Keycloak |
| Rocket.Chat `ali` | gleich | SSO via Keycloak |
| Twenty CRM `ali.peters@kineo.swiss` | gleich | SSO via Keycloak |
| Gitea `ali` | gleich | SSO via Keycloak |

### Fixes vor Produktiv-Go-Live (Checkliste)

- [ ] **Rocket.Chat 2FA wieder aktivieren** (wurde für OAuth-Setup temporär aus)
  - Admin → Accounts → Two Factor Authentication → Enabled + Enforce Password Fallback
  - Ali kriegt TOTP-App (Authy / 1Password / iOS Codes)
- [ ] **Keycloak MFA (TOTP) für `ali` im master realm erzwingen**
  - Admin Console → Authentication → Flows → Browser → OTP Form = Required
- [ ] **Keycloak Master-Admin-Passwort rotieren** auf ≥20 Zeichen unique
- [ ] **OIDC in alle Tools wired** (Nextcloud, Rocket.Chat, Gitea — Twenty deferred)
  - Per-Tool Admin-Accounts werden zu "break-glass" und bleiben mit Unique-Password liegen
- [ ] **Twenty CRM SSO** — explizit deferred bis einer dieser Trigger:
  - Twenty führt OIDC für Self-Hosted ohne Multi-Workspace-Zwang ein, ODER
  - Twenty Enterprise wird lizensiert (kostenpflichtig), ODER
  - Wir migrieren auf 2nd-Level-Wildcard `*.crm.kineo360.work` (DNS, Cert, NPM-Routing)

  Hintergrund: Twenty v2 koppelt SSO-UI an `IS_MULTIWORKSPACE_ENABLED=true`,
  was jeden Workspace auf `<workspace>.<base-domain>` zwingt. Würde zwei
  Wildcard-Level brauchen, die unsere aktuelle DNS/Cert-Struktur nicht hat.
  Ali nutzt Twenty bis dahin mit lokalem Account (Email + Password).
- [ ] **Fail2ban** auf Host für SSH + NPM Login-Brute-Force-Schutz
- [ ] **Backup-Verschlüsselung** (S3 Hetzner Object Storage mit restic + Password)
- [ ] **Audit-Log** in Keycloak aktivieren (Events → Login Events storage 14d)
- [ ] **CrowdSec oder analog** für HTTP-Layer-Threats vor NPM

## Why this is acceptable right now

- Keine echten Patientendaten im System
- Nur `ali` hat Zugang (ein Operator)
- Keine ausgehenden Connections außer Let's Encrypt + Docker Registry
- Alle admin-URLs nur über HTTPS + TLS 1.2+
- SSH-Key-only-Login aktiv, root direkt via SSH disabled
- UFW + Docker Network-Isolation zwischen corehub/medtheris-internal
- Keycloak sessions stateful (nicht JWT) → Logout = sofort raus

## Trigger für Debt-Abbau

Einer reicht zum "jetzt fixen":

1. Erste externe Praxis wird onboarded
2. Erste Test-Patientenakte wird angelegt (auch Dummy-Daten)
3. Domain-Transfer `medtheris.com` abgeschlossen und Go-Live geplant
4. Ein Mitarbeiter (nicht Ali) bekommt Zugriff auf ein Tool
