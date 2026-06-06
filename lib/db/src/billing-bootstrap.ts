import { pool } from "./index";

/**
 * Idempotent bootstrap for billing tables. Same pattern as
 * `ensureLiveHighlightsSchema` — raw CREATE TABLE IF NOT EXISTS so a fresh
 * database self-heals on first boot without drizzle-kit push.
 */
export async function ensureBillingSchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS org_subscriptions (
      clerk_org_id text PRIMARY KEY,
      tier text NOT NULL DEFAULT 'free',
      status text NOT NULL DEFAULT 'active',
      stripe_customer_id text,
      stripe_subscription_id text,
      stripe_price_id text,
      current_period_end timestamptz,
      cancel_at_period_end integer NOT NULL DEFAULT 0,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_counters (
      id text PRIMARY KEY,
      clerk_org_id text NOT NULL,
      counter_key text NOT NULL,
      period text NOT NULL,
      count integer NOT NULL DEFAULT 0,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS usage_counters_org_key_period_uniq
      ON usage_counters (clerk_org_id, counter_key, period)
  `);
}
