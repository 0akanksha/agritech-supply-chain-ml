# AgriTech — Predictive AgriTech Supply Chains

Small farmers face volatile mandi (wholesale market) pricing and climate risk. This platform
fuses weather, satellite crop-health, and mandi price trends into regional ML models that flag
localized supply-chain bottlenecks before they hit.

**Phase 4 (current)**: deployable. A GitHub Actions pipeline runs CI (typecheck/lint/tests) on
every push and, once it's green on `main`, triggers a deploy of both Render services — Render's
own auto-deploy-on-push is deliberately turned off so a deploy only ever happens after CI passes
(see "Deploying" below). Real weather (Open-Meteo) and real satellite crop-health (NASA/ORNL
DAAC MODIS NDVI) feed the dashboard and the models; mandi prices are placeholder demo data until
a free data.gov.in API key is connected (see "Connecting real mandi prices") — once it is, real
Agmarknet data replaces the placeholder automatically. The bottleneck-risk label is a genuine,
backtestable target (future realized price volatility, not a synthetic formula — see "How the
model works"), trained runs are tracked in MLflow, and a seeded admin account can trigger ETL
refreshes and retraining from an admin page.

## Architecture

```
AgriTech/
├── .github/workflows/ci-deploy.yml   # CI on every push/PR; deploys (via Render Deploy Hooks)
│                                      # only on push to main, only after CI passes
├── render.yaml                    # the two Render services (Blueprint), autoDeploy: false
├── src/                          # React + Vite + TS frontend
│   ├── pages/                      # Dashboard, Login, Signup, Farms, Admin
│   ├── context/AuthContext.tsx     # signup/login/logout/me
│   ├── components/                 # WeatherPanel, CropHealthPanel, PriceTrendChart, RiskAlert,
│   │                                # RiskBadge, Header, ProtectedRoute, AdminRoute
│   └── lib/api.ts                  # generic fetch helper + typed calls to /api/auth,
│                                    # /api/farms, /api/ml/*, /api/admin/*
├── server/                        # Express + Drizzle backend
│   ├── src/db/schema.ts            # users (+ role), savedFarms
│   ├── src/lib/ensureAdmin.ts      # seeds one admin from ADMIN_EMAIL/ADMIN_PASSWORD
│   ├── src/routes/auth.routes.ts   # signup, login, logout, me (JWT in httpOnly cookie)
│   ├── src/routes/farms.routes.ts  # requireAuth: list/create/delete saved farms
│   ├── src/routes/ml.routes.ts     # public thin proxy -> the Python ML service
│   ├── src/routes/admin.routes.ts  # requireAuth+requireAdmin: proxy -> ML service /admin/*
│   └── src/index.ts                # single process: serves the API and the frontend itself
│                                    # (Vite in middleware mode in dev, static dist in prod)
└── ml-service/                    # Python FastAPI service — data + ML
    ├── Dockerfile, .dockerignore   # how Render builds this service (runtime: docker)
    ├── app/
    │   ├── reference_data.py       # 6 Indian mandi regions (+ lat/lon) × 5 crops
    │   ├── db.py, schema.sql, migrate.py   # this service's own Postgres tables, in a
    │   │                            # separate `ml` schema (see db.py's docstring for why)
    │   ├── internal_auth.py        # X-Internal-Secret check — see "Deploying" below
    │   ├── data/
    │   │   ├── synthetic.py        # seeded generators — now a test-fixture generator only
    │   │   ├── real_data.py        # Postgres reads, same shape as synthetic.py's output
    │   │   └── features.py         # pure feature/label function fed by either source
    │   ├── etl/                    # weather.py (Open-Meteo), satellite.py (MODIS),
    │   │                            # prices.py (Agmarknet), run.py (orchestrator + status),
    │   │                            # seed_placeholder_prices.py (see below)
    │   ├── models/train.py         # trains + MLflow-logs one model per crop
    │   ├── models/predict.py       # loads a model, scores a region/crop, explains the score
    │   ├── models/storage.py       # saves/loads trained models to local disk + Postgres —
    │   │                            # see "Deploying" for why both
    │   └── routers/                # regions, crops, weather, satellite, prices, predict, admin
    └── tests/test_model.py         # pytest: pure feature/label logic, offline, no DB/network
```

Express (port 4000) is the single browser-facing process: it serves the frontend and owns
`/api/auth`, `/api/farms`, `/api/ml` (public proxy), and `/api/admin` (admin-only proxy) to the
Python service on port 8000. Locally the browser never reaches the ML service directly; in
production it technically can (see "Deploying"), which is what `internal_auth.py` guards against.

## How the model works

Weather and NDVI are model **inputs**, pulled from real APIs and cached in Postgres. The
**label** — what the model is trained to predict — is *future realized price volatility*:
for each week, "how big was the worst mandi price swing over the following month," computed
directly from real historical prices (not a rule-of-thumb formula, like Phase 1's synthetic
version was). That makes it a genuine, backtestable supervised-learning target: train on the
past, test on the most recent slice (time-aware split, not random — random would leak future
price info across the split). Crops without enough real price history yet are skipped, not
crashed; the dashboard shows a clear "not enough data yet" message instead of a fake score.

Because the label discards direction (it's a magnitude of swing, not up-vs-down), the model
can't honestly claim to predict *which way* prices will move. The dashboard's plain-language
summary is upfront about this distinction: it states the recent price trend as an observed
fact (computed directly from real price history, not model output) alongside the model's risk
outlook, rather than implying the model forecasts direction.

Each training run is logged to **MLflow** (local file-store backend — no server process
required) for experiment tracking/versioning: `cd ml-service && .venv/bin/mlflow ui
--backend-store-uri file:./mlruns` to browse it. The fitted model is also saved via
`app/models/storage.py`, which is what actually serves predictions — MLflow is for
history/versioning, not the request-time path. `storage.py` writes to *both* a local
`app/models/artifacts/{crop}.joblib` file (the fast path) and a `model_artifacts` table in
Postgres; `predict.py` reads the local file first and falls back to Postgres if it's missing.
That fallback is what makes served models survive a Render redeploy — see "Deploying".

## Real data sources

- **Weather**: [Open-Meteo Historical Weather API](https://open-meteo.com/en/docs/historical-weather-api)
  — free, no key.
- **Satellite NDVI**: [ORNL DAAC MODIS subset service](https://modis.ornl.gov/data/modis_webservice.html)
  (`MOD13Q1`, 16-day composites) — free, no key. NDVI is region-level only (satellites don't see
  crop labels), shared across that region's crops.
- **Mandi prices**: [data.gov.in Agmarknet](https://www.data.gov.in/apis/9ef84268-d588-465a-a308-a864a43d0070)
  — free, but needs a personal API key (see below). Matched by state + commodity and aggregated
  to a daily state-wide mean modal price, not one exact market (the free API can't be reliably
  pre-mapped to a specific mandi per region).

### Connecting real mandi prices

1. Sign up at [data.gov.in](https://www.data.gov.in) and generate an API key (My Account → API
   keys). Registration goes through the Jan Parichay government SSO and its OTP delivery is
   sometimes flaky — if it fails, try again in a few minutes, try email OTP instead of SMS, or
   contact `support-parichay@nic.in` / `1800-111-555`.
2. Put the key in `ml-service/.env` as `DATA_GOV_IN_API_KEY`.
3. Run an ETL refresh (admin page "Run ETL now", or `cd ml-service && .venv/bin/python -m
   app.etl.run`) and then retrain (admin page "Retrain models", or `.venv/bin/python -m
   app.models.train`). Real Agmarknet rows overwrite the placeholder ones for the same
   region/crop/date automatically — no manual cleanup.

Until then, `ml-service/app/etl/seed_placeholder_prices.py` seeds synthetic demo prices (tagged
`source='synthetic_placeholder'` in the `mandi_prices` table) so the price chart, training, and
predictions all have something to work with.

## Running locally

Requires Node 20+, Python 3.11+, and a Postgres database (this project uses
[Neon](https://neon.tech)'s serverless Postgres, like the other apps in this workspace).

```bash
# one-time setup
npm install
npm install --prefix server
cp server/.env.example server/.env      # DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
cp ml-service/.env.example ml-service/.env   # same DATABASE_URL; DATA_GOV_IN_API_KEY optional
npm run db:push                          # creates users/saved_farms (Express)

cd ml-service
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python -m app.migrate                    # creates this service's own tables
.venv/bin/python -m app.etl.run                    # backfills real weather + NDVI (~10 min;
                                                     # prices skip cleanly without an API key)
.venv/bin/python -m app.etl.seed_placeholder_prices  # optional: demo prices until you have a key
.venv/bin/python -m app.models.train
cd ..

# every time
npm run dev   # runs Express (4000, serving the app + API) and uvicorn (8000) together
```

Open http://localhost:4000 — the dashboard works without an account; sign up to unlock "Save
this farm" and **My Farms**. Log in with the seeded `ADMIN_EMAIL`/`ADMIN_PASSWORD` to reach
**Admin** in the nav and trigger ETL/retraining from the UI instead of the CLI.

Other useful commands:
- `npm run lint` — oxlint on the frontend
- `npm run build:all` — production build of both the frontend and the server
- `cd ml-service && .venv/bin/python -m pytest tests/` — offline feature/label pipeline tests
  (no DB or network needed)
- `cd ml-service && .venv/bin/mlflow ui --backend-store-uri file:./mlruns` — browse training runs

## Deploying

Two [Render](https://render.com) services (`render.yaml`, a Blueprint) plus a GitHub Actions
pipeline that's the only thing allowed to trigger a deploy — Render's own auto-deploy-on-push is
turned off (`autoDeploy: false` on both services) so a bad push can't go live just because it
was pushed; it has to pass CI first.

### One-time setup

1. **Create the Blueprint**: Render dashboard → New → Blueprint → connect this GitHub repo →
   it reads `render.yaml` and creates `agritech-web` and `agritech-ml`. Nothing deploys
   automatically yet (`autoDeploy: false`).
2. **Fill in env vars** on each service (Render dashboard → service → Environment) — everything
   marked `sync: false` in `render.yaml`:
   - Both services: the same Neon `DATABASE_URL`.
   - `agritech-web`: `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
   - `agritech-ml`: `DATA_GOV_IN_API_KEY` (optional — leave blank to keep placeholder prices).
   - Generate one secret (e.g. `openssl rand -hex 32`) and set it as `INTERNAL_ML_SECRET` on
     **both** services — this is what stops a stranger from hitting `agritech-ml`'s public URL
     directly (see `app/internal_auth.py`; free-tier Render services can't be made
     private-network-only, so this app-level check is what actually protects it).
   - Once `agritech-ml` exists, copy its Render-assigned URL into `agritech-web`'s
     `ML_SERVICE_URL`.
   - `JWT_SECRET` is auto-generated by the Blueprint; nothing to do there.
3. **Push the DB schema once**: `npm run db:push` (Express/Drizzle tables) locally against the
   same `DATABASE_URL`, and let `agritech-ml`'s first deploy run its own migration automatically
   (`Dockerfile`'s `CMD` runs `python -m app.migrate` on every container start — safe, purely
   additive). Schema changes are never auto-applied from CI: an earlier unguarded `db:push`
   against this same database once came within a TTY-prompt of dropping 4,600+ real ETL rows it
   didn't recognize (see `db.py`'s docstring) — that's also why the two services keep separate
   Postgres schemas (`public` for Express, `ml` for the ML service).
4. **Wire up GitHub Actions**: each service's Settings tab has a Deploy Hook URL. Add them as
   repo secrets — `RENDER_DEPLOY_HOOK_WEB` and `RENDER_DEPLOY_HOOK_ML` (Settings → Secrets and
   variables → Actions, or `gh secret set RENDER_DEPLOY_HOOK_WEB`).

### Day to day

Push to `main` → `.github/workflows/ci-deploy.yml` runs typecheck/lint/tests for the frontend,
server, and ML service (plus a `docker build` sanity check) → if all pass, it `curl`s both Deploy
Hooks → Render rebuilds and redeploys both services. Pull requests run the same CI checks but
never deploy.

### Free-tier things worth knowing

- Free Render services sleep after 15 minutes idle and take ~30-50s to wake on the next
  request — expect a slow first load after a quiet period.
- Free services get no persistent disk, which is why trained models live in Postgres
  (`app/models/storage.py`) rather than only on local disk, and why MLflow's *run history*
  (not the models themselves) resets on every deploy/cold-start — see `ml-service/.env.example`.
- ETL refreshes and retraining are still manually triggered (admin page or CLI), not on a
  schedule — a natural next step would be a Render Cron Job calling `python -m app.etl.run`
  periodically, which needs its own env vars but no code changes to the ETL modules themselves.
