from fastapi import APIRouter

from app.reference_data import REGIONS
from app.schemas import RegionOut

router = APIRouter()


@router.get("/regions", response_model=list[RegionOut])
def list_regions() -> list[RegionOut]:
    return [RegionOut(id=r.id, name=r.name, state=r.state) for r in REGIONS]
