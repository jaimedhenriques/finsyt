import type { Request, Response, NextFunction } from "express";
import {
  AuthenticationError,
  AuthorizationError,
} from "@workspace/db/auth";

export function authErrorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
) {
  if (err instanceof AuthenticationError) {
    return res.status(401).json({ error: err.message });
  }
  if (err instanceof AuthorizationError) {
    return res.status(403).json({ error: err.message });
  }
  return next(err);
}
