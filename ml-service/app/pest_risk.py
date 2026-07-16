"""Rule-based pest/disease risk signal — same spirit as app.weather_forecast's farming tip:
a plain heuristic over weather + crop-health data already loaded elsewhere in predict.py, not
a model.

Fungal/bacterial disease (blight, mildew, rot) is favored by sustained warm+humid conditions
("leaf wetness" conducive to spore germination) — a well-known agronomy rule of thumb, not
crop-specific science. Certain pests (aphids, whiteflies, mites) are instead favored by hot,
dry conditions. Declining crop health (NDVI) on top of either raises the flag from a proactive
"watch out" to an elevated-risk warning, since it may mean something is already underway.
"""

from __future__ import annotations

# Broad agronomy rule-of-thumb ranges, not crop-specific.
_HUMID_THRESHOLD_PCT = 75.0
_FUNGAL_TEMP_RANGE_C = (15.0, 30.0)
_HOT_DRY_TEMP_C = 32.0
_DRY_HUMIDITY_PCT = 40.0
_NDVI_DECLINING_THRESHOLD = -0.02

# A few crops have a disease commonly associated with this weather pattern; default to a
# generic term otherwise — this isn't a full per-crop pest database, just a plainer message.
_FUNGAL_DISEASE_BY_CROP = {
    "tomato": "blight",
    "potato": "blight",
    "wheat": "rust",
    "rice": "blast",
}


def assess(crop_id: str, crop_name: str, avg_humidity_pct: float, avg_temp_c: float, ndvi_trend: float) -> dict:
    is_humid = avg_humidity_pct >= _HUMID_THRESHOLD_PCT
    is_fungal_temp = _FUNGAL_TEMP_RANGE_C[0] <= avg_temp_c <= _FUNGAL_TEMP_RANGE_C[1]
    is_hot_dry = avg_temp_c >= _HOT_DRY_TEMP_C and avg_humidity_pct <= _DRY_HUMIDITY_PCT
    is_declining = ndvi_trend <= _NDVI_DECLINING_THRESHOLD

    if is_humid and is_fungal_temp:
        disease = _FUNGAL_DISEASE_BY_CROP.get(crop_id, "fungal disease")
        if is_declining:
            return {
                "level": "high",
                "message": (
                    f"Warm, humid conditions plus declining crop health — elevated risk of {disease} "
                    f"in {crop_name}. Worth an in-field check and preventive fungicide if not already applied."
                ),
            }
        return {
            "level": "medium",
            "message": (
                f"Warm, humid conditions this week favor {disease} in {crop_name} — worth watching "
                "closely even though crop health looks stable so far."
            ),
        }

    if is_hot_dry:
        if is_declining:
            return {
                "level": "medium",
                "message": (
                    f"Hot, dry conditions can favor pests like aphids and whiteflies in {crop_name} — "
                    "combined with declining crop health, worth an in-field check."
                ),
            }
        return {
            "level": "low",
            "message": f"Hot, dry conditions can favor pests like aphids and whiteflies in {crop_name}.",
        }

    return {"level": "low", "message": "No elevated pest or disease risk signals from this week's weather."}
