"""Real satellite NDVI via the ORNL DAAC MODIS/VIIRS subset REST service — free, no key,
no signup: https://modis.ornl.gov/data/modis_webservice.html

Product MOD13Q1 (16-day composite, 250m), band 250m_16_days_NDVI, scale factor 0.0001.
NDVI is region-level only (satellites observe land, not crop labels) — see reference_data.py.
"""

from __future__ import annotations

from datetime import date, timedelta

import httpx

from app.db import get_connection
from app.reference_data import Region

BASE_URL = "https://modis.ornl.gov/rst/api/v1"
PRODUCT = "MOD13Q1"
BAND = "250m_16_days_NDVI"
SCALE = 0.0001
# The service errors ("exceeds maximum subset tiles support of 10") past 10 composite
# dates per request; a 16-day cadence means ~8-9 dates in 140 days, safely under that.
WINDOW_DAYS = 140


def _to_modis_date(d: date) -> str:
    return f"A{d.year}{d.timetuple().tm_yday:03d}"


def fetch_ndvi(region: Region, start_date: date, end_date: date) -> int:
    """Fetches MOD13Q1 NDVI for a region across [start_date, end_date], paginating in
    ~140-day windows, and upserts it. Returns rows written."""
    rows: list[tuple] = []

    with httpx.Client(timeout=60.0) as client:
        window_start = start_date
        while window_start <= end_date:
            window_end = min(window_start + timedelta(days=WINDOW_DAYS), end_date)
            try:
                resp = client.get(
                    f"{BASE_URL}/{PRODUCT}/subset",
                    params={
                        "latitude": region.latitude,
                        "longitude": region.longitude,
                        "startDate": _to_modis_date(window_start),
                        "endDate": _to_modis_date(window_end),
                        "kmAboveBelow": 0,
                        "kmLeftRight": 0,
                        "band": BAND,
                    },
                )
                resp.raise_for_status()
                payload = resp.json()
            except httpx.HTTPError:
                # MODIS composites lag real time by weeks-to-months, and very recent
                # windows can 400 before data is processed — skip and keep going.
                window_start = window_end + timedelta(days=1)
                continue

            if isinstance(payload, dict):
                for point in payload.get("subset", []):
                    values = point.get("data") or []
                    if values and values[0] is not None:
                        ndvi = values[0] * SCALE
                        rows.append((region.id, point["calendar_date"], ndvi))

            window_start = window_end + timedelta(days=1)

    if not rows:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                insert into ndvi_observations (region_id, date, ndvi, fetched_at)
                values (%s, %s, %s, now())
                on conflict (region_id, date) do update set
                    ndvi = excluded.ndvi,
                    fetched_at = excluded.fetched_at
                """,
                rows,
            )
        conn.commit()
    return len(rows)
