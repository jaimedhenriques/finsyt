'use client'
import Link from 'next/link'
import { useSubscription } from '@/lib/supabase/hooks'

interface ProGateProps {
  children: React.ReactNode
  feature?: string
  fallback?: React.ReactNode
}

export default function ProGate({ children, feature, fallback }: ProGateProps) {
  const { isPro, loading } = useSubscription()

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
        <div style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid #E2E8F2', borderTopColor: '#1B4FFF', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    )
  }

  if (isPro) return <>{children}</>

  if (fallback) return <>{fallback}</>

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '60px 24px', textAlign: 'center' }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, marginBottom: 20 }}>✦</div>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0A1628', marginBottom: 10, letterSpacing: '-0.02em' }}>
        {feature ? `${feature} is a Pro feature` : 'Pro Feature'}
      </h2>
      <p style={{ fontSize: 14, color: '#7A8EAE', maxWidth: 380, lineHeight: 1.7, marginBottom: 28 }}>
        Upgrade to Finsyt Pro for unlimited access to AI research, advanced data, screener, filings, and more.
      </p>
      <div style={{ display: 'flex', gap: 12 }}>
        <Link href="/app/upgrade"
          style={{ padding: '12px 28px', borderRadius: 12, background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>
          Upgrade to Pro →
        </Link>
        <Link href="/app/research"
          style={{ padding: '12px 20px', borderRadius: 12, border: '1.5px solid #E2E8F2', color: '#4A5568', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>
          Back to Research
        </Link>
      </div>
    </div>
  )
}

/** Inline badge for Pro-only features in nav */
export function ProBadge() {
  return (
    <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 5px', borderRadius: 4, background: 'rgba(245,158,11,0.2)', color: '#F59E0B', letterSpacing: '0.05em' }}>PRO</span>
  )
}

/** Query limit banner shown when approaching free tier limit */
export function QueryLimitBanner({ used, limit }: { used: number; limit: number }) {
  const pct = (used / limit) * 100
  if (pct < 70) return null

  return (
    <div style={{ padding: '10px 16px', background: pct >= 100 ? '#FEF2F2' : '#FFFBEB', border: `1px solid ${pct >= 100 ? '#FCA5A5' : '#FCD34D'}`, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, fontSize: 13 }}>
      <span style={{ color: pct >= 100 ? '#991B1B' : '#92400E' }}>
        {pct >= 100
          ? `You've reached your daily query limit (${limit}/${limit}). Upgrade to continue.`
          : `${used}/${limit} queries used today. ${Math.ceil(limit - used)} remaining.`}
      </span>
      <Link href="/app/upgrade"
        style={{ padding: '6px 14px', borderRadius: 8, background: pct >= 100 ? '#EF4444' : '#F59E0B', color: '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
        Upgrade
      </Link>
    </div>
  )
}
