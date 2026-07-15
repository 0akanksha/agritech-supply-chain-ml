"""Static reference data: a handful of major mandi regions and crops.

`state` doubles as the Agmarknet state filter (see app/etl/prices.py); `latitude`/
`longitude` are the real-world join keys for Open-Meteo (weather) and the ORNL DAAC MODIS
subset service (satellite NDVI) — see app/etl/weather.py and app/etl/satellite.py.
`base_temp_c`/`base_rainfall_mm` are used only by app/data/synthetic.py, which is now a
test-fixture generator (see app/data/features.py), not part of the real data path.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    state: str
    latitude: float
    longitude: float
    # Baseline climate skew used by the synthetic test-fixture generator, roughly modeling
    # each region's real climate (drier/hotter vs. wetter/cooler).
    base_temp_c: float
    base_rainfall_mm: float


@dataclass(frozen=True)
class Crop:
    id: str
    name: str
    # Typical mandi modal price baseline, in Rs/quintal, used to scale synthetic prices.
    base_price: float
    # How sensitive this crop's health/price is to weather stress (0-1).
    weather_sensitivity: float


REGIONS: list[Region] = [
    Region("nashik", "Nashik", "Maharashtra", latitude=19.9975, longitude=73.7898, base_temp_c=26.0, base_rainfall_mm=2.5),
    Region("pune", "Pune", "Maharashtra", latitude=18.5204, longitude=73.8567, base_temp_c=24.0, base_rainfall_mm=2.0),
    Region("ludhiana", "Ludhiana", "Punjab", latitude=30.9010, longitude=75.8573, base_temp_c=22.0, base_rainfall_mm=1.6),
    Region("agra", "Agra", "Uttar Pradesh", latitude=27.1767, longitude=78.0081, base_temp_c=27.0, base_rainfall_mm=1.4),
    Region("bengaluru", "Bengaluru", "Karnataka", latitude=12.9716, longitude=77.5946, base_temp_c=23.0, base_rainfall_mm=3.0),
    Region("indore", "Indore", "Madhya Pradesh", latitude=22.7196, longitude=75.8577, base_temp_c=25.0, base_rainfall_mm=2.1),
]

CROPS: list[Crop] = [
    Crop("wheat", "Wheat", base_price=2200, weather_sensitivity=0.55),
    Crop("rice", "Rice", base_price=1950, weather_sensitivity=0.65),
    Crop("onion", "Onion", base_price=1600, weather_sensitivity=0.85),
    Crop("tomato", "Tomato", base_price=1400, weather_sensitivity=0.9),
    Crop("potato", "Potato", base_price=1100, weather_sensitivity=0.6),
]

REGIONS_BY_ID: dict[str, Region] = {r.id: r for r in REGIONS}
CROPS_BY_ID: dict[str, Crop] = {c.id: c for c in CROPS}
