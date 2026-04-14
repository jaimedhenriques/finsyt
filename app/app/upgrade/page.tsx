'use client'
import Link from 'next/link'

const T = {
  bg: '#080E1A', surface: '#0F1929', border: 'rgba(255,255,255,0.06)',
  text: '#E2E8F0', textMuted: 'rgba(255,255,255,0.35)', textSub: 'rgba(255,255,255,0.55)',
  accent: '#1B4FFF', pos: '#10B981', serif: "'Georgia', serif", sans: "'Inter', system-ui, sans-serif",
}

const PLANS = [
  {
    name: 'Free',
    price: '$0', period: '/month',
    desc: 'For individuals exploring financial AI',
    features: [
      '10 AI research queries/month',
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
  { feature: 'AI research queries',        free: '10/mo',     pro: 'Unlimited',    enterprise: 'Unlimited' },
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
  return (
    <div className="page-content" style={{ background: T.bg, minHeight: '100vh', color: T.text }}>
      <style>{`
        * { box-sizing: border-box; }
        body { background: ${T.bg}; }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 64, paddingTop: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 999, padding: '5px 14px', marginBottom: 24 }}>
          <span style={{ fontSize: 13 }}>⚡</span>
          <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: '#FCD34D' }}>Unlock the full platform</span>
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
            background: plan.highlight ? '#1B4FFF' : T.surface,
            border: `1px solid ${plan.highlight ? '#1B4FFF' : T.border}`,
            borderRadius: 20, padding: '36px 32px',
            position: 'relative',
            boxShadow: plan.highlight ? '0 24px 64px rgba(27,79,255,0.35)' : 'none',
          }}>
            {plan.highlight && (
              <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#FCD34D', color: '#0A0908', fontFamily: T.sans, fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', padding: '4px 14px', borderRadius: 999, whiteSpace: 'nowrap' }}>MOST POPULAR</div>
            )}

            <div style={{ marginBottom: 28 }}>
              <div style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: plan.highlight ? 'rgba(255,255,255,0.6)' : T.textMuted, marginBottom: 10 }}>{plan.name}</div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                <span style={{ fontFamily: T.serif, fontSize: 48, fontWeight: 400, color: '#fff', letterSpacing: '-2px', lineHeight: 1 }}>{plan.price}</span>
                <span style={{ fontFamily: T.sans, fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.5)' : T.textMuted }}>{plan.period}</span>
              </div>
              <div style={{ fontFamily: T.sans, fontSize: 13, color: plan.highlight ? 'rgba(255,255,255,0.6)' : T.textSub }}>{plan.desc}</div>
            </div>

            <button
              onClick={async () => {
                if (plan.disabled) return
                if (plan.name === 'Enterprise') { window.location.href = 'mailto:hello@finsyt.com'; return }
                try {
                  const res = await fetch('/api/checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ priceId: plan.name === 'Pro' ? (process.env.NEXT_PUBLIC_STRIPE_PRO_PRICE_ID || '') : '' }),
                  })
                  const data = await res.json()
                  if (data.url) window.location.href = data.url
                } catch {}
              }}
              disabled={plan.disabled}
              style={{
                display: 'block', width: '100%', textAlign: 'center',
                background: plan.highlight ? '#fff' : plan.disabled ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
                color: plan.highlight ? '#1B4FFF' : plan.disabled ? T.textMuted : '#fff',
                borderRadius: 9999, padding: '12px 24px',
                fontFamily: T.sans, fontSize: 14, fontWeight: 700,
                border: 'none', cursor: plan.disabled ? 'default' : 'pointer', marginBottom: 28,
                transition: 'opacity 0.15s',
                letterSpacing: '-0.01em',
              }}
            >{plan.cta}</button>

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
          { q: "What's included in the free plan?", a: '10 AI research queries per month, live market data, basic company profiles, SEC filing search, and one watchlist with up to 25 stocks.' },
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
