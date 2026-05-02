# Twenty CRM — Custom-Field Setup für den MedTheris-Workspace

Status: **26 Felder fehlen** (Stand 1. Mai 2026, sichtbar im Scraper-Log
am Ende eines `--push-cache`-Laufs als `Hinweis: Twenty-Workspace hatte
keine Felder: …`).

Solange diese Felder im Twenty-Workspace nicht existieren, wirft der
GraphQL-Server `Object company doesn't have any "X" field` und der
Scraper-Client (`crm/twenty_client.py → _execute_with_drift_retry`)
schmeisst das Feld stillschweigend aus dem Payload — der Lead landet
trotzdem als Company in Twenty, aber ohne die jeweilige Information.

Damit also „Telefon, Homepage, welche Software, wie viele Therapeut:innen"
**alle** auf der Company sichtbar werden, müssen diese Custom-Fields
**einmalig** in Twenty Settings → Data Model angelegt werden. Anschließend
zieht ein erneutes `--push-cache` (idempotent, kein Google-/LLM-Cost) die
fehlenden Spalten an die bereits gepushten 100+ Leads heran (`merge_company_fields`
schreibt nur in leere Felder).

## Schritt 1 — Settings öffnen

1. Twenty-Admin-UI → **Settings** → **Data Model**.
2. „Companies" auswählen → Tab „Fields" → Knopf **+ Add field**.
3. Pro Feld: **API Name** *exakt* wie unten angegeben, **Field Type** wie
   in der Tabelle, **Label** und Beschreibung optional (das ignoriert der
   Scraper).
4. Speichern. Twenty regeneriert das Schema sofort.
5. Genauso für **Persons** → ein einziges Feld (`personTitle`).

## Schritt 2 — Fehlende Felder

### Company

| API Name | Field Type | Wofür / wer schreibt |
|---|---|---|
| `acceptsEmergency` | **Boolean** | LLM-Extraktion: Notfall-Termine ja/nein |
| `bookingConfidence` | **Text** | `high \| medium \| low \| none` (booking_detector) |
| `bookingEvidence` | **Text** | z. B. `iframe-match=onedoc.ch` (Beweisstring fürs CRM-Audit) |
| `geoLat` | **Number** | Google Places — Praxis-Latitude |
| `geoLng` | **Number** | Google Places — Praxis-Longitude |
| `googleMapsUrl` | **Link** | Direktlink auf den Google-Maps-Eintrag |
| `industry` | **Text** | `physiotherapie \| arztpraxis \| sportverein` (Profile-tag) |
| `insuranceAccepted` | **Text** | LLM: akzeptierte Krankenkassen / Tarife |
| `onlineBookingUrl` | **Link** | Direktlink auf den Online-Buchungs-Widget |
| `openingHours` | **Text** | Google Places (Klartext-Zeile) |
| `ownerTitle` | **Text** | Akademischer/Fachtitel der Inhaber:in (z. B. „MSc, MAS") |
| `plusCode` | **Text** | Google plus_code (für Adress-Disambiguierung) |
| `practiceFacebook` | **Link** | gefundene Facebook-Seite der Praxis |
| `practiceInstagram` | **Link** | gefundener Instagram-Account der Praxis |
| `practiceLinkedin` | **Link** | LinkedIn-Company-Page |
| `practiceLocations` | **Number** | LLM: Anzahl Standorte (1 = Single-Site) |
| `practiceSize` | **Text** | LLM: Größenklassifizierung (`solo \| small \| medium \| large`) |
| `practiceTiktok` | **Link** | gefundener TikTok-Account |
| `practiceX` | **Link** | gefundener X/Twitter-Account |
| `practiceYoutube` | **Link** | gefundener YouTube-Channel |
| `trainingOffered` | **Text** | LLM: angebotene Fortbildungen (Komma-Liste) |
| `websitePlatform` | **Text** | **„welche Software": `wordpress \| wix \| squarespace \| typo3 \| custom \| …`** |
| `websitePlatformEvidence` | **Text** | Beweisstring (z. B. `meta-generator=WordPress 6.4`) |
| `wheelchairAccessible` | **Boolean** | Google Places (rollstuhl-zugänglich) |
| `yearFounded` | **Number** | LLM: Gründungsjahr |

### Person (separat in Settings → Data Model → Persons)

| API Name | Field Type | Wofür |
|---|---|---|
| `personTitle` | **Text** | Akademischer/Fachtitel (z. B. „Dr. med." oder „Physiotherapeutin SRK") |

> **Wichtig:** Beim Anlegen Twenty fragt nach „Type" — wähle **NICHT**
> „Select" oder „Multi-Select" für die Text-Felder, sonst muss man
> später für jede neue Plattform/Provider-Variante einen Enum-Eintrag
> manuell pflegen. „Text" reicht; der Scraper schreibt freie Strings.

## Schritt 3 — Re-Push der bestehenden Leads

Nach dem Anlegen einmal:

```bash
ssh medtheris-corelab-root
cd /opt/corelab
docker compose exec -T medtheris-scraper \
  python /app/main.py --profile physio --push-cache
```

Der Lauf streamt das übliche Log nach `/var/scraper/run.log`. Das Portal
zeigt Live-Output unter **Admin → Onboarding → Scraper** (Tab „Letzter /
aktueller Lauf").

`merge_company_fields` schreibt nur in leere Felder, du verlierst also
nichts an manuell gepflegten Daten. Sobald der Hinweis am Ende leer ist
(„Twenty-Workspace hatte keine Felder: …" entfällt), passt das Schema
wieder zum Mapper.

## Optional — kleinere Felder, die heute schon im Workspace sind

Diese Felder werden vom Scraper geschrieben **und vom Workspace akzeptiert**
— hier nur zur Dokumentation, damit klar ist, was bereits funktioniert:

```
phone, domainName (= homepage), googleRating, googleReviewCount,
employeeCountPhysio (= „wie viele Therapeut:innen"),
specializations, languages, generalEmail,
ownerName, ownerEmail, ownerSource, ownerLinkedin,
leadTherapistName, leadTherapistEmail,
bookingSystem, practiceXing, teamMembersJson
```

## Realistische Coverage-Erwartung

Selbst nach Schritt 2 wird die Datenfüllrate auf einigen Feldern niedrig
bleiben — das ist Quellen-, nicht Scraper-Realität. Stand der 173 bisher
gefundenen Physio-Praxen (Schweiz):

| Feld | Coverage über alle Leads |
|---|---|
| Google Rating | 87 % |
| Telefon | 42 % |
| Website (Homepage) | 39 % |
| Online-Buchung-Plattform | 38 % |
| Website-Plattform | 38 % |
| Therapeut:innen-Anzahl | 24 % |
| Owner-Name | 21 % |
| Owner-Email | 10 % |
| Gründungsjahr | 4 % |

Hauptursache: ~62 % der Praxen haben in Google Maps keine Website
hinterlegt — ohne Website kein Crawl, ohne Crawl keine LLM-Extraktion,
also strukturell leere Owner/Software/Therapeut:innen-Felder. Das lösen
wir nicht über Twenty-Schema, sondern entweder über Discovery-Filter
(„nur Praxen mit Website pushen") oder Manual-Enrichment.

## Diagnose-Skript

`scripts/scraper-cache-quality.py` (lokal entwickelt, copy-paste-bar)
berechnet die obigen Coverage-Zahlen direkt aus
`/var/scraper/scraper.sqlite` ohne CRM-Calls — nützlich für regelmäßige
Reviews bevor man entscheidet, ob ein neuer Discovery-Lauf sich lohnt.
