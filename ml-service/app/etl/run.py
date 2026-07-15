"""Orchestrates the three ETL fetchers across all regions/crops and records status in
etl_runs (one row per source per invocation). Postgres is the source of truth for run
status — no in-memory state — so a "run in progress" check is just a query, and it
survives process restarts.

Run from ml-service/: `python -m app.etl.run` (defaults to a 2-year backfill through
yesterday). Also called from routers/admin.py for the admin-triggered version.
"""

from __future__ import annotations

from datetime import date, timedelta

from app.db import get_connection
from app.etl.prices import DataGovInKeyMissing, fetch_prices
from app.etl.satellite import fetch_ndvi
from app.etl.weather import fetch_weather
from app.reference_data import CROPS, REGIONS

DEFAULT_BACKFILL_DAYS = 730


def is_running() -> bool:
    with get_connection() as conn:
        row = conn.execute("select 1 from etl_runs where status = 'running' limit 1").fetchone()
    return row is not None


def _start_run(source: str) -> int:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "insert into etl_runs (source, status) values (%s, 'running') returning id",
                (source,),
            )
            run_id = cur.fetchone()[0]
        conn.commit()
    return run_id


def _finish_run(run_id: int, status: str, rows_written: int, error: str | None) -> None:
    with get_connection() as conn:
        conn.execute(
            "update etl_runs set status = %s, finished_at = now(), rows_written = %s, error = %s where id = %s",
            (status, rows_written, error, run_id),
        )
        conn.commit()


def run_weather_etl(start_date: date, end_date: date) -> dict:
    run_id = _start_run("weather")
    total_rows = 0
    errors: list[str] = []
    for region in REGIONS:
        try:
            total_rows += fetch_weather(region, start_date, end_date)
        except Exception as e:  # keep going across regions; report failures, don't abort
            errors.append(f"{region.id}: {e}")
    status = "success" if not errors else ("partial" if total_rows else "error")
    _finish_run(run_id, status, total_rows, "; ".join(errors) or None)
    return {"source": "weather", "status": status, "rows_written": total_rows, "errors": errors}


def run_satellite_etl(start_date: date, end_date: date) -> dict:
    run_id = _start_run("satellite")
    total_rows = 0
    errors: list[str] = []
    for region in REGIONS:
        try:
            total_rows += fetch_ndvi(region, start_date, end_date)
        except Exception as e:
            errors.append(f"{region.id}: {e}")
    status = "success" if not errors else ("partial" if total_rows else "error")
    _finish_run(run_id, status, total_rows, "; ".join(errors) or None)
    return {"source": "satellite", "status": status, "rows_written": total_rows, "errors": errors}


def run_prices_etl(start_date: date, end_date: date) -> dict:
    run_id = _start_run("prices")
    total_rows = 0
    errors: list[str] = []
    for region in REGIONS:
        for crop in CROPS:
            try:
                total_rows += fetch_prices(region, crop, start_date, end_date)
            except DataGovInKeyMissing as e:
                _finish_run(run_id, "skipped", 0, str(e))
                return {"source": "prices", "status": "skipped", "rows_written": 0, "errors": [str(e)]}
            except Exception as e:
                errors.append(f"{region.id}/{crop.id}: {e}")
    status = "success" if not errors else ("partial" if total_rows else "error")
    _finish_run(run_id, status, total_rows, "; ".join(errors) or None)
    return {"source": "prices", "status": status, "rows_written": total_rows, "errors": errors}


def run_full_etl(start_date: date | None = None, end_date: date | None = None) -> dict:
    end_date = end_date or (date.today() - timedelta(days=1))
    start_date = start_date or (end_date - timedelta(days=DEFAULT_BACKFILL_DAYS))
    return {
        "weather": run_weather_etl(start_date, end_date),
        "satellite": run_satellite_etl(start_date, end_date),
        "prices": run_prices_etl(start_date, end_date),
    }


def latest_status() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            """
            select distinct on (source) source, status, started_at, finished_at, rows_written, error
            from etl_runs
            order by source, started_at desc
            """
        ).fetchall()
    columns = ["source", "status", "started_at", "finished_at", "rows_written", "error"]
    return [dict(zip(columns, row)) for row in rows]


if __name__ == "__main__":
    result = run_full_etl()
    for source, summary in result.items():
        print(f"[etl] {source}: {summary['status']}, rows_written={summary['rows_written']}")
        for err in summary["errors"]:
            print(f"  ! {err}")
