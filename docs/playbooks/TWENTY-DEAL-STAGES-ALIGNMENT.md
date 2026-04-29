# Twenty: Deal-Stages mit Sales abstimmen

> **Ziel:** Vor größerem Kanban / Automatisierung (Welle 4) dieselben
> **Opportunity-Stages** in Twenty haben, die das Team in Meetings und
> Forecasts wirklich nutzt — sonst driftet das CRM täglich.

## Checkliste (ein Meeting, 30–45 Min.)

1. **Ist-Zustand** in Twenty öffnen: Settings → Objekte / Pipeline (je nach Twenty-Version) oder bestehende Opportunities nach `stage` sortieren.
2. **Benennungen** auf Deutsch oder Englisch **einheitlich** festlegen (ein Wort pro Stage, keine Doppelungen).
3. **Pflichtstufen** für MedTheris-Sales klären, mindestens:
   - Eingang (z. B. `NEW` — passt zu Lead-Inbox / Web-Form)
   - Qualifiziert (Portal nutzt u. a. `QUALIFIED` nach Lead-Approve)
   - Spätere Phasen bis „Won“ / „Lost“ — **ein** klares Lost-Label (Portal-Inbox: `LOST` bei Verwerfen)
4. **Wer darf** Stages ändern? (Ideal: nur wenige Rollen, sonst verwässert die Pipeline-Statistik.)
5. **Ergebnis dokumentieren:** kurze Tabelle „Stage-Name → Bedeutung (ein Satz)“ ins Team-Wiki oder Notion; optional Screenshot der Twenty-Pipeline.

## Bezug zum Portal

- **Code-Referenz (Defaults):** `portal/src/lib/crm/opportunity-stages.ts` — dort sind
  `NEW` / `QUALIFIED` / `LOST` und die Kanban-Standardspalten zentral benannt;
  Lead-Inbox, Public-Lead und API-Routen nutzen dieselben Konstanten.
- Lead-Inbox / Approve / Reject setzen Stages auf Werte, die **im jeweiligen Twenty-Workspace existieren müssen** (`NEW`, `QUALIFIED`, `LOST` — bei Abweichung Twenty oder Portal-API anpassen).
- CRM-Einstellungen im Portal (`…/crm/settings`) zeigen eine **Heuristik** der Pipeline aus vorhandenen Deals — kein Ersatz für die Abstimmung oben.

## Owner / Review

- **Owner:** Sales-Lead + wer Twenty administriert.  
- **Review:** wenn sich Angebotsphasen ändern oder neues Segment dazukommt.
