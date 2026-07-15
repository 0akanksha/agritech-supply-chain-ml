from __future__ import annotations

from pathlib import Path

import joblib
import numpy as np

from app.data.features import DRIVER_COLUMNS, FEATURE_LABELS, build_feature_frame
from app.reference_data import CROPS_BY_ID, REGIONS_BY_ID

ARTIFACTS_DIR = Path(__file__).parent / "artifacts"

_MODEL_CACHE: dict[str, dict] = {}

# Same normalization scales used to build the rule-based label in features.py, reused here
# to turn a feature's current reading into a comparable 0..~1+ "how stressed is this signal" value.
_DRIVER_SCALES = {
    "price_volatility_4w": lambda v: v / 0.06,
    "price_trend_abs_4w": lambda v: v / 0.15,
    "ndvi_trend_4w": lambda v: max(0.0, -v) / 0.06,
    "rain_anomaly_4w": lambda v: max(0.0, -v) / 1.5,
    "temp_anomaly_4w": lambda v: max(0.0, v) / 1.5,
}


class ModelNotTrainedError(RuntimeError):
    pass


def _load_model(crop_id: str) -> dict:
    if crop_id not in _MODEL_CACHE:
        path = ARTIFACTS_DIR / f"{crop_id}.joblib"
        if not path.exists():
            raise ModelNotTrainedError(
                f"No trained model for crop '{crop_id}'. Run `python -m app.models.train` first."
            )
        _MODEL_CACHE[crop_id] = joblib.load(path)
    return _MODEL_CACHE[crop_id]


def _risk_level(score: float) -> str:
    if score < 33:
        return "low"
    if score < 66:
        return "medium"
    return "high"


def _days_to_bottleneck(score: float) -> int | None:
    if score < 33:  # "low" risk: no imminent window worth projecting
        return None
    return int(round(np.clip(75 - score * 0.7, 3, 90)))


def _factors(row: dict, importances: dict[str, float]) -> list[dict]:
    raw = {col: max(0.0, _DRIVER_SCALES[col](row[col])) * importances.get(col, 0.0) for col in DRIVER_COLUMNS}
    total = sum(raw.values())
    if total <= 1e-9:
        # Nothing stands out; spread evenly across drivers by importance alone.
        total_importance = sum(importances.get(c, 0.0) for c in DRIVER_COLUMNS) or 1.0
        raw = {col: importances.get(col, 0.0) / total_importance for col in DRIVER_COLUMNS}
        total = sum(raw.values()) or 1.0

    factors = [{"label": FEATURE_LABELS[col], "contribution": raw[col] / total} for col in DRIVER_COLUMNS]
    factors.sort(key=lambda f: f["contribution"], reverse=True)
    return [f for f in factors if f["contribution"] > 0.02][:4] or factors[:1]


def _explanation(region_name: str, crop_name: str, score: float, level: str, days: int | None, factors: list[dict]) -> str:
    level_phrase = {"low": "low", "medium": "moderate", "high": "high"}[level]
    top = factors[0]
    text = (
        f"{crop_name} in {region_name} shows {level_phrase} bottleneck risk ({score:.0f}/100), "
        f"driven mainly by {top['label'].lower()} ({top['contribution'] * 100:.0f}% of the signal)."
    )
    if days is not None:
        text += f" If current conditions persist, a bottleneck could emerge within roughly {days} days."
    else:
        text += " No imminent bottleneck window is indicated."
    return text


def predict(region_id: str, crop_id: str) -> dict:
    region = REGIONS_BY_ID[region_id]
    crop = CROPS_BY_ID[crop_id]
    artifact = _load_model(crop_id)

    features_df = build_feature_frame(region_id, crop_id, weeks=8, with_label=False)
    latest = features_df.iloc[-1]

    X = features_df.loc[[latest.name], artifact["feature_columns"]]
    score = float(np.clip(artifact["model"].predict(X)[0], 0, 100))
    level = _risk_level(score)
    days = _days_to_bottleneck(score)

    importances = artifact["meta"]["feature_importances"]
    factors = _factors(latest.to_dict(), importances)
    explanation = _explanation(region.name, crop.name, score, level, days, factors)

    return {
        "region": region.name,
        "crop": crop.name,
        "riskLevel": level,
        "riskScore": round(score, 1),
        "daysToBottleneck": days,
        "explanation": explanation,
        "factors": [{"label": f["label"], "contribution": round(f["contribution"], 3)} for f in factors],
    }
