"""Weekly feature engineering shared by training and inference, plus the rule-based
synthetic label used to train the demo model (see train.py for why this is legitimate
supervised learning and not a lookup table)."""

from __future__ import annotations

import hashlib
from datetime import date

import numpy as np
import pandas as pd

from app.data.synthetic import generate_ndvi, generate_prices, generate_weather, weekly_weather_stress

FEATURE_COLUMNS = [
    "price_volatility_4w",
    "price_trend_abs_4w",
    "ndvi_level",
    "ndvi_trend_4w",
    "rain_anomaly_4w",
    "temp_anomaly_4w",
]

# Drivers that feed the rule-based label directly (see _rule_based_risk below); ndvi_level is
# an auxiliary model input that isn't shown as an explanation "factor" on its own.
DRIVER_COLUMNS = [c for c in FEATURE_COLUMNS if c != "ndvi_level"]

FEATURE_LABELS = {
    "price_volatility_4w": "Price volatility",
    "price_trend_abs_4w": "Price swing (4wk)",
    "ndvi_level": "Crop health level",
    "ndvi_trend_4w": "Crop health decline",
    "rain_anomaly_4w": "Drought signal",
    "temp_anomaly_4w": "Heat stress",
}


def _rule_based_risk(df: pd.DataFrame, rng: np.random.Generator) -> pd.Series:
    vol_term = np.clip(df["price_volatility_4w"] / 0.06, 0, 1)
    trend_term = np.clip(df["price_trend_abs_4w"] / 0.15, 0, 1)
    ndvi_term = np.clip(-df["ndvi_trend_4w"] / 0.06, 0, 1)
    drought_term = np.clip(-df["rain_anomaly_4w"] / 1.5, 0, 1)
    heat_term = np.clip(df["temp_anomaly_4w"] / 1.5, 0, 1)

    risk = 100 * (
        0.35 * vol_term + 0.20 * trend_term + 0.25 * ndvi_term + 0.12 * drought_term + 0.08 * heat_term
    )
    noise = rng.normal(0, 4, size=len(df))
    return np.clip(risk + noise, 0, 100)


def build_feature_frame(
    region_id: str,
    crop_id: str,
    weeks: int = 104,
    end: date | None = None,
    with_label: bool = False,
) -> pd.DataFrame:
    """Weekly feature rows for a region/crop. Set with_label=True to also attach the
    rule-based synthetic bottleneck-risk label (used for training only)."""
    end = end or date.today()
    lookback = weeks + 8  # extra history so rolling/diff features have no leading NaNs left

    ndvi_df = generate_ndvi(region_id, crop_id, weeks=lookback, end=end)
    price_df = generate_prices(region_id, crop_id, weeks=lookback, end=end)
    weather_daily = generate_weather(region_id, days=lookback * 7 + 14, end=end)
    stress_df = weekly_weather_stress(weather_daily).tail(lookback).reset_index(drop=True)
    stress_df["date"] = stress_df["date"].dt.strftime("%Y-%m-%d")

    df = ndvi_df.merge(price_df, on="date").merge(
        stress_df[["date", "rainAnomaly", "tempAnomaly"]], on="date"
    )

    price = df["modalPriceRsPerQuintal"]
    pct_change = price.pct_change()
    df["price_volatility_4w"] = pct_change.rolling(4).std()
    df["price_trend_abs_4w"] = price.pct_change(4).abs()
    df["ndvi_level"] = df["ndvi"]
    df["ndvi_trend_4w"] = df["ndvi"].diff(4)
    df["rain_anomaly_4w"] = df["rainAnomaly"].rolling(4).mean()
    df["temp_anomaly_4w"] = df["tempAnomaly"].rolling(4).mean()

    df = df.dropna(subset=FEATURE_COLUMNS).reset_index(drop=True)

    if with_label:
        seed_digest = hashlib.sha256(f"label|{region_id}|{crop_id}".encode()).digest()
        rng = np.random.default_rng(int.from_bytes(seed_digest[:4], "big"))
        df["bottleneck_risk"] = _rule_based_risk(df, rng)

    return df.tail(weeks).reset_index(drop=True)
