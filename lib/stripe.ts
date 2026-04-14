import Stripe from 'stripe'

let stripeClient: Stripe | null = null

export function getStripeClient() {
  if (stripeClient) {
    return stripeClient
  }

  const apiKey = process.env.STRIPE_SECRET_KEY || ''
  if (!apiKey) {
    throw new Error('Missing STRIPE_SECRET_KEY environment variable.')
  }

  stripeClient = new Stripe(apiKey)
  return stripeClient
}
