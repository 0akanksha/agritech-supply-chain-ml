import { Router } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cropCycles, expenses } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const cropCyclesRouter = Router();

cropCyclesRouter.use(requireAuth);

// Attaches a computed totalSpent (sum of the user's expenses per cycle) via one grouped
// aggregate query rather than N+1 per-cycle queries.
async function withTotals(cycles: (typeof cropCycles.$inferSelect)[], userId: string) {
  if (cycles.length === 0) return [];
  const totals = await db
    .select({
      cropCycleId: expenses.cropCycleId,
      total: sql<number>`coalesce(sum(${expenses.amount}), 0)`.mapWith(Number),
    })
    .from(expenses)
    .where(eq(expenses.userId, userId))
    .groupBy(expenses.cropCycleId);
  const totalsByCycle = Object.fromEntries(totals.map((t) => [t.cropCycleId, t.total]));
  return cycles.map((c) => ({ ...c, totalSpent: totalsByCycle[c.id] ?? 0 }));
}

cropCyclesRouter.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(cropCycles)
    .where(eq(cropCycles.userId, req.userId!))
    .orderBy(desc(cropCycles.createdAt));
  res.json({ cropCycles: await withTotals(rows, req.userId!) });
});

cropCyclesRouter.get("/:id", async (req, res) => {
  const [row] = await db
    .select()
    .from(cropCycles)
    .where(and(eq(cropCycles.id, req.params.id), eq(cropCycles.userId, req.userId!)));
  if (!row) throw new HttpError(404, "Crop cycle not found.");
  const [withTotal] = await withTotals([row], req.userId!);
  res.json({ cropCycle: withTotal });
});

const createSchema = z.object({
  regionId: z.string().trim().min(1),
  cropId: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  areaAcres: z.number().positive().optional(),
  sowingDate: z.string().date(),
  expectedHarvestDate: z.string().date().optional(),
});

cropCyclesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const [cycle] = await db
    .insert(cropCycles)
    .values({ userId: req.userId!, ...parsed.data })
    .returning();
  res.status(201).json({ cropCycle: { ...cycle, totalSpent: 0 } });
});

// Partial update: mark harvested/abandoned, set the actual harvest date, edit label/notes.
const updateSchema = z
  .object({
    label: z.string().trim().min(1).nullable(),
    notes: z.string().trim().max(2000).nullable(),
    status: z.enum(["active", "harvested", "abandoned"]),
    actualHarvestDate: z.string().date().nullable(),
  })
  .partial();

cropCyclesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }
  if (Object.keys(parsed.data).length === 0) {
    throw new HttpError(400, "No fields to update.");
  }

  const [updated] = await db
    .update(cropCycles)
    .set(parsed.data)
    .where(and(eq(cropCycles.id, req.params.id), eq(cropCycles.userId, req.userId!)))
    .returning();
  if (!updated) throw new HttpError(404, "Crop cycle not found.");
  const [withTotal] = await withTotals([updated], req.userId!);
  res.json({ cropCycle: withTotal });
});

cropCyclesRouter.delete("/:id", async (req, res) => {
  const [deleted] = await db
    .delete(cropCycles)
    .where(and(eq(cropCycles.id, req.params.id), eq(cropCycles.userId, req.userId!)))
    .returning();
  if (!deleted) throw new HttpError(404, "Crop cycle not found.");
  res.status(204).end();
});
