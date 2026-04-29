# Product Vision — Kineo360 Workstation

> Status: **Captured, not yet started.** Phase begins after infra setup
> sprint is fully closed (backups + production smoke tests done).

## North Star

Eine zusammenhängende „Workstation"-Erfahrung für Therapeuten und
Praxis-Personal, in der **alle täglichen Arbeitstools** unter einem Dach
mit konsistentem Look & Feel laufen: Mail, Chat, Helpdesk, Files, CRM,
Calls, Termine. Niemand im Team soll sich fühlen, als jongliere er sechs
verschiedene Open-Source-Apps — sondern als nutze er **ein Produkt**.

## Marken-Hierarchie

> **Entschieden** _(2026-04-25, Ali)_: **MedTheris** ist DAS Customer-Produkt.
> Kunden sehen ausschließlich „MedTheris". „Kineo360" ist ein interner
> Plattform-Codename, taucht extern nicht auf. Die Domain `kineo360.work`
> ist **temporär** — später bekommt MedTheris eine eigene Customer-facing-TLD
> (z.B. `medtheris.ch` / `.health` / `.app`), und alles Customer-facing
> migriert dorthin.

| Ebene | Name | Sichtbarkeit | Asset |
|---|---|---|---|
| Firma (legal entity) | **Corehub Technologies LLC** | Footer, Impressum, Verträge | `branding/logos/corehub.svg` (Hex-Mark, Navy `#1e4d8c`) |
| Internes Tool | **Corehub Workstation** | nur Mitarbeiter | erbt Corehub-Mark |
| **Customer-Produkt** | **MedTheris** | überall extern (Web, Mail, App, Marketing) | `branding/logos/medtheris.svg` (Hex-Network, Emerald `#059669`) |
| Plattform-Codename | **Kineo360** | nur intern (Repo-Namen, Domain temporär, Container-Hostnames) | kein Logo |
| Internes Team A | **Corehub** | nur intern (Sidebar-Workspace) | Corehub-Mark |
| Internes Team B | **MedTheris-Team** | nur intern (Sidebar-Workspace) | MedTheris-Mark |

Das Portal-Branding nutzt das **Corehub-Mark** als master-identity in der Top-Bar
(„Corehub Workstation · INTERNAL"). Workspace-Badges in der Sidebar zeigen das
jeweilige Team-Mark + Akzentfarbe.

### Domain-Migration (deferred)

Aktuell läuft alles unter `*.kineo360.work` weil das die einzige Domain ist die
in Cloudflare voll konfiguriert ist. Wenn MedTheris seine eigene Customer-Domain
hat, wandert in dieser Reihenfolge:

1. **Customer-facing zuerst**: `medtheris.<tld>` für Marketing-Site, Login, App
   (`app.medtheris.<tld>`, `auth.medtheris.<tld>`)
2. **Mail folgt**: `*@medtheris.<tld>` für Sales/Support, alte Adressen werden
   per Migadu-Alias forwarded für ~6 Monate
3. **Internal bleibt**: `*.kineo360.work` für Mitarbeiter-only Tools (Gitea,
   Portainer, NPM, Status, Workstation-Portal), das sieht der Kunde eh nie

Tracking: `SECURITY-DEBT.md` → „Customer-Domain-Migration MedTheris".

## Workspaces / Teams

> **Architektur-Update _(2026-04-25, Ali)_**: alle internen Teams laufen in
> **einem** Keycloak-Realm `main`. Workspace-Sichtbarkeit kommt aus
> Group-Membership (`/corehub`, `/medtheris`, `/kineo`). Vorher gab es 3
> Realms — das wurde konsolidiert, weil das gesamte Tool intern ist und kein
> Multi-Tenant-Mandantenmodell braucht. Bonus: ein Login = sofort Zugriff
> auf alle Apps (echtes SSO statt 3× separat einloggen).

| Team        | Rolle                            | Keycloak-Group | Mail-Domain                  | Akzentfarbe | Apps in Sidebar                                                                |
|-------------|----------------------------------|----------------|------------------------------|-------------|--------------------------------------------------------------------------------|
| **Corehub** | Engineering / Plattformbau       | `/corehub`     | `corehub.kineo360.work`      | Navy `#1e4d8c` | **Dashboard**, Mail, Chat (RC corehub), **Kalender** (NC), Files (NC), **Office** (Collabora), CRM, Code (Gitea), **Projekte** *(deferred)*, Status, Identity, Reverse Proxy |
| **MedTheris** | Sales + Customer Inquiries     | `/medtheris`   | `medtheris.kineo360.work`    | Emerald `#059669` | **Dashboard**, Mail, Chat (RC medtheris), **Kalender** (NC), Files (NC), **Office** (Collabora), CRM (Sales-Pipeline), Helpdesk (Zammad), Status, Identity |
| **Kineo** | Group-Holding / Strategy           | `/kineo`       | `kineo.kineo360.work`        | Violet `#7c3aed` | **Dashboard**, Mail, Chat (RC corehub), Calls (Jitsi), CRM, Projekte (Plane), Status, Identity *(eigene NC/Zammad-Backends sind deferred)* |

**Office-Stack:** ein gemeinsamer **OnlyOffice Document Server** (`onlyoffice-ds` Container) wird zu beiden
Nextcloud-Instanzen connected. Vorteile: voll docx/xlsx/pptx-kompatibel (besser als Collabora),
Live-Co-Editing, gratis self-hosted bis 20 concurrent. URL: `office.kineo360.work` (intern via NPM,
nur als Document-Server-Backend von NC angesprochen, nie direkt vom User geöffnet).

**Mail-Setup:** Beide Teams kriegen je eine Migadu-Subdomain unter `kineo360.work`
(Migadu erlaubt unbegrenzt viele Subdomains gratis). Pro Domain: MX + SPF + 3× DKIM + DMARC.

| Mailbox-Klasse              | Adresse                                           |
|-----------------------------|---------------------------------------------------|
| Persönlich (User)           | `<vorname>@<team>.kineo360.work`                  |
| Rollenadresse Engineering   | `eng@corehub.kineo360.work`                       |
| Rollenadresse Sales         | `sales@medtheris.kineo360.work`                   |
| Rollenadresse Support       | `support@medtheris.kineo360.work`                 |
| Service-Sender Corehub-Stack| `noreply@corehub.kineo360.work`                   |
| Service-Sender Medtheris-Stack | `noreply@medtheris.kineo360.work`              |
| Infrastruktur (Hetzner, Keycloak admin, Uptime Kuma) | `noreply@kineo360.work` (bestehend) |

Ali (Johannes Ali Peters) ist Mitglied aller drei Teams → Workspace-Switcher oben rechts.
Künftige Team-Mitglieder werden über das Onboarding-Tool im Realm `main` angelegt
und in eine oder mehrere Top-Level-Groups eingehängt. Sie sehen dann nur die
Workspaces, deren Group sie angehören.

### Team-Mitglieder (Stand 2026-04-25, post-Realm-Migration)

Alle User leben jetzt im **einzigen** Keycloak-Realm `main`. Workspace-Sichtbarkeit
ergibt sich aus Group-Mitgliedschaften:

| User                          | E-Mail (primär)                  | Group-Memberships                                       | Workspaces sichtbar      |
|-------------------------------|----------------------------------|---------------------------------------------------------|--------------------------|
| **ali** (Johannes Ali Peters) | `ali.peters@kineo.swiss`         | `/kineo/executives`, `/corehub/dev-ops`, `/medtheris/sales` | Kineo · Corehub · MedTheris |
| **johannes** (Johannes Ali Peters) | `johannes@corehub.kineo360.work` | `/corehub/product-owner`, `/kineo/leadership`           | Corehub · Kineo          |
| **diana.matushkina** (PO)       | `diana.matushkina@corehub.kineo360.work` | `/corehub/product-owner` · Top-Level `/corehub`, `/medtheris` | Corehub · MedTheris |
| **richard.bilous** (Backend)    | `richard.bilous@corehub.kineo360.work`   | `/corehub/back-end` · Top-Level `/corehub`, `/medtheris`       | Corehub · MedTheris |
| **daria.kyrychenko** (UI/UX)     | `daria.kyrychenko@corehub.kineo360.work` | `/corehub/ui-ux` · Top-Level `/corehub`, `/medtheris`         | Corehub · MedTheris |

**Provisionierung**: Erstpasswort wird in Keycloak temporär gesetzt mit
`force-reset` Flag → User muss bei erstem Login ändern und kriegt direkt eine
Aufforderung zur TOTP-Einrichtung. Mailboxes werden parallel in Migadu
angelegt (`<vorname.nachname>@<workspace>.kineo360.work` mit Onboarding-Tool) und benutzen denselben
Authenticator/SSO via Keycloak NICHT (Migadu ist eigenständiges Auth — siehe
`docs/migadu-dns.md`).

**Wo werden User angelegt?** Im Onboarding-Tool unter
`https://app.kineo360.work/admin/onboarding/members` (nur für Admin-Allowlist:
`ali`, `johannes`). Das Tool legt einen User in `main` an, fügt ihn den gewählten
Top-Level-Groups hinzu und provisioniert pro Workspace eine Migadu-Mailbox (`vorname.nachname@<workspace>.kineo360.work` als Zielmuster; siehe Playbook).

## Three Phases

### Phase 1 — Branded Portal Shell (3–5 Tage)

**Was:** Custom Web-App unter `app.kineo360.work` mit fester Sidebar
(Mail, Chat, Files, CRM, Helpdesk, Calls, Settings) und Top-Bar (Logo,
User-Menü). Jeder Sidebar-Eintrag öffnet die Original-App in einem
gemanagten iframe. SSO-Sessions sind über Keycloak schon geteilt → ein
Login, alles offen.

**Stack-Vorschlag:** Next.js + Tailwind + shadcn/ui, deployed als
zusätzlicher Container in der bestehenden Compose-Stack, NPM proxiert
`app.kineo360.work`.

**Theming der eingebetteten Apps:**

| App         | Theming-Layer                                | Aufwand |
|-------------|---------------------------------------------|---------|
| Keycloak    | Custom Freemarker theme (login + account)   | 4 h     |
| Nextcloud   | offizielle theming-App                      | 1 h     |
| Rocket.Chat | Asset overrides + custom CSS in admin       | 1 h     |
| Zammad      | Branding settings in admin UI               | 30 min  |
| Twenty CRM  | env vars für Logo + primary color           | 30 min  |
| Gitea       | custom templates                            | 2 h     |

### Phase 2 — Cross-App Workflow Views (3–6 Wochen)

**Was:** Eigene Views für Workflows, die mehrere Apps gleichzeitig brauchen.
Nicht „neue UI für jede App", sondern **gezielte Aggregationen** dort
wo täglich gewechselt wird.

**Erste Kandidaten:**
- **Patientenakte** — kombiniert Twenty (Stammdaten + Termine) +
  Nextcloud (Dokumente) + Rocket.Chat (Praxis-Threads zum Patienten) +
  Zammad (offene Tickets) auf einer Seite.
- **Tageshome** — Termine heute, neue Mails, neue Chat-Mentions,
  offene Tickets, Reminders. Ein Blick beim Praxisstart.
- **Quick-Capture** — von überall: Notiz/Foto/Sprachmemo, landet
  automatisch in Nextcloud + ggf. an Patientenakte verknüpft.

Jeweils ~1–2 Wochen Engineering pro Use-Case.

### Phase 3 — Custom UI per App (6+ Monate, eigenes Team)

**Bewusst ausgegrenzt für „solo + Anika":** Wenn Kineo360 ein **Produkt**
werden soll, das du an externe Praxen verkaufst und das *durch die UI*
differenziert, dann wird Phase 3 ein eigenes Software-Unternehmen mit
2–3 Frontend-Engineers über 6–12 Monate für eine MVP-Version.

Das ist kein „nebenbei" mehr — das ist ein zweites Geschäft.

**Trigger für Phase 3:**
- Validierter Product-Market-Fit: 5+ Praxen wollen das System
- Finanzierung dafür steht
- Mindestens ein/e Senior Frontend Engineer ist eingestellt

## Produkt-Roadmap — Reihenfolge & Abhängigkeiten

> Leitplan für **Wellen 2–7** und angrenzende Themen. Ziel: weniger
> Rework, klarere Gates, realistische Parallelität.

### Gate: Deploy + Smoke

Nach **jedem Batch** vor der nächsten Welle: **Deploy** und **Smoke-Tests**
(Sanity-Check der betroffenen Flächen). Das ist kein optionales Nice-to-have,
sondern der feste Übergang zwischen Arbeitspaketen — verhindert, dass sich
Fehler über Wellen stapeln.

**Operativer Auftrag & Checkboxen:** [`WELLEN-AUFTRAG.md`](./WELLEN-AUFTRAG.md)  
Die **verbindliche Reihenfolge der nächsten Pakete** steht dort unter **„Aktiver Fokus (vereinbart)“**.

### Welle 2 — Office / Word / Verträge

- **Proposal-Generator**, **Word-Mail-Merge**, **Merge-Variablen** und die
  **Excel-Conditional-Basis** im Portal gelten für den aktuellen Scope als
  umgesetzt (Details: [`WELLEN-AUFTRAG.md`](./WELLEN-AUFTRAG.md)).
- **Charts/Pivot**, **eSignature E2E (Sales-Contracts)** und KI-Erweiterungen
  bleiben **Backlog** — E2E braucht einen durchgängigen **Contract-Lifecycle**:
  Entwurf → Freigabe → Signatur → Archiv/Revision.

### Welle 3 — Marketing

**UTM-Attribution** und **öffentlicher Lead-Capture** (embeddable API,
CRM-Anlage, Quelle in der Lead-Inbox) bilden das **abgeschlossene
Marketing-Fundament** im Repo. **CMS**, **Landing-Page-Builder**, weitere
**Forms** und Kanal-Tools sind **Growth-Backlog**: sie bauen auf derselben
Attribution-Schicht auf, sind aber kein Blocker für den aktuellen Welle-3-Core.

### Welle 4 — CRM / Pipeline

**Deal-Stages Kanban** und verwandte Sales-Views profitieren, wenn
**Deal-Stages** im CRM (Twenty) bereits **konsistent** und teamweit abgestimmt
sind — sonst wird das Board täglich neu erfunden.

### Welle 5 — Global Cmd+K

**Globale Suche** lohnt sich, wenn bewusst definiert ist, **welche Quellen**
wirklich indexiert/durchsucht werden sollen (Mail, Files, CRM, Tickets, …)
und mit welcher Priorität. Ohne diese Liste wird Cmd+K entweder dünn oder
unendlich scope-creep.

### Welle 6 — Files / Content-Skalierung

Asset-Library und mehrsprachige Varianten bauen auf stabiler
**Files-/Metadaten-** und **Publishing-**Logik auf — nach Marketing-Basis
(Welle 3) oft sinnvoll einzuplanen.

### Welle 7 — Security / Compliance

**2FA-Enforcement**, **WebAuthn/Passkeys**, **DSG-Self-Service**
(Export/Löschung) sind **technisch oft Vorbedingungen** für größere Kunden
und Audits. Im Backlog stehen sie häufig als „Welle 7“, **politisch** können
und müssen frühere Sprints frei sein, wenn ein Deal das erzwingt — die
Nummer ist keine harte Reihenfolge für Compliance.

## Aktuelle Akzeptanz

In Phase 0 (jetzt) nutzt das Team jede App in ihrer Originalform direkt unter
`<service>.kineo360.work`. Das ist explizit OK weil:

- Kleines internes Team (3 Devs), keine UI-Konsistenz für Externe nötig
- Alle Apps haben SSO → kein Mehrfach-Login-Schmerz
- Die UI-Investition lohnt erst wenn entweder
  (a) das Team nervt's täglich, oder
  (b) externe Nutzer (Mitarbeiter, Patient:innen) reinkommen
