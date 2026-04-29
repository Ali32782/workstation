"""
LLM-based structured extraction from website text.

Sends merged homepage + team/contact subpage text plus the harvested email
list to Claude and asks for a structured JSON describing the entity (a
physio practice, a doctor's office, or a sports club) plus the people
working there.

The prompt forces the model to PICK matching emails from the harvested list
instead of hallucinating, which is the main reliability lever.

Multi-profile (April 2026):
  Each profile picks a `extractor_prompt_key` (`physio`, `aerzte`,
  `sportverein`); this module dispatches to the right prompt builder.
  All prompts produce the SAME JSON shape so downstream mapping code
  doesn't have to branch — only the field semantics shift (an "owner"
  on a Sportverein is the Vereins-Vorstand, on an Arztpraxis the
  Praxis-Inhaber:in).
"""
import json
import os
import re

import anthropic


_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_structured_data(
    text: str,
    practice_name: str,
    emails_found: list[str] | None = None,
    prompt_key: str = "physio",
) -> dict:
    """
    Extract owner / lead therapist / staff / specialization data.

    Args:
        text: merged body text from homepage + subpages.
        practice_name: name from Google Maps (used in prompt for context).
        emails_found: list of email addresses harvested by the enricher;
            the model is asked to PICK matching emails from this list rather
            than invent them.

    Returns:
        Dict with keys:
            owner_name, owner_email,
            lead_therapist_name, lead_therapist_email,
            general_email,
            employee_count_physio,
            languages (list[str]),
            specializations (list[str]),
            has_online_booking (bool),
            practice_size ("klein"|"mittel"|"gross")
        Empty dict if extraction failed.
    """
    if not text or not text.strip():
        return {}

    emails_block = ""
    if emails_found:
        emails_block = (
            "\n\nGEFUNDENE E-MAILS auf der Website (du MUSST aus dieser Liste "
            "auswählen, nichts erfinden — wenn keine passt: null):\n"
            + "\n".join(f"  - {e}" for e in emails_found[:30])
        )

    builder = _PROMPT_BUILDERS.get(prompt_key, _build_prompt_physio)
    prompt = builder(practice_name=practice_name, text=text, emails_block=emails_block)
    return _call_claude_and_parse(prompt)


def _call_claude_and_parse(prompt: str) -> dict:
    """Single Claude round-trip + JSON parse with fence-fallback."""
    client = anthropic.Anthropic()
    message = client.messages.create(
        model=_MODEL,
        max_tokens=2800,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = "".join(
        block.text for block in message.content if hasattr(block, "text")
    ).strip()

    candidates: list[str] = []
    fence_match = _FENCE_RE.search(raw)
    if fence_match:
        candidates.append(fence_match.group(1))
    candidates.append(raw)

    for cand in candidates:
        try:
            return json.loads(cand)
        except json.JSONDecodeError:
            continue

    print(f"    extractor: konnte JSON nicht parsen, raw[:120]={raw[:120]!r}")
    return {}


def _build_prompt_physio(*, practice_name: str, text: str, emails_block: str) -> str:
    return f"""\
Du bist Sales-Researcher und analysierst die Website der Schweizer \
Physiotherapie-Praxis "{practice_name}". Extrahiere Personen, Kontaktdaten, \
Praxis-Profil UND Sales-relevante Zusatzdaten. Antworte NUR mit einem \
JSON-Objekt, KEIN Markdown, KEINE Erklärung.

Schema:
{{
  "owner_name": "Vor- und Nachname des Inhabers/der Inhaberin (oder null). PRIO 1: \
Impressum-Block (Schweizer Recht — dort steht der juristische Inhaber).",
  "owner_source": "Wo wurde owner_name extrahiert? Werte: 'impressum', 'team', \
'about', 'kontakt', 'andere' oder null",
  "owner_email": "MUSS aus den gefundenen E-Mails stammen — wähle die persönliche \
Adresse des Inhabers wenn erkennbar (z.B. anna@praxis.ch), sonst null",
  "owner_phone": "Direkt-/Mobilnummer des Inhabers wenn explizit zugeordnet — \
NICHT die allgemeine Praxis-Nummer; sonst null",
  "owner_linkedin": "https://www.linkedin.com/in/<slug>/-URL des Inhabers, \
falls auf der Website verlinkt — sonst null",
  "owner_title": "Berufstitel/akademischer Grad des Inhabers wenn explizit \
genannt, z.B. 'Dr. phil. nat.', 'MSc Physiotherapie', 'Praxisinhaber' — sonst null",
  "lead_therapist_name": "Vor- und Nachname des leitenden Therapeuten/der \
Praxisleiterin — wenn unterschiedlich vom Inhaber (oder null wenn identisch \
oder kein eigener Leiter erkennbar)",
  "lead_therapist_email": "MUSS aus den gefundenen E-Mails stammen — \
persönliche Adresse des leitenden Therapeuten oder null",
  "lead_therapist_phone": "Direkt-/Mobilnummer des leitenden Therapeuten wenn \
explizit zugeordnet — NICHT die Praxis-Hauptnummer; sonst null",
  "team_members": [
    {{
      "name": "Vorname Nachname",
      "role": "z.B. Physiotherapeutin, Praxisleitung, Sportphysiotherapeut",
      "email": "persönliche Email aus der Liste oder null",
      "specializations": ["optional, Liste der Spezialisierungen dieser Person"],
      "linkedin": "https://www.linkedin.com/in/...-URL falls auf Website verlinkt, sonst null"
    }}
  ],
  "general_email": "Allgemeine Praxis-E-Mail aus den gefundenen E-Mails \
(typisch info@..., kontakt@..., praxis@...) oder null",
  "employee_count_physio": "Anzahl Physiotherapeut:innen im Team als Integer (oder null)",
  "languages": ["Sprachen der Praxis als ISO-Codes z.B. de, fr, it, en"],
  "specializations": ["Spezialisierungen der Praxis als Ganzes"],
  "training_offered": ["Zusatz-Angebote neben klassischer Physio: \
'Pilates', 'Yoga', 'Geräte-Training', 'medizinische Trainingstherapie', \
'Personal Training', 'Präventionskurse' usw. (oder leere Liste)"],
  "insurance_accepted": "Wie lautet die Krankenkassen-Anerkennung? Mögliche Werte: \
'krankenkassen-anerkannt' (Standard CH-Phrase 'EMR/ASCA/RME-anerkannt' oder 'alle \
Krankenkassen'), 'nur-zusatzversicherung', 'selbstzahler', null wenn nicht erwähnt",
  "year_founded": "Gründungsjahr der Praxis als Integer (z.B. 2018), \
falls auf Website explizit genannt — sonst null",
  "locations": "Anzahl Standorte/Filialen als Integer. 1 wenn nur eine Praxis, \
>1 wenn mehrere Filialen explizit genannt; null wenn unklar",
  "opening_hours_summary": "kurze Klartextzusammenfassung der Öffnungszeiten \
wenn auf Website (z.B. 'Mo-Fr 7:00-19:00, Sa nach Vereinbarung'); null wenn nicht erkennbar",
  "accepts_emergency_appointments": true|false|null,
  "has_online_booking": true|false,
  "online_booking_url": "Direkt-Link zum Buchungs-Widget wenn auf der Website \
verlinkt (z.B. https://onedoc.ch/...) — sonst null",
  "practice_size": "klein|mittel|gross",
  "social_handles": {{
    "linkedin_company":  "https://www.linkedin.com/company/<slug>/ oder null",
    "instagram":         "https://www.instagram.com/<handle>/ oder null",
    "facebook":          "https://www.facebook.com/<handle>/ oder null",
    "youtube":           "URL oder null",
    "tiktok":            "URL oder null"
  }}
}}

Wichtige Regeln:
- owner_name = die natürliche Person (Vorname Nachname), die die Praxis besitzt/führt.
  Suche in dieser Reihenfolge — sobald ein Treffer gefunden wird, übernimm ihn:
    a) Impressum nennt explizit "Inhaber: Anna Müller" oder "Geschäftsführer: \
Anna Müller" → owner_name="Anna Müller", owner_source="impressum".
    b) Team-Liste enthält eine Person, deren Rolle eines dieser Wörter \
enthält: "Gründer", "Gründerin", "Inhaber", "Inhaberin", "Praxisinhaber", \
"Geschäftsführer", "Geschäftsführerin", "CEO", "Eigentümer", "Owner". \
→ owner_name=DIESE Person, owner_source="team".
    c) Sonst → owner_name=null, owner_source=null.
  WICHTIG: owner_name darf NIEMALS eine Firma sein ("PhysioBasel AG" ist KEIN \
gültiger owner_name). Nur Vorname+Nachname von echten Menschen.
- "Leitender Therapeut" = Praxisleitung wenn nicht selbst Inhaber. \
Erkennbar an Rollen wie "Praxisleitung", "Zentrumsleiter:in", "Fachliche \
Leitung", "Leitende:r Therapeut:in".
- Wenn Inhaber UND leitende:r Therapeut:in dieselbe Person sind: \
owner_name ausfüllen, lead_therapist_name = null.
- owner_source NUR ausfüllen wenn owner_name nicht null ist; sonst owner_source = null.
- team_members: ALLE im Team genannten Therapeut:innen aufzählen (auch der \
Inhaber selbst). Wenn keine Team-Liste sichtbar: leeres Array [].
- Email-Zuordnung: Match Vor-/Nachname mit E-Mail-Local-Part. Wenn unklar: null statt raten.
- Telefon-Zuordnung: NUR setzen wenn die Nummer explizit dem Namen zugeordnet \
ist. Die Praxis-Hauptnummer NIEMALS als Person-Direktnummer übernehmen.
- practice_size: klein (1-2), mittel (3-6), gross (>6).
- has_online_booking: true wenn die Website "online buchen"/Buchungs-Widget enthält.
- LinkedIn/Social-URLs nur ausfüllen wenn sie WIRKLICH im Website-Text/Links \
auftauchen — niemals plausible URLs erfinden. Sonst null.
- year_founded ist häufig im Impressum oder unter "Über uns" zu finden \
("seit 2014", "gegründet 2017"). Falls nur ein Bereich wie "seit über 20 Jahren" \
erkennbar: schätze konservativ (also: schreibe null statt zu raten).

{emails_block}

Website-Text (Homepage + Impressum/Team/Über-uns/Kontakt-Seiten):
{text[:12000]}
"""


def _build_prompt_aerzte(*, practice_name: str, text: str, emails_block: str) -> str:
    """Ärzte-Prompt: dieselbe JSON-Struktur, andere Semantik.

    `owner_name` = Praxis-Inhaber:in (Dr. med. …), `lead_therapist_name`
    bleibt das Feld für leitende Ärzt:innen wenn nicht identisch zum
    Inhaber. `team_members` listet alle Ärzt:innen + MPAs. Specialties
    sind die medizinischen Fachgebiete.
    """
    return f"""\
Du bist Sales-Researcher und analysierst die Website der Schweizer \
Arztpraxis "{practice_name}". Extrahiere Personen, Kontaktdaten, \
Praxisprofil UND Sales-relevante Zusatzdaten. Antworte NUR mit einem \
JSON-Objekt, KEIN Markdown, KEINE Erklärung.

Schema (gleich wie Physio — die semantische Auslegung folgt unten):
{{
  "owner_name": "Vor- und Nachname der/des Praxis-Inhaber:in (Dr. med. …) \
oder null. PRIO 1: Impressum (Schweizer Recht). Akademische Titel wie \
'Dr. med.' oder 'PD' werden in 'owner_title' gespeichert, NICHT in \
'owner_name'.",
  "owner_source": "Wo extrahiert? 'impressum'|'team'|'about'|'kontakt'|'andere' oder null",
  "owner_email": "MUSS aus den gefundenen E-Mails stammen — persönliche \
Adresse oder null",
  "owner_phone": "Direktnummer wenn explizit zugeordnet, NICHT die \
Praxis-Hauptnummer; sonst null",
  "owner_linkedin": "https://www.linkedin.com/in/<slug>/-URL oder null",
  "owner_title": "Akademischer Grad/Titel: 'Dr. med.', 'Dr. med. PhD', \
'PD', 'Prof. Dr.' usw. Das ist KEIN Berufstitel wie 'Praxisinhaber'.",
  "lead_therapist_name": "Vor- und Nachname leitende:r Ärzt:in (Praxis-/ \
Zentrumsleitung, Chefarzt) — nur wenn unterschiedlich zum Inhaber, sonst null",
  "lead_therapist_email": "MUSS aus den gefundenen E-Mails stammen oder null",
  "lead_therapist_phone": "Direktnummer wenn explizit zugeordnet, sonst null",
  "team_members": [
    {{
      "name": "Vorname Nachname",
      "role": "z.B. Fachärztin Orthopädie, Allgemeinmedizin, MPA",
      "email": "persönliche Email aus der Liste oder null",
      "specializations": ["medizinische Fachgebiete dieser Person"],
      "linkedin": "LinkedIn-URL falls auf Website verlinkt, sonst null"
    }}
  ],
  "general_email": "Praxis-Hauptmail (info@/kontakt@/praxis@) aus der Liste oder null",
  "employee_count_physio": "Gesamtanzahl Ärzt:innen + Fachpersonal als Integer (oder null) — \
das Feld heisst aus historischen Gründen 'physio', meint hier aber das gesamte Team",
  "languages": ["Sprachen der Praxis als ISO-Codes (de, fr, it, en …)"],
  "specializations": ["Medizinische Fachgebiete der Praxis: 'Orthopädie', \
'Sportmedizin', 'Allgemeinmedizin', 'Innere Medizin', 'Kardiologie', \
'Manuelle Medizin', 'Stosswellen', 'Ganganalyse', …"],
  "training_offered": ["Spezielle Diagnostik-/Therapie-Angebote: 'MRI', \
'Ultraschall', 'Sonographie', 'EKG', 'Belastungs-EKG', 'Infusionstherapie', \
'Akupunktur', usw. (oder leere Liste)"],
  "insurance_accepted": "Krankenkassen-Status: 'krankenkassen-anerkannt' \
(Standard CH), 'nur-zusatzversicherung', 'selbstzahler', null wenn nicht erwähnt",
  "year_founded": "Gründungsjahr als Integer (oder null)",
  "locations": "Anzahl Standorte als Integer (1 wenn nur eine Praxis); null wenn unklar",
  "opening_hours_summary": "Kurze Klartext-Zusammenfassung der Sprechzeiten oder null",
  "accepts_emergency_appointments": true|false|null,
  "has_online_booking": true|false,
  "online_booking_url": "Direkt-Link zum Buchungs-Widget oder null",
  "practice_size": "klein|mittel|gross",
  "social_handles": {{
    "linkedin_company": "Praxis-LinkedIn-URL oder null",
    "instagram":         "Instagram-URL oder null",
    "facebook":          "Facebook-URL oder null",
    "youtube":           "URL oder null",
    "tiktok":            "URL oder null"
  }}
}}

Wichtige Regeln:
- owner_name = natürliche Person (Vor- und Nachname). NIEMALS eine Firma. \
Akademische Titel wie 'Dr. med.' gehen in owner_title, NICHT in owner_name.
- owner_source NUR ausfüllen wenn owner_name nicht null ist.
- team_members: ALLE im Team genannten Ärzt:innen (Fachärzt:innen, \
Assistenzärzt:innen) UND nicht-ärztliches Fachpersonal (MPA, MTRA) auflisten. \
Wenn keine Team-Liste sichtbar: leeres Array [].
- Email-Zuordnung: Vor-/Nachname mit Email-Local-Part matchen, sonst null.
- Telefon-Zuordnung: NUR wenn explizit zugeordnet — nie die Praxis-Hauptnummer.
- specializations: medizinische Fachgebiete (Facharzttitel, Schwerpunkte). \
Keine generischen Floskeln wie 'ganzheitlich' oder 'modern'.
- has_online_booking: true wenn ein erkennbares Buchungs-Widget eingebunden ist.
- LinkedIn/Social-URLs nur wenn WIRKLICH im Website-Text vorhanden — niemals raten.
- year_founded: konservativ. Bei Phrasen wie 'seit über 20 Jahren': null statt zu raten.

{emails_block}

Website-Text (Homepage + Impressum/Team/Über-uns/Kontakt-Seiten):
{text[:12000]}
"""


def _build_prompt_sportverein(*, practice_name: str, text: str, emails_block: str) -> str:
    """Sportverein-Prompt: Vorstand statt Inhaber, Trainer statt Therapeuten.

    JSON-Struktur bleibt identisch zur Physio-/Ärzte-Variante, damit das
    Mapping in `crm/mapper.py` einheitlich bleibt — `owner_name` enthält
    den/die Präsident:in, `lead_therapist_name` ggf. die Vereinsleitung
    wenn separat (selten).
    """
    return f"""\
Du bist Sales-Researcher und analysierst die Website des Schweizer \
Sportvereins "{practice_name}". Extrahiere Vorstand, Trainer:innen, \
Kontaktdaten UND Sales-relevante Zusatzdaten. Antworte NUR mit einem \
JSON-Objekt, KEIN Markdown, KEINE Erklärung.

Schema (kompatibel zu Physio/Ärzte — die Auslegung der Felder folgt unten):
{{
  "owner_name": "Vor- und Nachname der/des Präsident:in (PRIO 1) oder \
Geschäftsführer:in. Suchorte: 'Vorstand', 'Präsident', 'Präsidium', \
'Kontakt', 'Über uns'. NIEMALS eine Firma oder ein Verein selbst.",
  "owner_source": "Wo extrahiert? 'vorstand'|'kontakt'|'about'|'andere' oder null",
  "owner_email": "MUSS aus den gefundenen E-Mails stammen — persönliche \
Adresse der/des Präsident:in oder null",
  "owner_phone": "Direkt-/Mobilnummer wenn explizit zugeordnet, sonst null",
  "owner_linkedin": "LinkedIn-URL der/des Präsident:in oder null",
  "owner_title": "Funktion im Vorstand: 'Präsident', 'Präsidentin', \
'Geschäftsführer:in', 'Vereinspräsident:in' oder null",
  "lead_therapist_name": "Vor- und Nachname Sportlicher Leitung / \
Cheftrainer:in / Vereinsleitung WENN unterschiedlich zur/zum Präsident:in \
— sonst null",
  "lead_therapist_email": "Persönliche Email aus der Liste oder null",
  "lead_therapist_phone": "Direkt-/Mobilnummer wenn explizit, sonst null",
  "team_members": [
    {{
      "name": "Vorname Nachname",
      "role": "z.B. Trainer:in U17, Vorstand Finanzen, Jugendkoordinator:in",
      "email": "persönliche Email aus der Liste oder null",
      "specializations": ["Disziplinen / Mannschaften / Aufgabenbereiche"],
      "linkedin": "LinkedIn-URL falls auf Website verlinkt, sonst null"
    }}
  ],
  "general_email": "Vereins-Hauptmail (info@/kontakt@/sekretariat@) aus der Liste oder null",
  "employee_count_physio": "Anzahl aktive Mitglieder als Integer (oder null) — \
das Feld heisst aus historischen Gründen 'physio', meint hier die Mitgliederzahl",
  "languages": ["Sprachen der Vereinsdokumentation als ISO-Codes (de, fr, en …)"],
  "specializations": ["Disziplinen / Sportarten des Vereins: 'Fussball', \
'Handball', 'Volleyball', 'Leichtathletik', 'Turnen', 'Schwimmen', \
'Unihockey', …"],
  "training_offered": ["Angebotene Trainingsgruppen: 'Aktive Herren', \
'Senior:innen', 'Jugend U10-U17', 'Kindersport', 'Plauschturnen', usw."],
  "insurance_accepted": null,
  "year_founded": "Gründungsjahr als Integer (oder null) — Vereine nennen \
das fast immer im 'Über uns'-Bereich",
  "locations": "Anzahl Trainingsstätten/Anlagen als Integer; null wenn unklar",
  "opening_hours_summary": "Kurze Trainingszeit-Übersicht oder null",
  "accepts_emergency_appointments": null,
  "has_online_booking": false,
  "online_booking_url": null,
  "practice_size": "klein (<50 Mitglieder)|mittel (50-200)|gross (>200)",
  "social_handles": {{
    "linkedin_company": "Vereins-LinkedIn-URL oder null",
    "instagram":         "Instagram-URL oder null",
    "facebook":          "Facebook-URL oder null",
    "youtube":           "URL oder null",
    "tiktok":            "URL oder null"
  }}
}}

Wichtige Regeln:
- owner_name = die/der Vereins-Präsident:in (oder Geschäftsführer:in). \
Echter Mensch mit Vor- und Nachname. NIEMALS eine Firma oder der Verein selbst.
- Vereine haben fast nie 'Online-Booking' im Sinne eines Termin-Widgets — \
has_online_booking = false setzen, online_booking_url = null.
- specializations = Sportarten / Disziplinen, NICHT 'Fitness' oder 'Wellness'.
- training_offered = strukturierte Trainingsgruppen / Angebote.
- LinkedIn/Social-URLs nur wenn WIRKLICH im Text — niemals raten.
- year_founded ist bei Vereinen ein wichtiger Glaubwürdigkeits-Marker. Bei \
unklaren Phrasen ('seit langem'): null statt zu raten.

{emails_block}

Website-Text (Homepage + Über-uns/Vorstand/Kontakt-Seiten):
{text[:12000]}
"""


# Dispatch table — keys must match `Profile.extractor_prompt_key`.
_PROMPT_BUILDERS = {
    "physio": _build_prompt_physio,
    "aerzte": _build_prompt_aerzte,
    "sportverein": _build_prompt_sportverein,
}
