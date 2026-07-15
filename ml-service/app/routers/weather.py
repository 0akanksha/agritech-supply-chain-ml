from fastapi import APIRouter, HTTPException

from app.data.synthetic import generate_weather
from app.reference_data import REGIONS_BY_ID
from app.schemas import WeatherPoint

router = APIRouter()


@router.get("/weather", response_model=list[WeatherPoint])
def get_weather(region: str) -> list[WeatherPoint]:
    if region not in REGIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")
    df = generate_weather(region, days=180)
    return [WeatherPoint(**row) for row in df.to_dict(orient="records")]
