from fastapi import APIRouter, HTTPException

from app.models.predict import PredictionUnavailableError, predict
from app.reference_data import CROPS_BY_ID, REGIONS_BY_ID
from app.schemas import Prediction

router = APIRouter()


@router.get("/predict", response_model=Prediction)
def get_prediction(region: str, crop: str) -> Prediction:
    if region not in REGIONS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown region '{region}'")
    if crop not in CROPS_BY_ID:
        raise HTTPException(status_code=404, detail=f"Unknown crop '{crop}'")
    try:
        result = predict(region, crop)
    except PredictionUnavailableError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    return Prediction(**result)
