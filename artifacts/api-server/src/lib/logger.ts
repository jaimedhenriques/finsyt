import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

/**
 * PII / secret redaction paths. Keep this list conservative — anything we know
 * may carry sensitive material is replaced with `[REDACTED]` before it can hit
 * stdout, log shippers, or downstream sinks.
 */
const REDACT_PATHS = [
  // Auth & session
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-csrf-token']",
  "req.headers['x-api-key']",
  "res.headers['set-cookie']",
  // Request bodies that commonly carry credentials/PII
  'req.body.password',
  'req.body.newPassword',
  'req.body.currentPassword',
  'req.body.token',
  'req.body.refreshToken',
  'req.body.accessToken',
  'req.body.apiKey',
  'req.body.secret',
  'req.body.clientSecret',
  'req.body.ssn',
  'req.body.taxId',
  'req.body.creditCard',
  'req.body.cardNumber',
  'req.body.cvv',
  // Generic top-level fields
  'password',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
  'clientSecret',
  'authorization',
];

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: { colorize: true },
        },
      }),
});
