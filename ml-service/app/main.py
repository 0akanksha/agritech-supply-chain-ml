from fastapi import FastAPI

from app.internal_auth import require_internal_secret
from app.routers import admin, crops, predict, prices, regions, satellite, weather

# No CORS middleware: this service is never called directly from the browser — Express
# proxies every request server-side (see server/src/routes/ml.routes.ts / admin.routes.ts).
app = FastAPI(title="AgriTech ML Service", version="0.1.0")

app.middleware("http")(require_internal_secret)

app.include_router(regions.router, prefix="/api")
app.include_router(crops.router, prefix="/api")
app.include_router(weather.router, prefix="/api")
app.include_router(satellite.router, prefix="/api")
app.include_router(prices.router, prefix="/api")
app.include_router(predict.router, prefix="/api")
app.include_router(admin.router, prefix="/api")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
