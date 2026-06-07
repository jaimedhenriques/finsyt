/**
 * Clerk Frontend API Proxy Middleware
 *
 * Proxies Clerk Frontend API requests through your domain, enabling Clerk
 * authentication on custom domains and .replit.app deployments without
 * requiring CNAME DNS configuration.
 *
 * AUTH CONFIGURATION: To manage users, enable/disable login providers
 * (Google, GitHub, etc.), change app branding, or configure OAuth credentials,
 * use the Auth pane in the workspace toolbar. There is no external Clerk
 * dashboard — all auth configuration is done through the Auth pane.
 *
 * IMPORTANT:
 * - Only active in production (Clerk proxying doesn't work for dev instances)
 * - Must be mounted BEFORE express.json() middleware
 *
 * Usage in app.ts:
 *   import { CLERK_PROXY_PATH, clerkProxyMiddleware } from "./middlewares/clerkProxyMiddleware";
 *   app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
 *
 * The middleware also intercepts proxied responses to extract the
 * `(sign_in_id -> identifier)` mapping and to count credential failures per
 * account. This powers the per-account lockouts in `authAttemptGuard`.
 */

import {
  createProxyMiddleware,
  responseInterceptor,
} from "http-proxy-middleware";
import type { RequestHandler } from "express";
import { clerkClient } from "@clerk/express";
import { logger } from "../lib/logger";
import {
  rememberSignIn,
  recordFailure,
  recordSuccess,
  accountAttemptConfig,
} from "../lib/accountAttempts";
import { recordEvent } from "../lib/securityEvents";
import { notifyUser } from "../lib/notifyUser";

const CLERK_FAPI = "https://frontend-api.clerk.dev";
export const CLERK_PROXY_PATH = "/api/__clerk";

const SIGN_IN_PATH_RE = /^\/v1\/client\/sign_ins(?:\/([^/?]+))?(?:\/(\w+))?/;

interface ClerkSignInResponse {
  response?: {
    id?: string;
    identifier?: string | null;
    status?: string;
    user_data?: { email_addresses?: { email_address?: string }[] };
  };
  errors?: { code?: string; message?: string }[];
}

async function notifyAccountLocked(identifier: string, ip: string, ua: string) {
  try {
    const list = await clerkClient.users.getUserList({
      emailAddress: [identifier],
      limit: 1,
    });
    const user = list.data[0];
    if (!user) {
      logger.info(
        { identifier, ip },
        "Account lockout fired but no Clerk user matches identifier",
      );
      return;
    }
    recordEvent({
      userId: user.id,
      kind: "ip_lockout",
      message: `Your account was temporarily locked after ${accountAttemptConfig.FAIL_THRESHOLD} failed sign-in attempts.`,
      ip,
      userAgent: ua,
    });
    await notifyUser({
      userId: user.id,
      kind: "lockout",
      subject: "Your Finsyt account was temporarily locked",
      body: `We saw ${accountAttemptConfig.FAIL_THRESHOLD} failed sign-in attempts for your account from IP ${ip}. We've paused sign-ins for ${Math.round(accountAttemptConfig.LOCKOUT_MS / 60_000)} minutes. If this wasn't you, reset your password now.`,
    });
  } catch (err) {
    logger.error({ err, identifier }, "Failed to notify user of account lockout");
  }
}

function parseProxiedJson(buf: Buffer): ClerkSignInResponse | null {
  try {
    const text = buf.toString("utf8");
    if (!text.startsWith("{")) return null;
    return JSON.parse(text) as ClerkSignInResponse;
  } catch {
    return null;
  }
}

export function clerkProxyMiddleware(): RequestHandler {
  // Only run proxy in production — Clerk proxying doesn't work for dev instances
  if (process.env.NODE_ENV !== "production") {
    return (_req, _res, next) => next();
  }

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    return (_req, _res, next) => next();
  }

  return createProxyMiddleware({
    target: CLERK_FAPI,
    changeOrigin: true,
    selfHandleResponse: true,
    pathRewrite: (path: string) =>
      path.replace(new RegExp(`^${CLERK_PROXY_PATH}`), ""),
    on: {
      proxyReq: (proxyReq, req) => {
        const protocol = req.headers["x-forwarded-proto"] || "https";
        const host = req.headers.host || "";
        const proxyUrl = `${protocol}://${host}${CLERK_PROXY_PATH}`;

        proxyReq.setHeader("Clerk-Proxy-Url", proxyUrl);
        proxyReq.setHeader("Clerk-Secret-Key", secretKey);

        const xff = req.headers["x-forwarded-for"];
        const clientIp =
          (Array.isArray(xff) ? xff[0] : xff)?.split(",")[0]?.trim() ||
          req.socket?.remoteAddress ||
          "";
        if (clientIp) {
          proxyReq.setHeader("X-Forwarded-For", clientIp);
        }
      },
      proxyRes: responseInterceptor(async (responseBuffer, proxyRes, req, _res) => {
        // Pass through unchanged for any non-sign-in path; this keeps the
        // proxy semantically transparent and avoids parsing every payload.
        const url = (req as any).url as string;
        const upstreamPath = url.replace(new RegExp(`^${CLERK_PROXY_PATH}`), "");
        const m = SIGN_IN_PATH_RE.exec(upstreamPath);
        if (!m) return responseBuffer;

        const status = proxyRes.statusCode ?? 0;
        const json = parseProxiedJson(responseBuffer as Buffer);
        const signInId = m[1] ?? json?.response?.id ?? null;
        const identifier =
          json?.response?.identifier ??
          json?.response?.user_data?.email_addresses?.[0]?.email_address ??
          (signInId ? null : null);

        if (signInId && identifier) {
          rememberSignIn(signInId, identifier);
        }

        const ip = (req as any).socket?.remoteAddress ?? "unknown";
        const ua = String((req as any).headers?.["user-agent"] ?? "");

        if (status >= 200 && status < 300 && identifier && json?.response?.status === "complete") {
          recordSuccess(identifier);
          return responseBuffer;
        }

        // Treat 4xx (except 429 from our limiter) as a credential failure.
        const isFailure = status >= 400 && status < 500 && status !== 429;
        if (isFailure && identifier) {
          const result = recordFailure(identifier);
          if (result.lockedJustNow) {
            logger.warn(
              {
                identifier: identifier.replace(/(.{2}).*(@.*)/, "$1***$2"),
                ip,
                lockoutMs: accountAttemptConfig.LOCKOUT_MS,
              },
              "Account locked after repeated failed sign-in attempts",
            );
            void notifyAccountLocked(identifier, ip, ua);
          }
        }
        return responseBuffer;
      }),
    },
  }) as RequestHandler;
}
