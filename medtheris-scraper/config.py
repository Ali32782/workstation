"""
Configuration: search queries, German-speaking-Switzerland PLZ list, booking signatures.

Phase-1 scope: Deutschschweiz only (DE-CH). Romandie + Ticino sind out-of-scope
für den initialen Run, weil MedTheris-Onboarding in DE startet und wir den
Trial-Credit ($300 / 90 Tage) nicht in Regionen verbrennen, die wir noch nicht
gezielt ansprechen können.

Cantons covered (alle DE-sprachigen + zweisprachige mit DE-Mehrheit):
  ZH BE LU UR SZ OW NW GL ZG SO BS BL SH AR AI SG GR AG TG

NICHT enthalten: GE VD VS NE JU FR (Romandie) · TI (Ticino).
"""

SEARCH_QUERIES = [
    "Physiotherapie",
    "Physiotherapeut",
    "Physio Praxis",
    "Rehabilitation Physiotherapie",
]

# Curated DE-CH PLZ list. ~80 entries → covers ≥85% of German-speaking
# Swiss physio practices. Google Places' radius re-ranking automatically widens
# each query well beyond the PLZ point, so we don't need every single PLZ.
SWISS_PLZ_CITIES = [
    # --- Zürich (ZH) ---
    {"plz": "8001", "city": "Zürich", "canton": "ZH"},
    {"plz": "8004", "city": "Zürich", "canton": "ZH"},
    {"plz": "8005", "city": "Zürich", "canton": "ZH"},
    {"plz": "8006", "city": "Zürich", "canton": "ZH"},
    {"plz": "8032", "city": "Zürich", "canton": "ZH"},
    {"plz": "8037", "city": "Zürich", "canton": "ZH"},
    {"plz": "8044", "city": "Zürich", "canton": "ZH"},
    {"plz": "8050", "city": "Zürich", "canton": "ZH"},
    {"plz": "8055", "city": "Zürich", "canton": "ZH"},
    {"plz": "8400", "city": "Winterthur", "canton": "ZH"},
    {"plz": "8404", "city": "Winterthur", "canton": "ZH"},
    {"plz": "8600", "city": "Dübendorf", "canton": "ZH"},
    {"plz": "8610", "city": "Uster", "canton": "ZH"},
    {"plz": "8620", "city": "Wetzikon", "canton": "ZH"},
    {"plz": "8700", "city": "Küsnacht", "canton": "ZH"},
    {"plz": "8800", "city": "Thalwil", "canton": "ZH"},
    {"plz": "8810", "city": "Horgen", "canton": "ZH"},
    {"plz": "8820", "city": "Wädenswil", "canton": "ZH"},
    {"plz": "8180", "city": "Bülach", "canton": "ZH"},
    # --- Bern (BE) — DE-sprachiger Teil ---
    {"plz": "3000", "city": "Bern", "canton": "BE"},
    {"plz": "3005", "city": "Bern", "canton": "BE"},
    {"plz": "3007", "city": "Bern", "canton": "BE"},
    {"plz": "3008", "city": "Bern", "canton": "BE"},
    {"plz": "3010", "city": "Bern", "canton": "BE"},
    {"plz": "3012", "city": "Bern", "canton": "BE"},
    {"plz": "3014", "city": "Bern", "canton": "BE"},
    {"plz": "3018", "city": "Bern", "canton": "BE"},
    {"plz": "3027", "city": "Bern", "canton": "BE"},
    {"plz": "3400", "city": "Burgdorf", "canton": "BE"},
    {"plz": "3600", "city": "Thun", "canton": "BE"},
    {"plz": "3800", "city": "Interlaken", "canton": "BE"},
    {"plz": "2502", "city": "Biel/Bienne", "canton": "BE"},
    # --- Basel (BS + BL) ---
    {"plz": "4001", "city": "Basel", "canton": "BS"},
    {"plz": "4051", "city": "Basel", "canton": "BS"},
    {"plz": "4052", "city": "Basel", "canton": "BS"},
    {"plz": "4053", "city": "Basel", "canton": "BS"},
    {"plz": "4055", "city": "Basel", "canton": "BS"},
    {"plz": "4056", "city": "Basel", "canton": "BS"},
    {"plz": "4057", "city": "Basel", "canton": "BS"},
    {"plz": "4058", "city": "Basel", "canton": "BS"},
    {"plz": "4102", "city": "Binningen", "canton": "BL"},
    {"plz": "4103", "city": "Bottmingen", "canton": "BL"},
    {"plz": "4410", "city": "Liestal", "canton": "BL"},
    # --- Solothurn (SO) ---
    {"plz": "4500", "city": "Solothurn", "canton": "SO"},
    {"plz": "4600", "city": "Olten", "canton": "SO"},
    # --- Luzern (LU) ---
    {"plz": "6000", "city": "Luzern", "canton": "LU"},
    {"plz": "6003", "city": "Luzern", "canton": "LU"},
    {"plz": "6004", "city": "Luzern", "canton": "LU"},
    {"plz": "6005", "city": "Luzern", "canton": "LU"},
    {"plz": "6010", "city": "Kriens", "canton": "LU"},
    {"plz": "6020", "city": "Emmenbrücke", "canton": "LU"},
    {"plz": "6030", "city": "Ebikon", "canton": "LU"},
    # --- Zentralschweiz (UR SZ OW NW ZG) ---
    {"plz": "6300", "city": "Zug", "canton": "ZG"},
    {"plz": "6340", "city": "Baar", "canton": "ZG"},
    {"plz": "6430", "city": "Schwyz", "canton": "SZ"},
    {"plz": "6440", "city": "Brunnen", "canton": "SZ"},
    {"plz": "6460", "city": "Altdorf", "canton": "UR"},
    {"plz": "6060", "city": "Sarnen", "canton": "OW"},
    {"plz": "6370", "city": "Stans", "canton": "NW"},
    # --- Aargau (AG) ---
    {"plz": "5000", "city": "Aarau", "canton": "AG"},
    {"plz": "5400", "city": "Baden", "canton": "AG"},
    {"plz": "5200", "city": "Brugg", "canton": "AG"},
    {"plz": "5600", "city": "Lenzburg", "canton": "AG"},
    {"plz": "5700", "city": "Zofingen", "canton": "AG"},
    # --- Ostschweiz (SG TG SH AR AI GL) ---
    {"plz": "9000", "city": "St. Gallen", "canton": "SG"},
    {"plz": "9006", "city": "St. Gallen", "canton": "SG"},
    {"plz": "9010", "city": "St. Gallen", "canton": "SG"},
    {"plz": "9014", "city": "St. Gallen", "canton": "SG"},
    {"plz": "9200", "city": "Gossau", "canton": "SG"},
    {"plz": "9400", "city": "Rorschach", "canton": "SG"},
    {"plz": "9500", "city": "Wil", "canton": "SG"},
    {"plz": "8500", "city": "Frauenfeld", "canton": "TG"},
    {"plz": "8280", "city": "Kreuzlingen", "canton": "TG"},
    {"plz": "8200", "city": "Schaffhausen", "canton": "SH"},
    {"plz": "9100", "city": "Herisau", "canton": "AR"},
    {"plz": "9050", "city": "Appenzell", "canton": "AI"},
    {"plz": "8750", "city": "Glarus", "canton": "GL"},
    # --- Graubünden (GR) — DE-sprachiger Teil ---
    {"plz": "7000", "city": "Chur", "canton": "GR"},
    {"plz": "7270", "city": "Davos Platz", "canton": "GR"},
    {"plz": "7500", "city": "St. Moritz", "canton": "GR"},
]


# Domain / URL signatures of known online-booking platforms.
#
# These are matched against the merged HTML, link list, iframe sources, script
# sources, and form actions of every visited subpage. The detector returns the
# first provider whose signatures appear (highest-confidence first), plus an
# 'evidence' string explaining where the match was found — that's important
# for sales: "iframe-src=onedoc.ch" is a proven integration; a generic CTA
# keyword on a Wix homepage is a much weaker signal.
#
# 'custom' is reserved for sites that have generic booking copy ("Termin online
# buchen") but no recognizable provider, set by booking_detector as a fallback.
# 'none' means we found no booking signal at all.
#
# Order matters loosely: the first match wins, so put the most distinctive,
# high-confidence providers first. Wix-internal bookings stay near the bottom
# because many sites embed onedoc/doctolib INSIDE a Wix page, and the outer
# Wix booking widget is less interesting than the actual provider.
BOOKING_SIGNATURES = {
    # ----- Switzerland-specific (highest interest for MedTheris) -----
    "onedoc": ["onedoc.ch", "onedoc.com"],
    "medicosearch": ["medicosearch.ch", "medi.swiss"],
    "calenso": ["calenso.com", "calenso.ch", "my.calenso.com"],
    "agnes": ["agnes.ch", "med.agnes.ch"],
    "deindoctor": ["deindoctor.ch"],
    "deinarzt": ["deinarzt.ch"],
    "eterminal": ["eterminal.ch"],
    # ----- DACH region (strong Swiss penetration) -----
    "doctolib": ["doctolib.ch", "doctolib.de", "doctolib.fr", "doctolib.com"],
    "samedi": ["samedi.de", "samedi.ch", "patient.samedi"],
    "terminland": ["terminland.de", "terminland.ch", "terminland.com"],
    "appointmind": ["appointmind.com", "appointmind.net"],
    "easyappointments": ["easyappointments.org", "/easy-appointments/"],
    # ----- Physio-/health-specific clinic management with embedded booking -----
    "clinicmaster": ["clinicmaster.com", "clinicmaster.ch"],
    "theramed": ["theramed.com", "theramed.ch", "theramed.de"],
    "tomedo": ["tomedo.de", "tomedo.ch"],
    "physiotools": ["physiotools.com"],
    "deepcura": ["deepcura.com", "deepcura.ai"],
    "elaine": ["elaine.io", "go.elaine.io"],
    "timetap": ["timetap.com"],
    "bookitit": ["bookitit.com"],
    # ----- General/horizontal schedulers commonly used by physios -----
    "calendly": ["calendly.com"],
    "calcom": ["cal.com", "app.cal.com"],
    "koalendar": ["koalendar.com"],
    "youcanbookme": ["youcanbook.me", "youcanbookme.com"],
    "tidycal": ["tidycal.com"],
    "savvycal": ["savvycal.com"],
    "vyte": ["vyte.in", "vyte.com"],
    "picktime": ["picktime.com"],
    "setmore": ["setmore.com", "go.setmore.com"],
    "acuity": ["acuityscheduling.com", "app.squarespacescheduling.com"],
    "square_appointments": ["squareup.com/appointments", "app.squareup.com/appointments"],
    "schedulista": ["schedulista.com"],
    "fresha": ["fresha.com", "www.fresha.com"],
    "simplybook": ["simplybook.it", "simplybook.me"],
    "bookafy": ["bookafy.com"],
    "10to8": ["10to8.com"],
    "microsoft_bookings": ["bookings.office.com", "outlook.office.com/bookwithme"],
    "hubspot_meetings": ["meetings.hubspot.com", "hubspot.com/meetings"],
    "zoho_bookings": ["bookings.zoho.com", "zohobookings"],
    # ----- WordPress booking plugins (detected via class names / asset paths) -----
    "wp_amelia": ["amelia/", "ameliabooking", "amelia-booking", "amelia-front"],
    "wp_bookly": ["bookly-", "/bookly/", "bookly-form", "bookly-booking"],
    "wp_latepoint": ["latepoint", "/latepoint/"],
    "wp_motopress": ["mphb_", "motopress-appointment", "mphb-bookings"],
    # ----- Wix-internal (only flagged if no third-party provider was matched) -----
    "wix_bookings": [
        "bookings.wixapps.net", "wixapps.net/api/bookings", "wix-bookings",
        "_api/bookings/", "/bookings-checkout",
    ],
    "squarespace_scheduling": [
        "scheduling.squarespace.com", "acuityscheduling.com/schedule.php",
    ],
    # ----- Sentinel buckets used by booking_detector logic -----
    "custom": [],   # generic CTA found, no recognizable provider
    "none": [],     # no booking signal at all
}


# Ordered tuple of providers we consider "high-confidence physio-relevant".
# Used by the detector to score: hits on these get confidence='high', everything
# else (calendly, generic horizontal schedulers) gets 'medium'. 'custom' = low.
HIGH_CONFIDENCE_BOOKING_PROVIDERS = (
    "onedoc", "medicosearch", "calenso", "agnes", "deindoctor", "deinarzt",
    "eterminal", "doctolib", "samedi", "terminland", "appointmind",
    "easyappointments", "clinicmaster", "theramed", "tomedo", "deepcura",
    "elaine", "wp_amelia", "wp_bookly", "wp_latepoint",
)


# Signatures that identify which website-platform / CMS the practice runs on.
# Important for sales because:
#   - wix/jimdo/godaddy → low-tech, easy to migrate, cheap-renter target
#   - wordpress → mid-range, has plugin booking systems we can replace
#   - squarespace → polished but locked-in, harder to migrate
#   - webflow → tech-savvy operator, evaluate ROI
#   - custom/unknown → likely has a developer relationship, harder cold-pitch
#
# Detection sources (in order): <meta name="generator"> content, script src URLs,
# stylesheet/link href URLs, body/html class attributes.
# Each list is matched against lower-cased haystacks built from
# (meta-generator content) + (script src URLs) + (raw HTML), in that order.
# A short lower-case keyword ("squarespace", "wix") matches the
# meta-generator string ("Squarespace 7.1", "Wix.com Website Builder") as
# well as any URL/HTML occurrence — so we don't need separate `meta` signatures.
WEBSITE_PLATFORM_SIGNATURES = {
    "wix": ["wix.com", "wixstatic.com", "parastorage.com", "wix-code", "wix.com website builder"],
    "squarespace": ["squarespace", "sqsp.net"],
    "wordpress": ["/wp-content/", "/wp-includes/", "wp-json", "wordpress.com", "wordpress.org", "wordpress"],
    "jimdo": ["jimdo.com", "jimdofree.com", "jimdosite.com", "jimdo"],
    "webflow": ["webflow.com", "assets.website-files.com", "uploads-ssl.webflow", "webflow"],
    "shopify": ["cdn.shopify.com", "shopify.com/s/files", "shopify"],
    "godaddy": ["godaddysites.com", "img1.wsimg.com", "godaddy website builder"],
    "weebly": ["weebly.com", "editmysite"],
    "joomla": ["joomla!", "joomla"],
    "drupal": ["drupal", "/sites/default/files/"],
    "ghost": ["ghost.org", "ghost-cards", "ghost "],
    "typo3": ["typo3"],
    "custom": [],   # placeholder — set when none of the above matched
}
