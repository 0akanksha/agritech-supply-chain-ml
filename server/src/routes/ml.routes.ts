import { Router } from "express";
import { HttpError } from "../middleware/errorHandler.js";

// Public thin proxy to the Python ML service — keeps the browser talking to a single
// origin (this Express server) instead of reaching across to a second local port.
export const mlRouter = Router();

const ML_SERVICE_URL = process.env.ML_SERVICE_URL ?? "http://localhost:8000";

const PROXIED_PATHS = ["regions", "crops", "weather", "satellite", "prices", "predict"] as const;

for (const path of PROXIED_PATHS) {
  mlRouter.get(`/${path}`, async (req, res) => {
    const url = new URL(`/api/${path}`, ML_SERVICE_URL);
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") url.searchParams.set(key, value);
    }

    let upstream: Response;
    try {
      upstream = await fetch(url);
    } catch {
      throw new HttpError(502, "ML service is unavailable.");
    }

    const body = await upstream.json().catch(() => undefined);
    res.status(upstream.status).json(body);
  });
}
