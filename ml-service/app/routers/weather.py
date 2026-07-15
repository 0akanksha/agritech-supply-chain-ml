from datetime import date, timedelta

from fastapi import APIRouter, HTTPException

from app.data.real_data import load_weather
from app.reference_data import REGIONS_BY_ID
from app.schemas import WeatherPoint

router = APIRouter()


@router.get("/weather", response_model=list[WeatherPoint])
def get_weather(region: str) -> list[WeatherPoint]:
    if region not in REGIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")
    end = date.today()
    df = load_weather(region, end - timedelta(days=180), end).dropna()
    return [WeatherPoint(**row) for row in df.to_dict(orient="records")]
