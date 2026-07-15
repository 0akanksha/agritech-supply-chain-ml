from fastapi import APIRouter, HTTPException

from app.data.synthetic import generate_prices
from app.reference_data import CROPS_BY_ID, REGIONS_BY_ID
from app.schemas import PricePoint

router = APIRouter()


@router.get("/prices", response_model=list[PricePoint])
def get_prices(region: str, crop: str) -> list[PricePoint]:
    if region not in REGIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")
    if crop not in CROPS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown crop '{crop}'")
    df = generate_prices(region, crop, weeks=52)
    return [PricePoint(**row) for row in df.to_dict(orient="records")]
