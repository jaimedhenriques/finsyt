'use client'
import { useState } from 'react'
type Billing = 'monthly' | 'annual'

function Check({ yes, label, dark }: { yes?: boolean; label: string; dark?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '4.5px 0' }}>
      <div style={{ width: 17, height: 17, borderRadius: '50%', background: yes ? (dark ? 'rgba(16,185,129,0.25)' : '#ECFDF5') : (dark ? 'rgba(255,255,255,0.06)' : '#F5F7FB'), display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
        {yes
          ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke={dark ? '#34D399' : '#059669'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3" /></svg>
          : <svg width="7" height="7" viewBox="0 0 12 12" fill="none" stroke={dark ? 'rgba(255,255,255,0.18)' : '#D1D5DB'} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="3" x2="9" y2="9" /><line x1="9" y1="3" x2="3" y2="9" /></svg>}
      </div>
      <span style={{ fontSize: 12.5, color: yes ? (dark ? 'rgba(255,255,255,0.75)' : '#3D4F6E') : (dark ? 'rgba(255,255,255,0.22)' : '#B0BCD0'), lineHeight: 1.45 }}>{label}</span>
    </div>
  )
}

function Card({ tier, tagline, mo, ann, billing, cta, href, highlight, badge, features }: any) {
  const price = billing === 'annual' ? ann : mo
  const saving = mo && ann ? Math.round(((mo - ann) / mo) * 100) : 0
  return (
    <div style={{ background: highlight ? '#0A1628' : '#fff', border: `2px solid ${highlight ? '#1B4FFF' : '#E8EDF4'}`, borderRadius: 16, padding: '28px 24px', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: highlight ? '0 8px 40px rgba(27,79,255,0.18)' : 'none' }}>
      {badge && <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', background: 'linear-gradient(90deg,#1B4FFF,#0891B2)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 14px', borderRadius: 999, whiteSpace: 'nowrap' }}>{badge}</div>}
      <div style={{ fontSize: 11, fontWeight: 800, color: highlight ? 'rgba(255,255,255,0.4)' : '#7D8FA9', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>{tier}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 4 }}>
        {price === null
          ? <span style={{ fontSize: 30, fontWeight: 900, color: highlight ? '#fff' : '#0A1628' }}>Custom</span>
          : <><span style={{ fontSize: 13, fontWeight: 700, color: highlight ? 'rgba(255,255,255,0.35)' : '#B0BCD0', alignSelf: 'flex-start', marginTop: 5 }}>$</span>
            <span style={{ fontSize: 36, fontWeight: 900, color: highlight ? '#fff' : '#0A1628', letterSpacing: '-0.04em', lineHeight: 1 }}>{price}</span>
            <span style={{ fontSize: 13, color: highlight ? 'rgba(255,255,255,0.3)' : '#B0BCD0' }}>/mo</span></>}
      </div>
      {billing === 'annual' && saving > 0 && <div style={{ fontSize: 11, fontWeight: 700, color: '#059669', background: '#ECFDF5', padding: '2px 7px', borderRadius: 5, display: 'inline-flex', width: 'fit-content', marginBottom: 4 }}>Save {saving}% vs monthly</div>}
      <p style={{ fontSize: 12.5, color: highlight ? 'rgba(255,255,255,0.42)' : '#7D8FA9', lineHeight: 1.55, marginBottom: 18, minHeight: 36 }}>{tagline}</p>
      <a href={href} style={{ display: 'block', textAlign: 'center', padding: '10px 14px', background: highlight ? '#1B4FFF' : price === null ? '#0A1628' : '#F0F4FA', color: highlight || price === null ? '#fff' : '#0A1628', borderRadius: 9, fontSize: 13, fontWeight: 800, textDecoration: 'none', marginBottom: 20 }}>{cta}</a>
      <div style={{ borderTop: `1px solid ${highlight ? 'rgba(255,255,255,0.08)' : '#F0F4FA'}`, paddingTop: 14 }}>
        {features.map((f: any, i: number) => <Check key={i} yes={f.yes} label={f.label} dark={highlight} />)}
      </div>
    </div>
  )
}

function FAQ({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ borderBottom: '1px solid #E8EDF4' }}>
      <button onClick={() => setOpen(o => !o)} style={{ display: 'flex', alignItems: 'center', width: '100%', padding: '15px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700, color: '#0A1628' }}>{q}</span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#B0BCD0" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', flexShrink: 0 }}><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && <p style={{ fontSize: 13.5, color: '#7D8FA9', lineHeight: 1.65, paddingBottom: 14, margin: 0 }}>{a}</p>}
    </div>
  )
}

const COMPARE = [
  ['Monthly Price (annual)',  'Free',    '$19/mo',     '$49/mo',     'Custom'],
  ['AI Research Prompts',    '10/mo',   '100/mo',     '500/mo',     'Unlimited'],
  ['Financial History',      '5 years', '10 years',   '20+ years',  '20+ years'],
  ['Segments & KPI Data',    'Limited', 'Full',       'Full',       'Full'],
  ['Custom Dashboards',      '1',       '5',          'Unlimited',  'Unlimited'],
  ['Portfolio Tracking',     '—',       '✓',          '✓',          '✓'],
  ['Analyst Revisions',      '—',       '—',          '✓',          '✓'],
  ['DCF Models',             '—',       '✓',          'Unlimited',  'Unlimited'],
  ['Export (Excel / PDF)',   '—',       '—',          '✓',          '✓'],
  ['MCP (Claude, Cursor)',   'Beta',    'Beta',       '✓',          '✓'],
  ['Webhooks',               '—',       '—',          '✓',          '✓'],
  ['REST API Access',        '—',       '—',          '—',          '✓'],
  ['Team Seats',             '—',       '—',          '—',          'Up to 50'],
  ['SSO / SAML',             '—',       '—',          '—',          '✓'],
  ['On-prem / Private Cloud','—',       '—',          '—',          '✓'],
  ['Priority Support',       '—',       'Email',      'Priority',   'Dedicated CSM'],
]

export default function PricingPage() {
  const [billing, setBilling] = useState<Billing>('annual')
  const PLANS = [
    { tier: 'Free', tagline: 'Explore with no commitment. Full product evaluation.', mo: 0, ann: 0, cta: 'Start for free', href: '/app/auth/sign-up', features: [
      { yes: true,  label: '10 AI Research prompts / month' },
      { yes: true,  label: '5 years of financial history' },
      { yes: true,  label: 'Basic Segments & KPI data' },
      { yes: true,  label: '1 custom dashboard + real-time quotes' },
      { yes: true,  label: 'MCP access (beta)' },
      { yes: false, label: 'Portfolio tracking' },
      { yes: false, label: 'Analyst revisions & estimates' },
      { yes: false, label: 'Exports & API access' },
    ]},
    { tier: 'Plus', tagline: 'For serious investors who want full data depth.', mo: 24, ann: 19, cta: 'Start 14-day free trial', href: '/app/auth/sign-up?plan=plus', features: [
      { yes: true,  label: '100 AI Research prompts / month' },
      { yes: true,  label: '10 years of financial history' },
      { yes: true,  label: 'Full Segments & KPI data (2,300+ companies)' },
      { yes: true,  label: '5 dashboards + portfolio tracking' },
      { yes: true,  label: 'Event calendar + earnings alerts' },
      { yes: false, label: 'Analyst revisions & estimates' },
      { yes: false, label: 'Excel / PDF exports' },
      { yes: false, label: 'API access' },
    ]},
    { tier: 'Pro', tagline: 'The full terminal. For analysts who need everything.', mo: 64, ann: 49, cta: 'Start 14-day free trial', href: '/app/auth/sign-up?plan=pro', highlight: true, badge: '⚡ Most Popular', features: [
      { yes: true,  label: '500 AI Research prompts / month' },
      { yes: true,  label: '20+ years & 40+ quarters of history' },
      { yes: true,  label: 'Full Segments & KPI + source-to-filing links' },
      { yes: true,  label: 'Unlimited dashboards + analyst revisions' },
      { yes: true,  label: 'Unlimited DCF models' },
      { yes: true,  label: 'Excel / PPTX / PDF exports' },
      { yes: true,  label: 'MCP (Claude, Cursor, ChatGPT)' },
      { yes: true,  label: 'Webhooks for event-driven workflows' },
    ]},
    { tier: 'Enterprise', tagline: 'For teams, funds & fintechs needing API + SLA.', mo: null, ann: null, cta: 'Contact sales', href: 'mailto:sales@finsyt.com', features: [
      { yes: true,  label: 'Unlimited AI prompts' },
      { yes: true,  label: 'Full history + as-reported financials' },
      { yes: true,  label: 'REST API — financials, ratios, prices, KPIs' },
      { yes: true,  label: 'MCP server OAuth (Claude, Cursor, ChatGPT)' },
      { yes: true,  label: 'Up to 50 team seats + SSO/SAML' },
      { yes: true,  label: 'On-prem / private cloud deployment' },
      { yes: true,  label: 'Dedicated CSM + SLA' },
      { yes: true,  label: 'Custom data coverage requests' },
    ]},
  ]

  return (
    <div style={{ background: '#F7F9FC', minHeight: 'calc(100vh - 60px)' }}>
      {/* Hero */}
      <div style={{ background: '#0A1628', padding: '52px 32px 0', textAlign: 'center' }}>
        <div style={{ maxWidth: 700, margin: '0 auto' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 14px', background: 'rgba(27,79,255,0.15)', border: '1px solid rgba(27,79,255,0.3)', borderRadius: 999, marginBottom: 18 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#93B4FF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#93B4FF' }}>Institutional data. Retail price.</span>
          </div>
          <h1 style={{ fontSize: '2.375rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 14 }}>
            Research like a Bloomberg analyst.<br />
            <span style={{ background: 'linear-gradient(90deg,#1B4FFF,#0891B2)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Pay like a retail investor.</span>
          </h1>
          <p style={{ fontSize: 15.5, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, maxWidth: 500, margin: '0 auto 28px' }}>
            S&P Global data, AI Copilot, proprietary KPIs, and MCP connectivity — starting at $0. Bloomberg charges $2,000/month for the same data.
          </p>
          {/* Billing toggle */}
          <div style={{ display: 'inline-flex', background: 'rgba(255,255,255,0.07)', borderRadius: 10, padding: 4, marginBottom: 44 }}>
            {(['monthly', 'annual'] as Billing[]).map(b => (
              <button key={b} onClick={() => setBilling(b)} style={{ padding: '8px 22px', borderRadius: 8, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, fontWeight: 700, background: billing === b ? '#fff' : 'transparent', color: billing === b ? '#0A1628' : 'rgba(255,255,255,0.38)', transition: 'all 0.15s', display: 'flex', alignItems: 'center', gap: 7 }}>
                {b === 'annual' ? <>Annual <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 4, background: '#ECFDF5', color: '#059669', fontWeight: 800 }}>Save ~30%</span></> : 'Monthly'}
              </button>
            ))}
          </div>
        </div>
        {/* Cards */}
        <div style={{ maxWidth: 1120, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, paddingBottom: 60 }}>
          {PLANS.map(p => <Card key={p.tier} {...p} billing={billing} />)}
        </div>
      </div>

      <div style={{ maxWidth: 1120, margin: '0 auto', padding: '52px 32px' }}>
        {/* Cost comparison */}
        <div style={{ textAlign: 'center', marginBottom: 52 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: '#B0BCD0', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 16 }}>The Bloomberg alternative — at 3% of the cost</p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, flexWrap: 'wrap' }}>
            {[{ n: 'Bloomberg', p: '$2,000/mo', i: 0 }, { n: 'FactSet', p: '$1,200/mo', i: 1 }, { n: 'S&P Cap IQ', p: '$800/mo', i: 2 }, { n: 'Finsyt Pro', p: '$49/mo ✓', i: 3 }].map((x, j) => (
              <div key={x.n} style={{ display: 'flex', alignItems: 'center', gap: j < 3 ? 20 : 0 }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: x.i === 3 ? '#1B4FFF' : '#7D8FA9' }}>{x.n}</div>
                  <div style={{ fontSize: 11, color: x.i === 3 ? '#059669' : '#B0BCD0', fontWeight: 600 }}>{x.p}</div>
                </div>
                {j < 3 && <span style={{ fontSize: 18, color: '#E8EDF4' }}>→</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Full comparison table */}
        <div style={{ marginBottom: 52 }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.025em', textAlign: 'center', marginBottom: 24 }}>Full feature comparison</h2>
          <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 14, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead><tr style={{ background: '#F7F9FC', borderBottom: '1px solid #E8EDF4' }}>
                  <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: 700, color: '#7D8FA9', fontSize: 11, width: '34%' }}>Feature</th>
                  {['Free', 'Plus', 'Pro ⚡', 'Enterprise'].map((h, i) => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: 900, color: i === 2 ? '#1B4FFF' : '#0A1628', fontSize: 12, background: i === 2 ? '#EEF3FF' : 'transparent', borderLeft: '1px solid #F0F4FA' }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {COMPARE.map((row, ri) => (
                    <tr key={ri} style={{ borderBottom: '1px solid #F5F7FB', background: ri % 2 === 0 ? '#fff' : '#FAFBFC' }}>
                      <td style={{ padding: '10px 16px', fontWeight: 600, color: '#3D4F6E', fontSize: 12.5 }}>{row[0]}</td>
                      {[row[1], row[2], row[3], row[4]].map((v, ci) => (
                        <td key={ci} style={{ padding: '10px 16px', textAlign: 'center', fontSize: 12.5, fontWeight: 600, color: v === '—' ? '#D1D5DB' : ci === 2 ? '#1B4FFF' : '#0A1628', background: ci === 2 ? '#F5F8FF' : 'transparent', borderLeft: '1px solid #F0F4FA' }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Data coverage dark card */}
        <div style={{ background: 'linear-gradient(135deg,#0A1628 0%,#0D1F3C 100%)', borderRadius: 16, padding: '36px 40px', marginBottom: 52, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 36 }}>
          <div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.025em', marginBottom: 10 }}>Institutional-grade data, included in every plan</h2>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, marginBottom: 20 }}>Sourced from S&P Global Market Intelligence — the same data used by hedge funds, investment banks, and asset managers.</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {['S&P Global Market Intelligence', 'Morningstar Equity Research', 'SEC EDGAR', 'Finnhub', 'FRED (Macro)', 'FMP Financials'].map(s => (
                <span key={s} style={{ fontSize: 11, padding: '3px 9px', borderRadius: 5, background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', fontWeight: 600, border: '1px solid rgba(255,255,255,0.09)' }}>{s}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              ['📊', '100,000+', 'global securities'],
              ['🔑', '2,300+', 'Segment & KPI companies'],
              ['📅', '40+ quarters', 'of history'],
              ['🌍', 'USA, UK, EU', 'Canada, ADRs'],
              ['⚡', '<1 hour', 'data latency post-filing'],
              ['🔗', '100%', 'source-linked to filing'],
            ].map(([icon, val, sub]) => (
              <div key={val} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.07)' }}>
                <div style={{ fontSize: 16, marginBottom: 3 }}>{icon}</div>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#fff' }}>{val}</div>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* MCP banner */}
        <div style={{ background: '#fff', border: '1.5px solid #E8EDF4', borderRadius: 14, padding: '24px 28px', marginBottom: 52, display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: '#EEF3FF', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔗</div>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 5 }}>
              <h3 style={{ fontSize: 14, fontWeight: 900, color: '#0A1628' }}>Use Finsyt data in Claude, Cursor & ChatGPT via MCP</h3>
              <span style={{ fontSize: 10, padding: '2px 7px', borderRadius: 4, background: '#EEF3FF', color: '#1B4FFF', fontWeight: 700 }}>Pro & Enterprise</span>
            </div>
            <p style={{ fontSize: 13, color: '#7D8FA9', lineHeight: 1.55, margin: 0 }}>Add <code style={{ fontSize: 12, color: '#1B4FFF', background: '#F0F4FA', padding: '1px 5px', borderRadius: 3 }}>https://api.finsyt.com/mcp/sse</code> to Claude Desktop or Cursor. Ask financial questions in plain English — Finsyt fetches live data.</p>
          </div>
          <a href="/app/docs" style={{ padding: '9px 18px', background: '#1B4FFF', color: '#fff', borderRadius: 9, fontSize: 12, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}>View MCP docs →</a>
        </div>

        {/* Testimonials */}
        <div style={{ marginBottom: 52 }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.025em', textAlign: 'center', marginBottom: 22 }}>Trusted by analysts, funds & founders</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {[
              { name: 'Alex K.', role: 'Growth Equity Analyst', quote: 'Replaced my FactSet subscription. Same data, AI Copilot on top, a fraction of the cost. The KPI sourcing back to filings is genuinely incredible.' },
              { name: 'Priya R.', role: 'Portfolio Manager, London', quote: "Earnings transcript search is faster than Bloomberg. Finsyt's segment breakdowns for ASML and LVMH are better than anything I've seen at a retail price point." },
              { name: 'Seb M.', role: 'Fintech Founder', quote: 'Built our data layer on Finsyt API. Clean standardised financials, fast ingestion, webhooks for earnings events. Days → hours.' },
            ].map((t, i) => (
              <div key={i} style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '18px 20px' }}>
                <div style={{ fontSize: 26, color: '#1B4FFF', marginBottom: 8, lineHeight: 1 }}>"</div>
                <p style={{ fontSize: 13, color: '#3D4F6E', lineHeight: 1.65, margin: '0 0 14px' }}>{t.quote}</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 32, height: 32, borderRadius: '50%', background: `hsl(${i * 120},55%,87%)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: `hsl(${i * 120},45%,30%)` }}>{t.name[0]}</div>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700, color: '#0A1628' }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: '#B0BCD0' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div style={{ maxWidth: 680, margin: '0 auto 52px' }}>
          <h2 style={{ fontSize: '1.375rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.025em', textAlign: 'center', marginBottom: 22 }}>Frequently asked questions</h2>
          {[
            { q: "What's included in the free plan?", a: "The free plan gives you 10 AI Research prompts/month, 5 years of financial history, basic segment data, 1 custom dashboard, and real-time quotes. It's a full product evaluation — not a demo. MCP access is included in beta." },
            { q: 'How does the 14-day free trial work?', a: 'Sign up for Plus or Pro and get full access for 14 days with no credit card required. After 14 days you move to the free plan unless you subscribe.' },
            { q: 'What is MCP and which plans get access?', a: 'MCP (Model Context Protocol) lets you connect Finsyt directly to Claude Desktop, Cursor, and ChatGPT. You ask financial questions in plain English and the AI pulls live data from Finsyt. All plans get MCP in beta; Pro and Enterprise get full access.' },
            { q: 'What data sources does Finsyt use?', a: 'Core financials and ratios come from S&P Global Market Intelligence. Segment & KPI data is proprietary — extracted by our analyst team from filings. Market data from Finnhub. Macro from FRED.' },
            { q: 'How does Finsyt compare to Bloomberg or FactSet?', a: 'Bloomberg costs ~$2,000/month; FactSet ~$1,200/month. Finsyt Pro at $49/month uses the same fundamental data (via S&P Global) and adds an AI Copilot and MCP. The gap is real-time tick data and fixed income. For equity fundamentals and research workflows, Finsyt is comparable at 3% of the price.' },
            { q: 'Can I get API access?', a: 'API access is Enterprise only. Our API covers financials (as-reported and standardised), ratios, KPIs, prices, filings with filing-image sourcing, and company logos. Contact sales@finsyt.com.' },
            { q: 'Can I cancel any time?', a: 'Yes. Monthly plans cancel at end of billing period. Annual plans cancel at year end. No cancellation fees.' },
          ].map((f, i) => <FAQ key={i} {...f} />)}
        </div>

        {/* Bottom CTA */}
        <div style={{ background: 'linear-gradient(135deg,#0A1628 0%,#0D1F3C 100%)', borderRadius: 20, padding: '48px 36px', textAlign: 'center' }}>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 900, color: '#fff', letterSpacing: '-0.035em', marginBottom: 10 }}>Start researching smarter today</h2>
          <p style={{ fontSize: 14.5, color: 'rgba(255,255,255,0.4)', maxWidth: 380, margin: '0 auto 24px', lineHeight: 1.6 }}>Free forever. No credit card. Cancel anytime.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <a href="/app/auth/sign-up" style={{ padding: '12px 28px', background: '#1B4FFF', color: '#fff', borderRadius: 10, fontSize: 14, fontWeight: 800, textDecoration: 'none' }}>Get started free →</a>
            <a href="mailto:sales@finsyt.com" style={{ padding: '12px 28px', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.65)', borderRadius: 10, fontSize: 14, fontWeight: 800, textDecoration: 'none', border: '1px solid rgba(255,255,255,0.11)' }}>Talk to sales</a>
          </div>
        </div>
      </div>
    </div>
  )
}
