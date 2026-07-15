"""Real historical weather via Open-Meteo's Historical Weather API — free, no key, no signup.
https://open-meteo.com/en/docs/historical-weather-api
"""

from __future__ import annotations

from datetime import date

import httpx

from app.db import get_connection
from app.reference_data import Region

ARCHIVE_URL = "https://archive-api.open-meteo.com/v1/archive"


def fetch_weather(region: Region, start_date: date, end_date: date) -> int:
    """Fetches daily weather for a region's whole date range in one request (Open-Meteo
    doesn't paginate the archive endpoint) and upserts it. Returns rows written."""
    params = {
        "latitude": region.latitude,
        "longitude": region.longitude,
        "start_date": start_date.isoformat(),
        "end_date": end_date.isoformat(),
        "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,relative_humidity_2m_mean",
        "timezone": "auto",
    }
    resp = httpx.get(ARCHIVE_URL, params=params, timeout=30.0)
    resp.raise_for_status()
    daily = resp.json()["daily"]

    rows = []
    for i, day in enumerate(daily["time"]):
        temp_max = daily["temperature_2m_max"][i]
        temp_min = daily["temperature_2m_min"][i]
        temp_c = (temp_max + temp_min) / 2 if temp_max is not None and temp_min is not None else None
        rows.append((region.id, day, temp_c, daily["precipitation_sum"][i], daily["relative_humidity_2m_mean"][i]))

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                insert into weather_observations (region_id, date, temp_c, rainfall_mm, humidity_pct, fetched_at)
                values (%s, %s, %s, %s, %s, now())
                on conflict (region_id, date) do update set
                    temp_c = excluded.temp_c,
                    rainfall_mm = excluded.rainfall_mm,
                    humidity_pct = excluded.humidity_pct,
                    fetched_at = excluded.fetched_at
                """,
                rows,
            )
        conn.commit()
    return len(rows)
