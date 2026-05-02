"""
Lokales Upload-UI für Hyrox-SportsNow-Exporte (Kursplan, Abos, Rechnungen).

Start im Projektordner:
  streamlit run streamlit_upload.py

Dateinamen entsprechen den Mustern in update_dashboard.py (FILE_PATTERNS),
damit das Dashboard die Dateien automatisch findet.
"""

from __future__ import annotations

import re
from datetime import date
from pathlib import Path

import streamlit as st

from update_dashboard import (
    INPUT_HYROX_INVOICES,
    INPUT_HYROX_SCHEDULES,
    ensure_input_output_layout,
)


def _sanitize(s: str) -> str:
    s = s.strip().replace(" ", "_")
    return re.sub(r"[^\w.\-]+", "_", s)[:80] or "export"


def _month_options() -> list[str]:
    """Letzte 36 Monate als YYYY-MM."""
    today = date.today()
    y, m = today.year, today.month
    out: list[str] = []
    for _ in range(36):
        out.append(f"{y:04d}-{m:02d}")
        m -= 1
        if m < 1:
            m = 12
            y -= 1
    return out


KINDS = {
    "Kursplan (schedules)": (
        "schedules",
        lambda ym, extra: f"kineo-hyrox_schedules_{ym}{extra}.xlsx",
    ),
    "Aktive Abos (active passes)": (
        "schedules",
        lambda ym, extra: f"kineo-hyrox_active_passes_{ym}{extra}.xlsx",
    ),
    "Abgelaufene Abos (past passes)": (
        "schedules",
        lambda ym, extra: f"kineo-hyrox_past_passes_{ym}{extra}.xlsx",
    ),
    "Rechnungen (invoices)": (
        "invoices",
        lambda ym, extra: f"kineo-hyrox_invoices_{ym}{extra}.xlsx",
    ),
}


def main() -> None:
    st.set_page_config(page_title="Kineo Hyrox Upload", layout="centered")
    ensure_input_output_layout()

    st.title("Kineo – Hyrox-Dateien ablegen")
    st.markdown(
        "Lädt SportsNow-Excel-Exporte mit **eindeutigen Namen** nach "
        "`input/hyrox/schedules/<Monat>/` bzw. `input/hyrox/invoices/`. "
        "`update_dashboard.py` erkennt sie über die üblichen Dateimuster."
    )

    kind = st.selectbox("Dateityp", list(KINDS.keys()))
    month = st.selectbox("Monat (für Ordner & Namen)", _month_options())
    extra = st.text_input(
        "Zusatz im Dateinamen (optional, z. B. `quelle` oder `v2`)",
        placeholder="leer = Standardname",
    )
    extra_part = f"_{_sanitize(extra)}" if extra.strip() else ""

    area, name_fn = KINDS[kind]
    if area == "schedules":
        dest_dir = INPUT_HYROX_SCHEDULES / month
    else:
        dest_dir = INPUT_HYROX_INVOICES / month
    dest_dir.mkdir(parents=True, exist_ok=True)

    target_name = name_fn(month, extra_part)
    st.info(f"**Ziel:** `{dest_dir / target_name}`")

    uploaded = st.file_uploader("Excel-Datei (.xlsx)", type=["xlsx"])
    if uploaded and st.button("Speichern", type="primary"):
        path = dest_dir / target_name
        data = uploaded.getvalue()
        path.write_bytes(data)
        st.success(f"Gespeichert: `{path}`")
        st.caption("Anschließend `Dashboard_Aktualisieren.command` oder `python3 update_dashboard.py` ausführen.")


if __name__ == "__main__":
    main()
