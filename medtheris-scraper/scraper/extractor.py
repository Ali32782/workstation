"""
LLM-based structured extraction from practice website text.

Sends merged homepage + team/contact subpage text plus the harvested email
list to Claude and asks for a structured JSON describing:
  - Inhaber (owner_name + owner_email)
  - Leitender Therapeut (lead_therapist_name + lead_therapist_email)
  - Generic practice contact (general_email — info@/kontakt@)
  - Team-Größe, Sprachen, Spezialisierungen, Buchungs-System

The prompt forces the model to PICK matching emails from the harvested list
instead of hallucinating, which is the main reliability lever.
"""
import json
import os
import re

import anthropic


_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929")
_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)


def extract_structured_data(text: str, practice_name: str,
                            emails_found: list[str] | None = None) -> dict:
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

    prompt = f"""\
Du bist Sales-Researcher und analysierst die Website der Schweizer \
Physiotherapie-Praxis "{practice_name}". Extrahiere Personen, Kontaktdaten \
und Praxis-Profil. Antworte NUR mit einem JSON-Objekt, KEIN Markdown, \
KEINE Erklärung.

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
      "specializations": ["optional, Liste der Spezialisierungen dieser Person"]
    }}
  ],
  "general_email": "Allgemeine Praxis-E-Mail aus den gefundenen E-Mails \
(typisch info@..., kontakt@..., praxis@...) oder null",
  "employee_count_physio": "Anzahl Physiotherapeut:innen im Team als Integer (oder null)",
  "languages": ["Sprachen der Praxis als ISO-Codes z.B. de, fr, it, en"],
  "specializations": ["Spezialisierungen der Praxis als Ganzes"],
  "has_online_booking": true|false,
  "practice_size": "klein|mittel|gross"
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
  BEISPIEL: Impressum sagt "PhysioBasel AG, Oetlingerstrasse 2", Team sagt \
"Stefano Limone — Gründer, Physiotherapeut" → owner_name="Stefano Limone", \
owner_source="team".
- "Leitender Therapeut" = Praxisleitung wenn nicht selbst Inhaber. \
Erkennbar an Rollen wie "Praxisleitung", "Zentrumsleiter:in", "Fachliche \
Leitung", "Leitende:r Therapeut:in".
- Wenn Inhaber UND leitende:r Therapeut:in dieselbe Person sind: \
owner_name ausfüllen, lead_therapist_name = null.
- owner_source NUR ausfüllen wenn owner_name nicht null ist; sonst owner_source = null.
- team_members: ALLE im Team genannten Therapeut:innen aufzählen (auch der \
Inhaber selbst — er gehört dort hinein UND nach owner_name). Wenn keine \
Team-Liste sichtbar: leeres Array [].
- Email-Zuordnung: Match Vor-/Nachname mit E-Mail-Local-Part ("anna@praxis.ch" \
gehört zu Anna, "a.mueller@praxis.ch" zu Anna Mueller). Wenn unklar: null statt raten.
- Telefon-Zuordnung: NUR setzen wenn die Nummer explizit dem Namen zugeordnet \
ist (z.B. "Anna Müller, Mobile +41 79 123 45 67"). Die Praxis-Hauptnummer \
NIEMALS als Person-Direktnummer übernehmen.
- practice_size: klein (1-2 Therapeut:innen), mittel (3-6), gross (>6).
- has_online_booking: true wenn die Website "online buchen", "Termin buchen", \
einen Buchungs-Widget (OneDoc, Doctolib, Samedi) oder einen Link dorthin enthält.

{emails_block}

Website-Text (Homepage + Impressum/Team/Über-uns/Kontakt-Seiten):
{text[:12000]}
"""

    client = anthropic.Anthropic()
    message = client.messages.create(
        model=_MODEL,
        max_tokens=2000,  # raised — team_members list adds tokens
        messages=[{"role": "user", "content": prompt}],
    )

    raw = "".join(
        block.text for block in message.content if hasattr(block, "text")
    ).strip()

    candidates = []
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
