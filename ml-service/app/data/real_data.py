"""Reads the ETL-populated Postgres tables, returning DataFrames with the same column
shapes as app/data/synthetic.py's generators — so app/data/features.py's pure feature
function works identically whether fed real or synthetic (test-fixture) data.

NDVI is region-level only (no crop_id) — see reference_data.py.
"""

from __future__ import annotations

from datetime import date

import pandas as pd

from app.db import get_connection


def _numeric_frame(rows: list[tuple], columns: list[str]) -> pd.DataFrame:
    """psycopg returns Postgres `numeric` columns as Decimal, which breaks pandas
    arithmetic (rolling/diff/pct_change) unless cast to float."""
    df = pd.DataFrame(rows, columns=columns)
    df["date"] = df["date"].astype(str)
    for col in columns[1:]:
        df[col] = df[col].astype(float)
    return df


def load_weather(region_id: str, start_date: date, end_date: date) -> pd.DataFrame:
    with get_connection() as conn:
        rows = conn.execute(
            """
            select date, temp_c, rainfall_mm, humidity_pct
            from weather_observations
            where region_id = %s and date between %s and %s
            order by date
            """,
            (region_id, start_date, end_date),
        ).fetchall()
    return _numeric_frame(rows, ["date", "tempC", "rainfallMm", "humidityPct"])


def load_ndvi(region_id: str, start_date: date, end_date: date) -> pd.DataFrame:
    with get_connection() as conn:
        rows = conn.execute(
            """
            select date, ndvi
            from ndvi_observations
            where region_id = %s and date between %s and %s
            order by date
            """,
            (region_id, start_date, end_date),
        ).fetchall()
    return _numeric_frame(rows, ["date", "ndvi"])


def load_prices(region_id: str, crop_id: str, start_date: date, end_date: date) -> pd.DataFrame:
    with get_connection() as conn:
        rows = conn.execute(
            """
            select date, modal_price_rs_per_quintal
            from mandi_prices
            where region_id = %s and crop_id = %s and date between %s and %s
            order by date
            """,
            (region_id, crop_id, start_date, end_date),
        ).fetchall()
    return _numeric_frame(rows, ["date", "modalPriceRsPerQuintal"])
