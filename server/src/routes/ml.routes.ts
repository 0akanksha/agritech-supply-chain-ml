import { Router } from "express";
import { fetchFromMlService } from "../lib/mlService.js";

// Public thin proxy to the Python ML service — keeps the browser talking to a single
// origin (this Express server) instead of reaching across to a second local port.
export const mlRouter = Router();

const PROXIED_PATHS = ["regions", "crops", "weather", "forecast", "satellite", "prices", "predict"] as const;

for (const path of PROXIED_PATHS) {
  mlRouter.get(`/${path}`, async (req, res) => {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === "string") query[key] = value;
    }
    const { status, body } = await fetchFromMlService(`/api/${path}`, { query });
    res.status(status).json(body);
  });
}
