"""One-off: loads a static historical mandi-price CSV (e.g. the Kaggle mirror of the same
Agmarknet "Current Daily Price of Various Commodities" dataset — see README) into the
mandi_prices table, as a real-but-not-live substitute for the live Agmarknet API while a
data.gov.in key isn't available.

Reads in chunks so it's safe against a very large file (this dataset family covers years of
data across every commodity and market in India — we only keep the rows that match our 6
regions' states and 5 tracked crops). Column names vary across exports of this same underlying
government dataset (plain "State"/"Commodity"/"Arrival_Date", or XML-escaped variants like
"Modal_x0020_Price" from older SOAP-based exports) — _normalize_columns handles both.

Every date-windowed query in this app (training's 730-day lookback, the dashboard's 365-day
chart window, predict.py's 120-day feature window) is anchored to the real wall-clock date,
which is correct for the genuinely live sources (weather, NDVI) but means a *static* CSV whose
dates don't advance would otherwise silently fall outside every window and never actually get
read by anything, once enough real time has passed since the file was exported. So the whole
loaded window is shifted forward so its most recent date lands on "yesterday," preserving the
real day-to-day price relationships (still tagged source='kaggle_agmarknet' — it's a recency
shift, not fabricated data; the price values and their relative movement are exactly what was
recorded).

Tagged source='kaggle_agmarknet': ranks above synthetic_placeholder (gets overwritten by it)
but below live 'agmarknet' data (never overwrites it), via the same conditional-upsert pattern
as seed_placeholder_prices.py.

Run from ml-service/: `python -m app.etl.load_kaggle_prices --file data/kaggle_prices.csv`
"""

from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd

from app.db import get_connection
from app.reference_data import CROPS, REGIONS

CHUNK_SIZE = 200_000
DATE_FORMATS = ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d-%b-%y", "%d-%b-%Y")

# Logical field -> candidate normalized column names, in priority order.
COLUMN_CANDIDATES: dict[str, list[str]] = {
    "state": ["state", "state_name"],
    "commodity": ["commodity", "commodity_name"],
    "date": ["arrival_date", "price_date", "date", "reported_date"],
    "modal_price": ["modal_price", "modal_price_rs_quintal"],
}

STATE_TO_REGION_IDS: dict[str, list[str]] = defaultdict(list)
for region in REGIONS:
    STATE_TO_REGION_IDS[region.state.lower()].append(region.id)

CROP_NAME_TO_ID: dict[str, str] = {crop.name.lower(): crop.id for crop in CROPS}


def _normalize_columns(df: pd.DataFrame) -> pd.DataFrame:
    df.columns = (
        df.columns.str.replace("_x0020_", " ", regex=False)
        .str.strip()
        .str.lower()
        .str.replace(r"[\s_]+", "_", regex=True)
    )
    return df


def _resolve_columns(columns: pd.Index) -> dict[str, str]:
    resolved: dict[str, str] = {}
    missing: list[str] = []
    for field, candidates in COLUMN_CANDIDATES.items():
        match = next((c for c in candidates if c in columns), None)
        if match is None:
            missing.append(field)
        else:
            resolved[field] = match
    if missing:
        raise ValueError(
            f"Couldn't find columns for {missing} in this CSV. "
            f"Available columns: {list(columns)}. Add the real header name(s) to "
            "COLUMN_CANDIDATES in this file and re-run."
        )
    return resolved


def _parse_date(raw: str) -> date | None:
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(str(raw).strip(), fmt).date()
        except ValueError:
            continue
    return None


def load(file_path: Path) -> int:
    # (region_id, crop_id, parsed_date) -> list of modal prices seen, averaged at the end
    # (matches the live ETL's "daily state-wide mean modal price" aggregation — see etl/prices.py).
    accumulated: dict[tuple[str, str, date], list[float]] = defaultdict(list)
    columns_resolved = False
    cols: dict[str, str] = {}
    rows_scanned = 0

    for chunk in pd.read_csv(file_path, chunksize=CHUNK_SIZE, low_memory=False, dtype=str):
        chunk = _normalize_columns(chunk)
        if not columns_resolved:
            cols = _resolve_columns(chunk.columns)
            print(f"[load_kaggle_prices] resolved columns: {cols}", file=sys.stderr)
            columns_resolved = True

        rows_scanned += len(chunk)
        # itertuples() renames leading-underscore columns (namedtuples disallow them), so
        # these can't be named `_state`/`_commodity`.
        chunk["match_state"] = chunk[cols["state"]].str.strip().str.lower()
        chunk["match_commodity"] = chunk[cols["commodity"]].str.strip().str.lower()
        chunk = chunk[chunk["match_state"].isin(STATE_TO_REGION_IDS) & chunk["match_commodity"].isin(CROP_NAME_TO_ID)]
        if chunk.empty:
            continue

        for row in chunk.itertuples(index=False):
            state = getattr(row, "match_state")
            commodity = getattr(row, "match_commodity")
            parsed_date = _parse_date(getattr(row, cols["date"]))
            if parsed_date is None:
                continue
            try:
                price = float(getattr(row, cols["modal_price"]))
            except (TypeError, ValueError):
                continue
            if price <= 0:
                continue

            crop_id = CROP_NAME_TO_ID[commodity]
            for region_id in STATE_TO_REGION_IDS[state]:
                accumulated[(region_id, crop_id, parsed_date)].append(price)

        print(f"[load_kaggle_prices] scanned {rows_scanned:,} rows, matched {len(accumulated):,} region/crop/date groups so far", file=sys.stderr)

    if not accumulated:
        print("[load_kaggle_prices] no matching rows found — check COLUMN_CANDIDATES / state & commodity spellings", file=sys.stderr)
        return 0

    # Shift every date so the most recent one lands on "yesterday" — see module docstring for
    # why a static file's real dates would otherwise fall outside every lookback window in the
    # app and never actually get read.
    max_date = max(d for _, _, d in accumulated)
    shift = (date.today() - timedelta(days=1) - max_date).days
    if shift != 0:
        print(
            f"[load_kaggle_prices] shifting dates by {shift:+d} days "
            f"(source max date {max_date} -> {max_date + timedelta(days=shift)})",
            file=sys.stderr,
        )

    rows = [
        (region_id, crop_id, (d + timedelta(days=shift)).isoformat(), sum(prices) / len(prices), len(prices))
        for (region_id, crop_id, d), prices in accumulated.items()
    ]

    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.executemany(
                """
                insert into mandi_prices (region_id, crop_id, date, modal_price_rs_per_quintal, sample_count, source, fetched_at)
                values (%s, %s, %s, %s, %s, 'kaggle_agmarknet', now())
                on conflict (region_id, crop_id, date) do update set
                    modal_price_rs_per_quintal = excluded.modal_price_rs_per_quintal,
                    sample_count = excluded.sample_count,
                    source = 'kaggle_agmarknet',
                    fetched_at = excluded.fetched_at
                where mandi_prices.source != 'agmarknet'
                """,
                rows,
            )
        conn.commit()

    return len(rows)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", default="data/kaggle_prices.csv")
    args = parser.parse_args()

    path = Path(args.file)
    if not path.exists():
        print(f"[load_kaggle_prices] file not found: {path}", file=sys.stderr)
        sys.exit(1)

    n = load(path)
    print(f"[load_kaggle_prices] wrote {n} rows (source='kaggle_agmarknet')")
