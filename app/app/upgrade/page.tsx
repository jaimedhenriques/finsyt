'use client'
import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'

const FEATURES_FREE = [
  '10 AI research queries/day',
  '5 companies in watchlist',
  'Basic market data',
  'Public filings access',
  'Limited screener (20 results)',
]

const FEATURES_PRO = [
  'Unlimited AI research queries',
  'Unlimited watchlist',
  'Real-time quotes & charts',
  'Full SEC filings + XBRL',
  'Advanced screener (500 results)',
  'Earnings transcripts',
  'Insider transaction alerts',
  'Macro dashboard (FRED)',
  'Private company data',
  'Export to Excel / CSV',
  'API access (10k calls/mo)',
  'Priority support',
]

function UpgradeInner() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [plan, setPlan] = useState<'pro' | 'enterprise'>('pro')

  const success = searchParams?.get('success') === 'true'
  const canceled = searchParams?.get('canceled') === 'true'

  useEffect(() => {
    if (success) {
      setTimeout(() => router.push('/app/research'), 3000)
    }
  }, [success, router])

  async function handleUpgrade() {
    setLoading(true)
    try {
      const res = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert(data.error || 'Failed to start checkout')
      }
    } catch {
      alert('Checkout error — please try again')
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 'calc(100vh - 52px)', padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 64, marginBottom: 20 }}>🎉</div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#0A1628', marginBottom: 12, letterSpacing: '-0.02em' }}>You&apos;re now on Pro!</h1>
        <p style={{ fontSize: 16, color: '#7A8EAE', marginBottom: 28, maxWidth: 420 }}>Welcome to Finsyt Pro. Redirecting you to the research platform...</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', color: '#1B4FFF', fontSize: 14, fontWeight: 600 }}>
          <div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid #1B4FFF', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
          Redirecting...
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px' }}>
      {canceled && (
        <div style={{ padding: '12px 16px', borderRadius: 10, background: '#FFF7ED', border: '1px solid #FED7AA', color: '#92400E', fontSize: 14, marginBottom: 24, textAlign: 'center' }}>
          Checkout was canceled. No charges were made.
        </div>
      )}

      <div style={{ textAlign: 'center', marginBottom: 48 }}>
        <span style={{ display: 'inline-block', padding: '4px 12px', borderRadius: 20, background: 'rgba(27,79,255,0.1)', color: '#1B4FFF', fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>Finsyt Pro</span>
        <h1 style={{ fontSize: '2.25rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.03em', marginBottom: 14 }}>Institutional-Grade Financial Intelligence</h1>
        <p style={{ fontSize: 16, color: '#7A8EAE', maxWidth: 560, margin: '0 auto', lineHeight: 1.7 }}>
          Unlimited AI research, real-time data, full filings access, and advanced screener. Everything you need to research like a professional analyst.
        </p>
      </div>

      {/* Pricing cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 48 }}>

        {/* Free */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #E2E8F2', padding: '28px 24px' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9BAFC8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Free</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 900, color: '#0A1628' }}>$0</span>
              <span style={{ fontSize: 14, color: '#9BAFC8' }}>/mo</span>
            </div>
            <p style={{ fontSize: 13, color: '#9BAFC8', marginTop: 6 }}>Get started for free</p>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURES_FREE.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#4A5568' }}>
                <span style={{ color: '#34D399', flexShrink: 0, marginTop: 1 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button disabled style={{ width: '100%', padding: '11px', borderRadius: 10, border: '1.5px solid #E2E8F2', background: '#F5F7FB', color: '#9BAFC8', fontSize: 14, fontWeight: 600, cursor: 'not-allowed' }}>Current Plan</button>
        </div>

        {/* Pro */}
        <div
          style={{ background: 'linear-gradient(160deg, #0D1B3E 0%, #0A1628 100%)', borderRadius: 20, border: '1.5px solid rgba(27,79,255,0.4)', padding: '28px 24px', position: 'relative', boxShadow: '0 0 40px rgba(27,79,255,0.15)' }}
          onClick={() => setPlan('pro')}
        >
          <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '4px 14px', borderRadius: 20, background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', color: '#fff', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' }}>MOST POPULAR</div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#93B4FF', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Pro</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 900, color: '#fff' }}>$49</span>
              <span style={{ fontSize: 14, color: '#7A8EAE' }}>/mo</span>
            </div>
            <p style={{ fontSize: 13, color: '#7A8EAE', marginTop: 6 }}>For analysts &amp; investors</p>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {FEATURES_PRO.map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#CBD5E1' }}>
                <span style={{ color: '#34D399', flexShrink: 0, marginTop: 1 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
          <button
            onClick={handleUpgrade}
            disabled={loading || plan !== 'pro'}
            style={{ width: '100%', padding: '13px', borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #1B4FFF, #0D9FE8)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', letterSpacing: '-0.01em', opacity: loading ? 0.7 : 1, transition: 'opacity 0.15s', fontFamily: 'inherit' }}
          >
            {loading && plan === 'pro' ? 'Redirecting...' : 'Upgrade to Pro →'}
          </button>
        </div>

        {/* Enterprise */}
        <div style={{ background: '#fff', borderRadius: 20, border: '1.5px solid #E2E8F2', padding: '28px 24px' }}>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#9BAFC8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>Enterprise</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontSize: '2rem', fontWeight: 900, color: '#0A1628' }}>Custom</span>
            </div>
            <p style={{ fontSize: 13, color: '#9BAFC8', marginTop: 6 }}>For teams &amp; institutions</p>
          </div>
          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {['Everything in Pro', 'Team workspaces', 'SSO / SAML', 'Custom data integrations', 'SLA + dedicated support', 'Volume API pricing', 'Custom models/prompts'].map(f => (
              <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: '#4A5568' }}>
                <span style={{ color: '#34D399', flexShrink: 0, marginTop: 1 }}>✓</span>
                {f}
              </li>
            ))}
          </ul>
          <a href="mailto:enterprise@finsyt.com"
            style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '13px', borderRadius: 12, border: '1.5px solid #1B4FFF', background: '#fff', color: '#1B4FFF', fontSize: 14, fontWeight: 700, textAlign: 'center', textDecoration: 'none', letterSpacing: '-0.01em' }}>
            Contact Sales
          </a>
        </div>
      </div>

      <p style={{ textAlign: 'center', fontSize: 13, color: '#9BAFC8' }}>
        All plans include a 14-day free trial. Cancel any time. Questions? Email{' '}
        <a href="mailto:support@finsyt.com" style={{ color: '#1B4FFF', textDecoration: 'none' }}>support@finsyt.com</a>
      </p>
    </div>
  )
}

export default function UpgradePage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, color: '#9BAFC8' }}>Loading...</div>}>
      <UpgradeInner />
    </Suspense>
  )
}
