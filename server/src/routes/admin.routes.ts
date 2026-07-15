import { Router } from "express";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { fetchFromMlService } from "../lib/mlService.js";

// Thin proxy to the ML service's /api/admin/* endpoints — requireAuth+requireAdmin here is
// what actually protects them, since the ML service itself has no auth of its own (see its
// routers/admin.py docstring).
export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get("/etl/status", async (_req, res) => {
  const { status, body } = await fetchFromMlService("/api/admin/etl/status");
  res.status(status).json(body);
});

adminRouter.post("/etl/run", async (_req, res) => {
  const { status, body } = await fetchFromMlService("/api/admin/etl/run", { method: "POST" });
  res.status(status).json(body);
});

adminRouter.post("/train/run", async (_req, res) => {
  const { status, body } = await fetchFromMlService("/api/admin/train/run", { method: "POST" });
  res.status(status).json(body);
});

adminRouter.get("/runs", async (_req, res) => {
  const { status, body } = await fetchFromMlService("/api/admin/runs");
  res.status(status).json(body);
});
