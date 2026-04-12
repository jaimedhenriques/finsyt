'use client'

import { useState, useEffect, useRef } from 'react'

// ─── Code syntax highlight (simple) ──────────────────────────────────────────
function CodeBlock({ lang, code, active }: { lang: string; code: string; active?: boolean }) {
  const [copied, setCopied] = useState(false)
  const keywords = ['from', 'import', 'const', 'let', 'await', 'async', 'return', 'new', 'func', 'package', 'main', 'import', 'public', 'class', 'static', 'void']
  const strings = /"[^"]*"|'[^']*'/g
  const comments = /\/\/.*/g

  function highlight(line: string) {
    // Very basic: just render as-is with CSS color classes
    return line
  }

  return (
    <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', background: '#0D1117' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 16px', background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ display: 'flex', gap: 5 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FF5F57' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FEBC2E' }} />
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#28C840' }} />
          </div>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: 'monospace' }}>{lang}</span>
        </div>
        <button onClick={() => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600) }}
          style={{ fontSize: 11, fontWeight: 600, color: copied ? '#10B981' : 'rgba(255,255,255,0.35)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 4 }}>
          {copied ? '✓ Copied' : '⎘ Copy'}
        </button>
      </div>
      <pre style={{ margin: 0, padding: '18px 20px', fontSize: 12.5, lineHeight: 1.7, color: '#E2E8F0', overflowX: 'auto', fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace" }}>
        <code>{code}</code>
      </pre>
    </div>
  )
}

// ─── Animated counter ─────────────────────────────────────────────────────────
function Counter({ target, suffix = '', prefix = '' }: { target: number; suffix?: string; prefix?: string }) {
  const [val, setVal] = useState(0)
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        let start = 0
        const step = target / 60
        const timer = setInterval(() => {
          start += step
          if (start >= target) { setVal(target); clearInterval(timer) }
          else setVal(Math.floor(start))
        }, 16)
        obs.disconnect()
      }
    })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [target])
  return <span ref={ref}>{prefix}{val.toLocaleString()}{suffix}</span>
}

// ─── Pricing tier ─────────────────────────────────────────────────────────────
function PricingCard({ name, price, tag, features, highlighted, cta }: {
  name: string; price: string; tag: string; features: string[]; highlighted?: boolean; cta: string
}) {
  return (
    <div style={{ flex: 1, minWidth: 220, borderRadius: 16, border: `1.5px solid ${highlighted ? '#1B4FFF' : 'rgba(255,255,255,0.08)'}`, background: highlighted ? 'linear-gradient(180deg, rgba(27,79,255,0.08) 0%, rgba(27,79,255,0.03) 100%)' : 'rgba(255,255,255,0.02)', padding: '28px 24px', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: highlighted ? '0 0 40px rgba(27,79,255,0.12)' : 'none' }}>
      {highlighted && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', padding: '3px 14px', background: 'linear-gradient(135deg,#1B4FFF,#06B6D4)', borderRadius: 20, fontSize: 11, fontWeight: 800, color: '#fff', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>MOST POPULAR</div>}
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 8 }}>{name}</div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
          <span style={{ fontSize: 32, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>{price}</span>
          {price !== 'Free' && <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>/month</span>}
        </div>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{tag}</div>
      </div>
      <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '20px 0' }} />
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px', flex: 1 }}>
        {features.map((f, i) => (
          <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 10, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.4 }}>
            <svg style={{ flexShrink: 0, marginTop: 1 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            {f}
          </li>
        ))}
      </ul>
      <button style={{ width: '100%', padding: '11px 0', borderRadius: 9, background: highlighted ? 'linear-gradient(135deg,#1B4FFF,#2563EB)' : 'rgba(255,255,255,0.06)', border: highlighted ? 'none' : '1px solid rgba(255,255,255,0.1)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', boxShadow: highlighted ? '0 4px 16px rgba(27,79,255,0.3)' : 'none', transition: 'all 0.15s' }}
        onMouseEnter={e => { if (!highlighted) e.currentTarget.style.background = 'rgba(255,255,255,0.1)' }}
        onMouseLeave={e => { if (!highlighted) e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
      >{cta}</button>
    </div>
  )
}

// ─── Code snippets per language ───────────────────────────────────────────────
const CODE_SNIPPETS: Record<string, string> = {
  Python: `from finsyt import RESTClient

client = RESTClient("YOUR_API_KEY")

# Get AAPL stock aggregates (OHLCV)
aggs = client.get_aggs(
    ticker="AAPL",
    multiplier=1,
    timespan="day",
    from_date="2024-01-01",
    to_date="2025-01-01",
)

for bar in aggs:
    print(f"{bar.timestamp}: O={bar.open} H={bar.high} L={bar.low} C={bar.close} V={bar.volume}")`,

  JavaScript: `import { FinsytClient } from '@finsyt/api'

const client = new FinsytClient({ apiKey: 'YOUR_API_KEY' })

// Stream real-time trades for NVDA
const ws = client.websocket('trades')
ws.subscribe(['T.NVDA', 'T.AAPL', 'T.MSFT'])

ws.on('message', (trade) => {
  console.log(\`\${trade.sym}: $\${trade.p} × \${trade.s} shares at \${trade.t}ns\`)
})`,

  cURL: `# Get latest financials for AAPL (Income Statement)
curl -X GET "https://api.finsyt.com/v1/fundamentals/financials" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -G --data-urlencode "ticker=AAPL" \\
     --data-urlencode "type=income_statement" \\
     --data-urlencode "period=annual" \\
     --data-urlencode "limit=5"

# Response: structured JSON with revenue, EBITDA, EPS, FCF...`,

  Go: `package main

import (
    "fmt"
    finsyt "github.com/finsyt-io/finsyt-go"
)

func main() {
    c := finsyt.NewClient("YOUR_API_KEY")

    // Get SEC filings for TSLA
    filings, err := c.Filings.List("TSLA", finsyt.FilingOptions{
        Type:  "10-K",
        Limit: 5,
    })
    if err != nil { panic(err) }

    for _, f := range filings {
        fmt.Printf("[%s] %s — %s\n", f.FiledAt, f.Type, f.URL)
    }
}`,
}

// ─── JSON response preview ────────────────────────────────────────────────────
const JSON_RESPONSE = `{
  "ticker": "AAPL",
  "period": "Q4 2024",
  "source": "SEC EDGAR (10-Q)",
  "filed_at": "2024-11-01",
  "financials": {
    "income_statement": {
      "revenue":         { "value": 94930000000, "unit": "USD", "label": "Revenue" },
      "gross_profit":    { "value": 43884000000, "unit": "USD", "label": "Gross Profit" },
      "operating_income":{ "value": 29596000000, "unit": "USD", "label": "Operating Income" },
      "net_income":      { "value": 14736000000, "unit": "USD", "label": "Net Income" },
      "eps_diluted":     { "value": 0.97,        "unit": "USD", "label": "Diluted EPS" }
    },
    "kpis": {
      "gross_margin":    { "value": 0.462, "label": "Gross Margin %" },
      "operating_margin":{ "value": 0.312, "label": "Operating Margin %" },
      "revenue_yoy":     { "value": 0.061, "label": "Revenue YoY Growth" }
    }
  }
}`

// ─── Endpoint list ────────────────────────────────────────────────────────────
const ENDPOINTS = [
  { method: 'GET', path: '/v1/quotes/{ticker}', desc: 'Real-time & delayed quote', badge: 'Real-time' },
  { method: 'GET', path: '/v1/aggs/{ticker}/{timespan}', desc: 'OHLCV bars (1m → 1d)', badge: 'Historical' },
  { method: 'GET', path: '/v1/trades/{ticker}', desc: 'Nanosecond trade ticks', badge: 'Real-time' },
  { method: 'GET', path: '/v1/fundamentals/financials', desc: 'Income / Balance / Cash Flow', badge: 'Fundamentals' },
  { method: 'GET', path: '/v1/fundamentals/kpis', desc: 'Margins, ratios, growth rates', badge: 'Fundamentals' },
  { method: 'GET', path: '/v1/sec/filings', desc: 'SEC EDGAR 10-K / 10-Q / 8-K', badge: 'Filings' },
  { method: 'GET', path: '/v1/news', desc: 'News with sentiment scores', badge: 'News' },
  { method: 'GET', path: '/v1/insider', desc: 'Insider transactions', badge: 'Alternative' },
  { method: 'GET', path: '/v1/screener', desc: 'Filter 10k+ tickers by any metric', badge: 'Screener' },
  { method: 'WS', path: 'wss://stream.finsyt.com/v1/trades', desc: 'WebSocket real-time stream', badge: 'Stream' },
  { method: 'GET', path: '/v1/macro', desc: 'GDP, CPI, rates via FRED', badge: 'Macro' },
  { method: 'GET', path: '/v1/private/companies', desc: 'Private co. discovery (75M+)', badge: 'Private' },
]

const BADGE_COLORS: Record<string, string> = {
  'Real-time': '#10B981', 'Historical': '#1B4FFF', 'Fundamentals': '#7C3AED',
  'Filings': '#0891B2', 'News': '#F59E0B', 'Alternative': '#E11D48',
  'Screener': '#6366F1', 'Stream': '#10B981', 'Macro': '#059669', 'Private': '#D97706',
}

// ─── Main ─────────────────────────────────────────────────────────────────────
export default function DeveloperPage() {
  const [activeLang, setActiveLang] = useState('Python')
  const [billingAnnual, setBillingAnnual] = useState(false)
  const [activeTab, setActiveTab] = useState<'request' | 'response'>('response')

  const PRICING = [
    {
      name: 'Basic', price: 'Free', tag: 'Perfect for prototyping',
      features: ['All US stock tickers', '5 API calls/minute', '2 years historical data', 'End-of-day data only', 'Reference & company data', 'Community support'],
      cta: 'Start free',
    },
    {
      name: 'Starter', price: billingAnnual ? '$23' : '$29', tag: '15-min delayed data',
      features: ['Unlimited API calls', '5 years historical data', '15-min delayed quotes', 'Corporate actions', 'Technical indicators', 'Email support'],
      cta: 'Get Starter',
    },
    {
      name: 'Developer', price: billingAnnual ? '$63' : '$79', tag: 'For serious builders', highlighted: true,
      features: ['Everything in Starter', '10 years historical data', '15-min delayed data', 'Options & forex data', 'Fundamentals & filings', 'WebSocket streaming', 'Priority support'],
      cta: 'Get Developer',
    },
    {
      name: 'Advanced', price: billingAnnual ? '$159' : '$199', tag: 'Real-time, no delays',
      features: ['Everything in Developer', 'Real-time quotes & trades', 'Full tick-level data', 'SEC filings access', 'Private company data', 'SLA guarantee', 'Dedicated support'],
      cta: 'Get Advanced',
    },
    {
      name: 'Business', price: 'Custom', tag: 'Enterprise & scale',
      features: ['Unlimited everything', 'White-label options', 'Custom data feeds', 'On-prem deployment', 'SOC 2 compliance docs', '24/7 dedicated support'],
      cta: 'Contact sales',
    },
  ]

  return (
    <div style={{ background: '#07101F', minHeight: '100%', color: '#fff', fontFamily: 'inherit' }}>
      <style>{`
        @keyframes fadeUp { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:none} }
        @keyframes pulseDot { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .devpage-scroll::-webkit-scrollbar { display: none }
        .ep-row:hover { background: rgba(27,79,255,0.06) !important; }
      `}</style>

      {/* ── HERO ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '64px 32px 80px', display: 'flex', gap: 60, alignItems: 'center', flexWrap: 'wrap' }}>
        {/* Left */}
        <div style={{ flex: 1, minWidth: 320, animation: 'fadeUp 0.5s ease' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '5px 12px', background: 'rgba(27,79,255,0.1)', border: '1px solid rgba(27,79,255,0.2)', borderRadius: 20, marginBottom: 20 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#10B981', animation: 'pulseDot 2s infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#93B4FF', letterSpacing: '0.06em' }}>FINSYT DATA API — NOW IN BETA</span>
          </div>
          <h1 style={{ fontSize: 'clamp(32px,4vw,52px)', fontWeight: 900, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20, color: '#fff' }}>
            Institutional-grade<br/>
            <span style={{ background: 'linear-gradient(135deg,#1B4FFF,#06B6D4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>financial data</span><br/>
            for your next project
          </h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, maxWidth: 480, marginBottom: 32 }}>
            One API for real-time quotes, tick data, SEC filings, fundamentals, macro indicators, and private company intelligence. Standardised JSON, WebSocket streams, and SDKs in 4 languages.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button style={{ padding: '13px 28px', background: 'linear-gradient(135deg,#1B4FFF,#2563EB)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(27,79,255,0.35)' }}>
              Get free API key →
            </button>
            <button style={{ padding: '13px 28px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>
              View docs
            </button>
          </div>
          {/* Trust signals */}
          <div style={{ display: 'flex', gap: 24, marginTop: 32, flexWrap: 'wrap' }}>
            {[['0 credit card', 'Free tier forever'], ['5 min', 'To first API call'], ['99.9%', 'Uptime SLA']].map(([stat, label]) => (
              <div key={label}>
                <div style={{ fontSize: 17, fontWeight: 900, color: '#fff' }}>{stat}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: code window */}
        <div style={{ flex: 1.1, minWidth: 320, animation: 'fadeUp 0.6s ease' }}>
          {/* Language tabs */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3, width: 'fit-content' }}>
            {Object.keys(CODE_SNIPPETS).map(lang => (
              <button key={lang} onClick={() => setActiveLang(lang)}
                style={{ padding: '5px 14px', borderRadius: 8, background: activeLang === lang ? '#1B4FFF' : 'transparent', border: 'none', color: activeLang === lang ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s' }}
              >{lang}</button>
            ))}
          </div>
          <CodeBlock lang={activeLang} code={CODE_SNIPPETS[activeLang]} />
        </div>
      </div>

      {/* ── STATS STRIP ── */}
      <div style={{ background: 'rgba(255,255,255,0.02)', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '32px 32px', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 24 }}>
          {[
            { val: 1, suffix: 'T+', label: 'Data points served' },
            { val: 20, suffix: ' years', label: 'Historical depth' },
            { val: 10413, suffix: '', label: 'US stock tickers' },
            { val: 99, suffix: '.9%', label: 'API uptime' },
            { val: 12, suffix: '', label: 'Endpoint categories' },
          ].map(s => (
            <div key={s.label} style={{ textAlign: 'center', flex: 1, minWidth: 120 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#fff', letterSpacing: '-0.02em' }}>
                <Counter target={s.val} suffix={s.suffix} />
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ENDPOINTS ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 32px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#93B4FF', letterSpacing: '0.1em', marginBottom: 10 }}>ENDPOINTS</div>
          <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', marginBottom: 12 }}>Every data type. One API key.</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15, maxWidth: 520, margin: '0 auto' }}>Standardised RESTful endpoints and WebSocket streams with consistent JSON schemas across all asset classes.</p>
        </div>

        <div style={{ background: '#0A1525', borderRadius: 14, border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
          {/* Header row */}
          <div style={{ display: 'grid', gridTemplateColumns: '72px 280px 1fr 100px', padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', fontSize: 10, fontWeight: 800, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>
            <span>METHOD</span><span>ENDPOINT</span><span>DESCRIPTION</span><span>CATEGORY</span>
          </div>
          {ENDPOINTS.map((ep, i) => (
            <div key={i} className="ep-row" style={{ display: 'grid', gridTemplateColumns: '72px 280px 1fr 100px', padding: '12px 20px', borderBottom: i < ENDPOINTS.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center', cursor: 'pointer', transition: 'background 0.15s' }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: ep.method === 'WS' ? '#F59E0B' : ep.method === 'GET' ? '#10B981' : '#1B4FFF', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{ep.method}</span>
              <span style={{ fontSize: 12, color: '#93B4FF', fontFamily: 'monospace' }}>{ep.path}</span>
              <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>{ep.desc}</span>
              <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 5, background: `${BADGE_COLORS[ep.badge]}15`, border: `1px solid ${BADGE_COLORS[ep.badge]}30`, fontSize: 10, fontWeight: 700, color: BADGE_COLORS[ep.badge], width: 'fit-content' }}>{ep.badge}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── RESPONSE EXPLORER ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 32px 0' }}>
        <div style={{ display: 'flex', gap: 60, alignItems: 'flex-start', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#93B4FF', letterSpacing: '0.1em', marginBottom: 10 }}>FINANCIAL STATEMENTS API</div>
            <h2 style={{ fontSize: 'clamp(22px,2.5vw,34px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', marginBottom: 16 }}>Source-linked financials, parsed from XBRL</h2>
            <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 15, lineHeight: 1.65, marginBottom: 28 }}>Every data point is hyperlinked to its original SEC filing. Income statements, balance sheets, and cash flow data standardised across 10,000+ companies — comparable quarter by quarter.</p>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {[
                'XBRL-parsed and mapped to standard concepts',
                'Hyperlinked citations to source filings',
                'Annual and quarterly granularity',
                'Derived KPIs: margins, growth rates, ratios',
                '10+ years of history per company',
              ].map(f => (
                <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 10, fontSize: 14, color: 'rgba(255,255,255,0.65)' }}>
                  <svg style={{ flexShrink: 0, marginTop: 2 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1B4FFF" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1.2, minWidth: 320 }}>
            <div style={{ display: 'flex', gap: 2, marginBottom: 8 }}>
              {(['response', 'request'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  style={{ padding: '5px 14px', borderRadius: 7, background: activeTab === t ? '#1B4FFF' : 'rgba(255,255,255,0.05)', border: 'none', color: activeTab === t ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', textTransform: 'capitalize' }}>
                  {t}
                </button>
              ))}
            </div>
            <CodeBlock lang="JSON" code={activeTab === 'response' ? JSON_RESPONSE : `GET /v1/fundamentals/financials?ticker=AAPL&period=Q4+2024&type=all\nAuthorization: Bearer YOUR_API_KEY\nContent-Type: application/json`} />
          </div>
        </div>
      </div>

      {/* ── FEATURE GRID ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '72px 32px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', marginBottom: 12 }}>Built for the way developers actually work</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { icon: '⚡', title: 'Nanosecond precision', desc: 'Every trade and quote message timestamped at the nanosecond. Reconstruct order books, validate fills, backtest with total fidelity.' },
            { icon: '📚', title: 'Client SDKs', desc: 'Official libraries for Python, JavaScript/TypeScript, Go, and Java. Or use any HTTP client with our well-documented REST API.' },
            { icon: '🔁', title: 'WebSocket streaming', desc: 'Subscribe to real-time trade and quote streams. Built on a HA messaging layer — no dropped ticks, no reconnect hell.' },
            { icon: '📊', title: 'Flat file exports', desc: 'Bulk download via S3 or SFTP. Pre-partitioned parquet and CSV files for every asset class, updated after market close.' },
            { icon: '🛡️', title: 'Data redundancy', desc: 'Two fully isolated networks ingest and process all exchange feeds. Failover in milliseconds. 99.9% uptime SLA on paid plans.' },
            { icon: '🔑', title: 'Transparent pricing', desc: 'No surprises, no per-call fees on paid tiers. Unlimited API calls from $29/mo. Cancel anytime — no annual lock-in required.' },
          ].map(f => (
            <div key={f.title} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 14, padding: '24px', transition: 'border-color 0.15s' }}
              onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(27,79,255,0.3)'}
              onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
            >
              <div style={{ fontSize: 28, marginBottom: 12 }}>{f.icon}</div>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{f.title}</h3>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.65, margin: 0 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── PRICING ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px 0' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#93B4FF', letterSpacing: '0.1em', marginBottom: 10 }}>PRICING</div>
          <h2 style={{ fontSize: 'clamp(24px,3vw,38px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', marginBottom: 12 }}>Simple pricing. Instant access.</h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 15 }}>Unlimited access. Cancel anytime. No credit card required for the free tier.</p>
          {/* Toggle */}
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginTop: 20, background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '5px 8px' }}>
            <button onClick={() => setBillingAnnual(false)} style={{ padding: '5px 14px', borderRadius: 7, background: !billingAnnual ? '#1B4FFF' : 'transparent', border: 'none', color: !billingAnnual ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Monthly</button>
            <button onClick={() => setBillingAnnual(true)} style={{ padding: '5px 14px', borderRadius: 7, background: billingAnnual ? '#1B4FFF' : 'transparent', border: 'none', color: billingAnnual ? '#fff' : 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>Annually</button>
            {billingAnnual && <span style={{ fontSize: 11, fontWeight: 700, color: '#10B981', background: 'rgba(16,185,129,0.1)', padding: '2px 8px', borderRadius: 6 }}>Save 20%</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'stretch' }}>
          {PRICING.map(p => <PricingCard key={p.name} {...p} />)}
        </div>
      </div>

      {/* ── CTA FOOTER ── */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 32px 64px', textAlign: 'center' }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(27,79,255,0.12) 0%, rgba(6,182,212,0.08) 100%)', border: '1px solid rgba(27,79,255,0.2)', borderRadius: 20, padding: '56px 32px' }}>
          <h2 style={{ fontSize: 'clamp(22px,3vw,38px)', fontWeight: 900, letterSpacing: '-0.02em', color: '#fff', marginBottom: 14 }}>Start building in minutes</h2>
          <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 16, marginBottom: 32, maxWidth: 440, margin: '0 auto 32px' }}>No credit card. No waiting. Your free API key unlocks 2 years of historical data and real reference data instantly.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button style={{ padding: '14px 32px', background: 'linear-gradient(135deg,#1B4FFF,#2563EB)', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 20px rgba(27,79,255,0.4)' }}>Get free API key →</button>
            <button style={{ padding: '14px 32px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, color: 'rgba(255,255,255,0.7)', fontWeight: 600, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}>Read documentation</button>
          </div>
        </div>
      </div>
    </div>
  )
}
