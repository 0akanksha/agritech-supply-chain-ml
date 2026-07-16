# Single image for both halves of the app: Express (Node) is the container's main process and
# spawns the Python ML service as a child on 127.0.0.1 (see server/src/lib/embeddedMlService.ts)
# — genuinely unreachable from outside the container, not just unadvertised, so there's nothing
# to protect with a shared secret the way a two-service split would need.
#
# Python base (heavier deps: scikit-learn/pandas/mlflow) with Node added via NodeSource's
# official Debian install script, rather than the other way around.
FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy just the manifests first so `npm install`/`pip install` are cached across builds that
# don't touch dependencies.
COPY package.json package-lock.json ./
COPY server/package.json server/package-lock.json ./server/
RUN npm install --include=dev && npm install --include=dev --prefix server

COPY ml-service/requirements.txt ./ml-service/requirements.txt
RUN pip install --no-cache-dir -r ml-service/requirements.txt

COPY . .
RUN npm run build:all

EXPOSE 4000

# NODE_ENV=production set here, not as a platform env var — same reasoning as
# render.yaml's comment on it: setting it platform-wide makes Render's install skip
# devDependencies (vite, @vitejs/plugin-react, typescript, ...) and break the build. Setting
# it only at runtime, here, is also what makes index.ts serve the built static frontend
# instead of booting a Vite dev-server instance inside the production container.
CMD ["sh", "-c", "NODE_ENV=production node server/dist/index.js"]
