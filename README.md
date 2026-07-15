# AgriTech — Predictive AgriTech Supply Chains

Small farmers face volatile mandi (wholesale market) pricing and climate risk. This platform
fuses weather, satellite crop-health, and mandi price trends into regional ML models that flag
localized supply-chain bottlenecks before they hit.

**Phase 2 (current)**: Express + Neon Postgres + JWT auth sit in front of the Phase 1 ML service.
The dashboard itself is still public and still runs on synthetic weather/satellite/price data —
what's new is accounts: farmers can sign up, save the region/crop combinations they care about,
and check them on a "My Farms" page. See the roadmap below for what comes next.

## Architecture

```
AgriTech/
├── src/                      # React + Vite + TS frontend
│   ├── pages/                  # Dashboard, Login, Signup, Farms ("My Farms")
│   ├── context/AuthContext.tsx # signup/login/logout/me
│   ├── components/             # WeatherPanel, CropHealthPanel, PriceTrendChart, RiskAlert,
│   │                            # RiskBadge, Header, ProtectedRoute
│   └── lib/api.ts              # generic fetch helper + typed calls to /api/auth, /api/farms,
│                                # /api/ml/*
├── server/                    # Express + Drizzle backend (NEW in Phase 2)
│   ├── src/db/schema.ts        # users, savedFarms
│   ├── src/routes/auth.routes.ts    # signup, login, logout, me (JWT in httpOnly cookie)
│   ├── src/routes/farms.routes.ts   # requireAuth: list/create/delete saved farms
│   ├── src/routes/ml.routes.ts      # public thin proxy -> the Python ML service
│   └── src/index.ts            # single process: serves the API, and the frontend itself
│                                # (Vite in middleware mode in dev, static dist in prod)
└── ml-service/                 # Python FastAPI service — data + ML (unchanged from Phase 1)
    ├── app/
    │   ├── reference_data.py   # 6 Indian mandi regions × 5 crops
    │   ├── data/synthetic.py   # seeded weather/NDVI/price generators
    │   ├── data/features.py    # weekly feature engineering + rule-based synthetic label
    │   ├── models/train.py     # trains + saves one RandomForestRegressor per crop
    │   ├── models/predict.py   # loads a model, scores a region/crop, explains the score
    │   └── routers/            # regions, crops, weather, satellite, prices, predict
    └── tests/test_model.py     # pytest: every region×crop predicts a valid risk score
```

Express (port 4000) is now the single browser-facing process, matching the other apps in this
workspace: it serves the frontend itself and owns `/api/auth`, `/api/farms`, and `/api/ml`
(a thin server-side proxy to the Python service on port 8000 — the browser never talks to it
directly). The ML service and its pytest suite are otherwise untouched from Phase 1.

**Bottleneck Risk Score**: a 0–100 composite of predicted price volatility, crop-health (NDVI)
trend, and weather stress (drought/excess-rain), learned by a small scikit-learn model trained on
synthetic labeled history — a real (if demo-scale) supervised learning task, not a lookup table.

## Running locally

Requires Node 20+, Python 3.11+, and a Postgres database (this project uses
[Neon](https://neon.tech)'s serverless Postgres, like the other apps in this workspace).

```bash
# one-time setup
npm install
npm install --prefix server
cp server/.env.example server/.env   # fill in DATABASE_URL and JWT_SECRET
npm run db:push                       # creates the users/saved_farms tables

cd ml-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.models.train   # trains and saves the per-crop models
cd ..

# every time
npm run dev   # runs Express (4000, serving the app + API) and uvicorn (8000) together
```

Open http://localhost:4000 — the dashboard works without an account; sign up to unlock
"Save this farm" and the **My Farms** page.

Other useful commands:
- `npm run lint` — oxlint on the frontend
- `npm run build:all` — production build of both the frontend and the server
- `cd ml-service && .venv/bin/python -m pytest tests/` — pipeline sanity tests (train → predict,
  every region × crop combination)

## Roadmap

- **Phase 3 — Real data + MLOps**: swap the synthetic generators for real sources (Open-Meteo for
  weather, Sentinel/MODIS NDVI for satellite, Agmarknet/data.gov.in for mandi prices); add a
  scheduled ETL pulling data into Postgres; add model versioning, scheduled retraining, and basic
  experiment tracking. This is also the natural point to revisit an admin role, once there's
  reference data and retraining jobs for one to actually administer.
- **Phase 4 — DevOps/Deploy**: Dockerize the ML service, add CI (lint+build on push), deploy the
  Express+React app to Render and the ML service as a second Render web service, wire health
  checks and env vars, then go live.
