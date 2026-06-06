'use client'
import { useCallback, useEffect, useState } from 'react'

export type Tier = 'free' | 'pro' | 'enterprise'

export interface BillingSnapshot {
  tier: Tier
  isPro: boolean
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  aiQueriesUsed: number
  aiQueriesLimit: number | null
  priceLabel: string | null
}

const DEFAULT_BILLING: BillingSnapshot = {
  tier: 'free',
  isPro: false,
  status: 'active',
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  aiQueriesUsed: 0,
  aiQueriesLimit: 10,
  priceLabel: null,
}

export function useTier(): {
  tier: Tier
  isPro: boolean
  billing: BillingSnapshot
  loading: boolean
  refresh: () => void
} {
  const [billing, setBilling] = useState<BillingSnapshot>(DEFAULT_BILLING)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(() => {
    setLoading(true)
    fetch('/platform/api/billing/status', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : DEFAULT_BILLING))
      .then((data: BillingSnapshot) => {
        setBilling({
          tier: data.tier ?? 'free',
          isPro: Boolean(data.isPro),
          status: data.status ?? 'active',
          currentPeriodEnd: data.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: Boolean(data.cancelAtPeriodEnd),
          aiQueriesUsed: data.aiQueriesUsed ?? 0,
          aiQueriesLimit: data.aiQueriesLimit ?? 10,
          priceLabel: data.priceLabel ?? null,
        })
      })
      .catch(() => setBilling(DEFAULT_BILLING))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return {
    tier: billing.tier,
    isPro: billing.isPro,
    billing,
    loading,
    refresh,
  }
}
