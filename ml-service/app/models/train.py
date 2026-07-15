"""Trains one bottleneck-risk regressor per crop on real ETL'd data (see app/etl/).

Label: real, backtestable future price volatility (see app.data.features's module
docstring) — not a rule-based formula over synthetic inputs like Phase 1's. That has two
consequences here:
- The train/test split MUST be time-aware (train on the past, test on the most recent
  slice) — a random split would leak future price information across the split.
- Crops without enough real history yet are skipped, not crashed (MIN_TRAINING_SAMPLES).
  predict.py raises a clear PredictionUnavailableError (-> 503) for those.

Each successful run is logged to MLflow (local file-store backend — no server to run; browse
with `mlflow ui --backend-store-uri file:./mlruns`) for experiment tracking/versioning, and
the fitted model is ALSO saved to artifacts/{crop_id}.joblib — the simple, MLflow-independent
path predict.py actually reads at request time, so serving never talks to MLflow.

Run from ml-service/: `python -m app.models.train`
"""

from __future__ import annotations

import os
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import joblib
import mlflow
import mlflow.sklearn
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score

from app.data.features import FEATURE_COLUMNS, build_feature_and_label_frame
from app.data.real_data import load_ndvi, load_prices, load_weather
from app.reference_data import CROPS, REGIONS, Crop, Region

ARTIFACTS_DIR = Path(__file__).parent / "artifacts"
BACKFILL_DAYS = 730
MIN_TRAINING_SAMPLES = 30
TEST_FRACTION = 0.2
MLFLOW_EXPERIMENT = "agritech-bottleneck-risk"


def _region_crop_frame(region: Region, crop: Crop, end: date) -> pd.DataFrame:
    start = end - timedelta(days=BACKFILL_DAYS)
    weather_df = load_weather(region.id, start, end)
    ndvi_df = load_ndvi(region.id, start, end)
    price_df = load_prices(region.id, crop.id, start, end)
    if weather_df.empty or ndvi_df.empty or price_df.empty:
        return pd.DataFrame()
    df = build_feature_and_label_frame(weather_df, ndvi_df, price_df, with_label=True)
    df["region_id"] = region.id
    return df


def _time_aware_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Train on earlier dates, test on the most recent slice (one global date cutoff
    across all pooled regions) — a random split would leak future price info."""
    dates = pd.to_datetime(df["date"]).sort_values()
    cutoff = dates.iloc[int(len(dates) * (1 - TEST_FRACTION))]
    is_test = pd.to_datetime(df["date"]) >= cutoff
    return df[~is_test], df[is_test]


def train_all(end: date | None = None) -> dict:
    end = end or date.today()
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)
    mlflow.set_tracking_uri(os.environ.get("MLFLOW_TRACKING_URI", "file:./mlruns"))
    mlflow.set_experiment(MLFLOW_EXPERIMENT)

    results: dict[str, dict] = {}
    for crop in CROPS:
        frames = [_region_crop_frame(region, crop, end) for region in REGIONS]
        frames = [f for f in frames if not f.empty]
        df = pd.concat(frames, ignore_index=True) if frames else pd.DataFrame()

        if len(df) < MIN_TRAINING_SAMPLES:
            reason = f"only {len(df)} real samples available (need {MIN_TRAINING_SAMPLES}+)"
            results[crop.id] = {"status": "skipped", "n_samples": len(df), "reason": reason}
            print(f"[train] {crop.id:8s} skipped — {reason}", file=sys.stderr)
            continue

        train_df, test_df = _time_aware_split(df)
        if len(train_df) == 0 or len(test_df) == 0:
            results[crop.id] = {"status": "skipped", "n_samples": len(df), "reason": "not enough date range for a time-aware split"}
            continue

        X_train, y_train = train_df[FEATURE_COLUMNS], train_df["bottleneck_risk"]
        X_test, y_test = test_df[FEATURE_COLUMNS], test_df["bottleneck_risk"]

        model = RandomForestRegressor(n_estimators=300, max_depth=6, random_state=42, n_jobs=-1)
        model.fit(X_train, y_train)
        preds = model.predict(X_test)
        r2 = float(r2_score(y_test, preds))
        mae = float(mean_absolute_error(y_test, preds))
        importances = dict(zip(FEATURE_COLUMNS, model.feature_importances_.tolist()))

        with mlflow.start_run(run_name=f"{crop.id}-{datetime.now(timezone.utc):%Y%m%dT%H%M%S}"):
            mlflow.log_params(
                {
                    "crop_id": crop.id,
                    "n_estimators": 300,
                    "max_depth": 6,
                    "n_train": len(train_df),
                    "n_test": len(test_df),
                    "data_start": str(df["date"].min()),
                    "data_end": str(df["date"].max()),
                }
            )
            mlflow.log_metrics({"r2_test": r2, "mae_test": mae})
            mlflow.sklearn.log_model(model, "model", registered_model_name=f"agritech-{crop.id}")

        artifact = {
            "model": model,
            "feature_columns": FEATURE_COLUMNS,
            "meta": {
                "crop_id": crop.id,
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "n_samples": len(df),
                "r2_test": r2,
                "mae_test": mae,
                "feature_importances": importances,
            },
        }
        joblib.dump(artifact, ARTIFACTS_DIR / f"{crop.id}.joblib")
        results[crop.id] = {"status": "trained", "n_samples": len(df), "r2_test": r2, "mae_test": mae}
        print(f"[train] {crop.id:8s} n={len(df):4d} r2_test={r2:.3f} mae_test={mae:.2f}", file=sys.stderr)

    return results


if __name__ == "__main__":
    train_all()
