# AgriTech — Predictive AgriTech Supply Chains

Small farmers face volatile mandi (wholesale market) pricing and climate risk. This platform
fuses weather, satellite crop-health, and mandi price trends into regional ML models that flag
localized supply-chain bottlenecks before they hit.

**Phase 1 (current)**: a local-only prototype. No database, no auth, no external API keys —
weather/satellite/price data is generated synthetically but deterministically, and a real
scikit-learn model (one per crop) is trained on it and served for inference. See the roadmap
below for what comes next.

## Architecture

```
AgriTech/
├── src/                 # React + Vite + TS frontend — single-region dashboard
│   ├── pages/Dashboard.tsx
│   ├── components/       # WeatherPanel, CropHealthPanel, PriceTrendChart, RiskAlert
│   └── lib/api.ts        # fetch wrappers hitting /api/* (proxied to the ML service)
└── ml-service/           # Python FastAPI service — data + ML
    ├── app/
    │   ├── reference_data.py   # 6 Indian mandi regions × 5 crops
    │   ├── data/synthetic.py   # seeded weather/NDVI/price generators
    │   ├── data/features.py    # weekly feature engineering + rule-based synthetic label
    │   ├── models/train.py     # trains + saves one RandomForestRegressor per crop
    │   ├── models/predict.py   # loads a model, scores a region/crop, explains the score
    │   └── routers/            # regions, crops, weather, satellite, prices, predict
    └── tests/test_model.py     # pytest: every region×crop predicts a valid risk score
```

The frontend (Vite, port 5173) proxies `/api/*` to the ML service (FastAPI/uvicorn, port 8000)
in dev — there's no separate backend yet in Phase 1.

**Bottleneck Risk Score**: a 0–100 composite of predicted price volatility, crop-health (NDVI)
trend, and weather stress (drought/excess-rain), learned by a small scikit-learn model trained on
synthetic labeled history — a real (if demo-scale) supervised learning task, not a lookup table.

## Running locally

Requires Node 20+ and Python 3.11+.

```bash
# one-time setup
npm install
cd ml-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.models.train   # trains and saves the per-crop models
cd ..

# every time
npm run dev   # runs Vite (5173) and uvicorn (8000) together
```

Open http://localhost:5173, pick a region and crop, and the weather/crop-health/price charts
and the bottleneck risk panel will populate.

Other useful commands:
- `npm run lint` — oxlint on the frontend
- `cd ml-service && .venv/bin/python -m pytest tests/` — pipeline sanity tests (train → predict,
  every region × crop combination)

## Roadmap

- **Phase 2 — Backend/DB/Auth**: introduce Express (single-process pattern, matching the other
  apps in this workspace), Neon Postgres + Drizzle, JWT-in-httpOnly-cookie auth. Express proxies
  `/api/predict` etc. to the Python service; Postgres stores users, saved regions/farms, and
  cached historical data.
- **Phase 3 — Real data + MLOps**: swap the synthetic generators for real sources (Open-Meteo for
  weather, Sentinel/MODIS NDVI for satellite, Agmarknet/data.gov.in for mandi prices); add a
  scheduled ETL pulling data into Postgres; add model versioning, scheduled retraining, and basic
  experiment tracking.
- **Phase 4 — DevOps/Deploy**: Dockerize the ML service, add CI (lint+build on push), deploy the
  Express+React app to Render and the ML service as a second Render web service, wire health
  checks and env vars, then go live.
