import rateLimit, {
  type Options,
  type RateLimitRequestHandler,
} from "express-rate-limit";
import type { RequestHandler } from "express";

function handler(_req: any, res: any) {
  res.status(429).json({
    error: "Too Many Requests",
    message: "Rate limit exceeded. Try again shortly.",
  });
}

const baseOpts: Partial<Options> = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler,
};

export const generalLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60_000,
  limit: 300,
});

export const authLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60_000,
  limit: 20,
});

export const writeLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60_000,
  limit: 30,
});

export const expensiveLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60_000,
  limit: 15,
});

/**
 * Strict per-IP limiters layered in front of the Clerk Frontend API proxy.
 * These are intentionally tighter than `generalLimiter` because the upstream
 * endpoints are the prime target for credential-stuffing and password-spraying
 * attacks. Clerk also enforces its own per-account attack-protection policy
 * (configurable in the Auth pane) — these are an independent edge defense.
 *
 * Limits are scoped per remote IP (Express's `trust proxy` is enabled in
 * `app.ts`, so `req.ip` reflects the real client address).
 */
export const signInLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 15 * 60_000,
  limit: 12,
});

export const signUpLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60 * 60_000,
  limit: 10,
});

export const passwordResetLimiter: RateLimitRequestHandler = rateLimit({
  ...baseOpts,
  windowMs: 60 * 60_000,
  limit: 6,
});

/**
 * Path-aware dispatcher that picks the right strict limiter based on which
 * Clerk Frontend API endpoint the proxied request targets. Mount this BEFORE
 * `clerkProxyMiddleware()` on the same path.
 *
 * Clerk FAPI uses paths like:
 *   POST /v1/client/sign_ins                          → sign-in attempt
 *   POST /v1/client/sign_ins/<id>/attempt_first_factor → password attempt
 *   POST /v1/client/sign_ins/<id>/reset_password      → password reset
 *   POST /v1/client/sign_ups                          → sign-up
 *   POST /v1/client/sign_ups/<id>/attempt_verification → email verification
 */
export function clerkAuthRateLimit(): RequestHandler {
  return (req, res, next) => {
    if (req.method === "OPTIONS") return next();
    const p = req.path;
    if (/reset_password|forgot[_-]?password/i.test(p)) {
      return passwordResetLimiter(req, res, next);
    }
    if (p.startsWith("/v1/client/sign_ups")) {
      return signUpLimiter(req, res, next);
    }
    if (p.startsWith("/v1/client/sign_ins")) {
      return signInLimiter(req, res, next);
    }
    return next();
  };
}
