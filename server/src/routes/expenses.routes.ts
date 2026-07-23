import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cropCycles, expenseCategoryValues, expenses } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const expensesRouter = Router();

expensesRouter.use(requireAuth);

const listQuerySchema = z.object({ cropCycleId: z.string().uuid().optional() });

expensesRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query");
  }

  const conditions = [eq(expenses.userId, req.userId!)];
  if (parsed.data.cropCycleId) conditions.push(eq(expenses.cropCycleId, parsed.data.cropCycleId));

  const rows = await db
    .select()
    .from(expenses)
    .where(and(...conditions))
    .orderBy(desc(expenses.expenseDate), desc(expenses.createdAt));
  res.json({ expenses: rows });
});

const createSchema = z.object({
  cropCycleId: z.string().uuid(),
  category: z.enum(expenseCategoryValues),
  amount: z.number().positive(),
  expenseDate: z.string().date(),
  note: z.string().trim().min(1).max(500).optional(),
});

expensesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  // The FK alone doesn't stop attaching an expense to someone else's cycle id, so confirm
  // the cycle belongs to req.userId before inserting.
  const [cycle] = await db
    .select({ id: cropCycles.id })
    .from(cropCycles)
    .where(and(eq(cropCycles.id, parsed.data.cropCycleId), eq(cropCycles.userId, req.userId!)));
  if (!cycle) throw new HttpError(404, "Crop cycle not found.");

  const [expense] = await db
    .insert(expenses)
    .values({ userId: req.userId!, ...parsed.data })
    .returning();
  res.status(201).json({ expense });
});

expensesRouter.delete("/:id", async (req, res) => {
  const [deleted] = await db
    .delete(expenses)
    .where(and(eq(expenses.id, req.params.id), eq(expenses.userId, req.userId!)))
    .returning();
  if (!deleted) throw new HttpError(404, "Expense not found.");
  res.status(204).end();
});
