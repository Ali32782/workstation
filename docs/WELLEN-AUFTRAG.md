# Wellen-Auftrag — Ausführung (Agent & Team)

> **Auftrag:** Diese Datei ist die operative Arbeitsliste für die
> Produkt-Wellen. Cursor-Agenten und Menschen behandeln sie als **aktiven
> Auftrag**: Arbeit in der hier festgelegten Reihenfolge und Priorität,
> nicht als lose Ideensammlung.
>
> **Leitplan:** Abhängigkeiten und Gates → [`PRODUCT-VISION.md`](./PRODUCT-VISION.md)
> Abschnitt „Produkt-Roadmap — Reihenfolge & Abhängigkeiten“.
>
> **Nach jedem Batch:** Deploy + **Smoke** → [`../scripts/smoke-test.sh`](../scripts/smoke-test.sh)
> (lokal/CI nach Bedarf); Portal vor Merge: `cd portal && npx tsc --noEmit`.

## Prinzipien

1. **Kein Wellenwechsel** ohne erledigtes Deploy+Smoke-Gate der letzten Lieferung.
2. **UTM & Attribution** (Welle 3) nicht „später“ — Schema früh, bevor Kanal-Tools skalieren.
3. **CRM-Stages** (Twenty) vor schwerem Kanban (Welle 4) abstimmen.
4. **Compliance** (Welle 7) darf **vor** der Nummer „7“ priorisiert werden, wenn Deals es erzwingen.

---

## Status-Legende

- [ ] offen  
- [~] teilweise / Basis im Repo  
- [x] erledigt / für aktuellen Scope ausreichend

---

## Aktiver Fokus (vereinbart)

Reihenfolge für die **nächsten Arbeitspakete** (Umsatz vor breitem Growth):

1. **eSign / Sales — MVP**  
   **Stand:** Documenso eingebunden; Vertriebsablauf in der Sign-UI; CRM ↔ Sign
   (`company:<uuid>` als Documenso `externalId`); **PDF-Archiv-Download** bei
   abgeschlossenen Dokumenten (`/api/sign/document/…/pdf?download=1`); **Office ↔ CRM**
   (`?crmCompany=` auf Office-Hub + Kachel im Company-Hub).
2. **Twenty Deal-Stages** — Playbook: `docs/playbooks/TWENTY-DEAL-STAGES-ALIGNMENT.md`  
   **Stand im Repo:** Defaults in `portal/src/lib/crm/opportunity-stages.ts`; Abstimmung der Enum-Werte mit Sales in Twenty bleibt Gate vor größerem Kanban (Welle 4).
3. **Growth:** Statische Lead-Landing **`/p/lead`** (Server Action → Twenty, ohne Bearer-Token auf der Seite); API **`POST /api/public/lead`** bleibt für Embeds.

Nach jedem abgeschlossenen Paket: **Deploy + Smoke** + `cd portal && npx tsc --noEmit`.

---

## Welle 2 — Office / Word / Verträge

> **Status Gesamt — Core-Sprint:** Die Lieferungen **Mail-Merge**, **Merge-Schema**,
> **Proposal (Presets + Cloud-Vorlage)** und **Excel-Conditional-Basis** gelten
> für den aktuellen Scope als **abgeschlossen** (`[x]` unten).
>
> **Weiteres Backlog:** Excel Charts/Pivot, **vollständiger** Sign-Lifecycle
> (über MVP hinaus), KI-Baukasten. **eSign-MVP** ist aktuell **fokussiert**
> (siehe Abschnitt *Aktiver Fokus*).

| Thema | Status | Hinweis / Code |
|--------|--------|----------------|
| Word Mail-Merge (CRM → DOCX/ZIP) | [x] | `/api/office/word-merge`, `lib/office/merge.ts` |
| Merge-Variablen kanonisch & dokumentiert | [x] | `CRM_MERGE_SCHEMA_VERSION`, `merge-tokens.ts` |
| Proposal-Generator (Word × CRM, geführt) | [x] | Hub-Dialog; `proposal-presets.ts`; `GET /api/office/cloud-template` |
| Excel Conditional Formatting (Portal/Sheet) | [x] | `lib/office/conditional.ts` — weitere Regeln = Backlog |
| Excel Charts / Pivot | [ ] | Backlog |
| eSignature E2E Sales (Entwurf → Sign → Archiv) | [~] | **MVP zuerst** (siehe *Aktiver Fokus*); Documenso: `/sign`, `lib/sign/documenso.ts`; E2E voll = Backlog |
| KI-Baukasten Proposal | [ ] | Backlog — bewusst später |

**Nächste Schritte:** zuerst *Aktiver Fokus* Punkt 1–2; Charts/Pivot und KI weiter hinten.

---

## Welle 3 — Marketing / Growth

> **Status Gesamt — Core:** **Attribution (UTM)** und **öffentlicher Lead-Capture**
> (API + CRM + Lead-Inbox-Quelle `web-form`) sind für Welle 3 **abgeschlossen**.
>
> **Growth-Backlog:** CMS, Landing-Builder, Automation-Kanäle etc. sind **nicht**
> Teil dieses Abschlusses (eigene Initiativen / spätere Wellen).

| Thema | Status | Hinweis |
|--------|--------|---------|
| UTM-Attribution pro Lead | [x] | `marketing-attribution.json`; `GET/POST /api/marketing/attribution`; Company-Hub-Karte |
| Embeddable Lead-Form | [x] | `POST /api/public/lead`; `lib/crm/public-lead.ts`; UTM → Attribution; Admin Lead-Inbox: Quelle „Web-Formular“ |
| Public Marketing-Site CMS (MedTheris) | [ ] | Growth-Backlog |
| Landing-Builder + A/B | [ ] | Growth-Backlog |
| Newsletter / Drip-Editor | [ ] | Growth-Backlog |
| SEO-Pipeline | [ ] | Growth-Backlog |
| LinkedIn-Scheduler | [ ] | Growth-Backlog |
| Statische Lead-Landing (`/p/lead`) | [x] | Server Action → `submitPublicLead`; Embeds weiterhin `POST /api/public/lead` |
| Webinar/Event-Anmeldung | [ ] | Growth-Backlog |

## Welle 4 — CRM / CS / Revenue

| Thema | Status | Hinweis |
|--------|--------|---------|
| Deal-Stages Kanban | [~] | `/{ws}/crm/pipeline` — Board über alle Deals; Firmen-Kanban unverändert unter Firma → Deals; Playbook Stages |
| Customer-Onboarding nach „Won“ | [ ] | — |
| Account-Health / Churn-Risk | [ ] | — |
| Renewal-Reminder + Auto-Mail | [ ] | — |
| Referral-Tracking | [ ] | — |
| Call-Transcription + Summary (Whisper) | [ ] | — |
| Inbox Smart-Triage | [~] | Mail-KI-Routen teils vorhanden — Scope festlegen |

---

## Welle 5 — Globale Suche

| Thema | Status | Hinweis |
|--------|--------|---------|
| Cmd+K global | [~] | **Sign/Dokumente** (Documenso-Titel); CRM-Deals mit `?company=&deal=` / Pipeline `?deal=`; Tickets, Files, Plane … |

---

## Welle 6 — Files / Content-Skalierung

| Thema | Status | Hinweis |
|--------|--------|---------|
| Asset-Library im Files-Modul | [ ] | — |
| Mehrsprachige Content-Varianten DE/EN | [ ] | — |

---

## Welle 7 — Security / Compliance / Files

| Thema | Status | Hinweis |
|--------|--------|---------|
| Rollen je Workspace | [ ] | — |
| 2FA-Enforcement + WebAuthn | [ ] | ggf. vor Welle 5/6 priorisieren |
| DSG Self-Service Export/Löschung | [ ] | — |
| PDF-Annotation in Files | [ ] | — |

---

## Kommunikation an den Agenten (Template)

Bei Fortsetzung in neuen Chats z. B.:

> „Arbeite nach `docs/WELLEN-AUFTRAG.md`: **Aktiver Fokus** zuerst, dann Welle X;
> Gate: `tsc` + sinnvoller Smoke. Kein Scope-Creep in andere Wellen.“

---

*Letzte Strukturierung: 2026-04-29 — Pipeline `/crm/pipeline`, `/p/lead`, Wellen 3–4 angepasst.*
