from __future__ import annotations

from datetime import date, timedelta
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from app.data.features import DRIVER_COLUMNS, FEATURE_LABELS, build_feature_and_label_frame
from app.data.real_data import load_ndvi, load_prices, load_weather
from app.reference_data import CROPS_BY_ID, REGIONS_BY_ID

ARTIFACTS_DIR = Path(__file__).parent / "artifacts"
# Enough real history for the rolling 4-week features to be non-null at the latest row,
# with headroom for NDVI's ~16-day composite cadence — not a full retraining backfill.
LOOKBACK_DAYS = 120

_MODEL_CACHE: dict[str, dict] = {}

# Typical-magnitude scales for each driver (independent of the label formula) — turns a
# feature's current reading into a comparable 0..~1+ "how stressed is this signal" value,
# weighted by the model's learned feature_importances_ to build the explanation factors.
_DRIVER_SCALES = {
    "price_volatility_4w": lambda v: v / 0.06,
    "price_trend_abs_4w": lambda v: v / 0.15,
    "ndvi_trend_4w": lambda v: max(0.0, -v) / 0.06,
    "rain_anomaly_4w": lambda v: max(0.0, -v) / 1.5,
    "temp_anomaly_4w": lambda v: max(0.0, v) / 1.5,
}


class PredictionUnavailableError(RuntimeError):
    """No trained model for this crop yet, or not enough recent real data to featurize."""


def _load_model(crop_id: str) -> dict:
    if crop_id not in _MODEL_CACHE:
        path = ARTIFACTS_DIR / f"{crop_id}.joblib"
        if not path.exists():
            raise PredictionUnavailableError(
                f"No trained model for crop '{crop_id}' yet. Run an ETL backfill, then "
                "`python -m app.models.train` (or use the admin page)."
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


def _recent_price_trend_pct(price_df) -> float | None:
    """Signed % change in price over the trailing ~4 weeks — a plain observed fact (not a
    model prediction; the model's label discards direction, see features.py's module
    docstring), used only to give farmers a simple "prices have been rising/falling" read
    alongside the risk score."""
    if price_df.empty:
        return None
    df = price_df.assign(date=pd.to_datetime(price_df["date"])).sort_values("date")
    latest_date = df["date"].iloc[-1]
    latest_price = df["modalPriceRsPerQuintal"].iloc[-1]
    baseline = df[df["date"] <= latest_date - pd.Timedelta(days=28)]
    if baseline.empty or baseline["modalPriceRsPerQuintal"].iloc[-1] == 0:
        return None
    baseline_price = baseline["modalPriceRsPerQuintal"].iloc[-1]
    return float((latest_price - baseline_price) / baseline_price * 100)


def _plain_summary(crop_name: str, region_name: str, trend_pct: float | None, level: str) -> str:
    if trend_pct is None:
        trend_phrase = "Recent price direction isn't clear yet from the available data."
    elif trend_pct > 5:
        trend_phrase = (
            f"{crop_name} prices in {region_name} have been going up lately "
            f"(about {trend_pct:.0f}% over the past month)."
        )
    elif trend_pct < -5:
        trend_phrase = (
            f"{crop_name} prices in {region_name} have been going down lately "
            f"(about {abs(trend_pct):.0f}% over the past month)."
        )
    else:
        trend_phrase = f"{crop_name} prices in {region_name} have stayed fairly steady over the past month."

    outlook = {
        "low": "Prices aren't expected to change much in the near term.",
        "medium": "There's a moderate chance prices could shift noticeably in the coming weeks.",
        "high": "Prices are at high risk of a sharp change in the coming weeks — worth watching closely.",
    }[level]

    return f"{trend_phrase} {outlook}"


def predict(region_id: str, crop_id: str) -> dict:
    region = REGIONS_BY_ID[region_id]
    crop = CROPS_BY_ID[crop_id]
    artifact = _load_model(crop_id)

    end = date.today()
    start = end - timedelta(days=LOOKBACK_DAYS)
    weather_df = load_weather(region_id, start, end)
    ndvi_df = load_ndvi(region_id, start, end)
    price_df = load_prices(region_id, crop_id, start, end)

    features_df = build_feature_and_label_frame(weather_df, ndvi_df, price_df, with_label=False)
    if features_df.empty:
        raise PredictionUnavailableError(
            f"Not enough recent real data for '{region.name}'/'{crop.name}' yet — has the ETL run for this combination?"
        )
    latest = features_df.iloc[-1]

    X = features_df.loc[[latest.name], artifact["feature_columns"]]
    score = float(np.clip(artifact["model"].predict(X)[0], 0, 100))
    level = _risk_level(score)
    days = _days_to_bottleneck(score)

    importances = artifact["meta"]["feature_importances"]
    factors = _factors(latest.to_dict(), importances)
    explanation = _explanation(region.name, crop.name, score, level, days, factors)
    plain_summary = _plain_summary(crop.name, region.name, _recent_price_trend_pct(price_df), level)

    return {
        "region": region.name,
        "crop": crop.name,
        "riskLevel": level,
        "riskScore": round(score, 1),
        "daysToBottleneck": days,
        "explanation": explanation,
        "plainSummary": plain_summary,
        "factors": [{"label": f["label"], "contribution": round(f["contribution"], 3)} for f in factors],
    }
