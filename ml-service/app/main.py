from fastapi import FastAPI

from app.routers import admin, crops, predict, prices, regions, satellite, weather

# No CORS middleware, no auth middleware: this service is never reachable except from Express,
# which spawns it as a child process bound to 127.0.0.1 in production (see
# server/src/lib/embeddedMlService.ts) — genuinely unreachable from outside the container, not
# just unadvertised. In local dev it's reachable only via Express's proxy (server/src/routes/
# ml.routes.ts / admin.routes.ts) same as always.
app = FastAPI(title="AgriTech ML Service", version="0.1.0")

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
