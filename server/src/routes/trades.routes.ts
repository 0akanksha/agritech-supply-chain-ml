import { Router } from "express";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { tradeListings, trades } from "../db/schema.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const tradesRouter = Router();

tradesRouter.use(requireAuth);

async function remainingQuantity(listing: typeof tradeListings.$inferSelect, excludeTradeId?: string) {
  const conditions = [eq(trades.listingId, listing.id), inArray(trades.status, ["accepted", "completed"])];
  const [{ total }] = await db
    .select({ total: sql<number>`coalesce(sum(${trades.quantityQuintal}), 0)`.mapWith(Number) })
    .from(trades)
    .where(
      excludeTradeId
        ? and(...conditions, sql`${trades.id} != ${excludeTradeId}`)
        : and(...conditions),
    );
  return listing.quantityQuintal - total;
}

const listQuerySchema = z.object({ listingId: z.string().uuid().optional() });

tradesRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid query");
  }

  const conditions = [or(eq(trades.buyerId, req.userId!), eq(trades.sellerId, req.userId!))!];
  if (parsed.data.listingId) conditions.push(eq(trades.listingId, parsed.data.listingId));

  const rows = await db
    .select()
    .from(trades)
    .where(and(...conditions))
    .orderBy(desc(trades.createdAt));
  res.json({ trades: rows });
});

const createSchema = z.object({
  listingId: z.string().uuid(),
  quantityQuintal: z.number().positive(),
  pricePerQuintal: z.number().positive(),
});

tradesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }

  const [listing] = await db.select().from(tradeListings).where(eq(tradeListings.id, parsed.data.listingId));
  if (!listing) throw new HttpError(404, "Listing not found.");
  if (listing.status !== "open") throw new HttpError(409, "This listing is no longer open.");
  if (listing.sellerId === req.userId) throw new HttpError(400, "You can't make an offer on your own listing.");

  const remaining = await remainingQuantity(listing);
  if (parsed.data.quantityQuintal > remaining) {
    throw new HttpError(400, `Only ${remaining} quintal remaining on this listing.`);
  }

  const [trade] = await db
    .insert(trades)
    .values({
      listingId: listing.id,
      sellerId: listing.sellerId,
      buyerId: req.userId!,
      quantityQuintal: parsed.data.quantityQuintal,
      pricePerQuintal: parsed.data.pricePerQuintal,
    })
    .returning();
  res.status(201).json({ trade });
});

const updateSchema = z.object({
  status: z.enum(["accepted", "rejected", "cancelled", "completed"]),
});

const SELLER_ONLY_TRANSITIONS = new Set(["accepted", "rejected", "completed"]);
const BUYER_ONLY_TRANSITIONS = new Set(["cancelled"]);
const REQUIRED_CURRENT_STATUS: Record<string, string> = {
  accepted: "proposed",
  rejected: "proposed",
  cancelled: "proposed",
  completed: "accepted",
};

tradesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const nextStatus = parsed.data.status;

  const [trade] = await db
    .select()
    .from(trades)
    .where(and(eq(trades.id, req.params.id), or(eq(trades.buyerId, req.userId!), eq(trades.sellerId, req.userId!))));
  if (!trade) throw new HttpError(404, "Trade not found.");

  if (SELLER_ONLY_TRANSITIONS.has(nextStatus) && trade.sellerId !== req.userId) {
    throw new HttpError(403, "Only the seller can do that.");
  }
  if (BUYER_ONLY_TRANSITIONS.has(nextStatus) && trade.buyerId !== req.userId) {
    throw new HttpError(403, "Only the buyer can do that.");
  }
  if (trade.status !== REQUIRED_CURRENT_STATUS[nextStatus]) {
    throw new HttpError(409, `Can't move a ${trade.status} trade to ${nextStatus}.`);
  }

  if (nextStatus === "accepted") {
    const [listing] = await db.select().from(tradeListings).where(eq(tradeListings.id, trade.listingId));
    if (!listing) throw new HttpError(404, "Listing not found.");
    // Check-then-update, not an atomic transaction: the neon-http driver used here has no
    // transaction support ("No transactions support in neon-http driver"). Acceptable for a
    // record-keeping-only marketplace at this scale — a race between two near-simultaneous
    // accepts could momentarily oversell a listing, recoverable manually, not a real-money risk.
    const remaining = await remainingQuantity(listing, trade.id);
    if (trade.quantityQuintal > remaining) {
      throw new HttpError(409, "Not enough quantity remaining on this listing to accept this offer.");
    }

    const [updated] = await db
      .update(trades)
      .set({ status: "accepted" })
      .where(and(eq(trades.id, trade.id), eq(trades.status, "proposed")))
      .returning();
    if (!updated) throw new HttpError(409, "This offer was already handled.");

    const remainingAfter = await remainingQuantity(listing);
    if (remainingAfter <= 0) {
      await db.update(tradeListings).set({ status: "closed" }).where(eq(tradeListings.id, listing.id));
    }
    res.json({ trade: updated });
    return;
  }

  const [updated] = await db
    .update(trades)
    .set({ status: nextStatus })
    .where(and(eq(trades.id, trade.id), eq(trades.status, REQUIRED_CURRENT_STATUS[nextStatus])))
    .returning();
  if (!updated) throw new HttpError(409, "This offer was already handled.");
  res.json({ trade: updated });
});
