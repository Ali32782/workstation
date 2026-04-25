# Product Vision — Kineo360 Workstation

> Status: **Captured, not yet started.** Phase begins after infra setup
> sprint is fully closed (backups + production smoke tests done).

## North Star

Eine zusammenhängende „Workstation"-Erfahrung für Therapeuten und
Praxis-Personal, in der **alle täglichen Arbeitstools** unter einem Dach
mit konsistentem Look & Feel laufen: Mail, Chat, Helpdesk, Files, CRM,
Calls, Termine. Ali soll sich nicht fühlen, als jongliere er sechs
verschiedene Open-Source-Apps — sondern als nutze er **ein Produkt**.

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

## Aktuelle Akzeptanz

In Phase 0 (jetzt) nutzt Ali jede App in ihrer Originalform direkt unter
`<service>.kineo360.work`. Das ist explizit OK weil:

- Single Operator, keine UI-Konsistenz nötig
- Alle Apps haben SSO → kein Mehrfach-Login-Schmerz
- Die UI-Investition lohnt erst wenn entweder
  (a) Ali nervt's täglich, oder
  (b) externe Nutzer (Mitarbeiter, Patient:innen) reinkommen
