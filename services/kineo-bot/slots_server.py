"""
Kineo OneDoc Slot-Server — läuft auf Hetzner Port 8098
Render holt Slots von hier statt direkt von OneDoc
"""
import ssl, json, urllib.request, urllib.parse
from datetime import date, timedelta
from collections import defaultdict
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import os
from fastapi import Header, HTTPException

SLOTS_API_KEY = os.environ.get("SLOTS_API_KEY", "")

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"], allow_headers=["*"])

def verify_key(x_api_key: str = Header(default="")):
    if SLOTS_API_KEY and x_api_key != SLOTS_API_KEY:
        raise HTTPException(status_code=403, detail="Forbidden")

BASE = "https://www.onedoc.ch"
HEADERS = {
    "User-Agent":       "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
    "Accept":           "application/json, */*",
    "Accept-Language":  "de-DE,de;q=0.9",
    "Referer":          "https://www.onedoc.ch/de/",
    "X-Requested-With": "XMLHttpRequest",
    "X-API-Version":    "1.2.0",
    "X-OneDoc-App":     "web-patient",
}
SSL_CTX = ssl.create_default_context()
SSL_CTX.check_hostname = False
SSL_CTX.verify_mode = ssl.CERT_NONE

STANDARD_APT_TYPE_ID = 176378

PRAXEN = [
    {"standort": "Seefeld", "entity_id": "50967", "therapeuten": [
        {"name": "Andrina Kümin",   "prof_id": "2907953", "calendar_id": "125442"},
        {"name": "Joëlle Ramseier", "prof_id": "2998987", "calendar_id": "128306"},
        {"name": "Helen Schwank",   "prof_id": "2907961", "calendar_id": "125445"},
        {"name": "Noah Stierli",    "prof_id": "2907964", "calendar_id": "125443"},
        {"name": "Sereina Urech",   "prof_id": "2907969", "calendar_id": "125444"},
        {"name": "Meike Vogel",     "prof_id": "2944269", "calendar_id": "126599"},
    ]},
    {"standort": "Wipkingen", "entity_id": "50970", "therapeuten": [
        {"name": "Eva Danko",        "prof_id": "2907150", "calendar_id": "125383"},
        {"name": "Raphael Hahner",   "prof_id": "2907166", "calendar_id": "125386"},
        {"name": "Sonia Montero",    "prof_id": "2907167", "calendar_id": "125387"},
        {"name": "Eve Schreurs",     "prof_id": "2999078", "calendar_id": "128319"},
        {"name": "Barbara Victorio", "prof_id": "2944281", "calendar_id": "126601"},
    ]},
    {"standort": "Stauffacher", "entity_id": "50968", "therapeuten": [
        {"name": "Andrina Kümin",   "prof_id": "2908008", "calendar_id": "125453"},
        {"name": "Emma Leu",        "prof_id": "2962676", "calendar_id": "127231"},
        {"name": "Carmen Weber",    "prof_id": "2911916", "calendar_id": "125641"},
    ]},
    {"standort": "Escher Wyss", "entity_id": "51318", "therapeuten": [
        {"name": "Clara Benning",   "prof_id": "2936879", "calendar_id": "126376"},
        {"name": "Annika Heinrich", "prof_id": "2936895", "calendar_id": "126377"},
        {"name": "Andreas Niggl",   "prof_id": "2936885", "calendar_id": "126378"},
    ]},
    {"standort": "Zollikon", "entity_id": "50971", "therapeuten": [
        {"name": "Helen Schwank", "prof_id": "2907110", "calendar_id": "125377"},
        {"name": "Meike Vogel",   "prof_id": "2944266", "calendar_id": "126598"},
    ]},
    {"standort": "Thalwil", "entity_id": "50969", "therapeuten": [
        {"name": "Emma Leu",           "prof_id": "2962677", "calendar_id": "127230"},
        {"name": "Andreas Niggl",      "prof_id": "2907180", "calendar_id": "125439"},
        {"name": "Hanna Raffeiner",    "prof_id": "2907170", "calendar_id": "125395"},
        {"name": "Joëlle Ramseier",    "prof_id": "3056625", "calendar_id": "129911"},
    ]},
]

PRAXEN_BY_NAME = {p["standort"]: p for p in PRAXEN}


def api_get(path: str, params: dict = None):
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, context=SSL_CTX, timeout=15) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        return e.code, None
    except Exception as ex:
        print(f"API Fehler: {ex}")
        return 0, None


def get_apt_type_id(entity_id: str, prof_id: str) -> str:
    for ct in ["established", "new"]:
        status, data = api_get(
            f"/api/entities/{entity_id}/bookable-appointment-types",
            {"professionalId": prof_id, "acceptedClientType": ct},
        )
        if status == 200 and data:
            typen = data.get("data", [])
            for t in typen:
                if t.get("appointmentTypeId") == STANDARD_APT_TYPE_ID:
                    return str(STANDARD_APT_TYPE_ID)
            if typen:
                return str(typen[0]["appointmentTypeId"])
    return str(STANDARD_APT_TYPE_ID)


def fetch_slots(entity_id: str, prof_id: str, calendar_id: str,
                apt_type_id: str, von: str, bis: str, name: str) -> list:
    status, data = api_get(
        f"/api/v1/locations/{entity_id}/availabilities",
        {
            "professionId": "53",
            "startDate": von,
            "endDate": bis,
            "professionalId": prof_id,
            "appointmentTypeId": apt_type_id,
            "acceptedClientType": "established",
            "selectUniqueAppointmentTypePerDay": "true",
            "field": "availabilities:timeSlots,nextTimeSlotOn",
        },
    )
    if status != 200 or not data:
        return []
    time_slots = data.get("data", {}).get("timeSlots", {})
    slots = []
    for datum, slot_list in time_slots.items():
        for ts in slot_list:
            dt = ts.get("dateTime", "")
            slots.append({
                "datum": datum,
                "zeit": dt[11:16] if len(dt) > 10 else "",
                "datetime_iso": dt,
                "therapeut": name,
                "prof_id": prof_id,
                "calendar_id": calendar_id,
                "appointment_type_id": apt_type_id,
                "entity_id": entity_id,
            })
    return slots


@app.get("/slots")
def get_slots(standort: str = "", tage: int = 14, x_api_key: str = Header(default="")):
    verify_key(x_api_key)
    heute = date.today()
    bis = heute + timedelta(days=tage)
    von_str = heute.isoformat()
    bis_str = bis.isoformat()

    praxen = [PRAXEN_BY_NAME[standort]] if standort and standort in PRAXEN_BY_NAME else PRAXEN

    alle_slots = []
    for praxis in praxen:
        entity_id = praxis["entity_id"]
        for th in praxis["therapeuten"]:
            apt_type_id = get_apt_type_id(entity_id, th["prof_id"])
            slots = fetch_slots(entity_id, th["prof_id"], th["calendar_id"],
                                apt_type_id, von_str, bis_str, th["name"])
            alle_slots.extend(slots)

    by_date = defaultdict(list)
    for s in alle_slots:
        by_date[s["datum"]].append(s)

    freie_tage = []
    for datum in sorted(by_date.keys()):
        slots_day = sorted(by_date[datum], key=lambda x: x["zeit"])
        freie_tage.append({"datum": datum, "anzahl": len(slots_day), "slots": slots_day[:12]})

    standort_name = standort if standort else "Alle Standorte"
    return JSONResponse({
        "standort": standort_name,
        "zeitraum": f"{von_str} – {bis_str}",
        "freie_tage": freie_tage,
        "total_slots": len(alle_slots),
    })


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/buchen")
async def buchen_playwright(request: Request):
    """OneDoc Buchung via Playwright headless browser — umgeht Cloudflare."""
    body = await request.json()

    # Required fields
    entity_id          = str(body.get("entityId") or body.get("entity_id", ""))
    prof_id            = str(body.get("professionalId") or body.get("prof_id", ""))
    calendar_id        = str(body.get("calendarId") or body.get("calendar_id", ""))
    apt_type_id        = str(body.get("appointmentTypeId") or body.get("appointment_type_id", "176378"))
    datetime_iso       = body.get("startDateTime") or body.get("datetime_iso", "")
    patient            = body.get("patient", {})
    first_name         = patient.get("firstName", "")
    last_name          = patient.get("lastName", "")
    birth_date         = patient.get("birthDate", "")   # YYYY-MM-DD
    phone              = patient.get("phoneNumber", "")
    email              = patient.get("email", "")

    if not all([entity_id, prof_id, calendar_id, datetime_iso, first_name, last_name]):
        return JSONResponse({"error": "Fehlende Pflichtfelder"}, status_code=400)

    # Convert birth_date YYYY-MM-DD → DD.MM.YYYY for OneDoc form
    dob_display = birth_date
    if birth_date and "-" in birth_date:
        parts = birth_date.split("-")
        if len(parts) == 3:
            dob_display = f"{parts[2]}.{parts[1]}.{parts[0]}"

    # Build OneDoc booking URL
    date_part = datetime_iso[:10]
    time_part = datetime_iso[11:16]
    booking_url = (
        f"https://www.onedoc.ch/de/physiotherapeut/zuerich/{entity_id}/book"
        f"?professionalId={prof_id}"
        f"&calendarId={calendar_id}"
        f"&appointmentTypeId={apt_type_id}"
        f"&date={date_part}"
        f"&time={time_part.replace(':', '%3A')}"
    )

    print(f"Playwright booking: {first_name} {last_name} @ {booking_url}")

    try:
        from playwright.async_api import async_playwright
        async with async_playwright() as p:
            browser = await p.chromium.launch(
                headless=True,
                args=["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
            )
            ctx = await browser.new_context(
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
                locale="de-CH",
                timezone_id="Europe/Zurich",
            )
            page = await ctx.new_page()

            # Navigate to booking page
            await page.goto(booking_url, wait_until="networkidle", timeout=30000)
            await page.wait_for_timeout(2000)

            print(f"Page title: {await page.title()}")
            print(f"URL after load: {page.url}")

            # Fill patient form - OneDoc form fields
            # First name
            fn_sel = 'input[name="firstName"], input[placeholder*="Vorname"], input[id*="first"]'
            if await page.locator(fn_sel).count() > 0:
                await page.locator(fn_sel).first.fill(first_name)

            # Last name
            ln_sel = 'input[name="lastName"], input[placeholder*="Nachname"], input[id*="last"]'
            if await page.locator(ln_sel).count() > 0:
                await page.locator(ln_sel).first.fill(last_name)

            # Birth date
            dob_sel = 'input[name="birthDate"], input[placeholder*="Geburtsdatum"], input[placeholder*="datum"]'
            if await page.locator(dob_sel).count() > 0:
                await page.locator(dob_sel).first.fill(dob_display)

            # Phone
            if phone:
                ph_sel = 'input[name="phone"], input[type="tel"], input[placeholder*="Telefon"]'
                if await page.locator(ph_sel).count() > 0:
                    await page.locator(ph_sel).first.fill(phone)

            # Email
            if email:
                em_sel = 'input[name="email"], input[type="email"]'
                if await page.locator(em_sel).count() > 0:
                    await page.locator(em_sel).first.fill(email)

            await page.wait_for_timeout(500)

            # Screenshot for debugging
            screenshot = await page.screenshot(type="jpeg", quality=60)
            import base64
            screenshot_b64 = base64.b64encode(screenshot).decode()

            # Check if form is visible
            submit_sel = 'button[type="submit"], button:has-text("Buchen"), button:has-text("Bestätigen"), button:has-text("Confirm")'
            has_submit = await page.locator(submit_sel).count() > 0

            if not has_submit:
                await browser.close()
                return JSONResponse({
                    "error": "Buchungsformular nicht gefunden",
                    "url": page.url,
                    "debug_screenshot": screenshot_b64[:100] + "...",
                }, status_code=422)

            # Click submit
            await page.locator(submit_sel).first.click()
            await page.wait_for_timeout(3000)

            final_url = page.url
            final_title = await page.title()
            print(f"After submit: {final_url}")

            # Check for success indicators
            success = any([
                "confirm" in final_url.lower(),
                "success" in final_url.lower(),
                "bestätigung" in final_title.lower(),
                await page.locator(':text("Termin bestätigt"), :text("confirmed"), :text("Bestätigung")').count() > 0,
            ])

            final_screenshot = await page.screenshot(type="jpeg", quality=60)
            final_b64 = base64.b64encode(final_screenshot).decode()

            await browser.close()

            if success:
                return JSONResponse({
                    "success": True,
                    "appointment_id": f"pw_{date_part}_{prof_id}",
                    "therapeut": body.get("therapeut", f"{first_name} {last_name}"),
                    "standort": body.get("standort", ""),
                    "datum": date_part,
                    "zeit": time_part,
                    "method": "playwright",
                })
            else:
                return JSONResponse({
                    "error": f"Buchung möglicherweise fehlgeschlagen — bitte auf OneDoc prüfen",
                    "url": final_url,
                    "booking_url": booking_url,
                    "method": "playwright",
                }, status_code=200)  # 200 so frontend shows the message

    except Exception as e:
        print(f"Playwright error: {e}")
        import traceback
        traceback.print_exc()
        return JSONResponse({
            "error": f"Buchungsfehler: {str(e)}",
            "booking_url": booking_url,
        }, status_code=500)


SPORTSNOW_PROVIDER_ID = "5764"  # Kineo Hyrox

@app.get("/hyrox-kurse")
def get_hyrox_kurse(x_api_key: str = Header(default="")):
    verify_key(x_api_key)
    from datetime import date, timedelta
    import json, urllib.request as ur

    heute = date.today()
    payload = json.dumps({
        "date": heute.isoformat(),
        "start_at_beginning_of_week": True
    }).encode()

    req = ur.Request(
        f"https://www.sportsnow.ch/platform/api/v1/public/provider/{SPORTSNOW_PROVIDER_ID}/live_calendar",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
        }
    )
    try:
        with ur.urlopen(req, timeout=10) as r:
            data = json.loads(r.read().decode())
        return JSONResponse({"success": True, "data": data, "provider": "kineo-hyrox"})
    except Exception as e:
        # Fallback: return static schedule
        return JSONResponse({
            "success": False,
            "error": str(e),
            "fallback": True,
            "stundenplan": {
                "Montag":    ["06:30–07:30 Hyrox", "18:00–19:00 Full Body Strength"],
                "Dienstag":  ["06:30–07:30 Full Body Strength", "19:15–20:15 Hyrox"],
                "Mittwoch":  ["19:15–20:15 BOOTY L.B. Strength"],
                "Donnerstag":["09:50–10:50 Full Body Strength", "19:15–20:15 Hyrox"],
                "Freitag":   ["11:00–12:00 Hyrox"],
            },
            "buchung_url": "https://www.sportsnow.ch/go/kineo-hyrox/classes"
        })
