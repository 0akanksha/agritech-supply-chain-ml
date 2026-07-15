# psycopg[binary], scikit-learn, pandas, and mlflow all ship precompiled manylinux wheels for
# this base image's platforms, so no system build toolchain is needed here.
FROM python:3.13-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# Migration is safe to run on every container start — it's pure additive
# `CREATE TABLE IF NOT EXISTS` (see app/schema.sql). Render sets $PORT at runtime.
CMD ["sh", "-c", "python -m app.migrate && uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
