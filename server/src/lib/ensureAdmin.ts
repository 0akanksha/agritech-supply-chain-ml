import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

export async function ensureAdminSeeded() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const normalizedEmail = email.toLowerCase();
  const [existing] = await db.select().from(users).where(eq(users.email, normalizedEmail));
  if (existing) return;

  const passwordHash = await bcrypt.hash(password, 10);
  await db.insert(users).values({
    fullName: "Admin",
    email: normalizedEmail,
    passwordHash,
    role: "admin",
  });
  console.log(`Seeded initial admin user: ${normalizedEmail}`);
}
