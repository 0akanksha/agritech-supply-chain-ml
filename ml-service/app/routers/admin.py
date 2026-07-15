"""ETL/training trigger + status, and MLflow run history, for the admin page.

Not protected by any auth of its own — this service isn't browser-facing (only Express is,
via server/src/routes/admin.routes.ts), so requireAuth+requireAdmin at the Express layer is
what actually gates this. Fine for local dev; worth revisiting (e.g. a shared secret header)
if this service is ever reachable from outside the deploy's private network in Phase 4.
"""

from __future__ import annotations

import math
import os

import mlflow
from fastapi import APIRouter, BackgroundTasks

from app.etl.run import is_running as etl_is_running
from app.etl.run import latest_status, run_full_etl
from app.models.train import train_all

router = APIRouter()

MLFLOW_EXPERIMENT = "agritech-bottleneck-risk"


@router.post("/admin/etl/run")
def trigger_etl(background_tasks: BackgroundTasks) -> dict:
    if etl_is_running():
        return {"status": "already_running"}
    background_tasks.add_task(run_full_etl)
    return {"status": "started"}


@router.get("/admin/etl/status")
def etl_status() -> dict:
    return {"runs": latest_status()}


@router.post("/admin/train/run")
def trigger_training(background_tasks: BackgroundTasks) -> dict:
    background_tasks.add_task(train_all)
    return {"status": "started"}


def _clean(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    return value


@router.get("/admin/runs")
def training_runs(limit: int = 20) -> dict:
    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "file:./mlruns"))
    experiment = mlflow.get_experiment_by_name(MLFLOW_EXPERIMENT)
    if experiment is None:
        return {"runs": []}

    runs_df = mlflow.search_runs(
        experiment_ids=[experiment.experiment_id], order_by=["start_time DESC"], max_results=limit
    )

    runs = []
    for _, row in runs_df.iterrows():
        runs.append(
            {
                "runId": row.get("run_id"),
                "cropId": _clean(row.get("params.crop_id")),
                "startTime": str(row.get("start_time")),
                "r2Test": _clean(row.get("metrics.r2_test")),
                "maeTest": _clean(row.get("metrics.mae_test")),
                "nTrain": _clean(row.get("params.n_train")),
                "nTest": _clean(row.get("params.n_test")),
            }
        )
    return {"runs": runs}
