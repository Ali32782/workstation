# MedTheris Physio Prospecting Scraper

Findet Physiotherapie-Praxen in der ganzen Schweiz via Google Maps,
reichert sie mit Daten aus der eigenen Website an (Inhaber, Mitarbeiter,
Online-Booking-System, Spezialisierungen), und kippt sie als Leads in
die Twenty-CRM-Pipeline.

```
Discovery (Google Maps Places)
   └─► 130 PLZ × 4 Suchbegriffe = ~520 Suchen, ~3'000 unique Praxen erwartet
       │
       ▼
Enrichment (Playwright Headless Chrome)
   └─► HTML, Body-Text, Links, geharvestete E-Mails
       │
       ▼
Booking-System-Detection (regex + bekannte Provider)
   └─► onedoc / doctolib / samedi / calendly / custom / none
       │
       ▼
LLM-Extraction (Anthropic Claude)
   └─► Inhaber, Mitarbeiterzahl, Sprachen, Spezialisierungen
       │
       ▼
Twenty CRM Push
   └─► Company + Person + Opportunity (mit tenant=medtheris)
   └─► Dedup über SQLite (place_id), Skip wenn bereits in CRM
```

## Voraussetzungen

| Tool | Wofür |
|---|---|
| **Google Maps Places API Key** | Discovery (~$200 free monatliches Credit reicht für ~17'000 Place-Detail-Calls) |
| **Anthropic API Key** | LLM-Extraktion via Claude |
| **Twenty CRM API Key** | Lead-Push (Workspace-scoped Bearer Token, in Twenty Settings → Developers → API Keys generieren) |
| Python 3.11+ | Runtime |

### Wo bekomme ich die Keys?

**Google Maps:**
1. https://console.cloud.google.com → neues Projekt anlegen
2. APIs & Services → Library → "Places API" aktivieren (NICHT die "(New)" Variante, dieser Scraper nutzt die legacy API)
3. APIs & Services → Credentials → "+ Create Credentials" → "API Key"
4. Key restricten auf **Application: HTTP referrers** (oder besser **IP**) und **API: Places API**
5. Billing-Account verknüpfen (Pflicht für Places API, aber $200 free credit/Monat)

**Anthropic:**
1. https://console.anthropic.com → Settings → API Keys → "Create Key"

**Twenty:**
1. In Twenty einloggen unter https://crm.kineo360.work
2. Settings (Zahnrad) → Developers → API Keys → "+ Create API Key"
3. Name: "MedTheris Scraper", Expiration: nach Wahl
4. Token kopieren — wird nur einmal angezeigt

## Setup

```bash
cd medtheris-scraper
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# .env öffnen und Keys eintragen
```

## Twenty-Vorbereitung (einmalig)

Damit der Scraper alle Felder mappen kann, müssen folgende Custom-Fields auf
den Standard-Objekten in Twenty existieren:

In Twenty UI → **Settings → Data Model**:

| Object | Field-Name | Type | Notes |
|---|---|---|---|
| `Company` | `tenant` | Text | Default `corehub`, schreibt der Scraper auf `medtheris` |
| `Company` | `leadSource` | Text | Schreibt Scraper als `google-maps-scraper` |
| `Company` | `bookingSystem` | Text | onedoc / doctolib / samedi / calendly / custom / none |
| `Company` | `googleRating` | Number | Float |
| `Company` | `googleReviewCount` | Number | Integer |
| `Company` | `employeeCountPhysio` | Number | Integer |
| `Company` | `specializations` | Text | Komma-separierte Liste |
| `Company` | `languages` | Text | Komma-separierte Codes (de, fr, it) |
| `Person` | `tenant` | Text | wie oben |
| `Opportunity` | `tenant` | Text | wie oben |
| `Opportunity` | `source` | Text | `google-maps-scraper` |

Wenn ein Feld fehlt, schlägt die Twenty-Mutation mit
`Field 'xxx' not defined on CompanyCreateInput` fehl. Der Scraper loggt
das und macht trotzdem weiter mit der nächsten Praxis.

Empfohlen: 2 gespeicherte Views in Twenty anlegen
- **Companies → "MedTheris Pipeline"**: Filter `tenant = medtheris`
- **Companies → "Corehub Pipeline"**: Filter `tenant = corehub`

## Nutzung

```bash
# Test ohne CRM-Push, nur ein Kanton, max 5 Praxen
python main.py --canton ZH --dry-run --limit 5

# Echter Run, nur Zürich
python main.py --canton ZH

# Vollständige Schweiz (Achtung: dauert mehrere Stunden, ~10–20 USD Google-Maps-Kosten)
python main.py
```

Output:
- `output/leads-<kanton>.csv` — alle verarbeiteten Praxen mit allen Feldern
- `db/scraper.sqlite` — Dedup-Cache (re-runs überspringen verarbeitete place_ids)
- Twenty CRM — neue Companies / People / Opportunities (sofern nicht `--dry-run`)

## Module einzeln testen

```bash
# Booking-Detector
python -c "from scraper.booking_detector import detect_booking_system; \
  print(detect_booking_system(['https://onedoc.ch/p/foo'], 'Termin online buchen'))"

# Enricher (Playwright muss installiert sein)
python -c "import asyncio; from scraper.enricher import enrich_practice; \
  print(asyncio.run(enrich_practice('https://www.physio-zollikon.ch')))"

# Extractor (braucht ANTHROPIC_API_KEY)
python -c "from scraper.extractor import extract_structured_data; \
  print(extract_structured_data('Praxis mit 4 Therapeut:innen, Sport-Spezialisierung', 'Test'))"

# Twenty-Client (braucht TWENTY_API_KEY)
python -c "from crm.twenty_client import TwentyClient; import os; \
  c = TwentyClient(os.environ['TWENTY_API_URL'], os.environ['TWENTY_API_KEY']); \
  print(c.company_exists('Nicht existierende Praxis Test 12345'))"
```

## Aktueller Status

- ✅ Module-Skeleton (discovery, enricher, booking_detector, extractor, twenty_client, mapper, local_db, main)
- ✅ Vollständige PLZ-Liste für CH-weite Coverage (~130 Einträge)
- ✅ Dedup via SQLite, CSV-Output, Cache-aware re-runs
- ⚠️ **Noch nicht E2E getestet** — wartet auf Google Maps API Key
- ⚠️ Twenty Custom-Fields müssen einmalig in Twenty UI angelegt werden (siehe Tabelle oben)

## Limitierungen

- Google Maps Places liefert pro Suche max. 60 Treffer (3 Pages à 20). Daher wird auf PLZ-Ebene gesucht.
- Playwright timeout = 15s pro Site. Sites die JS-heavy sind (z.B. nur SPA mit Lazy-Loaded Content) werden teilweise nicht vollständig erfasst.
- E-Mail-Harvest aus HTML: regex-basiert, blocklist-gefiltert (kein "noreply@", "test@", "wixpress" etc.). Findet aber natürlich nur was die Praxis öffentlich auf der Website zeigt.
- Owner-Identifikation per LLM ist heuristisch — Claude rät die wahrscheinlichste Person aus dem Team-Text. Vor dem Lead-Outreach manuell verifizieren.
- Compliance: Scraper sammelt nur **öffentlich zugängliche** Daten von Geschäftswebsites. Kein DSGVO-Issue für B2B-Prospecting in CH/EU sofern nur Geschäftsadressen.

## Nicht enthalten (out of scope)

- Proxy-Rotation (falls Google IP-bantt)
- Cron-Scheduler (zZ. manuell ausführen)
- LinkedIn-Scraping für Mitarbeiterzahlen
- E-Mail-Verification (Bounce-Check)
- Automatische Outreach-Mails (das ist Twenty/Lemlist Job)
