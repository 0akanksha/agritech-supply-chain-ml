"""Persists trained-model artifacts locally (fast path) and in Postgres (survives Render's
ephemeral filesystem — free web services have no persistent disk, so every deploy/cold-start
gets a clean filesystem). `train.py` writes both; `predict.py` reads the local file first and
falls back to Postgres, warming the local cache for subsequent reads in the same container.
"""

from __future__ import annotations

import io
import json
from pathlib import Path

import joblib

from app.db import get_connection

ARTIFACTS_DIR = Path(__file__).parent / "artifacts"


def save_artifact(crop_id: str, artifact: dict) -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    local_path = ARTIFACTS_DIR / f"{crop_id}.joblib"
    joblib.dump(artifact, local_path)

    buffer = io.BytesIO()
    joblib.dump(artifact, buffer)
    with get_connection() as conn:
        conn.execute(
            """
            insert into model_artifacts (crop_id, model_bytes, feature_columns, meta, trained_at)
            values (%s, %s, %s, %s, now())
            on conflict (crop_id) do update set
                model_bytes = excluded.model_bytes,
                feature_columns = excluded.feature_columns,
                meta = excluded.meta,
                trained_at = excluded.trained_at
            """,
            (
                crop_id,
                buffer.getvalue(),
                json.dumps(artifact["feature_columns"]),
                json.dumps(artifact["meta"]),
            ),
        )
        conn.commit()


def load_artifact(crop_id: str) -> dict | None:
    local_path = ARTIFACTS_DIR / f"{crop_id}.joblib"
    if local_path.exists():
        return joblib.load(local_path)

    with get_connection() as conn:
        row = conn.execute(
            "select model_bytes from model_artifacts where crop_id = %s", (crop_id,)
        ).fetchone()
    if row is None:
        return None

    artifact = joblib.load(io.BytesIO(bytes(row[0])))
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(artifact, local_path)  # warm the local cache for this container's next read
    return artifact
