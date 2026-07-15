import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { clearAuthCookie, setAuthCookie, signToken } from "../auth/tokens.js";
import { requireAuth } from "../middleware/auth.js";
import { HttpError } from "../middleware/errorHandler.js";

export const authRouter = Router();

function toPublicUser(user: typeof users.$inferSelect) {
  return { id: user.id, fullName: user.fullName, email: user.email };
}

const signupSchema = z.object({
  fullName: z.string().trim().min(1),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, parsed.error.issues[0]?.message ?? "Invalid input");
  }
  const { fullName, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, email));
  if (existing) throw new HttpError(409, "An account with this email already exists.");

  const passwordHash = await bcrypt.hash(password, 10);
  const [user] = await db.insert(users).values({ fullName, email, passwordHash }).returning();

  const token = signToken(user);
  setAuthCookie(res, token);
  res.status(201).json({ user: toPublicUser(user) });
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new HttpError(400, "Enter your email and password.");
  }
  const email = parsed.data.email.toLowerCase();

  const [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) throw new HttpError(401, "Invalid email or password.");

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) throw new HttpError(401, "Invalid email or password.");

  const token = signToken(user);
  setAuthCookie(res, token);
  res.json({ user: toPublicUser(user) });
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const [user] = await db.select().from(users).where(eq(users.id, req.userId!));
  if (!user) throw new HttpError(401, "Not authenticated");
  res.json({ user: toPublicUser(user) });
});
