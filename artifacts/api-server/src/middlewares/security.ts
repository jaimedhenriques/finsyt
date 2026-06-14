import type { RequestHandler } from "express";
import helmet from "helmet";
import cors, { type CorsOptions } from "cors";
import { config } from "../lib/config";

export function securityHeaders(): RequestHandler {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "base-uri": ["'self'"],
        "frame-ancestors": ["'none'"],
        "object-src": ["'none'"],
        "img-src": ["'self'", "data:", "https:"],
        "script-src": ["'self'"],
        "style-src": ["'self'", "'unsafe-inline'"],
        "connect-src": ["'self'", ...config.allowedOrigins],
        "upgrade-insecure-requests": [],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: "same-origin" },
    crossOriginResourcePolicy: { policy: "same-site" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
    strictTransportSecurity: {
      maxAge: 63072000,
      includeSubDomains: true,
      preload: true,
    },
    frameguard: { action: "deny" },
    noSniff: true,
    permittedCrossDomainPolicies: { permittedPolicies: "none" },
    xPoweredBy: false,
  });
}

export function corsAllowlist(): RequestHandler {
  const opts: CorsOptions = {
    origin(origin, cb) {
      // Allow non-browser clients (curl, server-to-server) with no Origin header
      if (!origin) return cb(null, true);
      if (config.allowedOrigins.includes(origin)) return cb(null, true);
      // In dev, allow localhost and Replit dev domains by convention
      if (!config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1|.+\.replit\.dev|.+\.repl\.co)(:\d+)?$/.test(origin)) {
        return cb(null, true);
      }
      return cb(new Error(`Origin not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "X-Request-Id",
      "X-Org-Id",
      "X-Actor-Id",
      "X-Actor-Role",
    ],
    exposedHeaders: ["X-Request-Id"],
    maxAge: 600,
  };
  return cors(opts);
}
