"""One-off: seeds synthetic placeholder mandi prices so the app can be exercised end-to-end
(dashboard price chart, training, predictions) before a data.gov.in API key is available.

Tagged source='synthetic_placeholder' in mandi_prices. The `WHERE` clause on the upsert
means a real ETL run for the same region/crop/date (source='agmarknet') is never clobbered
back to placeholder by re-running this — and a real run's own upsert (see etl/prices.py)
overwrites placeholder rows outright, so nothing needs manual cleanup once a real key lands.

Run from ml-service/: `python -m app.etl.seed_placeholder_prices`
"""

from __future__ import annotations

from datetime import date

from app.data.synthetic import generate_prices
from app.db import get_connection
from app.reference_data import CROPS, REGIONS

BACKFILL_WEEKS = 104


def seed() -> int:
    end = date.today()
    total = 0
    with get_connection() as conn:
        with conn.cursor() as cur:
            for region in REGIONS:
                for crop in CROPS:
                    df = generate_prices(region.id, crop.id, weeks=BACKFILL_WEEKS, end=end)
                    rows = [
                        (region.id, crop.id, row.date, row.modalPriceRsPerQuintal)
                        for row in df.itertuples(index=False)
                    ]
                    cur.executemany(
                        """
                        insert into mandi_prices (region_id, crop_id, date, modal_price_rs_per_quintal, sample_count, source, fetched_at)
                        values (%s, %s, %s, %s, 1, 'synthetic_placeholder', now())
                        on conflict (region_id, crop_id, date) do update set
                            modal_price_rs_per_quintal = excluded.modal_price_rs_per_quintal,
                            sample_count = excluded.sample_count,
                            source = 'synthetic_placeholder',
                            fetched_at = excluded.fetched_at
                        where mandi_prices.source = 'synthetic_placeholder'
                        """,
                        rows,
                    )
                    total += len(rows)
        conn.commit()
    return total


if __name__ == "__main__":
    n = seed()
    print(f"[seed] wrote {n} placeholder price rows (source='synthetic_placeholder')")
