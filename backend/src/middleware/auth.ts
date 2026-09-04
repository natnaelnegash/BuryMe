import type { NextFunction, Request, Response } from "express";

import { auth } from "../config/firebase.js";
import { ApiError } from "./errors.js";

// The verified identity a request carries once `requireAuth` has run.
// `phoneNumber` (not `email`) is what Slice 1 relies on — see the plan's
// note that this is the Firebase Auth identity phone, distinct from any
// TelebirrAccount.telebirr_number added later.
export interface AuthContext {
  uid: string;
  phoneNumber: string | null;
}

declare module "express-serve-static-core" {
  interface Request {
    auth?: AuthContext;
  }
}

const BEARER_PREFIX = "Bearer ";

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.header("Authorization");
  if (!header?.startsWith(BEARER_PREFIX)) {
    next(new ApiError("UNAUTHENTICATED", "Missing or malformed Authorization header.", 401));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length);
  try {
    const decoded = await auth.verifyIdToken(token);
    req.auth = { uid: decoded.uid, phoneNumber: decoded.phone_number ?? null };
    next();
  } catch {
    next(new ApiError("UNAUTHENTICATED", "Invalid or expired token.", 401));
  }
}
