const FALLBACK_PRICE_CANDIDATES = ["price_123", "price_456"] as const

function readEnv(key: string): string {
  const value = process.env[key]
  return value ? value.trim() : ""
}

function readFirst(keys: readonly string[]): string {
  for (const key of keys) {
    const value = readEnv(key)
    if (value) return value
  }
  return ""
}

export function getStripeConfig() {
  const secretKey = readFirst(["STRIPE_SECRET_KEY"])
  const webhookSecret = readFirst(["STRIPE_WEBHOOK_SECRET"])
  const successPath = readFirst(["STRIPE_SUCCESS_PATH"]) || "/app/settings?upgrade=success"
  const cancelPath = readFirst(["STRIPE_CANCEL_PATH"]) || "/app/settings?upgrade=cancel"
  const freePriceId = readFirst(["STRIPE_PRICE_ID_FREE"]) || FALLBACK_PRICE_CANDIDATES[0]
  const proPriceId = readFirst(["STRIPE_PRICE_ID_PRO"]) || FALLBACK_PRICE_CANDIDATES[1]

  return {
    secretKey,
    webhookSecret,
    successPath,
    cancelPath,
    freePriceId,
    proPriceId,
    isConfigured: Boolean(secretKey),
    isWebhookConfigured: Boolean(secretKey && webhookSecret),
  }
}
