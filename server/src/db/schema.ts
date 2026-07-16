import { numeric, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";

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
