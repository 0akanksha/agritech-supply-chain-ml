"""Pure weekly feature engineering + labeling, shared by training and inference.

`build_feature_and_label_frame` takes three already-loaded DataFrames (weather/ndvi/price —
same column shapes whether they came from real Postgres data via app/data/real_data.py, or
from the synthetic test-fixture generator app/data/synthetic.py) and doesn't know or care
which. That's deliberate: it keeps this module's logic — the part with real correctness risk
(rolling windows, label construction, no lookahead leakage) — unit-testable without a
database or network, while train.py/predict.py wire it to real data in production.

Label: real, backtestable "future realized price volatility" — see train.py's module
docstring for why this replaced the old rule-based-on-synthetic-inputs label from Phase 1.
"""

from __future__ import annotations

import pandas as pd

FEATURE_COLUMNS = [
    "price_volatility_4w",
    "price_trend_abs_4w",
    "ndvi_level",
    "ndvi_trend_4w",
    "rain_anomaly_4w",
    "temp_anomaly_4w",
]

# All but ndvi_level double as "drivers" shown in the explanation UI (see predict.py);
# ndvi_level (absolute health level, not a trend) is an auxiliary model input only.
DRIVER_COLUMNS = [c for c in FEATURE_COLUMNS if c != "ndvi_level"]

FEATURE_LABELS = {
    "price_volatility_4w": "Price volatility",
    "price_trend_abs_4w": "Price swing (4wk)",
    "ndvi_level": "Crop health level",
    "ndvi_trend_4w": "Crop health decline",
    "rain_anomaly_4w": "Drought signal",
    "temp_anomaly_4w": "Heat stress",
}

LABEL_HORIZON_WEEKS = 4
# A 30% price swing within a month maps to the max risk score (100).
LABEL_CALIBRATION = 0.30


def _weekly_weather_stress(weather_daily: pd.DataFrame) -> pd.DataFrame:
    """Daily weather -> weekly avg temp / total rainfall + z-score anomalies."""
    df = weather_daily.copy()
    df["date"] = pd.to_datetime(df["date"])
    weekly = df.resample("W-MON", on="date").agg(
        avgTempC=("tempC", "mean"),
        totalRainfallMm=("rainfallMm", "sum"),
    )
    weekly["rainAnomaly"] = (weekly["totalRainfallMm"] - weekly["totalRainfallMm"].mean()) / (
        weekly["totalRainfallMm"].std(ddof=0) + 1e-6
    )
    weekly["tempAnomaly"] = (weekly["avgTempC"] - weekly["avgTempC"].mean()) / (
        weekly["avgTempC"].std(ddof=0) + 1e-6
    )
    return weekly.reset_index()


def _weekly_ndvi(ndvi_df: pd.DataFrame, weekly_dates: pd.Series) -> pd.Series:
    """NDVI updates roughly every ~16 days (real) or weekly (synthetic fixtures) — align
    onto the weekly grid by carrying forward the most recent observation."""
    if ndvi_df.empty:
        return pd.Series([None] * len(weekly_dates), index=weekly_dates.index)
    ndvi_sorted = ndvi_df.assign(date=pd.to_datetime(ndvi_df["date"])).sort_values("date")
    aligned = pd.merge_asof(
        pd.DataFrame({"date": weekly_dates}).sort_values("date"),
        ndvi_sorted[["date", "ndvi"]],
        on="date",
        direction="backward",
    )
    return aligned.set_index(weekly_dates.index)["ndvi"]


def _weekly_price(price_df: pd.DataFrame) -> pd.DataFrame:
    df = price_df.copy()
    df["date"] = pd.to_datetime(df["date"])
    weekly = df.resample("W-MON", on="date")["modalPriceRsPerQuintal"].mean()
    return weekly.reset_index()


def _future_volatility_label(price: pd.Series) -> pd.Series:
    """label[t] = worst |pct change| from price[t] over the next LABEL_HORIZON_WEEKS weeks,
    scaled 0-100. NaN for the trailing weeks whose future isn't in the frame — those rows
    must be dropped before training (they'd otherwise silently look "risk-free")."""
    n = len(price)
    label = pd.Series(index=price.index, dtype=float)
    for i in range(n):
        future = price.iloc[i + 1 : i + 1 + LABEL_HORIZON_WEEKS]
        if len(future) < LABEL_HORIZON_WEEKS or price.iloc[i] == 0:
            label.iloc[i] = float("nan")
            continue
        worst_move = (future - price.iloc[i]).abs().max() / price.iloc[i]
        label.iloc[i] = min(100.0, 100.0 * worst_move / LABEL_CALIBRATION)
    return label


def build_feature_and_label_frame(
    weather_df: pd.DataFrame,
    ndvi_df: pd.DataFrame,
    price_df: pd.DataFrame,
    *,
    with_label: bool = False,
) -> pd.DataFrame:
    """Weekly feature rows (+ optional label) from raw weather/ndvi/price DataFrames.

    weather_df: [date, tempC, rainfallMm, humidityPct] (daily)
    ndvi_df: [date, ndvi] (any cadence)
    price_df: [date, modalPriceRsPerQuintal] (any cadence)
    """
    weekly = _weekly_weather_stress(weather_df)
    weekly["ndvi"] = _weekly_ndvi(ndvi_df, weekly["date"])
    price_weekly = _weekly_price(price_df)
    weekly = weekly.merge(price_weekly, on="date", how="inner").sort_values("date").reset_index(drop=True)

    price = weekly["modalPriceRsPerQuintal"]
    pct_change = price.pct_change()
    weekly["price_volatility_4w"] = pct_change.rolling(4).std()
    weekly["price_trend_abs_4w"] = price.pct_change(4).abs()
    weekly["ndvi_level"] = weekly["ndvi"]
    weekly["ndvi_trend_4w"] = weekly["ndvi"].diff(4)
    weekly["rain_anomaly_4w"] = weekly["rainAnomaly"].rolling(4).mean()
    weekly["temp_anomaly_4w"] = weekly["tempAnomaly"].rolling(4).mean()

    if with_label:
        weekly["bottleneck_risk"] = _future_volatility_label(price)
        required = [*FEATURE_COLUMNS, "bottleneck_risk"]
    else:
        required = FEATURE_COLUMNS

    weekly["date"] = weekly["date"].dt.strftime("%Y-%m-%d")
    return weekly.dropna(subset=required).reset_index(drop=True)
