'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface FeatureGateProps {
  feature: string
  children: React.ReactNode
}

interface UserProfile {
  plan: string
  subscription_status: string | null
}

const FEATURE_REQUIREMENTS: Record<string, string> = {
  research: 'free',
  screener: 'free',
  markets: 'free',
  news: 'free',
  watchlist: 'free',
  macro: 'free',
  filings: 'pro',
  workspaces: 'pro',
  deals: 'pro',
  developer: 'pro',
  alerts: 'pro',
  discovery: 'enterprise',
  mcp: 'enterprise',
  private: 'enterprise',
}

const PLAN_HIERARCHY: Record<string, number> = {
  free: 0,
  pro: 1,
  enterprise: 2,
}

export default function FeatureGate({ feature, children }: FeatureGateProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/user')
      .then(r => r.json())
      .then(data => {
        setProfile(data.profile || { plan: 'free', subscription_status: null })
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: 400, color: '#6B7F9B', fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }

  const requiredPlan = FEATURE_REQUIREMENTS[feature] || 'free'
  const userPlan = profile?.plan || 'free'
  const hasAccess = (PLAN_HIERARCHY[userPlan] ?? 0) >= (PLAN_HIERARCHY[requiredPlan] ?? 0)

  if (hasAccess) return <>{children}</>

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: 32,
    }}>
      <div style={{
        textAlign: 'center', maxWidth: 480,
        background: '#fff', borderRadius: 20, padding: '48px 40px',
        border: '1px solid #E2E8F2', boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 16,
          background: 'linear-gradient(135deg, rgba(27,79,255,0.1), rgba(13,159,232,0.08))',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, marginBottom: 20,
        }}>✦</div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#1C2B4A', marginBottom: 8 }}>
          Upgrade to {requiredPlan === 'enterprise' ? 'Enterprise' : 'Pro'}
        </h2>
        <p style={{ color: '#6B7F9B', fontSize: 14, lineHeight: 1.7, marginBottom: 28 }}>
          This feature requires a {requiredPlan} subscription.
          Upgrade your plan to unlock institutional-grade capabilities.
        </p>
        <Link href="/app/upgrade" style={{
          display: 'inline-block', padding: '12px 32px', borderRadius: 12,
          background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
          color: '#fff', fontSize: 14, fontWeight: 700, textDecoration: 'none',
          transition: 'opacity 0.15s',
        }}>
          View Plans
        </Link>
      </div>
    </div>
  )
}
