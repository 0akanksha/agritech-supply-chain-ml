"""Postgres connection helper. Uses the same Neon DATABASE_URL as the Express server —
Python owns its own tables (weather_observations, ndvi_observations, mandi_prices, etl_runs)
in that database via raw SQL (see schema.sql/migrate.py), independent of Express's Drizzle
schema (users, saved_farms). No ORM: a handful of tables and simple upserts don't need one.

All of this service's tables live in a dedicated `ml` Postgres schema, not `public` — Express's
`drizzle-kit push` diffs the whole `public` schema against its own schema.ts and would treat
any table it doesn't know about as "extra, delete it" (this really happened once — a live
`db:push` was seconds from dropping 4,600+ real ETL'd rows before failing safely on a TTY
prompt). Every connection sets `search_path=ml,public` so callers can keep writing unqualified
table names (`weather_observations`, not `ml.weather_observations`).
"""

from __future__ import annotations

import os
from contextlib import contextmanager
from typing import Iterator

import psycopg
from dotenv import load_dotenv

load_dotenv()


def _database_url() -> str:
    url = os.environ.get("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not set (see ml-service/.env.example)")
    return url


@contextmanager
def get_connection() -> Iterator[psycopg.Connection]:
    # Neon's pooled connection (pgbouncer) rejects search_path as a libpq startup
    # `options` parameter, so it's set as a regular statement instead.
    with psycopg.connect(_database_url()) as conn:
        conn.execute("SET search_path TO ml, public")
        yield conn
