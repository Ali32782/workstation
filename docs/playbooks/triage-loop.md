---
owner: sales-ops
last_review: 2026-05-01
status: active
---

# Triage-Loop: Scrape → CRM → Review

> Tägliche / wöchentliche Routine nach jedem Scraper-Lauf oder Lead-Import. Ziel: keine Daten-Drift zwischen Twenty CRM und Portal, jeder Lead landet in einem definierten Zustand.

## Ziel

Nach jedem Scraper-Lauf (Cron, manueller Run via Admin-Panel, oder Lead-Import) eine klare nächste Aktion pro Lead — ohne dass Daten zwischen Twenty und Portal abdriften.

## Cadence

| Intervall | Aktion | Wer |
|---|---|---|
| Täglich (Mo-Fr, 09:00) | Scraper-Output sichten, neue Leads triagen | Sales-Ops |
| Wöchentlich (Mo, 10:00) | Lead-Inbox auf 0 bringen, Stages bereinigen | Sales-Ops + Operator |
| Monatlich (1. des Monats) | Daten-Quality-Check (fehlende Felder, alte Stages) | Operator |

## Vor dem Triagen — Health-Check (30 s)

```bash
# Vom Laptop aus
bash scripts/smoke-stacks.sh           # alle Container + Twenty erreichbar?
bash scripts/backup-verify.sh          # gestriges Backup vorhanden?
```

Wenn rot → erst Stack reparieren, dann triage. Triage in einen kaputten CRM zu schieben verschlimmert die Lage.

## Schritt-für-Schritt

### 1. Scraper-Output prüfen

- **UI**: `https://app.kineo360.work/admin/onboarding/scraper` (Admin-Allowlist `PORTAL_ADMIN_USERNAMES`)
- **Status-Pill** in der TopBar zeigt letzten Run-Zustand (idle / running / failed)
- **Logs auf dem Host**:
  ```bash
  ssh medtheris-corelab 'docker logs --tail 200 medtheris-scraper'
  ```
- Bei Fehlern: typische Ursachen
  - `LIMIT_REACHED` von Twenty → Rate-Limit-Throttle greift, weiter warten (1-2 Min) und Run wiederholen
  - `Anthropic 429` → Website-Discovery rate-limited, betroffene Leads werden NICHT als „attempted" markiert (siehe `medtheris-scraper/scraper/website_finder.py`)
  - `unique_violation domainName` → mehrere Filialen einer Kette teilen sich einen Hostname; `crm/twenty_client.py` dropped das Feld automatisch

### 2. Cache → CRM-Sync

Der Scraper schreibt in seinem SQLite-Cache (`medtheris-scraper/db/local_db.py`) und pusht dann in Twenty. Wenn der Push fehlschlägt:

```bash
# Nochmal den Cache pushen, ohne neu zu scrapen
ssh medtheris-corelab 'docker exec medtheris-scraper python -m main --push-cache'
```

Danach im Admin-Panel den Counter „neue Leads in Twenty" prüfen (sollte hochlaufen).

### 3. Lead-Inbox triagen

Im Portal: `https://app.kineo360.work/medtheris/crm` → Tab **„Lead-Inbox"**.

Pro Eintrag eine Entscheidung:

| Aktion | Wann | Stage in Twenty |
|---|---|---|
| ✅ Approve | Plausible Praxis, Daten vollständig genug | `Recherchiert` |
| 🔄 Need-Info | Fehlende Felder (Telefon, Software, Therapeut-Anzahl) | bleibt in `Neu` |
| ❌ Reject | Aggregator, Doppelter Eintrag, falsche Branche | `Disqualifiziert` |
| 🚫 Stop-List | Kunde hat aktiv „nein" gesagt → nie wieder ansprechen | `Stop-List` |

Stage-Definitionen liegen in `portal/src/lib/crm/opportunity-stages.ts` und werden auch von Twenty-Filtern referenziert.

### 4. Need-Info-Backfill

Wenn ein Lead in „Need-Info" hängt:

1. Website-Lookup nochmal anstoßen (LLM web search):
   ```bash
   ssh medtheris-corelab 'docker exec medtheris-scraper python -m main --retry-no-website'
   ```
2. Manuell die Praxis-Site besuchen, Telefon + Therapeuten-Anzahl in Twenty nachtragen
3. Bei Software (Vivasoft, Inputmed, ThePrax …): Branchen-Wissen oder Email-Footer-Inspection

### 5. Marketing-Sync (nach Freigabe)

Nur Leads in `Recherchiert` oder höher kommen in Mautic-Segmente. Sync-Pipeline siehe [`docs/marketing-pipeline.md`](../marketing-pipeline.md). Aktuell manuell — automatischer Sync ist Backlog.

### 6. Abschluss

Pro Triage-Sitzung im Twenty-Workspace eine Notiz an die "Lead-Inbox-Sammelkarte":

```
Triage 2026-05-01 — 47 Leads gesichtet
  approved: 12  → Sales-Outreach
  need-info: 18 → backfill cycle
  rejected: 17  → siehe Reject-Reasons
```

Damit ist der Triage-Loop für den Tag abgeschlossen.

## Referenzen

- [`docs/scraper-runner.md`](../scraper-runner.md) — Scraper-Runner-Architektur
- [`docs/twenty-medtheris-schema.md`](../twenty-medtheris-schema.md) — Welche Custom-Fields existieren in Twenty
- [`portal/src/lib/crm/opportunity-stages.ts`](../../portal/src/lib/crm/opportunity-stages.ts) — Quelle der Stage-Liste
- [`docs/marketing-pipeline.md`](../marketing-pipeline.md) — Sync zu Mautic
- [`TWENTY-DEAL-STAGES-ALIGNMENT.md`](./TWENTY-DEAL-STAGES-ALIGNMENT.md) — Sales/Marketing-Alignment

## Bekannte Lücken

- **Auto-Sync zu Mautic** ist Backlog (Welle 3); aktuell manuell
- **Triage-Audit-Log** (wer hat wann was approved/rejected) noch nicht implementiert
- **Bulk-Triage-Aktionen** (mehrere Leads auf einmal rejecten) im Portal noch nicht verfügbar — workaround: direkt in Twenty
