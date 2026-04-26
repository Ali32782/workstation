# MedTheris Physio Prospecting Scraper

Findet Physiotherapie-Praxen in der ganzen Schweiz via Google Maps,
reichert sie mit Daten aus der eigenen Website an (Inhaber, Mitarbeiter,
Online-Booking-System, Spezialisierungen), und kippt sie als Leads in
die Twenty-CRM-Pipeline.

```
Discovery (Google Maps Places)
   └─► 130 PLZ × 4 Suchbegriffe = ~520 Suchen, ~3'000 unique Praxen erwartet
   └─► Detail-Call liefert: opening_hours, geo_lat/lng, plus_code,
       wheelchair_accessible, google_maps_url, intl_phone
       │
       ▼
Enrichment (Playwright Headless Chrome)
   └─► HTML, Body-Text, <a href> Links, <iframe src>, <script src>,
       <form action>, <meta name="generator">, gefundene E-Mails,
       gefundene tel: Links, gefundene Social-URLs (LinkedIn/IG/FB/...)
       │
       ▼
Booking-Detection (Multi-Source: iframe ▸ script ▸ form ▸ link ▸ html)
   └─► provider (onedoc/doctolib/samedi/medicosearch/calenso/agnes/eterminal/
                 doctolib/samedi/terminland/clinicmaster/theramed/tomedo/
                 elaine/cal.com/calendly/microsoft_bookings/wp_amelia/...)
   └─► confidence  (high | medium | low | none)
   └─► evidence    ('iframe-match=onedoc.ch', 'script-match=cal.com', ...)
       │
       ▼
Website-Platform-Detection (CMS / Page-Builder)
   └─► wix / squarespace / wordpress / jimdo / webflow / shopify / godaddy /
       weebly / drupal / typo3 / ghost / custom
       │
       ▼
LLM-Extraction (Claude Sonnet 4.5)
   └─► Inhaber + LinkedIn-URL, Owner-Title, Lead-Therapist, Team-Roster
       (mit Per-Person-LinkedIn), Mitarbeiterzahl, Sprachen, Spezialisierungen,
       training_offered, insurance_accepted, year_founded, locations,
       opening_hours_summary, accepts_emergency_appointments, social_handles
       │
       ▼
Optional: Web-Search für Owner-LinkedIn (ENABLE_SOCIAL_LOOKUP=1)
   └─► Wenn die Website kein LinkedIn-Profil verlinkt, sucht Claude
       (built-in web_search Tool) nach "<owner> <praxis> <stadt> linkedin".
       Defaults to OFF, da +$0.03/Praxis Anthropic-Cost.
       │
       ▼
Twenty CRM Push
   └─► Company (~30 Custom-Fields) + Persons (Owner, Lead-Therapist, Team)
   └─► Opportunity (Stage=NEW, Source=google-maps-scraper, tenant=medtheris)
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
2. Workspace-Selector oben links auf **MedTheris** stellen — der API-Key
   wird auf den aktuell aktiven Workspace ausgestellt, und ein Key aus
   einem anderen Workspace kippt die Leads in den falschen Tenant
   (z.B. nach Kineo360 statt MedTheris).
3. Settings (Zahnrad) → Developers → API Keys → "+ Create API Key"
4. Name: "MedTheris Scraper", Expiration: nach Wahl
5. Token kopieren — wird nur einmal angezeigt
6. Auf der Prod-Box ist der gleiche Token als
   `TWENTY_WORKSPACE_MEDTHERIS_TOKEN` in `/opt/corelab/.env` hinterlegt
   und kann von dort wiederverwendet werden.

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
den Standard-Objekten in Twenty existieren. Die Liste ist mit der v2-Enrichment
deutlich gewachsen — fehlende Felder werden vom Scraper protokolliert; die
Mutation bricht aber komplett ab, wenn Twenty einen unbekannten Feldnamen sieht.

In Twenty UI → **Settings → Data Model**:

**Company (Identity / Pipeline)**

| Field | Type | Notes |
|---|---|---|
| `tenant` | Text | Schreibt Scraper auf `medtheris` |
| `leadSource` | Text | Konstant `google-maps-scraper` |

**Company (Booking-Integration — der Hauptgrund weshalb wir Sales-Pitch machen)**

| Field | Type | Werte |
|---|---|---|
| `bookingSystem` | Text | onedoc, medicosearch, calenso, doctolib, samedi, terminland, clinicmaster, theramed, tomedo, elaine, calcom, calendly, microsoft_bookings, wp_amelia, wix_bookings, custom, none, ... |
| `bookingConfidence` | Text | high / medium / low / none |
| `bookingEvidence` | Text | z.B. `iframe-match=onedoc.ch` |
| `onlineBookingUrl` | Link/Text | Direkt-Link zum Widget |

**Company (Website / Tech-Stack)**

| Field | Type | Werte |
|---|---|---|
| `websitePlatform` | Text | wix, wordpress, squarespace, jimdo, webflow, shopify, godaddy, weebly, drupal, joomla, ghost, typo3, custom |
| `websitePlatformEvidence` | Text | z.B. `meta-generator=wix.com` |

**Company (Google-Places-Anreicherung)**

| Field | Type | |
|---|---|---|
| `googleRating` | Number (Float) | |
| `googleReviewCount` | Number (Integer) | |
| `openingHours` | Text | z.B. `Mo: 07:00–19:00; Di: ...` |
| `googleMapsUrl` | Link/Text | |
| `wheelchairAccessible` | Boolean | |
| `geoLat` | Number | |
| `geoLng` | Number | |
| `plusCode` | Text | |

**Company (LLM-Profil)**

| Field | Type | |
|---|---|---|
| `employeeCountPhysio` | Number | |
| `specializations` | Text | Komma-separiert |
| `languages` | Text | Komma-separierte ISO-Codes |
| `trainingOffered` | Text | Pilates, Yoga, MTT, ... |
| `insuranceAccepted` | Text | krankenkassen-anerkannt / nur-zusatzversicherung / selbstzahler |
| `yearFounded` | Number | |
| `practiceLocations` | Number | |
| `acceptsEmergency` | Boolean | |
| `practiceSize` | Text | klein / mittel / gross |
| `generalEmail` | Text | |

**Company (Owner / Leadership)**

| Field | Type | |
|---|---|---|
| `ownerName` | Text | |
| `ownerEmail` | Text | |
| `ownerSource` | Text | impressum / team / about / kontakt |
| `ownerTitle` | Text | z.B. `MSc Physiotherapie` |
| `ownerLinkedin` | Link/Text | nur gefüllt wenn Website oder web_search es liefert |
| `leadTherapistName` | Text | |
| `leadTherapistEmail` | Text | |

**Company (Social Channels)**

| Field | Type | |
|---|---|---|
| `practiceLinkedin` | Link/Text | |
| `practiceInstagram` | Link/Text | |
| `practiceFacebook` | Link/Text | |
| `practiceYoutube` | Link/Text | |
| `practiceX` | Link/Text | |
| `practiceTiktok` | Link/Text | |
| `practiceXing` | Link/Text | |

**Company (Team-Roster)**

| Field | Type | |
|---|---|---|
| `teamMembersJson` | Text (long) | Volle Team-Liste als JSON-String |

**Person**

| Field | Type | |
|---|---|---|
| `tenant` | Text | |
| `roleCustom` | Text | owner / owner_and_lead_therapist / lead_therapist / therapist / contact |
| `practiceRole` | Text | Original-Rolle der Website (`Physiotherapeutin SRK`) |
| `guessedEmail` | Text | `guess:<address>` wenn Email aus Pattern abgeleitet |
| `linkedinUrl` | Link/Text | |
| `personTitle` | Text | |

**Opportunity**

| Field | Type | |
|---|---|---|
| `tenant` | Text | |
| `source` | Text | `google-maps-scraper` |

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
# Booking-Detector (neue Multi-Source-API)
python -c "from scraper.booking_detector import detect_booking_system; \
  print(detect_booking_system(iframes=['https://onedoc.ch/p/foo'], html='Termin online buchen'))"

# Website-Platform-Detector
python -c "from scraper.booking_detector import detect_website_platform; \
  print(detect_website_platform(scripts=['https://static.parastorage.com/foo.js']))"

# Enricher (Playwright muss installiert sein)
python -c "import asyncio; from scraper.enricher import enrich_practice; \
  r = asyncio.run(enrich_practice('https://www.physio-zollikon.ch')); \
  print({k: r.get(k) for k in ('socials','iframes','meta_generators','pages_scraped')})"

# Extractor (braucht ANTHROPIC_API_KEY)
python -c "from scraper.extractor import extract_structured_data; \
  print(extract_structured_data('Praxis mit 4 Therapeut:innen, Sport-Spezialisierung', 'Test'))"

# Social-Finder mit web_search (braucht ENABLE_SOCIAL_LOOKUP=1 + ANTHROPIC_API_KEY)
python -c "import os; os.environ['ENABLE_SOCIAL_LOOKUP']='1'; \
  from scraper.social_finder import find_owner_linkedin; \
  print(find_owner_linkedin({'owner_name':'Anna Müller', 'name':'Physio Zollikon', \
                              'city':'Zollikon', 'canton':'ZH', 'website':'https://physio-zollikon.ch'}))"

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

## Owner-LinkedIn finden (Path 1 + Path 2)

Der Scraper geht in zwei Stufen vor:

1. **Path 1 (kostenlos, immer aktiv).** Der Enricher harvestet alle
   `<a href>`-Links der Homepage + Subpages und klassifiziert ihren Host.
   LinkedIn / Instagram / Facebook / YouTube / X / TikTok / Xing / Threads
   werden als Social-URLs übernommen. Falls die Praxis selbst eine
   `linkedin.com/in/...`-URL verlinkt (typisch im Footer oder auf der
   Team-Seite), wird sie automatisch als `owner_linkedin` zugewiesen.
2. **Path 2 (opt-in, $-Cost).** Wenn Path 1 leer ist UND der Inhaber-Name
   identifiziert wurde, kann Claude per built-in `web_search`-Tool aktiv
   nach `<owner-name> <praxis> <stadt> linkedin` suchen. Aktivierung über
   `ENABLE_SOCIAL_LOOKUP=1` in der `.env`. Cost: ~$0.03 pro Praxis auf
   Sonnet 4.5 — bei 1'000 Leads also ~$30. Lohnt sich für einen einmaligen
   Anreicherungslauf nach dem ersten Discovery-Sweep.

Ergebnis landet in den Twenty-Feldern `Person.linkedinUrl` (Owner +
Team-Members), `Company.ownerLinkedin`, `Company.practiceLinkedin` etc.

## Nicht enthalten (out of scope)

- Proxy-Rotation (falls Google IP-bantt)
- Cron-Scheduler (zZ. manuell ausführen)
- E-Mail-Verification (Bounce-Check)
- Automatische Outreach-Mails (das ist Twenty/Lemlist Job)
- Tiefes LinkedIn-Scraping (LinkedIn ToS — wir lesen nur was Claude oder
  die Praxis-Website öffentlich preisgeben)
