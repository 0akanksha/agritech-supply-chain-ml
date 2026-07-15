import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { savedFarms } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const farmsRouter = Router();

farmsRouter.use(requireAuth);

farmsRouter.get("/", async (req, res) => {
  const rows = await db
    .select()
    .from(savedFarms)
    .where(eq(savedFarms.userId, req.userId!))
    .orderBy(desc(savedFarms.createdAt));
  res.json({ farms: rows });
});

const createSchema = z.object({
  regionId: z.string().trim().min(1),
  cropId: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
});

farmsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  try {
    const [farm] = await db
      .insert(savedFarms)
      .values({ userId: req.userId!, ...parsed.data })
      .returning();
    res.status(201).json({ farm });
  } catch (err) {
    // drizzle's neon-http driver wraps the real Postgres error (with `.code`) under `.cause`.
    const cause = err && typeof err === "object" && "cause" in err ? err.cause : err;
    if (cause && typeof cause === "object" && "code" in cause && cause.code === "23505") {
      throw new HttpError(409, "You've already saved this region/crop combination.");
    }
    throw err;
  }
});

farmsRouter.delete("/:id", async (req, res) => {
  const [deleted] = await db
    .delete(savedFarms)
    .where(and(eq(savedFarms.id, req.params.id), eq(savedFarms.userId, req.userId!)))
    .returning();
  if (!deleted) throw new HttpError(404, "Saved farm not found.");
  res.status(204).end();
});
