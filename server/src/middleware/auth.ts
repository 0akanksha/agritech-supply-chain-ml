import jwt from "jsonwebtoken";
import type { NextFunction, Request, Response } from "express";
import { AUTH_COOKIE_NAME, type AuthPayload } from "../auth/tokens.js";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
    }
  }
}

// Non-blocking: decodes the cookie if present so routes can offer optional
// personalization (e.g. the dashboard's "Save this farm" button), without
// forcing a login wall on public routes.
export function attachUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[AUTH_COOKIE_NAME];
  if (token) {
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
      req.userId = payload.id;
      req.userRole = payload.role;
    } catch {
      // ignore invalid/expired token — treat as logged out
    }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.userId) {
    return res.status(401).json({ error: "Not authenticated" });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.userRole !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
