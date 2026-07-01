'use client'
import { useEffect, useState } from 'react'

export type Tier = 'free' | 'pro' | 'enterprise'

export function useTier(): { tier: Tier; isPro: boolean; setTier: (t: Tier) => void } {
  const [tier, setTier] = useState<Tier>('pro')
  useEffect(() => {
    try {
      const stored = (localStorage.getItem('finsyt_tier') as Tier) || 'pro'
      setTier(stored)
      document.cookie = `finsyt_tier=${stored}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    } catch {}
  }, [])
  function update(t: Tier) {
    setTier(t)
    try {
      localStorage.setItem('finsyt_tier', t)
      // Mirror to a cookie so server routes can read the entitlement.
      document.cookie = `finsyt_tier=${t}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`
    } catch {}
  }
  return { tier, isPro: tier !== 'free', setTier: update }
}
