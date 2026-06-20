'use client'
import { useEffect, useState } from 'react'

interface BillingState {
  plan: 'free' | 'pro' | 'enterprise'
  status: string
  currentPeriodEnd: string | null
  cancelAtPeriodEnd: boolean
  billingConfigured: boolean
  demoMode: boolean
  features: string[]
  usage: { aiQueries: { used: number; limit: number | null; remaining: number | null } }
}

const T = {
  bg: 'var(--bg-page)', surface: '#0F1929', border: 'rgba(255,255,255,0.06)',
  text: '#E2E8F0', textMuted: 'rgba(255,255,255,0.35)', textSub: 'rgba(255,255,255,0.55)',
  accent: 'var(--accent)', pos: 'var(--pos)', serif: "'Georgia', serif", sans: "'Inter', system-ui, sans-serif",
}

const PLANS = [
  {
    name: 'Free',
    price: '$0', period: '/month',
    desc: 'For individuals exploring financial AI',
    features: [
      '25 AI research queries/month',
      'Live market quotes',
      'Basic company profiles',
      'SEC filings search',
      '1 watchlist (25 stocks)',
      'Community support',
    ],
    missing: ['Unlimited AI queries', 'Earnings transcripts', 'Insider data', 'Workflow automation', 'Export to Excel/PDF'],
    cta: 'Current plan', disabled: true, highlight: false,
  },
  {
    name: 'Pro',
    price: '$29', period: '/month',
    desc: 'For analysts and investors who live on data',
    features: [
      'Unlimited AI research queries',
      'Full financial statements (IS, BS, CF)',
      'Earnings call transcripts',
      'Insider & institutional ownership',
      'Analyst consensus & price targets',
      'Unlimited watchlists',
      'Workflow automation & templates',
      'Export to Excel, PDF, PowerPoint',
      'Priority support (< 4h response)',
    ],
    missing: [],
    cta: 'Upgrade to Pro — $29/mo', disabled: false, highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom', period: '',
    desc: 'For firms that need security and scale',
    features: [
      'Everything in Pro',
      'SSO / SAML authentication',
      'Custom data integrations',
      'Private/single-tenant deployment',
      'Dedicated customer success manager',
      'SLA guarantees',
      'Audit logs & compliance reporting',
      'Team management & RBAC',
      'Custom model fine-tuning',
    ],
    missing: [],
    cta: 'Contact sales', disabled: false, highlight: false,
  },
]

const COMPARE = [
  { feature: 'AI research queries',        free: '25/mo',     pro: 'Unlimited',    enterprise: 'Unlimited' },
  { feature: 'Live market data',           free: '✓',         pro: '✓',            enterprise: '✓' },
  { feature: 'Company financial history',  free: '3 years',   pro: '20+ years',    enterprise: '20+ years' },
  { feature: 'SEC filings (10-K, 10-Q)',  free: 'Search only',pro: 'Full content', enterprise: 'Full content' },
  { feature: 'Earnings transcripts',       free: '—',         pro: '✓',            enterprise: '✓' },
  { feature: 'Insider transactions',       free: '—',         pro: '✓',            enterprise: '✓' },
  { feature: 'Analyst ratings & targets',  free: '—',         pro: '✓',            enterprise: '✓' },
  { feature: 'Institutional ownership',    free: '—',         pro: '✓',            enterprise: '✓' },
  { feature: 'Workflow automation',        free: '—',         pro: '✓',            enterprise: '✓' },
  { feature: 'Export (Excel, PDF, PPTX)', free: '—',         pro: '✓',            enterprise: '✓' },
  { feature: 'Watchlists',                free: '1 (25 stocks)', pro: 'Unlimited',  enterprise: 'Unlimited' },
  { feature: 'Alert types',               free: 'Price only', pro: 'Price + News', enterprise: 'All + Custom' },
  { feature: 'Private company data',      free: '—',         pro: 'Basic',        enterprise: 'Full CoreSignal' },
  { feature: 'SSO / SAML',               free: '—',         pro: '—',            enterprise: '✓' },
  { feature: 'Single-tenant deployment',  free: '—',         pro: '—',            enterprise: '✓' },
  { feature: 'SLA',                       free: '—',         pro: '—',            enterprise: '99.9% uptime' },
  { feature: 'Support',                   free: 'Community', pro: 'Priority (4h)', enterprise: 'Dedicated CSM' },
]

export default function UpgradePage() {
  const [billing, setBilling] = useState<BillingState | null>(null)
  const [statusFlag, setStatusFlag] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function loadBilling() {
    try {
      const res = await fetch('/platform/api/billing', { cache: 'no-store' })
      if (res.ok) setBilling(await res.json())
    } catch { /* leave billing null → defaults to Free CTAs */ }
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const sp = new URLSearchParams(window.location.search)
      const s = sp.get('status')
      if (s) {
        setStatusFlag(s)
        // Clean the URL so a refresh doesn't re-show the banner.
        window.history.replaceState({}, '', window.location.pathname)
      }
    }
    loadBilling()
  }, [])

  const currentPlan = billing?.plan ?? 'free'
  const billingConfigured = billing?.billingConfigured ?? true
  const demoMode = billing?.demoMode ?? false

  function ctaFor(planName: string): { label: string; onClick?: () => void; disabled: boolean } {
    const tier = planName.toLowerCase()
    if (tier === 'enterprise') {
      return { label: 'Contact sales', onClick: () => { window.location.href = 'mailto:hello@finsyt.com' }, disabled: false }
    }
    if (tier === 'free') {
      if (currentPlan === 'free') return { label: 'Current plan', disabled: true }
      return { label: 'Included', disabled: true }
    }
    // Pro
    if (currentPlan === 'pro' || currentPlan === 'enterprise') {
      return { label: 'Current plan', disabled: true }
    }
    if (!billingConfigured) {
      return { label: 'Billing unavailable', disabled: true }
    }
    return {
      label: 'Upgrade to Pro — $29/mo',
      onClick: () => { window.location.href = '/platform/api/stripe/create-checkout?plan=pro' },
      disabled: false,
    }
  }

  async function handleCancelToggle() {
    if (!billing) return
    setBusy(true)
    try {
      const res = await fetch('/platform/api/billing/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resume: billing.cancelAtPeriodEnd }),
      })
      if (res.ok) await loadBilling()
    } finally {
      setBusy(false)
    }
  }

  const usage = billing?.usage.aiQueries
  const statusBanner = (() => {
    if (!statusFlag) return null
    const map: Record<string, { tone: 'pos' | 'amber' | 'muted'; msg: string }> = {
      success: { tone: 'pos', msg: '🎉 Payment successful — your plan is being activated. It may take a moment to reflect.' },
      cancelled: { tone: 'muted', msg: 'Checkout cancelled. No charge was made.' },
      not_configured: { tone: 'amber', msg: 'Billing is not configured on this environment yet.' },
      price_not_configured: { tone: 'amber', msg: 'This plan’s price is not configured yet. Please contact support.' },
      signin_required: { tone: 'amber', msg: 'Please sign in to upgrade.' },
      no_workspace: { tone: 'amber', msg: 'Create or join a workspace before upgrading.' },
      error: { tone: 'amber', msg: 'Something went wrong starting checkout. Please try again.' },
    }
    return map[statusFlag] ?? null
  })()

  return (
    <div className="page-content" style={{ background: T.bg, minHeight: '100vh', color: T.text }}>
      <style>{`
        * { box-sizing: border-box; }
        body { background: ${T.bg}; }
      `}</style>

      {statusBanner && (
        <div style={{
          maxWidth: 1100, margin: '0 auto 24px',
          background: statusBanner.tone === 'pos' ? 'rgba(34,197,94,0.1)' : statusBanner.tone === 'amber' ? 'rgba(245,158,11,0.1)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${statusBanner.tone === 'pos' ? 'rgba(34,197,94,0.3)' : statusBanner.tone === 'amber' ? 'rgba(245,158,11,0.3)' : T.border}`,
          borderRadius: 12, padding: '14px 20px', fontFamily: T.sans, fontSize: 14,
          color: statusBanner.tone === 'pos' ? '#86efac' : statusBanner.tone === 'amber' ? 'var(--amber)' : T.textSub,
        }}>{statusBanner.msg}</div>
      )}

      {/* Current plan summary */}
      {billing && (
        <div style={{
          maxWidth: 1100, margin: '0 auto 24px', background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 16, padding: '20px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: T.textMuted, marginBottom: 6 }}>Current plan</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontFamily: T.serif, fontSize: 24, color: T.text, textTransform: 'capitalize' }}>{currentPlan}</span>
              {demoMode && <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 700, color: 'var(--amber)', background: 'rgba(245,158,11,0.12)', borderRadius: 999, padding: '3px 10px' }}>DEMO</span>}
              {billing.cancelAtPeriodEnd && <span style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 700, color: 'var(--amber)', background: 'rgba(245,158,11,0.12)', borderRadius: 999, padding: '3px 10px' }}>CANCELS AT PERIOD END</span>}
            </div>
            {usage && usage.limit !== null && (
              <div style={{ fontFamily: T.sans, fontSize: 13, color: T.textSub, marginTop: 8 }}>
                AI queries this month: <strong style={{ color: T.text }}>{usage.used}</strong> / {usage.limit}
                {usage.remaining === 0 && <span style={{ color: 'var(--amber)', marginLeft: 8 }}>Limit reached — upgrade for unlimited.</span>}
              </div>
            )}
            {usage && usage.limit === null && !demoMode && (
              <div style={{ fontFamily: T.sans, fontSize: 13, color: T.textSub, marginTop: 8 }}>Unlimited AI research queries.</div>
            )}
          </div>
          {(currentPlan === 'pro' || currentPlan === 'enterprise') && billing.status !== 'none' && !demoMode && billingConfigured && (
            <button
              onClick={handleCancelToggle}
              disabled={busy}
              style={{
                background: 'rgba(255,255,255,0.06)', color: T.text, border: `1px solid ${T.border}`,
                borderRadius: 9999, padding: '10px 20px', fontFamily: T.sans, fontSize: 13, fontWeight: 600,
                cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
              }}
            >{billing.cancelAtPeriodEnd ? 'Resume subscription' : 'Cancel subscription'}</button>
          )}
        </div>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 64, paddingTop: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 999, padding: '5px 14px', marginBottom: 24 }}>
          <span style={{ fontSize: 13 }}>⚡</span>
          <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: 'var(--amber)' }}>Unlock the full platform</span>
        </div>
        <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(36px, 5vw, 56px)', fontWeight: 400, letterSpacing: '-2px', color: T.text, marginBottom: 16 }}>
          Simple, transparent pricing
        </h1>
        <p style={{ fontFamily: T.sans, fontSize: 16, color: T.textSub, maxWidth: 480, margin: '0 auto' }}>
          Start free. Upgrade when you're ready. No hidden fees, no contracts.
        </p>
      </div>

      {/* Plans */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 80, maxWidth: 1100, margin: '0 auto 80px' }}>
        {PLANS.map((plan, i) => (
          <div key={plan.name} style={{
            background: plan.highlight ? 'var(--accent)' : T.surface,
            border: `1px solid ${plan.highlight ? 'var(--accent)' : T.border}`,
            borderRadius: 20, padding: '36px 32px',
            position: 'relative',
            boxShadow: plan.highlight ? '0 24px 64px rgba(27,79,255,0.35)' : 'none',
          }}>
            {plan.highlight && (
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: 'var(--amber)', color: '#0A0908', fontFamily: T.sans, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '4px 14px', borderRadius: 999, whiteSpace: 'nowrap' }}>MOST POPULAR</div>
            )}

            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: plan.highlight ? 'rgba(255,255,255,0.6)' : T.textMuted, marginBottom: 10 }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontFamily: T.serif, fontSize: 48, fontWeight: 400, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>{plan.price}</span>
                <span style={{ fontFamily: T.sans, fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.5)' : T.textMuted }}>{plan.period}</span>
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 13, color: plan.highlight ? 'rgba(255,255,255,0.6)' : T.textSub }}>{plan.desc}</div>
            </div>

            {(() => {
              const cta = ctaFor(plan.name)
              return (
                <button
                  onClick={() => { if (!cta.disabled && cta.onClick) cta.onClick() }}
                  disabled={cta.disabled}
                  style={{
                    display: 'block', width: '100%', textAlign: 'center',
                    background: plan.highlight ? '#fff' : cta.disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
                    color: plan.highlight ? 'var(--accent)' : cta.disabled ? T.textMuted : '#fff',
                    borderRadius: 9999, padding: '12px 24px',
                    fontFamily: T.sans, fontSize: 14, fontWeight: 700,
                    border: 'none', cursor: cta.disabled ? 'default' : 'pointer', marginBottom: 28,
                    transition: 'opacity 0.15s',
                    letterSpacing: '-0.01em',
                  }}
                >{cta.label}</button>
              )
            })()}

            <div style={{ height: 1, background: plan.highlight ? 'rgba(255,255,255,0.15)' : T.border, marginBottom: 24 }} />

            <ul style={{ listStyle: 'none', padding: 0 }}>
              {plan.features.map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                  <span style={{ color: plan.highlight ? '#fff' : T.pos, fontSize: 12, flexShrink: 0, marginTop: 2 }}>✓</span>
                  <span style={{ fontFamily: T.sans, fontSize: 13, color: plan.highlight ? 'rgba(255,255,255,0.8)' : T.textSub }}>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Comparison table */}
      <div style={{ maxWidth: 1100, margin: '0 auto 80px', background: T.surface, borderRadius: 20, border: `1px solid ${T.border}`, overflow: 'hidden' }}>
        <div style={{ padding: '28px 32px', borderBottom: `1px solid ${T.border}` }}>
          <h2 style={{ fontFamily: T.serif, fontSize: 24, fontWeight: 400, color: T.text, letterSpacing: '-0.5px' }}>Full comparison</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
              <th style={{ padding: '14px 32px', textAlign: 'left', fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: T.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Feature</th>
              {['Free', 'Pro', 'Enterprise'].map((p, i) => (
                <th key={p} style={{ padding: '14px 24px', textAlign: 'center', fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: i === 1 ? '#93B4FF' : T.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{p}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {COMPARE.map((row, i) => (
              <tr key={row.feature} style={{ borderTop: `1px solid ${T.border}` }}>
                <td style={{ padding: '12px 32px', fontFamily: T.sans, fontSize: 13, color: T.textSub }}>{row.feature}</td>
                {[row.free, row.pro, row.enterprise].map((val, j) => (
                  <td key={j} style={{ padding: '12px 24px', textAlign: 'center', fontFamily: T.sans, fontSize: 13, color: val === '—' ? 'rgba(255,255,255,0.15)' : val === '✓' ? T.pos : T.text, fontWeight: val === '✓' ? 700 : 400 }}>{val}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* FAQ */}
      <div style={{ maxWidth: 700, margin: '0 auto 80px' }}>
        <h2 style={{ fontFamily: T.serif, fontSize: 28, fontWeight: 400, letterSpacing: '-0.8px', color: T.text, textAlign: 'center', marginBottom: 40 }}>Frequently asked questions</h2>
        {[
          { q: 'Can I cancel anytime?', a: 'Yes. No contracts, no cancellation fees. Cancel from settings at any time and your Pro features remain until the end of the billing period.' },
          { q: 'Is my data ever used to train AI models?', a: 'Never. We operate a strict no-training policy. Your queries, notes, and watchlists are never used to train or fine-tune any model.' },
          { q: "What's included in the free plan?", a: '25 AI research queries per month, live market data, basic company profiles, SEC filing search, and one watchlist with up to 25 stocks.' },
          { q: 'Do you offer a free trial of Pro?', a: 'Yes — contact us at hello@finsyt.com and we can enable a 7-day Pro trial on your account, no credit card required.' },
          { q: 'What payment methods do you accept?', a: 'All major credit and debit cards via Stripe. Enterprise customers can also pay by bank transfer or invoice.' },
        ].map((item, i) => (
          <div key={i} style={{ borderBottom: `1px solid ${T.border}`, padding: '20px 0' }}>
            <div style={{ fontFamily: T.sans, fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 8 }}>{item.q}</div>
            <div style={{ fontFamily: T.sans, fontSize: 14, color: T.textSub, lineHeight: 1.65 }}>{item.a}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
