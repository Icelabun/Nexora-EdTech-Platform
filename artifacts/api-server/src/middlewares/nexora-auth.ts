import type { Request, RequestHandler } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

export type AuthenticatedRequest = Request & {
  auth?: { id: string; role: "student" | "teacher" | "admin" };
};

const sessionCookie = "nexora_session";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("JWT_SECRET must be configured with at least 32 characters.");
  }
  return secret;
}

export function signSession(id: string, role: string): string {
  return jwt.sign({ sub: id, role }, getJwtSecret(), { expiresIn: "7d" });
}

export function setSessionCookie(res: Parameters<RequestHandler>[1], token: string): void {
  res.cookie(sessionCookie, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

export const requireNexoraAuth: RequestHandler = (req, res, next) => {
  try {
    const token = req.cookies?.[sessionCookie];
    if (!token) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    if (typeof payload.sub !== "string" || !["student", "teacher", "admin"].includes(String(payload.role))) {
      res.status(401).json({ error: "Your session is invalid. Please sign in again." });
      return;
    }
    (req as AuthenticatedRequest).auth = {
      id: payload.sub,
      role: payload.role as "student" | "teacher" | "admin",
    };
    next();
  } catch {
    res.status(401).json({ error: "Your session expired. Please sign in again." });
  }
};

export function requireNexoraRole(...roles: Array<"student" | "teacher" | "admin">): RequestHandler {
  return (req, res, next) => {
    const auth = (req as AuthenticatedRequest).auth;
    if (!auth) {
      res.status(401).json({ error: "Sign in to continue." });
      return;
    }
    if (!roles.includes(auth.role)) {
      res.status(403).json({ error: "This area is not available for your account." });
      return;
    }
    next();
  };
}

export function authenticatedUserId(req: Request): string {
  const auth = (req as AuthenticatedRequest).auth;
  if (!auth) throw new Error("Authenticated route is missing user context.");
  return auth.id;
}
