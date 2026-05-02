/**
 * Pre-forward guard that runs in front of `clerkProxyMiddleware()`.
 *
 * Two layers of defense:
 *  1. Per-account lockout: if an identifier (email) has accumulated too many
 *     failed sign-in attempts recently, short-circuit any further attempt
 *     against that identifier with HTTP 423 before it reaches Clerk. The
 *     identifier for an in-flight attempt is recovered from the cached
 *     `(sign_in_id -> identifier)` map populated by the proxy's response
 *     interceptor in `clerkProxyMiddleware.ts`.
 *  2. Per-IP failure-burst lockout: an additional defense for sources that
 *     spread attempts thinly across many accounts (password spraying). After
 *     enough 4xx responses on attempt endpoints from one IP within the
 *     window, all attempts from that IP are blocked for `LOCKOUT_MS`.
 *
 * Per-account failure counting itself is performed in the proxy response
 * interceptor (which is the only place we can read the upstream status); this
 * middleware only reads / enforces the resulting lock state.
 */
import type { RequestHandler } from "express";
import { logger } from "../lib/logger";
import { isLocked, lookupSignIn, accountAttemptConfig } from "../lib/accountAttempts";

const FAIL_WINDOW_MS = 30 * 60_000;
const FAIL_THRESHOLD = 8;
const LOCKOUT_MS = 30 * 60_000;

interface IpState {
  failures: number[];
  lockedUntil: number;
}

const ipState = new Map<string, IpState>();

function getIpState(ip: string): IpState {
  let s = ipState.get(ip);
  if (!s) {
    s = { failures: [], lockedUntil: 0 };
    ipState.set(ip, s);
  }
  return s;
}

const ATTEMPT_PATH_RE =
  /^\/v1\/client\/(?:sign_ins|sign_ups)\/([^/]+)\/(?:attempt_|reset_password)/;

function attemptSignInId(path: string): string | null {
  const m = ATTEMPT_PATH_RE.exec(path);
  return m ? m[1] : null;
}

function isAttemptPath(path: string): boolean {
  return ATTEMPT_PATH_RE.test(path);
}

export function clerkAuthFailureGuard(): RequestHandler {
  return (req, res, next) => {
    const ip = req.ip ?? "unknown";
    const now = Date.now();

    // (1) per-account lock check
    const sid = attemptSignInId(req.path);
    if (sid) {
      const identifier = lookupSignIn(sid);
      if (identifier) {
        const lock = isLocked(identifier);
        if (lock.locked) {
          res.setHeader("Retry-After", String(lock.retryAfterSec));
          res.status(423).json({
            error: "Account Locked",
            message:
              "This account is temporarily locked after too many failed sign-in attempts. Reset your password or try again later.",
          });
          return;
        }
      }
    }

    // (2) per-IP burst lock check
    const ipS = getIpState(ip);
    if (ipS.lockedUntil > now && isAttemptPath(req.path)) {
      const retrySec = Math.ceil((ipS.lockedUntil - now) / 1000);
      res.setHeader("Retry-After", String(retrySec));
      res.status(423).json({
        error: "Locked",
        message:
          "Too many failed sign-in attempts from this network. Try again later or use account recovery.",
      });
      return;
    }

    if (!isAttemptPath(req.path)) return next();

    res.on("finish", () => {
      const status = res.statusCode;
      // 423 we just emitted ourselves should not also count as an upstream
      // failure for this IP. Any 4xx (except 429 from our limiter and 423
      // from our own short-circuit) means the upstream rejected the attempt.
      const isFailure =
        status >= 400 && status < 500 && status !== 429 && status !== 423;
      if (!isFailure) return;

      const cutoff = Date.now() - FAIL_WINDOW_MS;
      ipS.failures = ipS.failures.filter((t) => t >= cutoff);
      ipS.failures.push(Date.now());

      if (ipS.failures.length >= FAIL_THRESHOLD && ipS.lockedUntil <= Date.now()) {
        ipS.lockedUntil = Date.now() + LOCKOUT_MS;
        ipS.failures = [];
        logger.warn(
          {
            ip,
            lockoutMs: LOCKOUT_MS,
            accountFailWindow: accountAttemptConfig.FAIL_WINDOW_MS,
          },
          "IP locked out after burst of failed sign-in attempts",
        );
      }
    });

    next();
  };
}
