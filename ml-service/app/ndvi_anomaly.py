"""Rule-based crop-health anomaly signal — same spirit as app.pest_risk: a plain heuristic
over the NDVI series already loaded in predict.py, not a model.

Real MODIS NDVI updates roughly every ~16 days, so a full window rarely has more than a
handful of points — too sparse to reliably split into "short-term" vs "long-term" trend
segments. Instead this compares the single latest reading against the mean of the other
readings in the same lookback window ("recent trend" = recent history seen so far), which is
robust to that sparsity and still catches a reading that's meaningfully out of line with what
came before it. It does not attempt to distinguish the cause (drought, disease, waterlogging,
expected seasonal senescence) — like pest_risk, it only flags the pattern.
"""

from __future__ import annotations

import pandas as pd

# A drop this small is within the kind of season-to-season NDVI wobble seen in real regions
# here (e.g. ~5-10%) and isn't worth flagging.
_WATCH_DROP_PCT = 0.12
_ALERT_DROP_PCT = 0.25
_MIN_OBSERVATIONS = 4


def assess(ndvi_df: pd.DataFrame) -> dict:
    if len(ndvi_df) < _MIN_OBSERVATIONS:
        return {
            "level": "low",
            "message": "Not enough recent satellite readings yet to check for a crop-health anomaly.",
        }

    sorted_df = ndvi_df.assign(date=pd.to_datetime(ndvi_df["date"])).sort_values("date")
    latest = float(sorted_df["ndvi"].iloc[-1])
    baseline = float(sorted_df["ndvi"].iloc[:-1].mean())
    if baseline <= 0:
        return {"level": "low", "message": "No crop-health anomaly detected."}

    drop_pct = (baseline - latest) / baseline

    if drop_pct >= _ALERT_DROP_PCT:
        return {
            "level": "high",
            "message": (
                f"Satellite crop health has dropped sharply — the latest reading is "
                f"{drop_pct * 100:.0f}% below its recent average. Worth an in-field check to "
                "see what's changed (water stress, disease, or something else)."
            ),
        }
    if drop_pct >= _WATCH_DROP_PCT:
        return {
            "level": "medium",
            "message": (
                f"Satellite crop health is down {drop_pct * 100:.0f}% from its recent average — "
                "not alarming yet, but worth watching over the next couple of satellite passes."
            ),
        }
    return {"level": "low", "message": "No crop-health anomaly detected — NDVI is in line with its recent average."}
