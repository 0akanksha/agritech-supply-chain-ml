# AgriTech — Predictive AgriTech Supply Chains

Small farmers face volatile mandi (wholesale market) pricing and climate risk. This platform
fuses weather, satellite crop-health, and mandi price trends into regional ML models that flag
localized supply-chain bottlenecks before they hit.

**Phase 4 (current)**: deployable, as a single Render service. A GitHub Actions pipeline runs CI
(typecheck/lint/tests) on every push and, once it's green on `main`, triggers a deploy — Render's
own auto-deploy-on-push is deliberately turned off so a deploy only ever happens after CI passes
(see "Deploying" below). Real weather (Open-Meteo) and real satellite crop-health (NASA/ORNL DAAC
MODIS NDVI) feed the dashboard and the models; mandi prices are placeholder demo data until a
free data.gov.in API key is connected (see "Connecting real mandi prices") — once it is, real
Agmarknet data replaces the placeholder automatically. The bottleneck-risk label is a genuine,
backtestable target (future realized price volatility, not a synthetic formula — see "How the
model works"), trained runs are tracked in MLflow, and a seeded admin account can trigger ETL
refreshes and retraining from an admin page.

## Architecture

```
AgriTech/
├── .github/workflows/ci.yml       # typecheck/lint/tests/docker-build on every push/PR — a
│                                    # signal, not a deploy gate right now, see "Deploying"
├── Dockerfile, .dockerignore      # the one image Render builds — see "Deploying"
├── render.yaml                    # the single Render service (Blueprint), autoDeploy: true
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
│   ├── src/lib/embeddedMlService.ts  # production only: spawns the ML service itself as a
│   │                                  # child process — see "Deploying"
│   ├── src/routes/auth.routes.ts   # signup, login, logout, me (JWT in httpOnly cookie)
│   ├── src/routes/farms.routes.ts  # requireAuth: list/create/delete saved farms
│   ├── src/routes/ml.routes.ts     # public thin proxy -> the Python ML service
│   ├── src/routes/admin.routes.ts  # requireAuth+requireAdmin: proxy -> ML service /admin/*
│   └── src/index.ts                # single process: serves the API and the frontend itself
│                                    # (Vite in middleware mode in dev, static dist in prod)
└── ml-service/                    # Python FastAPI service — data + ML
    ├── app/
    │   ├── reference_data.py       # 6 Indian mandi regions (+ lat/lon) × 5 crops
    │   ├── db.py, schema.sql, migrate.py   # this service's own Postgres tables, in a
    │   │                            # separate `ml` schema (see db.py's docstring for why)
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
Python service on port 8000. In local dev that's a second process started by `npm run dev`; in
production it's a child process Express spawns itself inside the same container (see
"Deploying") — either way, the browser never talks to the Python service directly.

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

One [Render](https://render.com) service (`render.yaml`, a Blueprint). `autoDeploy: true` —
Render redeploys directly on every push to the connected branch; `.github/workflows/ci.yml` runs
typecheck/lint/tests/docker-build on every push and PR too, but purely as a signal, not a gate —
nothing currently stops a red CI run from having already deployed. (An earlier version gated
deploys behind CI passing, via a GitHub Actions job that curled a Render Deploy Hook — dropped
for now to keep the deploy path simpler while getting the first real deploy out. `render.yaml`'s
comment on `autoDeploy` says how to bring that back.)

It's one service, not two, because Express spawns the Python ML service itself as a child
process inside the same container (`server/src/lib/embeddedMlService.ts`), bound to `127.0.0.1`
— genuinely unreachable from outside the container. An earlier version of this deploy split them
into two Render services talking over the public internet with a shared-secret header, but that
turned out to be more operational overhead than it was worth at this scale (two Blueprint
services to keep correctly configured, two Deploy Hooks, a secret to keep in sync) for a problem
(cross-service auth) that a single container sidesteps entirely.

### One-time setup

1. **Create the Blueprint**: Render dashboard → **New** → **Blueprint** → connect this GitHub
   repo. This step matters more than it looks — **"New → Web Service" instead of "New →
   Blueprint" will silently ignore `render.yaml`** and auto-detect a build/runtime for you
   (this happened once already: Render guessed "Python at the repo root" and "plain Node
   defaults," and both were wrong). Blueprint is the only path that actually reads this file's
   `runtime: docker` / `dockerfilePath` settings.
2. **Fill in env vars** (Render dashboard → the service → Environment) — everything marked
   `sync: false` in `render.yaml`: `DATABASE_URL` (Neon), `ADMIN_EMAIL`, `ADMIN_PASSWORD`,
   `DATA_GOV_IN_API_KEY` (optional — leave blank to keep placeholder prices). `JWT_SECRET` is
   auto-generated by the Blueprint; `EMBEDDED_ML_SERVICE` and `MLFLOW_TRACKING_URI` already have
   correct values baked into `render.yaml`.
3. **Push the DB schema once**: `npm run db:push` (Express/Drizzle tables) locally against the
   same `DATABASE_URL`. The ML service's own migration runs automatically on every container
   start (`python -m app.migrate`, called from `embeddedMlService.ts` before `uvicorn` — safe,
   purely additive). Schema changes are never auto-applied from CI: an earlier unguarded
   `db:push` against this same database once came within a TTY-prompt of dropping 4,600+ real
   ETL rows it didn't recognize (see `db.py`'s docstring) — that's also why Express and the ML
   service keep separate Postgres schemas (`public` vs `ml`) to this day.

### Day to day

Push to `main` → Render rebuilds and redeploys directly. `.github/workflows/ci.yml` also runs
typecheck/lint/tests/`docker build` on the same push (and on pull requests), so failures are
visible on GitHub even though they don't block anything yet.

### Free-tier things worth knowing

- Free Render services sleep after 15 minutes idle and take ~30-50s to wake on the next
  request — expect a slow first load after a quiet period.
- No persistent disk, which is why trained models live in Postgres (`app/models/storage.py`)
  rather than only on local disk, and why MLflow's *run history* (not the models themselves)
  resets on every deploy/cold-start — see `ml-service/.env.example`.
- If the Python half crashes, Express exits too (`embeddedMlService.ts`'s exit handler), so
  Render's health check fails and it restarts the whole container — simple, if a little blunt;
  it means a Python-only crash costs you the whole container's warm state, not just that half.
- ETL refreshes and retraining are still manually triggered (admin page or CLI), not on a
  schedule — a natural next step would be a Render Cron Job calling `python -m app.etl.run`
  periodically.
