import httpx
from fastapi import APIRouter, HTTPException

from app.reference_data import REGIONS_BY_ID
from app.schemas import Forecast
from app.weather_forecast import fetch_forecast

router = APIRouter()


@router.get("/forecast", response_model=Forecast)
def get_forecast(region: str) -> Forecast:
    if region not in REGIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")
    # Called live on every dashboard load (not batched/retried like the ETL fetchers), so a
    # transient Open-Meteo hiccup shouldn't surface as an opaque 500 — the frontend already
    # has a clean fallback message for a proper error response.
    try:
        result = fetch_forecast(REGIONS_BY_ID[region])
    except httpx.HTTPError as e:
        raise HTTPException(status_code=502, detail="Forecast temporarily unavailable.") from e
    return Forecast(**result)
