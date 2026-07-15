from fastapi import APIRouter, HTTPException

from app.data.synthetic import generate_ndvi
from app.reference_data import CROPS_BY_ID, REGIONS_BY_ID
from app.schemas import CropHealthPoint

router = APIRouter()


@router.get("/satellite", response_model=list[CropHealthPoint])
def get_crop_health(region: str, crop: str) -> list[CropHealthPoint]:
    if region not in REGIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")
    if crop not in CROPS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown crop '{crop}'")
    df = generate_ndvi(region, crop, weeks=52)
    return [CropHealthPoint(**row) for row in df.to_dict(orient="records")]
