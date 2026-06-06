import "server-only";

export interface BillingEnvStatus {
  configured: boolean;
  missing: string[];
}

/** Validate Stripe + app URL env vars required for paid checkout in production. */
export function validateBillingEnv(): BillingEnvStatus {
  const required = [
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PRO_PRICE_ID",
  ] as const;

  const missing = required.filter((key) => !process.env[key]?.trim());

  const hasAppUrl = Boolean(
    process.env.APP_URL?.trim() || process.env.VERCEL_URL?.trim(),
  );
  if (!hasAppUrl) {
    missing.push("APP_URL");
  }

  return {
    configured: missing.length === 0,
    missing: [...missing],
  };
}
