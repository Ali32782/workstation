import re, pathlib

f = pathlib.Path.home() / "onedoc_scraper/scraper_api.py"
code = f.read_text()

old = '''    availabilities = (
        data.get("data", {}).get("availabilities") or
        data.get("availabilities") or
        []
    )

    # Flach: alle timeSlots aus allen Tagen sammeln
    slots = []
    for day in availabilities:
        date = day.get("date", "")
        for ts in day.get("timeSlots", []):
            slots.append({
                "date":      date,
                "startTime": ts.get("startTime") or ts.get("start") or ts,
                "booked":    ts.get("booked", False),
            })

    freie = [s for s in slots if not s.get("booked")]
    log.info(f"    → {len(freie)} freie Slots über {len(availabilities)} Tage")
    return freie'''

new = '''    time_slots = data.get("data", {}).get("timeSlots", {})
    slots = []
    for datum, slot_list in time_slots.items():
        for ts in slot_list:
            slots.append({"date": datum, "startTime": ts.get("dateTime",""), "booked": False})
    log.info(f"    → {len(slots)} freie Slots")
    return slots'''

if old in code:
    f.write_text(code.replace(old, new))
    print("✓ Patch angewendet")
else:
    print("Pattern nicht gefunden – zeige aktuelle get_slots Funktion:")
    for i, line in enumerate(code.split('\n')):
        if 'def get_slots' in line or 'availab' in line.lower() or 'timeSlot' in line:
            print(f"  {i+1}: {line}")
