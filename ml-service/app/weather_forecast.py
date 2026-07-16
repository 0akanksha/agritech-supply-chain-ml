"""Live weather forecast via Open-Meteo's Forecast API (free, no key) — deliberately not
ETL-cached like weather.py's historical data: a forecast is only useful fresh, and re-fetching
it live on each request is exactly what a real weather app does. Distinct from
app/etl/weather.py, which backfills the *historical* archive into Postgres for model training.
"""

from __future__ import annotations

import httpx

from app.reference_data import Region

FORECAST_URL = "https://api.open-meteo.com/v1/forecast"
FORECAST_DAYS = 7

# Open-Meteo only ever returns this subset of the ~100 WMO codes. (text, emoji) pairs, chosen
# for what's actually relevant to farming decisions (rain/thunderstorm severity) over India's
# plains — the tracked regions never see snow, so those codes are mapped but not fine-tuned.
WMO_CODES: dict[int, tuple[str, str]] = {
    0: ("Clear sky", "☀️"),
    1: ("Mainly clear", "🌤️"),
    2: ("Partly cloudy", "⛅"),
    3: ("Overcast", "☁️"),
    45: ("Fog", "🌫️"),
    48: ("Fog", "🌫️"),
    51: ("Light drizzle", "🌦️"),
    53: ("Drizzle", "🌦️"),
    55: ("Heavy drizzle", "🌦️"),
    56: ("Freezing drizzle", "🌦️"),
    57: ("Freezing drizzle", "🌦️"),
    61: ("Light rain", "🌧️"),
    63: ("Rain", "🌧️"),
    65: ("Heavy rain", "🌧️"),
    66: ("Freezing rain", "🌧️"),
    67: ("Freezing rain", "🌧️"),
    71: ("Light snow", "🌨️"),
    73: ("Snow", "🌨️"),
    75: ("Heavy snow", "🌨️"),
    77: ("Snow grains", "🌨️"),
    80: ("Light rain showers", "🌦️"),
    81: ("Rain showers", "🌦️"),
    82: ("Violent rain showers", "⛈️"),
    85: ("Snow showers", "🌨️"),
    86: ("Heavy snow showers", "🌨️"),
    95: ("Thunderstorm", "⛈️"),
    96: ("Thunderstorm with hail", "⛈️"),
    99: ("Thunderstorm with heavy hail", "⛈️"),
}

_HEAVY_RAIN_CODES = {65, 82, 95, 96, 99}
_HEAVY_RAIN_MM_THRESHOLD = 20.0
_WET_WEEK_MM_THRESHOLD = 15.0
_DRY_WEEK_MM_THRESHOLD = 2.0


def _condition(code: int) -> tuple[str, str]:
    return WMO_CODES.get(code, ("Mixed conditions", "🌡️"))


def _farming_tip(days: list[dict]) -> str:
    """Simple rule-based heuristic over the week's forecast — not a model, just a plain-language
    nudge (rain -> maybe skip irrigation; heavy rain/storms -> hold off spraying/harvest)."""
    total_rain = sum(d["rainfallMm"] for d in days)
    heavy_day = next(
        (d for d in days if d["conditionCode"] in _HEAVY_RAIN_CODES or d["rainfallMm"] >= _HEAVY_RAIN_MM_THRESHOLD),
        None,
    )

    if heavy_day is not None:
        return (
            f"Heavy rain or thunderstorms expected around {heavy_day['date']} — consider "
            "delaying spraying and, if crops are exposed, harvest."
        )
    if total_rain >= _WET_WEEK_MM_THRESHOLD:
        return f"Rain expected this week (~{total_rain:.0f}mm total) — you may be able to skip irrigation for a few days."
    if total_rain <= _DRY_WEEK_MM_THRESHOLD:
        return "Dry conditions expected all week — plan for irrigation if soil moisture is low."
    return "Mixed conditions expected this week — no major weather risks flagged."


def fetch_forecast(region: Region) -> dict:
    resp = httpx.get(
        FORECAST_URL,
        params={
            "latitude": region.latitude,
            "longitude": region.longitude,
            "forecast_days": FORECAST_DAYS,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code",
            "timezone": "auto",
        },
        timeout=15.0,
    )
    resp.raise_for_status()
    daily = resp.json()["daily"]

    days = []
    for i, date in enumerate(daily["time"]):
        code = daily["weather_code"][i]
        text, emoji = _condition(code)
        days.append(
            {
                "date": date,
                "tempMaxC": daily["temperature_2m_max"][i],
                "tempMinC": daily["temperature_2m_min"][i],
                "rainfallMm": daily["precipitation_sum"][i],
                "rainChancePct": daily["precipitation_probability_max"][i],
                "conditionCode": code,
                "conditionText": text,
                "conditionEmoji": emoji,
            }
        )

    tip = _farming_tip(days)
    for d in days:
        del d["conditionCode"]  # internal-only, not part of the API response shape

    return {"region": region.name, "days": days, "farmingTip": tip}
