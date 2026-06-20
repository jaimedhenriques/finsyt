/**
 * Stripe client + billing configuration helpers.
 *
 * The whole subscriptions feature degrades gracefully when Stripe secrets are
 * absent: `isBillingConfigured()` is false, checkout/webhook routes short-
 * circuit, and the UI shows an "unavailable" state instead of crashing.
 *
 * Required env (all optional — feature is off when STRIPE_SECRET_KEY is unset):
 *   STRIPE_SECRET_KEY       — server API key (sk_…)
 *   STRIPE_WEBHOOK_SECRET   — signing secret for /api/stripe/webhook (whsec_…)
 *   STRIPE_PRICE_PRO        — recurring Price id for the Pro plan
 *   STRIPE_PRICE_ENTERPRISE — recurring Price id for the Enterprise plan
 */
import Stripe from 'stripe'
import type { PlanTier } from '@workspace/db'

const SECRET_KEY = process.env.STRIPE_SECRET_KEY?.trim() || ''
export const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET?.trim() || ''

export const PLAN_PRICE_IDS: Record<Exclude<PlanTier, 'free'>, string> = {
  pro: process.env.STRIPE_PRICE_PRO?.trim() || '',
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE?.trim() || '',
}

/** True when the platform has enough config to create a checkout session. */
export function isBillingConfigured(): boolean {
  return SECRET_KEY.length > 0
}

/** True when incoming Stripe webhooks can be signature-verified. */
export function isWebhookConfigured(): boolean {
  return SECRET_KEY.length > 0 && STRIPE_WEBHOOK_SECRET.length > 0
}

let _client: Stripe | null = null

/** Lazily-constructed singleton. Throws if billing isn't configured. */
export function getStripe(): Stripe {
  if (!SECRET_KEY) {
    throw new Error('STRIPE_SECRET_KEY is not configured — billing is disabled.')
  }
  if (!_client) {
    // Omit apiVersion so the SDK uses the version pinned to the account; this
    // avoids a type mismatch with whatever default the installed SDK ships.
    _client = new Stripe(SECRET_KEY)
  }
  return _client
}

/** Map a Stripe Price id back to the local plan tier. */
export function priceIdToPlan(priceId: string | null | undefined): PlanTier {
  if (!priceId) return 'free'
  if (priceId === PLAN_PRICE_IDS.enterprise) return 'enterprise'
  if (priceId === PLAN_PRICE_IDS.pro) return 'pro'
  return 'free'
}
