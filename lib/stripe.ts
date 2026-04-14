import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) {
      throw new Error('STRIPE_SECRET_KEY is not configured')
    }
    _stripe = new Stripe(key, { typescript: true })
  }
  return _stripe
}

export const PLANS = {
  free: {
    name: 'Free',
    queriesPerDay: 10,
    features: ['AI Research (limited)', 'Market Data', 'Basic Screener'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    queriesPerDay: 500,
    features: [
      'Unlimited AI Research',
      'Real-time Market Data',
      'Advanced Screener',
      'SEC Filings',
      'News & Signals',
      'Macro Dashboard',
      'Workspaces',
      'API Access',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    queriesPerDay: Infinity,
    features: [
      'Everything in Pro',
      'Private Company Data',
      'MCP Tools',
      'Custom Integrations',
      'Priority Support',
      'Dedicated Instance',
    ],
  },
} as const

export type PlanKey = keyof typeof PLANS
