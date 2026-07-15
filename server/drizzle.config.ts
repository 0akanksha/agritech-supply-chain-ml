import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // The Python ML service owns its own tables in a separate `ml` Postgres schema (see
  // ml-service/app/db.py) — restrict push/introspection to `public` so it never again
  // treats those as extra tables to drop. (This restriction is also drizzle-kit's default
  // when unset, but a `db:push` against this database dropped 4,600+ real ETL rows down to
  // seconds from confirming once, before the `ml` schema separation existed — being
  // explicit here is cheap insurance against that recurring.)
  schemaFilter: ["public"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
