'use client'

import { useAuth } from '@/lib/supabase/auth-provider'
import Link from 'next/link'

type GateProps = {
  children: React.ReactNode
  requiredPlan?: 'pro' | 'enterprise'
  fallback?: React.ReactNode
}

export function SubscriptionGate({ children, requiredPlan = 'pro', fallback }: GateProps) {
  const { subscription, loading } = useAuth()

  if (loading) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', color: '#7D8FA9', fontSize: 14,
      }}>
        Loading…
      </div>
    )
  }

  const plan = subscription?.plan || 'free'
  const tiers = ['free', 'pro', 'enterprise']
  const userTier = tiers.indexOf(plan)
  const requiredTier = tiers.indexOf(requiredPlan)

  if (userTier >= requiredTier) {
    return <>{children}</>
  }

  if (fallback) return <>{fallback}</>

  return <UpgradePrompt requiredPlan={requiredPlan} />
}

function UpgradePrompt({ requiredPlan }: { requiredPlan: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '60vh', padding: 40,
    }}>
      <div style={{
        maxWidth: 480, textAlign: 'center',
        padding: 40, borderRadius: 16,
        background: '#fff', border: '1px solid #E2E8F2',
        boxShadow: '0 4px 24px rgba(0,0,0,0.04)',
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(27,79,255,0.12), rgba(13,159,232,0.12))',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 24, marginBottom: 16,
        }}>✦</div>
        <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0A1628', marginBottom: 8 }}>
          {requiredPlan === 'enterprise' ? 'Enterprise' : 'Pro'} Feature
        </h2>
        <p style={{ fontSize: 14, color: '#7D8FA9', lineHeight: 1.6, marginBottom: 24 }}>
          This feature requires a {requiredPlan === 'enterprise' ? 'Enterprise' : 'Pro'} subscription.
          Upgrade to unlock institutional-grade financial intelligence tools.
        </p>
        <Link href="/app/upgrade" style={{
          display: 'inline-block', padding: '12px 28px', borderRadius: 10,
          background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)',
          color: '#fff', fontSize: 14, fontWeight: 700,
          textDecoration: 'none', transition: 'opacity 0.15s',
        }}>
          Upgrade to {requiredPlan === 'enterprise' ? 'Enterprise' : 'Pro'}
        </Link>
      </div>
    </div>
  )
}

export function useSubscription() {
  const { subscription, loading } = useAuth()
  const plan = subscription?.plan || 'free'
  const tiers = ['free', 'pro', 'enterprise']
  const tier = tiers.indexOf(plan)

  return {
    plan,
    loading,
    isPro: tier >= 1,
    isEnterprise: tier >= 2,
    canAccess: (required: 'free' | 'pro' | 'enterprise') =>
      tier >= tiers.indexOf(required),
  }
}
