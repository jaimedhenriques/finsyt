import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request, RequestHandler, Response, NextFunction } from "express";

const CSRF_COOKIE = "csrf_token";
const CSRF_HEADER = "x-csrf-token";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/**
 * Double-submit cookie CSRF protection.
 *
 * - Issues a random `csrf_token` cookie (readable by JS) on every request that
 *   does not already have one.
 * - On state-changing requests (non-GET/HEAD/OPTIONS), requires the
 *   `X-CSRF-Token` header to match the cookie value.
 *
 * The session cookie itself MUST be HttpOnly + SameSite=Lax/Strict; the CSRF
 * cookie is only readable by same-origin JS, so a cross-origin attacker cannot
 * forge the matching header.
 */
export function csrfProtection(): RequestHandler {
  return (req: Request, res: Response, next: NextFunction) => {
    const cookieHeader = req.headers.cookie ?? "";
    const cookies = Object.fromEntries(
      cookieHeader.split(";").map((c) => {
        const [k, ...v] = c.trim().split("=");
        return [k, decodeURIComponent(v.join("="))];
      }),
    );
    let token = cookies[CSRF_COOKIE];

    if (!token) {
      token = randomBytes(32).toString("hex");
      res.setHeader(
        "Set-Cookie",
        `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax; Secure`,
      );
    }

    if (SAFE_METHODS.has(req.method)) return next();

    const provided = (req.headers[CSRF_HEADER] as string | undefined) ?? "";
    if (!provided || !constantTimeEqual(provided, token)) {
      return res.status(403).json({
        error: "Forbidden",
        message: "Invalid or missing CSRF token.",
      });
    }
    return next();
  };
}
