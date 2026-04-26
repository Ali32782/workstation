"""
Seeds two realistic example projects into Plane so the team can explore the
tool with non-trivial structure.

  - Corehub workspace:   "Plattform v2 Migration"  (engineering project)
  - MedTheris workspace: "Praxis-Onboarding Q2"    (sales / onboarding pipeline)

Each project comes with:
  * 4-5 custom states (in addition to the default Plane states)
  * 4 modules (epic-level grouping)
  * 2 cycles (sprints / monthly windows)
  * 4-6 labels
  * 10+ realistic issues, distributed across modules + cycles + states

Idempotent: re-running just upserts. Safe to run multiple times.

Run on the production host:

  docker exec -i plane-api-1 python manage.py shell < /path/to/plane-seed-examples.py
"""

from datetime import datetime, timedelta, timezone

from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueAssignee,
    IssueLabel,
    Label,
    Module,
    ModuleIssue,
    Project,
    ProjectMember,
    State,
    Workspace,
    WorkspaceMember,
)
from django.contrib.auth import get_user_model

User = get_user_model()

# ─────────────────────────────────────────────────────────────────────────────
# helpers
# ─────────────────────────────────────────────────────────────────────────────


def _slug(s: str) -> str:
    return s.lower().replace(" ", "-").replace(".", "").replace("/", "-")


def get_or_create_state(project, name, color, group, sequence, default=False):
    obj, _ = State.objects.update_or_create(
        project=project,
        name=name,
        defaults=dict(
            color=color,
            group=group,
            sequence=sequence,
            slug=_slug(name),
            workspace=project.workspace,
            default=default,
        ),
    )
    return obj


def get_or_create_label(project, name, color):
    obj, _ = Label.objects.update_or_create(
        project=project,
        name=name,
        defaults=dict(color=color, workspace=project.workspace),
    )
    return obj


def get_or_create_module(project, name, description, lead, members):
    obj, _ = Module.objects.update_or_create(
        project=project,
        name=name,
        defaults=dict(
            description=description,
            workspace=project.workspace,
            lead=lead,
        ),
    )
    return obj


def get_or_create_cycle(project, name, start, end, owned_by):
    obj, _ = Cycle.objects.update_or_create(
        project=project,
        name=name,
        defaults=dict(
            start_date=start,
            end_date=end,
            workspace=project.workspace,
            owned_by=owned_by,
        ),
    )
    return obj


def upsert_issue(
    project,
    title,
    description,
    state,
    priority,
    owner,
    labels=None,
    modules=None,
    cycle=None,
    assignees=None,
    estimate_point=None,
):
    issue, created = Issue.objects.update_or_create(
        project=project,
        name=title,
        defaults=dict(
            description_html=f"<p>{description}</p>",
            description_stripped=description,
            state=state,
            priority=priority,
            workspace=project.workspace,
            created_by=owner,
        ),
    )
    if labels:
        IssueLabel.objects.filter(issue=issue).delete()
        for lab in labels:
            IssueLabel.objects.create(
                issue=issue,
                label=lab,
                project=project,
                workspace=project.workspace,
            )
    if modules:
        ModuleIssue.objects.filter(issue=issue).delete()
        for mod in modules:
            ModuleIssue.objects.create(
                issue=issue,
                module=mod,
                project=project,
                workspace=project.workspace,
            )
    if cycle:
        CycleIssue.objects.update_or_create(
            issue=issue,
            defaults=dict(
                cycle=cycle,
                project=project,
                workspace=project.workspace,
            ),
        )
    if assignees:
        IssueAssignee.objects.filter(issue=issue).delete()
        for u in assignees:
            IssueAssignee.objects.create(
                issue=issue,
                assignee=u,
                project=project,
                workspace=project.workspace,
            )
    return issue


def get_or_create_project(workspace, name, identifier, description, owner):
    project, created = Project.objects.update_or_create(
        workspace=workspace,
        identifier=identifier,
        defaults=dict(
            name=name,
            description=description,
            description_text={"type": "doc", "content": []},
            description_html=f"<p>{description}</p>",
            created_by=owner,
            module_view=True,
            cycle_view=True,
            issue_views_view=True,
        ),
    )
    ProjectMember.objects.update_or_create(
        project=project,
        member=owner,
        workspace=workspace,
        defaults=dict(role=20, is_active=True),
    )
    return project


# ─────────────────────────────────────────────────────────────────────────────
# Project 1: Corehub  ·  "Plattform v2 Migration"
# ─────────────────────────────────────────────────────────────────────────────


def seed_corehub():
    ws = Workspace.objects.get(slug="corehub")
    owner = User.objects.get(id=ws.owner_id)

    # Make sure owner is a workspace member with admin role
    WorkspaceMember.objects.update_or_create(
        workspace=ws,
        member=owner,
        defaults=dict(role=20, is_active=True),
    )

    project = get_or_create_project(
        workspace=ws,
        name="Plattform v2 Migration",
        identifier="V2MIG",
        description=(
            "Migration der Corehub-Plattform auf die v2 Architektur "
            "(Multi-Tenant, OIDC-überall, Twenty-Multi-Workspace)."
        ),
        owner=owner,
    )

    # States: Backlog → Diskussion → Bereit → In Arbeit → Review → Erledigt → Blockiert
    states = {
        "backlog": get_or_create_state(
            project, "Backlog", "#94a3b8", "backlog", 10000, default=True
        ),
        "discuss": get_or_create_state(
            project, "Diskussion", "#a78bfa", "unstarted", 12000
        ),
        "ready": get_or_create_state(
            project, "Bereit", "#3b82f6", "unstarted", 14000
        ),
        "in_progress": get_or_create_state(
            project, "In Arbeit", "#f59e0b", "started", 16000
        ),
        "review": get_or_create_state(
            project, "Review", "#06b6d4", "started", 18000
        ),
        "done": get_or_create_state(
            project, "Erledigt", "#10b981", "completed", 20000
        ),
        "blocked": get_or_create_state(
            project, "Blockiert", "#ef4444", "cancelled", 22000
        ),
    }

    # Labels
    labels = {
        "backend": get_or_create_label(project, "backend", "#1e4d8c"),
        "frontend": get_or_create_label(project, "frontend", "#7c3aed"),
        "infra": get_or_create_label(project, "infrastruktur", "#f59e0b"),
        "security": get_or_create_label(project, "security", "#ef4444"),
        "docs": get_or_create_label(project, "docs", "#94a3b8"),
        "ux": get_or_create_label(project, "ux", "#10b981"),
    }

    # Modules
    modules = {
        "auth": get_or_create_module(
            project,
            "Authentication v2",
            "Single-Realm Migration, OIDC für alle Apps, MFA-Erzwingung.",
            owner,
            [],
        ),
        "tenancy": get_or_create_module(
            project,
            "Multi-Tenancy",
            "Workspace-isolierte Datenpfade in Twenty, Plane, Zammad, Documenso.",
            owner,
            [],
        ),
        "platform": get_or_create_module(
            project,
            "Platform Hardening",
            "Backups, Monitoring, Brute-Force-Schutz, Rate-Limiting.",
            owner,
            [],
        ),
        "portal_ux": get_or_create_module(
            project,
            "Portal UI/UX",
            "Light/Dark-Mode, Responsive, Accessibility, Onboarding-Flow.",
            owner,
            [],
        ),
    }

    today = datetime.now(timezone.utc).date()
    cycles = {
        "sprint1": get_or_create_cycle(
            project,
            "Sprint 17 — Auth & Multi-Tenancy",
            today - timedelta(days=7),
            today + timedelta(days=7),
            owner,
        ),
        "sprint2": get_or_create_cycle(
            project,
            "Sprint 18 — Hardening",
            today + timedelta(days=8),
            today + timedelta(days=21),
            owner,
        ),
    }

    issues = [
        # Sprint 1 — auth + tenancy
        dict(
            title="Keycloak Single-Realm Migration finalisieren",
            description=(
                "Alle 4 Bestandsuser (ali, johannes, diana, richard) in den "
                "main-Realm migrieren, alte Realms disabled."
            ),
            state=states["done"],
            priority="high",
            modules=[modules["auth"]],
            labels=[labels["backend"], labels["security"]],
            cycle=cycles["sprint1"],
        ),
        dict(
            title="Documenso Team-URL Fallback (CSRF/404 fix)",
            description=(
                "API gibt team.url nicht mehr aus → Deep-Link nutzt "
                "tenant.teamUrl aus Env als Fallback."
            ),
            state=states["done"],
            priority="urgent",
            modules=[modules["tenancy"]],
            labels=[labels["frontend"], labels["backend"]],
            cycle=cycles["sprint1"],
        ),
        dict(
            title="Twenty CRM: Medtheris-Daten aus Kineo-Workspace recovern",
            description=(
                "22 Custom Fields mirroren, Companies/Persons/Opportunities "
                "aus scraper.sqlite re-importieren, Scraper-Token korrigieren."
            ),
            state=states["done"],
            priority="urgent",
            modules=[modules["tenancy"]],
            labels=[labels["backend"]],
            cycle=cycles["sprint1"],
        ),
        dict(
            title="Nextcloud TokenPasswordExpiredException dauerhaft fixen",
            description=(
                "remember_login_cookie_lifetime=0, oc_authtoken purge, "
                "Doku unter SECURITY-DEBT.md."
            ),
            state=states["done"],
            priority="high",
            modules=[modules["platform"]],
            labels=[labels["security"], labels["infra"]],
            cycle=cycles["sprint1"],
        ),
        dict(
            title="Light/Dark Mode im Portal",
            description=(
                "ThemeToggle-Component, [data-theme=light] Override-Block, "
                "FOUC-Init-Script in <head>."
            ),
            state=states["done"],
            priority="medium",
            modules=[modules["portal_ux"]],
            labels=[labels["frontend"], labels["ux"]],
            cycle=cycles["sprint1"],
        ),
        dict(
            title="Kineo-Pille auf Login-Screen entfernen",
            description="Workspace-Pill + inline-Mention raus aus login/page.tsx.",
            state=states["done"],
            priority="low",
            modules=[modules["portal_ux"]],
            labels=[labels["frontend"]],
            cycle=cycles["sprint1"],
        ),
        # Sprint 2 — hardening
        dict(
            title="Fail2ban auf Host gegen SSH-Brute-Force",
            description=(
                "Jail für sshd + npm-login. Whitelist für Hetzner-IPv4, "
                "Slack-Webhook für Bans."
            ),
            state=states["ready"],
            priority="high",
            modules=[modules["platform"]],
            labels=[labels["security"], labels["infra"]],
            cycle=cycles["sprint2"],
        ),
        dict(
            title="Backup-Verschlüsselung mit restic + Hetzner Object Storage",
            description=(
                "Tägliche encrypted backups (postgres, mariadb, mongo, files). "
                "Wiederherstellungstest in Staging."
            ),
            state=states["ready"],
            priority="high",
            modules=[modules["platform"]],
            labels=[labels["infra"], labels["security"]],
            cycle=cycles["sprint2"],
        ),
        dict(
            title="CrowdSec für HTTP-Layer-Threats vor NPM",
            description="Bouncer-Container, scenarios pack, Slack/Webhook bei Bans.",
            state=states["backlog"],
            priority="medium",
            modules=[modules["platform"]],
            labels=[labels["security"], labels["infra"]],
            cycle=cycles["sprint2"],
        ),
        dict(
            title="Audit-Log in Keycloak aktivieren (14d storage)",
            description="Events → Login Events storage, Admin Events storage.",
            state=states["ready"],
            priority="medium",
            modules=[modules["auth"]],
            labels=[labels["security"], labels["docs"]],
            cycle=cycles["sprint2"],
        ),
        dict(
            title="Twenty CRM SSO via Keycloak (deferred bis OIDC stabil)",
            description=(
                "Pending bis Twenty Self-Hosted OIDC ohne Multi-Workspace-Zwang "
                "ausliefert ODER Enterprise-Lizenz."
            ),
            state=states["blocked"],
            priority="medium",
            modules=[modules["auth"]],
            labels=[labels["backend"]],
        ),
        dict(
            title="Plane SSO via Keycloak (deferred bis Plane Pro)",
            description=(
                "Plane Community hat kein OIDC. Optionen: Plane Pro lizensieren "
                "(~8 USD/User/Monat) oder bitbay/plane-oidc Fork."
            ),
            state=states["blocked"],
            priority="low",
            modules=[modules["auth"]],
            labels=[labels["backend"]],
        ),
        dict(
            title="Mobile-Layout für Portal (Sidebar, TopBar, Sign, CRM)",
            description=(
                "Sidebar als Drawer auf <md, TopBar reduzierter Workspace-Switcher, "
                "Touch-Targets ≥44px."
            ),
            state=states["in_progress"],
            priority="medium",
            modules=[modules["portal_ux"]],
            labels=[labels["frontend"], labels["ux"]],
            cycle=cycles["sprint2"],
        ),
    ]

    for spec in issues:
        upsert_issue(
            project=project,
            title=spec["title"],
            description=spec["description"],
            state=spec["state"],
            priority=spec["priority"],
            owner=owner,
            labels=spec.get("labels"),
            modules=spec.get("modules"),
            cycle=spec.get("cycle"),
            assignees=[owner],
        )

    print(f"corehub: project '{project.name}' seeded with {len(issues)} issues.")


# ─────────────────────────────────────────────────────────────────────────────
# Project 2: MedTheris  ·  "Praxis-Onboarding Q2"
# ─────────────────────────────────────────────────────────────────────────────


def seed_medtheris():
    ws = Workspace.objects.get(slug="medtheris")
    owner = User.objects.get(id=ws.owner_id)

    WorkspaceMember.objects.update_or_create(
        workspace=ws,
        member=owner,
        defaults=dict(role=20, is_active=True),
    )

    project = get_or_create_project(
        workspace=ws,
        name="Praxis-Onboarding Q2",
        identifier="POBQ2",
        description=(
            "Sales-Pipeline und Onboarding-Tracking für Physio-/Therapie-"
            "Praxen die im Q2 auf MedTheris migriert werden."
        ),
        owner=owner,
    )

    states = {
        "lead": get_or_create_state(
            project, "Neuer Lead", "#94a3b8", "backlog", 10000, default=True
        ),
        "qualified": get_or_create_state(
            project, "Qualifiziert", "#3b82f6", "unstarted", 12000
        ),
        "demo": get_or_create_state(
            project, "Demo terminiert", "#a78bfa", "unstarted", 14000
        ),
        "negotiation": get_or_create_state(
            project, "Verhandlung", "#f59e0b", "started", 16000
        ),
        "setup": get_or_create_state(
            project, "Setup läuft", "#06b6d4", "started", 18000
        ),
        "live": get_or_create_state(
            project, "Live", "#10b981", "completed", 20000
        ),
        "lost": get_or_create_state(
            project, "Verloren", "#ef4444", "cancelled", 22000
        ),
    }

    labels = {
        "physio": get_or_create_label(project, "physiotherapie", "#10b981"),
        "osteo": get_or_create_label(project, "osteopathie", "#7c3aed"),
        "ergo": get_or_create_label(project, "ergotherapie", "#3b82f6"),
        "wix": get_or_create_label(project, "site-wix", "#f59e0b"),
        "wp": get_or_create_label(project, "site-wordpress", "#1e4d8c"),
        "onedoc": get_or_create_label(project, "booking-onedoc", "#06b6d4"),
        "calenso": get_or_create_label(project, "booking-calenso", "#a78bfa"),
        "no_booking": get_or_create_label(project, "booking-keins", "#94a3b8"),
        "high_value": get_or_create_label(project, "high-value", "#ef4444"),
    }

    modules = {
        "discovery": get_or_create_module(
            project,
            "Discovery & Outreach",
            "Scraper-Output, Cold-Mail, LinkedIn-Touch, erste Antwort.",
            owner,
            [],
        ),
        "qualification": get_or_create_module(
            project,
            "Qualification & Demo",
            "Inbound-Call, Demo-Termin, Bedarfsanalyse, Angebot.",
            owner,
            [],
        ),
        "setup": get_or_create_module(
            project,
            "Technisches Setup",
            "Mailbox, Workspace-Provisioning, Datenmigration, Custom-Branding.",
            owner,
            [],
        ),
        "training": get_or_create_module(
            project,
            "Training & Go-Live",
            "Schulungstermine, Live-Schaltung, Hypercare-Phase erste 30 Tage.",
            owner,
            [],
        ),
    }

    today = datetime.now(timezone.utc).date()
    cycles = {
        "april": get_or_create_cycle(
            project,
            "April 2026 — Erste Welle",
            today.replace(day=1),
            (today.replace(day=1) + timedelta(days=32)).replace(day=1)
            - timedelta(days=1),
            owner,
        ),
        "may": get_or_create_cycle(
            project,
            "Mai 2026 — Zweite Welle",
            (today.replace(day=1) + timedelta(days=32)).replace(day=1),
            (today.replace(day=1) + timedelta(days=63)).replace(day=1)
            - timedelta(days=1),
            owner,
        ),
    }

    issues = [
        dict(
            title="Physio Studer · Zürich · OneDoc · Erstkontakt",
            description=(
                "Owner: Dr. M. Studer. Praxis nutzt OneDoc-Booking, hat 3 "
                "Therapeuten. Pain Point: Doppel-Buchungen + manuelles "
                "Patienten-Onboarding. ~CHF 1.2M Jahresumsatz geschätzt."
            ),
            state=states["qualified"],
            priority="high",
            modules=[modules["discovery"]],
            labels=[labels["physio"], labels["onedoc"], labels["high_value"]],
            cycle=cycles["april"],
        ),
        dict(
            title="Osteopraxis Lehmann · Bern · Wix · Demo geplant 30.04.",
            description=(
                "1 Owner + 1 Therapeut, alte Wix-Site ohne Booking. "
                "Will moderne Patientenkommunikation. Demo am 30.04. 14:00 "
                "via Zoom. Decision-Maker direkt am Demo dabei."
            ),
            state=states["demo"],
            priority="high",
            modules=[modules["qualification"]],
            labels=[labels["osteo"], labels["wix"]],
            cycle=cycles["april"],
        ),
        dict(
            title="Ergotherapie Müller · Basel · Calenso · Verhandlung Preismodell",
            description=(
                "5 Therapeuten, sehr digital. Hat schon Calenso-Booking, will "
                "Calendar-Sync + Patientenakte + Krankenkassen-Abrechnung. "
                "Preisrahmen: CHF 99/Monat/User akzeptabel, will aber "
                "Onboarding-Pauschale verhandeln."
            ),
            state=states["negotiation"],
            priority="urgent",
            modules=[modules["qualification"]],
            labels=[labels["ergo"], labels["calenso"], labels["high_value"]],
            cycle=cycles["april"],
        ),
        dict(
            title="Praxis Birkhof · Lausanne · WordPress · Mailbox provisioniert",
            description=(
                "2 Therapeuten, neue Praxis seit Q1/2026. Mailbox + "
                "Workspace angelegt, Datenmigration aus alter Excel-Liste "
                "im Gang. Training Mitte Mai."
            ),
            state=states["setup"],
            priority="medium",
            modules=[modules["setup"]],
            labels=[labels["physio"], labels["wp"]],
            cycle=cycles["april"],
        ),
        dict(
            title="Movetherapy Lozzi · Genf · keine Site · Live seit 14.04.",
            description=(
                "1-Personen-Praxis. Komplett neu aufgesetzt: Mailbox, "
                "Subdomain auf medtheris.ch, Patientenkalender, Online-"
                "Booking via OneDoc-Integration. Hypercare-Phase läuft "
                "bis 14.05."
            ),
            state=states["live"],
            priority="medium",
            modules=[modules["training"]],
            labels=[labels["physio"], labels["onedoc"]],
            cycle=cycles["april"],
        ),
        dict(
            title="Praxis Aesch · Aesch BL · Squarespace · Lead aus Scraper",
            description=(
                "Aus Scraper-Run vom 24.04. — 4-Therapeuten-Team, kein "
                "Online-Booking. Owner-LinkedIn gefunden. "
                "TODO: Cold-Mail mit personalisiertem Booking-Demo-Link."
            ),
            state=states["lead"],
            priority="medium",
            modules=[modules["discovery"]],
            labels=[labels["physio"], labels["no_booking"]],
            cycle=cycles["april"],
        ),
        dict(
            title="Schmerzklinik Winterthur · WordPress · Lead-Antwort negativ",
            description=(
                "Cold-Mail beantwortet: \"Setzen aktuell schon Doctolib ein, "
                "kein Bedarf\". Verloren — aber im April-Lookback "
                "drüberschauen, falls Doctolib-Probleme auftauchen."
            ),
            state=states["lost"],
            priority="low",
            modules=[modules["discovery"]],
            labels=[labels["physio"], labels["wp"]],
        ),
        dict(
            title="Manuelle-Therapie Zentrum · Luzern · Wix · Demo geplant 06.05.",
            description=(
                "8 Therapeuten, sehr trad. Praxis. Pain Point: Telefon-"
                "Anrufe für Termine. Demo Mai 06., wir bringen Booking-"
                "Showcase mit OneDoc-Vergleich."
            ),
            state=states["demo"],
            priority="high",
            modules=[modules["qualification"]],
            labels=[labels["physio"], labels["wix"], labels["high_value"]],
            cycle=cycles["may"],
        ),
        dict(
            title="Kinder-Ergotherapie Burkhart · St. Gallen · Setup",
            description=(
                "Spezialisiert auf Kinder-Ergo. 3 Therapeutinnen. Bekommt "
                "ein Custom-Logo + medtheris-Subdomain. Datenmigration "
                "aus Apple-Numbers ist non-trivial — TODO Mapping-Script."
            ),
            state=states["setup"],
            priority="medium",
            modules=[modules["setup"]],
            labels=[labels["ergo"]],
            cycle=cycles["may"],
        ),
        dict(
            title="MedFit · Chur · WordPress · Krankenkassen-Compliance prüfen",
            description=(
                "Spezielle Anforderung: Praxis arbeitet mit allen "
                "Schweizer Krankenkassen, braucht TARMED-konformes "
                "Rechnungs-Export. Klärung Compliance vor Setup-Start."
            ),
            state=states["qualified"],
            priority="urgent",
            modules=[modules["qualification"]],
            labels=[labels["physio"], labels["wp"], labels["high_value"]],
            cycle=cycles["may"],
        ),
        dict(
            title="Sales-Playbook v2 dokumentieren",
            description=(
                "Sales-Wiki: Discovery-Calls, Demo-Skripts (kurz/lang), "
                "Pricing-Matrix, Common Objections. Outcomes des Q1-"
                "Lookbacks reinkippen."
            ),
            state=states["qualified"],
            priority="medium",
            modules=[modules["discovery"]],
            labels=[],
            cycle=cycles["may"],
        ),
        dict(
            title="Hypercare-Checkliste für die ersten 30 Tage",
            description=(
                "Standard-30-Tage-Plan nach Go-Live: Day-1 Check, Week-1 "
                "Office Hours, Day-14 Pulse, Day-30 NPS + Renewal-Vorgespräch."
            ),
            state=states["lead"],
            priority="medium",
            modules=[modules["training"]],
            labels=[],
            cycle=cycles["may"],
        ),
    ]

    for spec in issues:
        upsert_issue(
            project=project,
            title=spec["title"],
            description=spec["description"],
            state=spec["state"],
            priority=spec["priority"],
            owner=owner,
            labels=spec.get("labels"),
            modules=spec.get("modules"),
            cycle=spec.get("cycle"),
            assignees=[owner],
        )

    print(f"medtheris: project '{project.name}' seeded with {len(issues)} issues.")


# ─────────────────────────────────────────────────────────────────────────────
# main
# ─────────────────────────────────────────────────────────────────────────────


seed_corehub()
seed_medtheris()
print("All done.")
