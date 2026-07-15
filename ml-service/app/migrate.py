"""Creates the ML service's real-data tables. Run from ml-service/: `python -m app.migrate`."""

from __future__ import annotations

from pathlib import Path

from app.db import get_connection

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


def migrate() -> None:
    sql = SCHEMA_PATH.read_text()
    with get_connection() as conn:
        conn.execute(sql)
        conn.commit()
    print("Migration applied.")


if __name__ == "__main__":
    migrate()
