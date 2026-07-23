import { Router } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { cropCycles, tradeListings, trades, users } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const tradeListingsRouter = Router();

tradeListingsRouter.use(requireAuth);

// Attaches remainingQuantity (quantityQuintal minus accepted+completed trade quantity) via one
// grouped aggregate query, same pattern as cropCyclesRouter's withTotals. Generic so it works
// for both the plain table row shape and the sellerName-joined select shape below.
async function withRemaining<T extends { id: string; quantityQuintal: number }>(listings: T[]) {
  if (listings.length === 0) return [] as (T & { remainingQuantity: number })[];
  const fulfilled = await db
    .select({
      listingId: trades.listingId,
      total: sql<number>`coalesce(sum(${trades.quantityQuintal}), 0)`.mapWith(Number),
    })
    .from(trades)
    .where(
      and(
        inArray(
          trades.listingId,
          listings.map((l) => l.id),
        ),
        inArray(trades.status, ["accepted", "completed"]),
      ),
    )
    .groupBy(trades.listingId);
  const fulfilledByListing = Object.fromEntries(fulfilled.map((f) => [f.listingId, f.total]));
  return listings.map((l) => ({
    ...l,
    remainingQuantity: l.quantityQuintal - (fulfilledByListing[l.id] ?? 0),
  }));
}

tradeListingsRouter.get("/", async (req, res) => {
  const scope = req.query.scope === "mine" ? "mine" : "open";

  const rows = await db
    .select({
      id: tradeListings.id,
      sellerId: tradeListings.sellerId,
      sellerName: users.fullName,
      regionId: tradeListings.regionId,
      cropId: tradeListings.cropId,
      cropCycleId: tradeListings.cropCycleId,
      quantityQuintal: tradeListings.quantityQuintal,
      askPriceRsPerQuintal: tradeListings.askPriceRsPerQuintal,
      status: tradeListings.status,
      notes: tradeListings.notes,
      createdAt: tradeListings.createdAt,
    })
    .from(tradeListings)
    .leftJoin(users, eq(tradeListings.sellerId, users.id))
    .where(scope === "mine" ? eq(tradeListings.sellerId, req.userId!) : eq(tradeListings.status, "open"))
    .orderBy(desc(tradeListings.createdAt));

  res.json({ tradeListings: await withRemaining(rows) });
});

tradeListingsRouter.get("/:id", async (req, res) => {
  const [row] = await db
    .select({
      id: tradeListings.id,
      sellerId: tradeListings.sellerId,
      sellerName: users.fullName,
      regionId: tradeListings.regionId,
      cropId: tradeListings.cropId,
      cropCycleId: tradeListings.cropCycleId,
      quantityQuintal: tradeListings.quantityQuintal,
      askPriceRsPerQuintal: tradeListings.askPriceRsPerQuintal,
      status: tradeListings.status,
      notes: tradeListings.notes,
      createdAt: tradeListings.createdAt,
    })
    .from(tradeListings)
    .leftJoin(users, eq(tradeListings.sellerId, users.id))
    .where(eq(tradeListings.id, req.params.id));
  if (!row) throw new HttpError(404, "Listing not found.");
  const [withTotal] = await withRemaining([row]);
  res.json({ tradeListing: withTotal });
});

const createSchema = z.object({
  regionId: z.string().trim().min(1),
  cropId: z.string().trim().min(1),
  cropCycleId: z.string().uuid().optional(),
  quantityQuintal: z.number().positive(),
  askPriceRsPerQuintal: z.number().positive(),
  notes: z.string().trim().min(1).max(500).optional(),
});

tradeListingsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  if (parsed.data.cropCycleId) {
    const [cycle] = await db
      .select({ id: cropCycles.id })
      .from(cropCycles)
      .where(and(eq(cropCycles.id, parsed.data.cropCycleId), eq(cropCycles.userId, req.userId!)));
    if (!cycle) throw new HttpError(404, "Crop cycle not found.");
  }

  const [listing] = await db
    .insert(tradeListings)
    .values({ sellerId: req.userId!, ...parsed.data })
    .returning();
  res.status(201).json({ tradeListing: { ...listing, sellerName: null, remainingQuantity: listing.quantityQuintal } });
});

const updateSchema = z.object({
  status: z.literal("cancelled").optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

tradeListingsRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }
  if (Object.keys(parsed.data).length === 0) {
    throw new HttpError(400, "No fields to update.");
  }

  if (parsed.data.status === "cancelled") {
    const [existing] = await db
      .select({ id: tradeListings.id })
      .from(tradeListings)
      .innerJoin(trades, eq(trades.listingId, tradeListings.id))
      .where(
        and(
          eq(tradeListings.id, req.params.id),
          eq(tradeListings.sellerId, req.userId!),
          inArray(trades.status, ["accepted", "completed"]),
        ),
      );
    if (existing) throw new HttpError(409, "Can't cancel a listing with an accepted trade.");
  }

  const [updated] = await db
    .update(tradeListings)
    .set(parsed.data)
    .where(and(eq(tradeListings.id, req.params.id), eq(tradeListings.sellerId, req.userId!)))
    .returning();
  if (!updated) throw new HttpError(404, "Listing not found.");
  const [withTotal] = await withRemaining([{ ...updated, sellerName: null }]);
  res.json({ tradeListing: withTotal });
});
