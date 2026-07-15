from datetime import date, timedelta

from fastapi import APIRouter, HTTPException

from app.data.real_data import load_ndvi
from app.reference_data import CROPS_BY_ID, REGIONS_BY_ID
from app.schemas import CropHealthPoint

router = APIRouter()


@router.get("/satellite", response_model=list[CropHealthPoint])
def get_crop_health(region: str, crop: str) -> list[CropHealthPoint]:
    if region not in REGIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")
    if crop not in CROPS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown crop '{crop}'")
    # `crop` is validated but unused: real satellite NDVI is region-level only (satellites
    # observe land, not crop labels) — see reference_data.py. Kept in the API contract so
    # the frontend's region+crop dashboard doesn't need a special case for this one panel.
    end = date.today()
    df = load_ndvi(region, end - timedelta(days=365), end).dropna()
    return [CropHealthPoint(**row) for row in df.to_dict(orient="records")]
