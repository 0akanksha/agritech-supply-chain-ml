"""Trains one bottleneck-risk regressor per crop on synthetic historical data.

The label (`bottleneck_risk`) comes from a rule-based simulator in
`app.data.features._rule_based_risk` — a deterministic formula over volatility/trend/health/
weather-stress signals plus noise. The model then learns to approximate that formula from the
underlying features alone, which is a legitimate (if demo-scale) supervised regression task:
at inference time we only have the features, not the rule, and the model must generalize across
regions. Phase 3 replaces the synthetic label with real observed outcomes.

Run from `ml-service/`: `python -m app.models.train`
"""

from __future__ import annotations

import sys
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.model_selection import train_test_split
from sklearn.metrics import r2_score

from app.data.features import FEATURE_COLUMNS, build_feature_frame
from app.reference_data import CROPS, REGIONS

ARTIFACTS_DIR = Path(__file__).parent / "artifacts"


def _training_frame(crop_id: str) -> pd.DataFrame:
    frames = [build_feature_frame(region.id, crop_id, weeks=104, with_label=True) for region in REGIONS]
    return pd.concat(frames, ignore_index=True)


def train_all() -> None:
    ARTIFACTS_DIR.mkdir(parents=True, exist_ok=True)

    for crop in CROPS:
        df = _training_frame(crop.id)
        X = df[FEATURE_COLUMNS]
        y = df["bottleneck_risk"]

        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        model = RandomForestRegressor(n_estimators=300, max_depth=6, random_state=42, n_jobs=-1)
        model.fit(X_train, y_train)
        r2 = r2_score(y_test, model.predict(X_test))

        importances = dict(zip(FEATURE_COLUMNS, model.feature_importances_.tolist()))

        artifact = {
            "model": model,
            "feature_columns": FEATURE_COLUMNS,
            "meta": {
                "crop_id": crop.id,
                "trained_at": datetime.now(timezone.utc).isoformat(),
                "n_samples": len(df),
                "r2_test": float(r2),
                "feature_importances": importances,
            },
        }
        joblib.dump(artifact, ARTIFACTS_DIR / f"{crop.id}.joblib")
        print(f"[train] {crop.id:8s} n={len(df):4d}  r2_test={r2:.3f}", file=sys.stderr)


if __name__ == "__main__":
    train_all()
