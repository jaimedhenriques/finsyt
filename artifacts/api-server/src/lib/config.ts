import { z } from "zod";

const isProduction = process.env.NODE_ENV === "production";

const ConfigSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  // Optional Postgres role to SET LOCAL ROLE into for every per-tenant
  // transaction. Required when the connection string is a superuser/BYPASSRLS
  // role (RLS is otherwise bypassed). Should be unset in production where the
  // connection itself uses a non-superuser role.
  DB_RUNTIME_ROLE: z.string().regex(/^[a-z_][a-z0-9_]*$/).optional(),
  CORS_ALLOWED_ORIGINS: z.string().default(""),
  CSRF_SECRET: z.string().min(32).optional(),
  RATE_LIMIT_TRUST_PROXY: z.coerce.boolean().default(true),
});

export type AppConfig = z.infer<typeof ConfigSchema> & {
  allowedOrigins: string[];
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
  return { ...data, allowedOrigins, isProduction };
}

export const config: AppConfig = loadConfig();
