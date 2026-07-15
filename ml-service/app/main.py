from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import crops, predict, prices, regions, satellite, weather

app = FastAPI(title="AgriTech ML Service", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(regions.router, prefix="/api")
app.include_router(crops.router, prefix="/api")
app.include_router(weather.router, prefix="/api")
app.include_router(satellite.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(predict.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
