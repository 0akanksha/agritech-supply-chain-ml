"""Real mandi prices via data.gov.in's Agmarknet resource
(https://www.data.gov.in/apis/9ef84268-d588-465a-a308-a864a43d0070) — needs a free personal
API key (see ml-service/.env.example; DATA_GOV_IN_API_KEY).

Prices are matched by state + commodity, not an exact market (see reference_data.py for why),
and aggregated to a daily state-wide mean modal price per region+crop.

NOTE: exact field names/date format below are based on the OGD platform's documented
conventions for this resource; `_parse_date` and `_field` are written defensively (try a
few known variants) since they haven't been confirmed against a live response yet — do that
first when DATA_GOV_IN_API_KEY becomes available, before trusting a full backfill.
"""

from __future__ import annotations

import os
import statistics
from collections import defaultdict
from datetime import date, datetime

import httpx

from app.db import get_connection
from app.reference_data import Crop, Region

RESOURCE_URL = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070"
PAGE_LIMIT = 500

DATE_FIELDS = ("arrival_date", "report_date", "price_date")
DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d")


class DataGovInKeyMissing(RuntimeError):
    pass


def _api_key() -> str:
    key = os.environ.get("DATA_GOV_IN_API_KEY")
    if not key:
        raise DataGovInKeyMissing(
            "DATA_GOV_IN_API_KEY is not set (see ml-service/.env.example) — sign up at data.gov.in"
        )
    return key


def _field(record: dict, *names: str) -> str | None:
    for name in names:
        if name in record and record[name] not in (None, ""):
            return record[name]
    return None


def _parse_date(record: dict) -> date | None:
    raw = _field(record, *DATE_FIELDS)
    if not raw:
        return None
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(raw, fmt).date()
        except ValueError:
            continue
    return None


def fetch_prices(region: Region, crop: Crop, start_date: date, end_date: date) -> int:
    """Fetches daily mandi price records for a crop across a region's state, aggregates
    to a state-wide daily mean modal price, and upserts. Returns rows written."""
    api_key = _api_key()

    daily_prices: dict[date, list[float]] = defaultdict(list)
    offset = 0
    with httpx.Client(timeout=30.0) as client:
        while True:
            resp = client.get(
                RESOURCE_URL,
                params={
                    "api-key": api_key,
                    "format": "json",
                    "limit": PAGE_LIMIT,
                    "offset": offset,
                    "filters[state.keyword]": region.state,
                    "filters[commodity]": crop.name,
                },
            )
            resp.raise_for_status()
            payload = resp.json()
            records = payload.get("records", [])
            if not records:
                break

            for rec in records:
                d = _parse_date(rec)
                if d is None or d < start_date or d > end_date:
                    continue
                modal_price_raw = _field(rec, "modal_price")
                try:
                    modal_price = float(modal_price_raw)
                except (TypeError, ValueError):
                    continue
                daily_prices[d].append(modal_price)

            offset += len(records)
            total = payload.get("total")
            if len(records) < PAGE_LIMIT or (total is not None and offset >= int(total)):
                break

    rows = [
        (region.id, crop.id, d, statistics.mean(prices), len(prices)) for d, prices in daily_prices.items()
    ]
    if not rows:
        return 0

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                insert into mandi_prices (region_id, crop_id, date, modal_price_rs_per_quintal, sample_count, source, fetched_at)
                values (%s, %s, %s, %s, %s, 'agmarknet', now())
                on conflict (region_id, crop_id, date) do update set
                    modal_price_rs_per_quintal = excluded.modal_price_rs_per_quintal,
                    sample_count = excluded.sample_count,
                    source = 'agmarknet',
                    fetched_at = excluded.fetched_at
                """,
                rows,
            )
        conn.commit()
    return len(rows)
