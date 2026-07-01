import express, { type Express, type NextFunction, type Request, type Response } from "express";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import router from "./routes";
import wellKnownRouter from "./routes/wellKnown";
import { logger } from "./lib/logger";
import { config } from "./lib/config";
import { securityHeaders, corsAllowlist } from "./middlewares/security";
import { clerkAuthRateLimit, generalLimiter } from "./middlewares/rateLimit";
import { clerkAuthFailureGuard } from "./middlewares/authAttemptGuard";
import { requestId } from "./middlewares/requestId";
import { authErrorHandler } from "./middlewares/orgContext";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

// Configure Express proxy trust from an explicit allowlist of upstream proxy
// IPs (TRUSTED_PROXY_IPS env var, comma-separated). This lets Express safely
// derive req.ip from X-Forwarded-For only when the header arrives through a
// verified proxy. When no proxy IPs are listed, trust proxy is left disabled
// and req.ip equals the raw TCP socket address — rate limiters then use
// req.socket.remoteAddress directly (see lib/clientIp.ts), which cannot be
// spoofed via headers. Never use `trust proxy: 1` (numeric) in production:
// that form trusts whatever the caller sends as the leftmost XFF value.
if (config.trustedProxyList.length > 0) {
  app.set("trust proxy", config.trustedProxyList);
}

app.disable("x-powered-by");

// Mount Clerk Frontend API proxy BEFORE body parsers — it streams raw bytes.
// Layer brute-force defenses in front of the proxy: a strict per-IP rate
// limit on sign-in/sign-up/password-reset endpoints, plus a failure-burst
// guard that locks an IP for 30 minutes after repeated credential failures.
app.use(
  CLERK_PROXY_PATH,
  clerkAuthRateLimit(),
  clerkAuthFailureGuard(),
  clerkProxyMiddleware(),
);

app.use(requestId());
app.use(securityHeaders());
app.use(corsAllowlist());

app.use(
  pinoHttp({
    logger,
    genReqId: (req) => (req as any).id,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

// Default per-IP rate limit; route groups can layer stricter limits.
app.use(generalLimiter);

// Populate `req.auth` from the Clerk session cookie / bearer token. Routes
// can then enforce auth via the `requireAuth` middleware. Pair with the
// `csrfProtection()` middleware on any cookie-authenticated mutating route.
app.use(clerkMiddleware());

// Public discovery endpoints
app.use(wellKnownRouter);

app.use("/api", router);

// Surface 401/403 from auth middlewares before falling through to the
// generic error handler.
app.use(authErrorHandler);

// Centralized error handler — never leak stack traces to clients.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ err, reqId: (req as any).id }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({
    error: "Internal Server Error",
    requestId: (req as any).id,
  });
});

export default app;
