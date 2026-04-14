import Stripe from 'stripe'

let _stripe: Stripe | null = null

export function getStripe(): Stripe {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY
    if (!key) throw new Error('STRIPE_SECRET_KEY is not set')
    _stripe = new Stripe(key, {
      apiVersion: '2025-03-31.basil',
      typescript: true,
    })
  }
  return _stripe
}

export { getStripe as stripe }

export const PLANS = {
  free: {
    name: 'Free',
    price: 0,
    queries: 25,
    features: ['Basic financial data', '25 AI queries/month', 'SEC filings access'],
  },
  pro: {
    name: 'Pro',
    priceId: process.env.STRIPE_PRO_PRICE_ID || '',
    price: 49,
    queries: -1,
    features: [
      'Unlimited AI queries',
      'Real-time data feeds',
      'Advanced screener',
      'Private company data',
      'Workspace collaboration',
      'API access',
      'Priority support',
    ],
  },
  enterprise: {
    name: 'Enterprise',
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || '',
    price: 199,
    queries: -1,
    features: [
      'Everything in Pro',
      'Custom data integrations',
      'Dedicated account manager',
      'SSO / SAML',
      'Custom MCP tools',
      'SLA guarantee',
    ],
  },
} as const

export type PlanKey = keyof typeof PLANS
