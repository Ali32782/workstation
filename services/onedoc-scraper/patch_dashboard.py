"""
Einmalig ausführen um die neue Version zu installieren.
Führt automatisch alle nötigen Änderungen am update_dashboard.py durch.
"""
import re
from pathlib import Path

script = Path(__file__).parent / "update_dashboard.py"
src = script.read_text()

if "non_returning" in src:
    print("✓ Bereits aktuell — kein Patch nötig")
    exit()

print("Patching update_dashboard.py...")

# PATCH 1: result dict — add non_returning keys
old1 = '"conversion": {"trial": 0, "converted": 0, "rate": 0},\n    }'
new1 = '"conversion": {"trial": 0, "converted": 0, "rate": 0},\n        "non_returning": [], "non_returning_by_type": [],\n    }'
src = src.replace(old1, new1)

# PATCH 2: after Trial Conversion block, add non-returning calculation
old2 = '        print(f"  → Hyrox Total Revenue: CHF {result[\'total_revenue\']:,.0f}")'
new2 = '''        # Non-returning customers
        if active_path and active_path.exists() and past_path and past_path.exists():
            import pandas as _pd
            _active = _pd.read_excel(active_path, header=0)
            _past   = _pd.read_excel(past_path,   header=0)
            _active.columns = _active.columns.str.strip()
            _past.columns   = _past.columns.str.strip()
            _active_ids = set(_active["Kunde"].unique())
            _past_ids   = set(_past["Kunde"].unique())
            _nr_ids = _past_ids - _active_ids
            _nr = _past[_past["Kunde"].isin(_nr_ids)].copy()
            _nr["Gültig bis"] = _pd.to_datetime(_nr["Gültig bis"], dayfirst=True, errors="coerce")
            _nr = _nr.sort_values("Gültig bis", ascending=False).drop_duplicates("Kunde", keep="first")
            _nr = _nr.sort_values("Gültig bis", ascending=False)
            result["non_returning"] = _nr[
                [c for c in ["Vorname","Name","E-Mail","Abonnement","Gültig bis","Total"] if c in _nr.columns]
            ].to_dict("records")
            result["non_returning_by_type"] = _nr.groupby("Abonnement").agg(
                Anzahl=("Kunde","count"), Umsatz=("Total","sum")
            ).sort_values("Anzahl", ascending=False).reset_index().to_dict("records")
            print(f"  → Nicht-wiederkehrende Kunden: {len(_nr)}")

        print(f"  → Hyrox Total Revenue: CHF {result[\'total_revenue\']:,.0f}")'''
src = src.replace(old2, new2)

# PATCH 3: Add non-returning display at end of write_hyrox (before col widths)
old3 = '    for c,w in [(1,14),(2,7),(3,8),(4,10),(5,8),(6,8),(7,9),(8,12),(9,14),(10,8),(11,8),(12,8),(13,8),(14,8)]:\n        ws.column_dimensions[gcl(c)].width=w\n\n\ndef write_simple_sheet'
new3 = '''    for c,w in [(1,14),(2,7),(3,8),(4,10),(5,8),(6,8),(7,9),(8,12),(9,14),(10,8),(11,8),(12,8),(13,8),(14,8)]:
        ws.column_dimensions[gcl(c)].width=w

    # Nicht-wiederkehrende Kunden
    r_nr_start = ws.max_row + 2
    nr_list      = hy_data.get("non_returning", [])
    nr_type_list = hy_data.get("non_returning_by_type", [])
    if nr_list:
        sec(ws, r_nr_start, f"NICHT-WIEDERKEHRENDE KUNDEN – kein Folge-Kauf · Total: {len(nr_list)} Kunden", cols=14, bg="FEE2E2")
        hdr(ws, r_nr_start+1, ["Abo-Typ","Anzahl","Umsatz (CHF)","Empfehlung"], bg="7F1D1D")
        for idx, rd in enumerate(nr_type_list, r_nr_start+2):
            bg = "F8FAFC" if idx%2==0 else "FFFFFF"
            dc(ws,idx,1,rd.get("Abonnement",""),bg,bold=True,h="left")
            dc(ws,idx,2,rd.get("Anzahl",0),bg,h="center")
            dc(ws,idx,3,rd.get("Umsatz",0),bg,fmt="#\'##0.00")
            dc(ws,idx,4,"Re-Aktivierung per E-Mail" if "Trial" in str(rd.get("Abonnement","")) else "Angebot senden",bg,h="left",sz=9,color="D97706")
        r_det = r_nr_start + 2 + len(nr_type_list) + 2
        sec(ws, r_det, "DETAIL – Retargeting-Liste", cols=14, bg="FEF2F2")
        hdr(ws, r_det+1, ["Vorname","Name","E-Mail","Letztes Abo","Gültig bis","Betrag (CHF)"], bg="7F1D1D")
        for idx, rd in enumerate(nr_list, r_det+2):
            bg = "F8FAFC" if idx%2==0 else "FFFFFF"
            dc(ws,idx,1,rd.get("Vorname",""),bg,h="left")
            dc(ws,idx,2,rd.get("Name",""),bg,h="left")
            dc(ws,idx,3,rd.get("E-Mail",""),bg,h="left",sz=9)
            dc(ws,idx,4,rd.get("Abonnement",""),bg,h="left",sz=9)
            dc(ws,idx,5,str(rd.get("Gültig bis",""))[:10],bg,h="center")
            dc(ws,idx,6,rd.get("Total",0),bg,fmt="#\'##0.00")
        r_tot = r_det + 2 + len(nr_list)
        hdr(ws, r_tot, ["TOTAL","",f"{len(nr_list)} Kunden","","",f"=SUM(F{r_det+2}:F{r_tot-1})"], bg="7F1D1D")
        ws.cell(r_tot,6).number_format = "#\'##0.00"


def write_simple_sheet'''
src = src.replace(old3, new3)

if "non_returning" in src:
    script.write_text(src)
    print("✅ Patch erfolgreich — update_dashboard.py aktualisiert")
    print("   Jetzt: python3 update_dashboard.py")
else:
    print("❌ Patch fehlgeschlagen — Struktur nicht erkannt")
