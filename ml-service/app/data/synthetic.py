"""Deterministic synthetic data generators standing in for real weather/satellite/mandi feeds.

Every series is seeded from (region, crop, series-kind) so repeated requests return the same
numbers for weeks at a stretch (the seed folds in the current ~4-week bucket), instead of
re-randomizing on every call. Phase 3 swaps these functions out for real API calls behind the
same signatures.
"""

from __future__ import annotations

import hashlib
from datetime import date, timedelta

import numpy as np
import pandas as pd

from app.reference_data import CROPS_BY_ID, REGIONS_BY_ID

MONSOON_MONTHS = {6, 7, 8, 9}


def _seed(*parts: str) -> int:
    digest = hashlib.sha256("|".join(parts).encode()).digest()
    return int.from_bytes(digest[:4], "big")


def _rng(*parts: str) -> np.random.Generator:
    return np.random.default_rng(_seed(*parts))


def generate_weather(region_id: str, days: int = 730, end: date | None = None) -> pd.DataFrame:
    """Daily temperature/rainfall/humidity series for a region."""
    region = REGIONS_BY_ID[region_id]
    end = end or date.today()
    start = end - timedelta(days=days - 1)
    dates = pd.date_range(start, end, freq="D")
    rng = _rng("weather", region_id, str(end.isocalendar()[1] // 4))  # re-seeds monthly

    day_of_year = dates.dayofyear.to_numpy()
    seasonal_temp = 5.0 * np.sin(2 * np.pi * (day_of_year - 80) / 365)
    temp_noise = rng.normal(0, 1.6, size=len(dates))
    temp_c = region.base_temp_c + seasonal_temp + temp_noise

    is_monsoon = np.isin(dates.month.to_numpy(), list(MONSOON_MONTHS))
    rain_shape = np.where(is_monsoon, 2.2, 0.5)
    rain_scale = region.base_rainfall_mm * np.where(is_monsoon, 6.0, 1.0)
    rainfall_mm = rng.gamma(shape=rain_shape, scale=rain_scale)
    rainfall_mm = np.round(rainfall_mm, 1)

    humidity = np.clip(45 + 0.9 * rainfall_mm + rng.normal(0, 4, size=len(dates)) + (15 * is_monsoon), 20, 98)

    return pd.DataFrame(
        {
            "date": dates.strftime("%Y-%m-%d"),
            "tempC": np.round(temp_c, 1),
            "rainfallMm": rainfall_mm,
            "humidityPct": np.round(humidity, 0),
        }
    )


def weekly_weather_stress(weather_daily: pd.DataFrame) -> pd.DataFrame:
    """Aggregate daily weather into weekly drought/excess-rain stress signals."""
    df = weather_daily.copy()
    df["date"] = pd.to_datetime(df["date"])
    weekly = df.resample("W-MON", on="date").agg(
        avgTempC=("tempC", "mean"),
        totalRainfallMm=("rainfallMm", "sum"),
        avgHumidityPct=("humidityPct", "mean"),
    )
    weekly["rainAnomaly"] = (weekly["totalRainfallMm"] - weekly["totalRainfallMm"].mean()) / (
        weekly["totalRainfallMm"].std(ddof=0) + 1e-6
    )
    weekly["tempAnomaly"] = (weekly["avgTempC"] - weekly["avgTempC"].mean()) / (
        weekly["avgTempC"].std(ddof=0) + 1e-6
    )
    return weekly.reset_index()


def generate_ndvi(region_id: str, crop_id: str, weeks: int = 104, end: date | None = None) -> pd.DataFrame:
    """Weekly NDVI-proxy crop health series, stressed by weather anomalies."""
    crop = CROPS_BY_ID[crop_id]
    end = end or date.today()
    weather_daily = generate_weather(region_id, days=weeks * 7 + 14, end=end)
    weekly = weekly_weather_stress(weather_daily).tail(weeks).reset_index(drop=True)

    rng = _rng("ndvi", region_id, crop_id, str(end.isocalendar()[1] // 4))
    week_of_year = weekly["date"].dt.isocalendar().week.to_numpy()
    growth_cycle = 0.15 * np.sin(2 * np.pi * (week_of_year - 10) / 52)

    stress = crop.weather_sensitivity * (
        0.06 * np.clip(-weekly["rainAnomaly"], 0, None)  # drought hurts
        + 0.05 * np.clip(weekly["rainAnomaly"] - 1.5, 0, None)  # waterlogging hurts
        + 0.04 * np.clip(weekly["tempAnomaly"], 0, None)  # heat stress
    )
    noise = rng.normal(0, 0.02, size=len(weekly))
    ndvi = np.clip(0.62 + growth_cycle - stress + noise, 0.12, 0.95)

    return pd.DataFrame({"date": weekly["date"].dt.strftime("%Y-%m-%d"), "ndvi": np.round(ndvi, 3)})


def generate_prices(region_id: str, crop_id: str, weeks: int = 104, end: date | None = None) -> pd.DataFrame:
    """Weekly mandi modal price series, responding to crop-health and weather stress with a lag."""
    crop = CROPS_BY_ID[crop_id]
    end = end or date.today()
    ndvi_df = generate_ndvi(region_id, crop_id, weeks=weeks + 4, end=end)
    rng = _rng("price", region_id, crop_id, str(end.isocalendar()[1] // 4))

    ndvi = ndvi_df["ndvi"].to_numpy()
    # Lower crop health a few weeks ago -> tighter supply now -> upward price pressure.
    supply_pressure = -np.diff(ndvi, prepend=ndvi[0])
    supply_pressure = pd.Series(supply_pressure).rolling(3, min_periods=1).mean().to_numpy()

    week_idx = np.arange(len(ndvi))
    seasonality = 0.08 * np.sin(2 * np.pi * (week_idx - 6) / 52)

    volatility = 0.015 + 0.025 * crop.weather_sensitivity
    shocks = rng.normal(0, volatility, size=len(ndvi))

    log_return = seasonality * 0.1 + supply_pressure * crop.weather_sensitivity * 0.8 + shocks
    log_price = np.log(crop.base_price) + np.cumsum(log_return) * 0.3
    price = np.exp(log_price)
    price = price * (crop.base_price / price[: min(8, len(price))].mean())  # anchor near base_price

    out = pd.DataFrame({"date": ndvi_df["date"], "modalPriceRsPerQuintal": np.round(price, 0)})
    return out.tail(weeks).reset_index(drop=True)
