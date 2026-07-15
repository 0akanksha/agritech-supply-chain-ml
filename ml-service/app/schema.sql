-- Real-data cache tables owned by the ML service. region_id/crop_id are the reference-data
-- ids from app/reference_data.py (e.g. "nashik", "wheat") — not foreign keys, since that
-- reference data is a static Python list, not a database table.
--
-- Lives in its own `ml` schema, not `public` — see db.py's module docstring for why
-- (Express's `drizzle-kit push` diffs all of `public` and will drop tables it doesn't
-- recognize). app/db.py's connections set search_path=ml,public, so table names below are
-- unqualified on purpose.

CREATE SCHEMA IF NOT EXISTS ml;

CREATE TABLE IF NOT EXISTS weather_observations (
    region_id text NOT NULL,
    date date NOT NULL,
    temp_c numeric,
    rainfall_mm numeric,
    humidity_pct numeric,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (region_id, date)
);

CREATE TABLE IF NOT EXISTS ndvi_observations (
    region_id text NOT NULL,
    date date NOT NULL,
    ndvi numeric,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (region_id, date)
);

CREATE TABLE IF NOT EXISTS mandi_prices (
    region_id text NOT NULL,
    crop_id text NOT NULL,
    date date NOT NULL,
    modal_price_rs_per_quintal numeric,
    sample_count integer NOT NULL DEFAULT 0,
    -- 'agmarknet' (real, see etl/prices.py) or 'synthetic_placeholder' (see
    -- etl/seed_placeholder_prices.py) — lets placeholder rows be told apart from real ones,
    -- and real ETL runs naturally overwrite placeholders on conflict (same primary key).
    source text NOT NULL DEFAULT 'agmarknet',
    fetched_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (region_id, crop_id, date)
);
ALTER TABLE mandi_prices ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'agmarknet';

CREATE TABLE IF NOT EXISTS etl_runs (
    id serial PRIMARY KEY,
    source text NOT NULL,
    status text NOT NULL,
    started_at timestamptz NOT NULL DEFAULT now(),
    finished_at timestamptz,
    rows_written integer,
    error text
);
