# Corehub-Contractor · Namen, Mail & Rechte (April 2026)

## Personen (aus `Contractor Overview`, April 2026)

Quelle: `corehub_contractor_overview_merged(2).xlsx` (Sheet *Contractor Overview*).
Zahlungs-/Bankdaten bleiben nur in dieser Datei bei euch — **nicht** in Git.

| Name | Rolle im Vertrag | Einladung (privat E-Mail aus Overview) | Ziel Firmenkonto & Username |
|------|------------------|------------------------------------------|-----------------------------|
| **Diana Matushkina** | Product Owner | `diashek.i@gmail.com` | `diana.matushkina` · `diana.matushkina@corehub.kineo360.work` |
| **Richard Bilous** | Backend Developer | `rich.290401@gmail.com` | `richard.bilous` · `richard.bilous@corehub.kineo360.work` |
| **Daria Kyrychenko** | UI/UX Designer | `daria.uiuxdesigner@gmail.com` | `daria.kyrychenko` · `daria.kyrychenko@corehub.kineo360.work` |

Weitere Zeilen im Overview (Frontend, Full Stack, DevOps, QA) stehen noch auf **[TBD]** — erst onboarden, wenn unterschrieben.

## E-Mail & Login

- **Primäre Adresse (Ziel):** `vorname.nachname@corehub.kineo360.work` (alles
  klein, Punkt zwischen Vor- und Nachname).
- **Portal-Username:** gleiches Muster `vorname.nachname` (erfüllt Validierung
  im Onboarding-Tool unter `/admin/onboarding/members`).
- **Workspace-Sichtbarkeit:** Top-Level-Gruppen **`/corehub`** und
  **`/medtheris`** (über Onboarding-Tool mehrere Teams ankreuzen).
  Optional **`/kineo`**, wenn die Person die Kineo-Org im Portal sehen soll.

## Rollen → Keycloak-Untergruppe (Realm `main`)

Nach dem Anlegen in den Top-Level-Gruppen in der Admin-Console noch die
**Funktionsrolle** setzen (Untergruppe unter `/corehub`):

| Person    | Rolle (Overview)               | Keycloak-Untergruppe     |
|-----------|--------------------------------|--------------------------|
| Diana Matushkina  | Product Owner        | `/corehub/product-owner` |
| Richard Bilous    | Backend Developer    | `/corehub/back-end`      |
| Daria Kyrychenko | UI/UX Designer         | `/corehub/ui-ux`         |

Die Untergruppen sind im Setup-Script `scripts/migrate-to-main-realm.sh`
definiert (u. a. `product-owner`, `back-end`, `ui-ux`).

## Onboarding (alle drei gleichermaßen)

1. **https://app.kineo360.work/admin/onboarding/members** (Admins `ali`, `johannes`):
   User mit **`vorname.nachname`** anlegen, Primärdomain Corehub,
   Teams **Corehub + MedTheris** (optional Kineo), Mailboxes aktivieren wenn gewünscht.
2. In **Keycloak** die Untergruppe aus der Tabelle oben sicherstellen
   (`/corehub/product-owner`, `/corehub/back-end`, `/corehub/ui-ux`).
3. Falls noch **Kurz-Accounts** (`diana`, `richard`) existieren — in Keycloak (und ggf.
   Migadu) **deaktivieren oder löschen**, damit keine doppelten Identitäten bleiben.

## Tabellen-Spiegel (ohne Bankdaten)

`docs/playbooks/corehub_contractor_team_roster.xlsx` wurde aus dem Overview für
die drei festen Roles befüllt (Name, Invite-Mail, geplantes `@corehub`-Konto).
Eine Kopie liegt zusätzlich unter `~/Downloads/corehub_contractor_team_roster_merged_with_overview.xlsx`.
