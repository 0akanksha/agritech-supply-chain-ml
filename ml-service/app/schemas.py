from __future__ import annotations

from typing import Literal

from pydantic import BaseModel


class RegionOut(BaseModel):
    id: str
    name: str
    state: str


class CropOut(BaseModel):
    id: str
    name: str


class WeatherPoint(BaseModel):
    date: str
    tempC: float
    rainfallMm: float
    humidityPct: float


class CropHealthPoint(BaseModel):
    date: str
    ndvi: float


class PricePoint(BaseModel):
    date: str
    modalPriceRsPerQuintal: float


RiskLevel = Literal["low", "medium", "high"]


class RiskFactor(BaseModel):
    label: str
    contribution: float


class Prediction(BaseModel):
    region: str
    crop: str
    riskLevel: RiskLevel
    riskScore: float
    daysToBottleneck: int | None
    explanation: str
    factors: list[RiskFactor]
