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


# Domain / URL signatures of known online-booking platforms in DACH/CH.
# 'custom' is reserved for sites that have generic booking copy ("Termin online
# buchen") but no recognizable provider, set by booking_detector as a fallback.
# 'none' means we found no booking signal at all.
BOOKING_SIGNATURES = {
    "onedoc": ["onedoc.ch", "onedoc.com"],
    "doctolib": ["doctolib.ch", "doctolib.de", "doctolib.com"],
    "samedi": ["samedi.de", "samedi.ch"],
    "calendly": ["calendly.com"],
    "clinicmaster": ["clinicmaster.com", "clinicmaster.ch"],
    "physiotools": ["physiotools.com"],
    "agnes": ["agnes.ch"],
    "appointmind": ["appointmind.com"],
    "terminland": ["terminland.de", "terminland.ch"],
    "custom": [],
    "none": [],
}
