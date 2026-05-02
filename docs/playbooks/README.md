# Internal Wiki / Knowledge-Base

Dieses Verzeichnis ist die Single-Source-of-Truth für interne Abläufe,
Playbooks und Wissens-Snippets bei Kineo / MedTheris. Inhalt ist als
Markdown abgelegt, damit es sowohl im Files-Modul des Portals
durchsuchbar ist als auch von Devs lokal mit `grep`/`rg` durchforstet
werden kann.

## Aktive Playbooks

- [`TWENTY-DEAL-STAGES-ALIGNMENT.md`](./TWENTY-DEAL-STAGES-ALIGNMENT.md) —
  Deal-Stages in Twenty mit Sales abstimmen (Gate vor Welle 4 Kanban).
- [`escalation-matrix.md`](./escalation-matrix.md) *(Entwurf)* —
  Wer kümmert sich um welche Art von Vorfall? Auth-Probleme → Ali,
  Mautic/CRM-Drift → Johannes, Infra/Compose → Anika.
- [`triage-loop.md`](./triage-loop.md) *(Entwurf)* — Der tägliche
  Scrape→CRM→Final-Check→Funnel-Push-Loop, Schritt für Schritt.

## Konventionen

- **Sprache**: Playbooks → deutsch (Operator-Realität). Tech-/API-
  Doku → englisch. Mischen ist okay, wenn die Zielgruppe gemischt ist.
- **Frontmatter**: Optional. Wenn vorhanden, mindestens `owner` +
  `last_review` damit wir Wissens-Stale-Drift erkennen.
- **Bilder**: In `./assets/` ablegen, Datei-Namen sprechend
  (`mautic-segment-picker.png`, nicht `Bildschirmfoto-2026-04-28.png`).
- **Tote Links**: Pre-commit-Hook check (kommt in Welle 7) jagt 404er
  via `lychee` aus PR-Diffs. Bis dahin manuell prüfen.

## Was hier *nicht* hingehört

- Kunden-spezifische Daten (geht ins CRM).
- Geheimnisse / Tokens / Passwörter (geht in den Vault, nicht ins
  Repo).
- Patient:innen-Daten (gehört in die Klinikmanagement-Software, **nie**
  ins Marketing-/Sales-Stack).

## Wiki-Editor (geplant Welle 6)

Das Files-Modul des Portals rendert `.md` bereits inline. Der
nächste Schritt ist ein „Edit"-Button im Reader (TipTap →
markdown-roundtrip), so dass das Team Playbooks direkt im Browser
fortschreibt — ohne lokales Repo-Setup.
