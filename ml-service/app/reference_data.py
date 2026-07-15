"""Static reference data for Phase 1: a handful of major mandi regions and crops.

Real Agmarknet/IMD/satellite integrations replace this in Phase 3 — for now these
ids just seed the synthetic data generators deterministically.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Region:
    id: str
    name: str
    state: str
    # Baseline climate skew used by the synthetic generators, roughly modeling
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
    Region("nashik", "Nashik", "Maharashtra", base_temp_c=26.0, base_rainfall_mm=2.5),
    Region("pune", "Pune", "Maharashtra", base_temp_c=24.0, base_rainfall_mm=2.0),
    Region("ludhiana", "Ludhiana", "Punjab", base_temp_c=22.0, base_rainfall_mm=1.6),
    Region("agra", "Agra", "Uttar Pradesh", base_temp_c=27.0, base_rainfall_mm=1.4),
    Region("bengaluru", "Bengaluru", "Karnataka", base_temp_c=23.0, base_rainfall_mm=3.0),
    Region("indore", "Indore", "Madhya Pradesh", base_temp_c=25.0, base_rainfall_mm=2.1),
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
