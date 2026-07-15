from fastapi import APIRouter

from app.reference_data import CROPS
from app.schemas import CropOut

router = APIRouter()


@router.get("/crops", response_model=list[CropOut])
def list_crops() -> list[CropOut]:
    return [CropOut(id=c.id, name=c.name) for c in CROPS]
