import type { Request, Response, NextFunction } from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "./logger";

/**
 * Actor / org context middleware.
 *
 * Until the Clerk-based auth provider lands (see SECURITY.md §7), the
 * platform forwards the authenticated org / user via headers signed with
 * a shared HMAC secret (`INTERNAL_AUTH_SECRET`). This middleware
 * verifies the signature before trusting any of the identity headers,
 * so an external caller who can reach the api-server cannot spoof an
 * `owner` actor by setting the headers themselves.
 *
 * Header contract (set by `artifacts/platform/lib/audit-client.ts`):
 *   x-org-id:        <orgId>
 *   x-actor-id:      <actorId>
 *   x-actor-role:    owner | admin | member
 *   x-actor-ts:      <unix-ms issued-at>
 *   x-actor-sig:     hex(HMAC_SHA256(secret, `${orgId}|${actorId}|${role}|${ts}`))
 *
 * If `INTERNAL_AUTH_SECRET` is unset, the api-server requires
 * `ALLOW_UNSIGNED_ACTOR=1` to accept unsigned headers — this exists
 * solely so local dev / curl smoke-tests still work, and must never be
 * enabled in production.
 */
export interface ActorContext {
  orgId: string;
  actorId: string;
  role: "owner" | "admin" | "member";
  isOwner: boolean;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: ActorContext;
    }
  }
}

const SIG_MAX_SKEW_MS = 5 * 60 * 1000;

function verifySignature(
  secret: string,
  orgId: string,
  actorId: string,
  role: string,
  ts: string,
  sig: string,
): boolean {
  const expected = createHmac("sha256", secret)
    .update(`${orgId}|${actorId}|${role}|${ts}`)
    .digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(sig, "hex");
  } catch {
    return false;
  }
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(expected, provided);
}

export function actorContext() {
  const secret = process.env.INTERNAL_AUTH_SECRET;
  const allowUnsigned = process.env.ALLOW_UNSIGNED_ACTOR === "1";
  const isProd = process.env.NODE_ENV === "production";

  if (!secret && !allowUnsigned) {
    logger.warn(
      "INTERNAL_AUTH_SECRET is not set — actor headers will be rejected. " +
        "Set INTERNAL_AUTH_SECRET to enable signed identity, or " +
        "ALLOW_UNSIGNED_ACTOR=1 for local dev only.",
    );
  }
  if (allowUnsigned && isProd) {
    throw new Error(
      "ALLOW_UNSIGNED_ACTOR must not be enabled in production — " +
        "configure INTERNAL_AUTH_SECRET instead.",
    );
  }

  return (req: Request, _res: Response, next: NextFunction) => {
    const orgId = (req.header("x-org-id") || "").trim();
    const actorId = (req.header("x-actor-id") || "").trim();
    const rawRole = (req.header("x-actor-role") || "member").trim().toLowerCase();
    const role: ActorContext["role"] =
      rawRole === "owner" || rawRole === "admin" ? rawRole : "member";
    const ts = (req.header("x-actor-ts") || "").trim();
    const sig = (req.header("x-actor-sig") || "").trim();

    if (!orgId || !actorId) {
      return next();
    }

    if (secret) {
      if (!ts || !sig) return next();
      const tsNum = Number(ts);
      if (!Number.isFinite(tsNum) || Math.abs(Date.now() - tsNum) > SIG_MAX_SKEW_MS) {
        return next();
      }
      if (!verifySignature(secret, orgId, actorId, role, ts, sig)) {
        return next();
      }
    } else if (!allowUnsigned) {
      // No secret configured and unsigned mode is off → refuse.
      return next();
    }

    // Owner-only is strict — `admin` is a separate role used elsewhere
    // for tenant-level operations and does NOT grant access to audit /
    // retention / DSAR endpoints.
    req.actor = { orgId, actorId, role, isOwner: role === "owner" };
    next();
  };
}

export function requireActor(req: Request, res: Response, next: NextFunction): void {
  if (!req.actor) {
    res.status(401).json({ error: "Unauthorized", message: "Missing or invalid actor context" });
    return;
  }
  next();
}

export function requireOwner(req: Request, res: Response, next: NextFunction): void {
  if (!req.actor) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (!req.actor.isOwner) {
    res.status(403).json({ error: "Forbidden", message: "Owner role required" });
    return;
  }
  next();
}
