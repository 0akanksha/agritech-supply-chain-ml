import { date, numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  // 'admin' accounts are seeded from ADMIN_EMAIL/ADMIN_PASSWORD at startup (see
  // lib/ensureAdmin.ts) — there's no public admin signup, matching the other apps here.
  role: text("role").notNull().default("farmer"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// regionId/cropId are the ml-service's reference-data ids (e.g. "nashik", "wheat") — they
// aren't foreign keys since that reference data still lives in the Python service, not Postgres.
export const savedFarms = pgTable(
  "saved_farms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    regionId: text("region_id").notNull(),
    cropId: text("crop_id").notNull(),
    label: text("label"),
    // In-app only (no SMS/email infra) — My Farms highlights a farm when its latest price
    // crosses this. Both null means no alert configured.
    alertPrice: numeric("alert_price", { mode: "number" }),
    alertDirection: text("alert_direction", { enum: ["above", "below"] }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.userId, table.regionId, table.cropId)],
);

// A crop cycle is one planting-to-harvest run for a farmer: a region/crop pair (same
// ml-service reference-data convention as savedFarms — not FKs) plus dates/area/status.
// No uniqueness constraint: a farmer legitimately has multiple cycles over time for the
// same region/crop.
export const cropCycles = pgTable("crop_cycles", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  regionId: text("region_id").notNull(),
  cropId: text("crop_id").notNull(),
  label: text("label"),
  areaAcres: numeric("area_acres", { mode: "number" }),
  sowingDate: date("sowing_date", { mode: "string" }).notNull(),
  expectedHarvestDate: date("expected_harvest_date", { mode: "string" }),
  actualHarvestDate: date("actual_harvest_date", { mode: "string" }),
  // 'harvested' vs 'abandoned' also doubles as a useful signal for a later credit-scoring
  // feature (a cycle abandoned before harvest is informative about risk).
  status: text("status", { enum: ["active", "harvested", "abandoned"] })
    .notNull()
    .default("active"),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Fixed list tuned for Indian farm expenses; exported so route-level zod schemas can build
// z.enum(expenseCategoryValues) from the same source of truth.
export const expenseCategoryValues = [
  "seeds",
  "fertilizer",
  "pesticide",
  "labor",
  "irrigation",
  "equipment",
  "transport",
  "land_rent",
  "storage",
  "other",
] as const;

// userId is denormalized onto expenses (not only derivable via a cropCycles join) so
// ownership checks stay a flat eq(expenses.userId, req.userId!) — same convention as savedFarms.
export const expenses = pgTable("expenses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  cropCycleId: uuid("crop_cycle_id")
    .notNull()
    .references(() => cropCycles.id, { onDelete: "cascade" }),
  category: text("category", { enum: expenseCategoryValues }).notNull(),
  amount: numeric("amount", { mode: "number" }).notNull(),
  expenseDate: date("expense_date", { mode: "string" }).notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
