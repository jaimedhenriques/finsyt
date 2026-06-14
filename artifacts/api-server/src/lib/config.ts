import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DB_RUNTIME_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/).optional(),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  CSRF_SECRET: z.string().min(32).optional(),
  /**
   * Comma-separated list of trusted upstream proxy IP addresses (e.g. Replit
   * load balancer, Cloudflare edge). When set, Express's `trust proxy` is
   * configured with exactly these IPs so that X-Forwarded-For is only
   * traversed through the verified proxy chain. When empty, Express does NOT
   * trust any proxy headers — rate limiters fall back to the un-spoofable
   * TCP socket address instead.
   *
   * Never set this to "1" or "true" in production: that form trusts whatever
   * the caller sends as the leftmost X-Forwarded-For value and lets any
   * attacker rotate their apparent IP at will.
   */
  TRUSTED_PROXY_IPS: z.string().default(""),
});

export type AppConfig = z.infer<typeof ConfigSchema> & {
  allowedOrigins: string[];
  trustedProxyList: string[];
  isProduction: boolean;
};

function loadConfig(): AppConfig {
  const parsed = ConfigSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const data = parsed.data;
  if (isProduction && !data.CSRF_SECRET) {
    throw new Error("CSRF_SECRET must be set in production (>=32 chars).");
  }
  const allowedOrigins = data.CORS_ALLOWED_ORIGINS
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (isProduction && allowedOrigins.length === 0) {
    throw new Error(
      "CORS_ALLOWED_ORIGINS must be set in production (comma-separated allowlist).",
    );
  }
  const trustedProxyList = data.TRUSTED_PROXY_IPS
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return { ...data, allowedOrigins, trustedProxyList, isProduction };
}

export const config: AppConfig = loadConfig();
