'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'

// ─── Design tokens ─────────────────────────────────────────────────────────
const T = {
  black:   '#0A0908',
  white:   '#FFFFFF',
  gray50:  '#FAFAF9',
  gray100: '#F5F3EF',
  gray200: '#E8E4DC',
  gray400: '#ADA89E',
  gray600: '#6B6560',
  accent:  '#1A56FF',
  accentLight: '#EEF3FF',
  serif:   "'Georgia', 'Times New Roman', serif",
  sans:    "'Inter', system-ui, -apple-system, sans-serif",
}

// ─── Ticker tape ───────────────────────────────────────────────────────────
const TICKERS = [
  { s: 'AAPL',   p: '189.30',  c: '+1.2%',  up: true  },
  { s: 'NVDA',   p: '876.40',  c: '+3.8%',  up: true  },
  { s: 'MSFT',   p: '415.22',  c: '+0.6%',  up: true  },
  { s: 'TSLA',   p: '178.05',  c: '-2.1%',  up: false },
  { s: 'META',   p: '503.19',  c: '+2.4%',  up: true  },
  { s: 'GOOGL',  p: '171.45',  c: '+0.9%',  up: true  },
  { s: 'AMZN',   p: '193.60',  c: '+1.7%',  up: true  },
  { s: 'JPM',    p: '198.22',  c: '-0.3%',  up: false },
  { s: 'BRK.B',  p: '412.00',  c: '+0.4%',  up: true  },
  { s: 'XOM',    p: '108.45',  c: '-0.8%',  up: false },
  { s: 'GS',     p: '450.10',  c: '+1.1%',  up: true  },
  { s: 'SPY',    p: '510.33',  c: '+0.7%',  up: true  },
]

function TickerTape() {
  return (
    <div style={{ overflow: 'hidden', background: T.gray50, borderBottom: `1px solid ${T.gray200}`, height: 38 }}>
      <style>{`
        @keyframes ticker { 0% { transform: translateX(0) } 100% { transform: translateX(-50%) } }
        .ticker-track { display: flex; animation: ticker 40s linear infinite; width: max-content; }
        .ticker-track:hover { animation-play-state: paused; }
      `}</style>
      <div className="ticker-track" style={{ alignItems: 'center', height: 38 }}>
        {[...TICKERS, ...TICKERS].map((t, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 24px', borderRight: `1px solid ${T.gray200}`, height: 38 }}>
            <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: T.black, letterSpacing: '0.04em' }}>{t.s}</span>
            <span style={{ fontFamily: T.sans, fontSize: 12, color: T.gray600 }}>{t.p}</span>
            <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 600, color: t.up ? '#059669' : '#DC2626' }}>{t.c}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Nav ───────────────────────────────────────────────────────────────────
function Nav({ scrolled }: { scrolled: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  return (
    <nav style={{
      position: 'sticky', top: 0, zIndex: 100,
      background: scrolled ? 'rgba(255,255,255,0.97)' : T.white,
      backdropFilter: 'blur(16px)',
      borderBottom: `1px solid ${scrolled ? T.gray200 : 'transparent'}`,
      transition: 'border-color 0.3s, box-shadow 0.3s',
      boxShadow: scrolled ? '0 1px 12px rgba(0,0,0,0.04)' : 'none',
      padding: '0 48px', height: 68,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <Link href="/" style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
        <div style={{ width: 30, height: 30, borderRadius: 8, background: T.black, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.serif, fontSize: 15, fontWeight: 400, color: T.white, letterSpacing: '-0.5px' }}>F</div>
        <span style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 400, color: T.black, letterSpacing: '-0.5px' }}>Finsyt</span>
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
        {['Platform', 'Intelligence', 'Data', 'Security', 'Pricing'].map(link => (
          <a key={link} href={`#${link.toLowerCase()}`} style={{ fontFamily: T.sans, fontSize: 14, color: T.gray600, textDecoration: 'none', fontWeight: 400, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = T.black)}
            onMouseLeave={e => (e.currentTarget.style.color = T.gray600)}
          >{link}</a>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link href="/auth/login" style={{ fontFamily: T.sans, fontSize: 14, color: T.black, textDecoration: 'none', fontWeight: 500 }}>Log in</Link>
        <Link href="/auth/signup" style={{
          fontFamily: T.sans, fontSize: 14, fontWeight: 600,
          background: T.black, color: T.white,
          borderRadius: 9999, padding: '9px 20px',
          textDecoration: 'none', letterSpacing: '-0.01em',
          transition: 'opacity 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >Request Demo</Link>
      </div>
    </nav>
  )
}

// ─── Animated product mockup ────────────────────────────────────────────────
function ProductMockup() {
  const [step, setStep] = useState(0)
  const steps = [
    { icon: '📊', text: 'Pulling live market data for NVDA...' },
    { icon: '📑', text: 'Searching SEC EDGAR for latest 10-K...' },
    { icon: '🧠', text: 'Analysing earnings call transcript...' },
    { icon: '📈', text: 'Comparing margins vs peer group...' },
    { icon: '✅', text: 'Research complete. 6 sources cited.' },
  ]
  useEffect(() => {
    const t = setInterval(() => setStep(p => (p + 1) % steps.length), 1800)
    return () => clearInterval(t)
  }, [])

  return (
    <div style={{
      background: '#0A1628',
      borderRadius: 16,
      overflow: 'hidden',
      boxShadow: '0 40px 80px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.06)',
      width: '100%', maxWidth: 560,
    }}>
      {/* Titlebar */}
      <div style={{ background: '#0D1E3A', padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#FF5F57','#FFBD2E','#28C840'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
        </div>
        <div style={{ flex: 1, textAlign: 'center', fontSize: 11, fontFamily: T.sans, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.03em' }}>Finsyt Intelligence</div>
      </div>

      {/* Chat area */}
      <div style={{ padding: '24px 24px 0', minHeight: 200 }}>
        {/* User message */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <div style={{ background: '#1B4FFF', borderRadius: '14px 14px 4px 14px', padding: '10px 16px', maxWidth: '80%' }}>
            <p style={{ fontFamily: T.sans, fontSize: 13, color: '#fff', margin: 0, lineHeight: 1.5 }}>
              Deep dive on NVDA — revenue model, margins, valuation vs peers, Q1 2025 outlook
            </p>
          </div>
        </div>

        {/* Tool call trace */}
        <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 10, padding: '12px 16px', marginBottom: 14, border: '1px solid rgba(255,255,255,0.06)' }}>
          {steps.slice(0, step + 1).map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '5px 0', opacity: i === step ? 1 : 0.45 }}>
              <span style={{ fontSize: 13 }}>{i < step ? '✓' : s.icon}</span>
              <span style={{ fontFamily: T.sans, fontSize: 12, color: i < step ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.85)', fontStyle: i === step ? 'italic' : 'normal' }}>{s.text}</span>
              {i === step && step < steps.length - 1 && (
                <span style={{ marginLeft: 'auto', width: 16, height: 16, border: '2px solid rgba(27,79,255,0.6)', borderTopColor: '#1B4FFF', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.7s linear infinite' }} />
              )}
            </div>
          ))}
        </div>

        {/* Partial answer */}
        {step >= 3 && (
          <div style={{ padding: '0 0 20px' }}>
            <p style={{ fontFamily: T.sans, fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: 0 }}>
              <strong style={{ color: '#93B4FF' }}>NVDA Q1 2025 — Revenue: $26.0B (+122% YoY)</strong><br />
              Data Centre segment now 87% of revenue ($22.6B). Gross margin expanded to 78.4%, driven by H100 GPU ASP gains. vs AMD: NVDA trades at 36x NTM EV/EBITDA vs AMD 28x, premium justified by CUDA moat...
            </p>
          </div>
        )}
      </div>

      {/* Input bar */}
      <div style={{ padding: '0 16px 16px' }}>
        <div style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, border: '1px solid rgba(255,255,255,0.08)' }}>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.2)', flex: 1, fontFamily: T.sans }}>Ask anything about any company, market, or filing...</span>
          <button style={{ width: 28, height: 28, borderRadius: 7, background: '#1B4FFF', border: 'none', color: '#fff', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>↑</button>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ─── Feature scroll section ────────────────────────────────────────────────
const FEATURES = [
  {
    num: '01',
    title: 'All your financial intelligence in one place',
    desc: 'Live market data, SEC filings, earnings transcripts, analyst ratings, insider transactions — unified in a single workspace. No tab switching, no copy-pasting.',
    visual: (
      <div style={{ background: '#0A1628', borderRadius: 12, padding: '24px', height: 280, overflow: 'hidden', position: 'relative' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Revenue (TTM)', val: '$60.9B', change: '+122%', up: true },
            { label: 'Gross Margin', val: '78.4%', change: '+12pp', up: true },
            { label: 'EV / EBITDA', val: '42.3×', change: 'NTM', up: null },
            { label: 'P/E Ratio', val: '38.1×', change: 'vs 28× peers', up: null },
            { label: 'Free Cash Flow', val: '$26.9B', change: '+210%', up: true },
            { label: 'Net Debt', val: '($3.8B)', change: 'Net cash', up: true },
          ].map((m, i) => (
            <div key={i} style={{ background: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ fontSize: 10, fontFamily: T.sans, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 18, fontFamily: T.serif, color: '#fff', fontWeight: 400, marginBottom: 4 }}>{m.val}</div>
              <div style={{ fontSize: 11, fontFamily: T.sans, color: m.up === true ? '#34D399' : m.up === false ? '#F87171' : 'rgba(255,255,255,0.35)' }}>{m.change}</div>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: '02',
    title: 'AI that reasons across documents and data',
    desc: 'Our intelligence engine reads 10-Ks, 10-Qs, transcripts, and live data simultaneously. Ask complex, multi-step questions and get answers with inline citations — not hallucinations.',
    visual: (
      <div style={{ background: '#0A1628', borderRadius: 12, padding: '24px', height: 280, overflow: 'hidden' }}>
        <div style={{ marginBottom: 14 }}>
          <div style={{ background: '#1B4FFF', borderRadius: '12px 12px 4px 12px', padding: '10px 14px', display: 'inline-block', maxWidth: '85%' }}>
            <p style={{ fontFamily: T.sans, fontSize: 12, color: '#fff', margin: 0 }}>What are the key risks in AAPL's latest 10-K?</p>
          </div>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.07)' }}>
          <p style={{ fontFamily: T.sans, fontSize: 12, color: 'rgba(255,255,255,0.75)', lineHeight: 1.7, margin: '0 0 10px' }}>
            From Apple's FY2024 10-K, three critical risks emerge: <span style={{ color: '#93B4FF', cursor: 'pointer' }}>[§ Risk Factors, p.5]</span>
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {['China revenue concentration (19% of total)', 'Macro sensitivity of consumer hardware', 'Services growth deceleration risk'].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ color: '#1B4FFF', fontSize: 11, fontWeight: 700, fontFamily: T.sans, flexShrink: 0, marginTop: 1 }}>0{i + 1}</span>
                <span style={{ fontFamily: T.sans, fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{r}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    num: '03',
    title: 'Build workflows. Automate the grind.',
    desc: "Create reusable research templates: earnings prep, comp tables, deck generation, peer benchmarking. Run them in one click. Export to Excel, PowerPoint, or Notion.",
    visual: (
      <div style={{ background: '#0A1628', borderRadius: 12, padding: '24px', height: 280, overflow: 'hidden' }}>
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontFamily: T.sans, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>Saved Workflows</div>
          {[
            { name: 'Earnings Comp Table', desc: 'Revenue, EBITDA, EPS vs consensus', icon: '📊', time: '~45s' },
            { name: 'M&A Deal Memo', desc: 'Target profile + synergy analysis', icon: '🏗️', time: '~2min' },
            { name: 'Sector Deep Dive', desc: '10 companies, 40+ metrics, peer chart', icon: '🔭', time: '~3min' },
            { name: 'Quarterly Earnings Brief', desc: 'Beat/miss + mgmt tone + guidance', icon: '📅', time: '~1min' },
          ].map((w, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', background: i === 0 ? 'rgba(27,79,255,0.12)' : 'rgba(255,255,255,0.03)', borderRadius: 8, marginBottom: 6, border: `1px solid ${i === 0 ? 'rgba(27,79,255,0.3)' : 'rgba(255,255,255,0.05)'}`, cursor: 'pointer' }}>
              <span style={{ fontSize: 16 }}>{w.icon}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: T.sans, fontSize: 12, color: '#fff', fontWeight: 500 }}>{w.name}</div>
                <div style={{ fontFamily: T.sans, fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{w.desc}</div>
              </div>
              <span style={{ fontFamily: T.sans, fontSize: 11, color: '#1B4FFF', fontWeight: 600 }}>{w.time}</span>
            </div>
          ))}
        </div>
      </div>
    ),
  },
  {
    num: '04',
    title: 'Institutional-grade data, not Bloomberg prices',
    desc: 'Live market data from Polygon. Fundamentals from FMP and EODHD. Macro from FRED. Private company intelligence from CoreSignal. 20+ data sources. All in one API.',
    visual: (
      <div style={{ background: '#0A1628', borderRadius: 12, padding: '24px', height: 280, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'hidden' }}>
        <div style={{ fontSize: 11, fontFamily: T.sans, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 4 }}>Data Sources Active</div>
        {[
          { name: 'Polygon.io', type: 'Live Market Data', status: 'live', color: '#1B4FFF' },
          { name: 'Financial Modeling Prep', type: 'Fundamentals & Estimates', status: 'live', color: '#10B981' },
          { name: 'EODHD', type: 'EOD, Fundamentals, Macro', status: 'live', color: '#10B981' },
          { name: 'SEC EDGAR', type: '10-K, 10-Q, 8-K Filings', status: 'live', color: '#10B981' },
          { name: 'FRED (Fed Reserve)', type: 'Macroeconomic Data', status: 'live', color: '#10B981' },
          { name: 'CoreSignal', type: 'Private Co. Intelligence', status: 'live', color: '#F59E0B' },
        ].map((d, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.04)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: d.color, boxShadow: `0 0 8px ${d.color}60`, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: T.sans, fontSize: 12, color: '#fff', fontWeight: 500 }}>{d.name}</div>
              <div style={{ fontFamily: T.sans, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{d.type}</div>
            </div>
            <span style={{ fontFamily: T.sans, fontSize: 10, fontWeight: 700, color: d.color, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{d.status}</span>
          </div>
        ))}
      </div>
    ),
  },
]

// ─── Testimonials ──────────────────────────────────────────────────────────
const TESTIMONIALS = [
  { quote: "Finsyt cut my earnings prep from 3 hours to 20 minutes. The AI cites the exact filing paragraph — I can trust it.", name: 'Sarah K.', title: 'Portfolio Manager, Long/Short Equity Fund', initials: 'SK' },
  { quote: "I replaced my Bloomberg terminal subscription with Finsyt for 90% of my daily research workflow. The remaining 10% doesn't justify $2,000/month.", name: 'Marcus T.', title: 'VP, Investment Banking', initials: 'MT' },
  { quote: "The comp table workflow alone saved our team 15+ hours a week. We now run sector analyses in minutes that used to take days.", name: 'Priya R.', title: 'Director of Research, Family Office', initials: 'PR' },
]

// ─── Pricing ──────────────────────────────────────────────────────────────
const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '/month',
    desc: 'For individuals exploring financial AI',
    features: ['10 AI research queries/month', 'Live market quotes', 'Basic company profiles', 'SEC filings search', '1 watchlist (25 stocks)'],
    cta: 'Get started free',
    highlight: false,
  },
  {
    name: 'Pro',
    price: '$29',
    period: '/month',
    desc: 'For analysts and investors who run on data',
    features: ['Unlimited AI research', 'Full financial statements', 'Earnings call transcripts', 'Insider & analyst data', 'Unlimited watchlists', 'Workflow automation', 'Export to Excel & PDF', 'Priority support'],
    cta: 'Start Pro trial',
    highlight: true,
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    desc: 'For firms that need security and scale',
    features: ['Everything in Pro', 'SSO / SAML', 'Custom data integrations', 'Private deployment option', 'Dedicated success manager', 'SLA & audit logs', 'Team management & RBAC'],
    cta: 'Contact sales',
    highlight: false,
  },
]

// ─── Main page ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false)
  const [activeFeature, setActiveFeature] = useState(0)
  const [testimonialIdx, setTestimonialIdx] = useState(0)
  const [demoQuery, setDemoQuery] = useState('')
  const [email, setEmail] = useState('')

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const t = setInterval(() => setTestimonialIdx(p => (p + 1) % TESTIMONIALS.length), 6000)
    return () => clearInterval(t)
  }, [])

  const testimonial = TESTIMONIALS[testimonialIdx]

  return (
    <div style={{ fontFamily: T.sans, background: T.white, color: T.black, overflowX: 'hidden' }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        html { scroll-behavior: smooth; }
        ::-webkit-scrollbar { width: 5px; }
        ::-webkit-scrollbar-thumb { background: ${T.gray200}; border-radius: 99px; }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(24px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse-dot { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
        .hero-word { animation: fadeUp 0.6s both; }
        .cta-btn:hover { opacity: 0.85 !important; transform: translateY(-1px); }
        .cta-btn { transition: opacity 0.15s, transform 0.15s; }
        .outline-btn:hover { background: ${T.black} !important; color: ${T.white} !important; }
        .outline-btn { transition: background 0.15s, color 0.15s; }
        .feature-row:hover { background: ${T.gray50} !important; }
        .feature-row { transition: background 0.2s; }
        .pricing-card:hover { box-shadow: 0 20px 60px rgba(0,0,0,0.10) !important; transform: translateY(-2px); }
        .pricing-card { transition: box-shadow 0.2s, transform 0.2s; }
      `}</style>

      <TickerTape />
      <Nav scrolled={scrolled} />

      {/* ── HERO ── */}
      <section style={{ padding: '96px 48px 80px', textAlign: 'center', background: T.white, position: 'relative', overflow: 'hidden' }}>
        {/* Background grid */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: `radial-gradient(${T.gray200} 1px, transparent 1px)`, backgroundSize: '32px 32px', opacity: 0.4, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(255,255,255,0) 0%, rgba(255,255,255,0.9) 100%)', pointerEvents: 'none' }} />

        {/* Announcement pill */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: T.gray100, borderRadius: 999, padding: '6px 14px 6px 8px', marginBottom: 32, border: `1px solid ${T.gray200}`, position: 'relative' }}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: T.black, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: T.white }}>✨</span>
          <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 500, color: T.black }}>Now live — AI earnings analysis with inline citations</span>
          <span style={{ fontFamily: T.sans, fontSize: 12, color: T.gray400 }}>→</span>
        </div>

        <h1 style={{ fontFamily: T.serif, fontSize: 'clamp(48px, 7vw, 88px)', fontWeight: 400, letterSpacing: '-3px', lineHeight: 1.0, marginBottom: 28, position: 'relative', maxWidth: 960, marginLeft: 'auto', marginRight: 'auto' }}>
          The financial intelligence<br />
          <span style={{ color: T.gray400 }}>platform for serious work</span>
        </h1>

        <p style={{ fontFamily: T.sans, fontSize: 18, color: T.gray600, maxWidth: 560, margin: '0 auto 48px', lineHeight: 1.65, position: 'relative', fontWeight: 400 }}>
          AI-powered research, live market data, SEC filings, earnings transcripts, and workflow automation — all in one secure workspace.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, position: 'relative', flexWrap: 'wrap' }}>
          <Link href="/auth/signup" className="cta-btn" style={{
            background: T.black, color: T.white, borderRadius: 9999,
            padding: '14px 32px', fontSize: 15, fontWeight: 600,
            textDecoration: 'none', fontFamily: T.sans, letterSpacing: '-0.01em',
            display: 'inline-block',
          }}>Start for free</Link>
          <Link href="#platform" className="outline-btn" style={{
            background: T.white, color: T.black, borderRadius: 9999,
            padding: '13px 28px', fontSize: 15, fontWeight: 500,
            textDecoration: 'none', fontFamily: T.sans, letterSpacing: '-0.01em',
            border: `1.5px solid ${T.gray200}`, display: 'inline-block',
          }}>See how it works →</Link>
        </div>

        {/* Trust strip */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginTop: 56, flexWrap: 'wrap', position: 'relative' }}>
          <span style={{ fontFamily: T.sans, fontSize: 12, color: T.gray400, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Powered by</span>
          {['Polygon.io', 'SEC EDGAR', 'FMP', 'FRED', 'CoreSignal'].map(p => (
            <span key={p} style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.gray600, letterSpacing: '-0.01em' }}>{p}</span>
          ))}
        </div>
      </section>

      {/* ── PRODUCT SCREENSHOT ── */}
      <section id="platform" style={{ padding: '0 48px 96px', display: 'flex', justifyContent: 'center' }}>
        <ProductMockup />
      </section>

      {/* ── BLOOMBERG QUOTE ── */}
      <section style={{ padding: '80px 80px 96px', borderTop: `1px solid ${T.gray100}` }}>
        <p style={{ fontFamily: T.serif, fontSize: 'clamp(28px, 4vw, 52px)', letterSpacing: '-1.5px', lineHeight: 1.2, maxWidth: 900 }}>
          <span style={{ color: T.gray400 }}>Just as Bloomberg digitized financial data in the 1980s, </span>
          <span style={{ color: T.black }}>Finsyt is building the AI-native intelligence layer for the next decade of finance.</span>
        </p>
      </section>

      {/* ── FEATURE SCROLL ── */}
      <section id="intelligence" style={{ padding: '0 80px 96px', borderTop: `1px solid ${T.gray100}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 64 }}>
          <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 400, letterSpacing: '-1.2px' }}>Everything you need.<br /><span style={{ color: T.gray400 }}>Nothing you don't.</span></h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, alignItems: 'start' }}>
          {/* Left: numbered list */}
          <div style={{ paddingRight: 48 }}>
            {FEATURES.map((f, i) => (
              <div key={f.num} className="feature-row" onClick={() => setActiveFeature(i)} style={{
                padding: '24px 20px', borderRadius: 12, cursor: 'pointer',
                background: activeFeature === i ? T.gray100 : 'transparent',
                marginBottom: 4,
              }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%', flexShrink: 0, marginTop: 2,
                    border: `2px solid ${activeFeature === i ? T.black : T.gray200}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: activeFeature === i ? T.black : 'transparent',
                    transition: 'all 0.2s',
                  }}>
                    <span style={{ fontFamily: T.sans, fontSize: 12, fontWeight: 700, color: activeFeature === i ? T.white : T.gray400 }}>{f.num}</span>
                  </div>
                  <div>
                    <h3 style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 400, letterSpacing: '-0.4px', color: activeFeature === i ? T.black : T.gray600, marginBottom: 6, transition: 'color 0.2s' }}>{f.title}</h3>
                    {activeFeature === i && <p style={{ fontFamily: T.sans, fontSize: 14, color: T.gray600, lineHeight: 1.65 }}>{f.desc}</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Right: visual */}
          <div style={{ position: 'sticky', top: 100 }}>
            {FEATURES[activeFeature].visual}
          </div>
        </div>
      </section>

      {/* ── STREAMLINE WORKFLOWS ── */}
      <section id="data" style={{ padding: '0 80px 96px', borderTop: `1px solid ${T.gray100}` }}>
        <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, letterSpacing: '-1.5px', lineHeight: 1.05, marginBottom: 56 }}>
          Streamline & Automate<br /><span style={{ color: T.gray400 }}>Your Research Workflows</span>
        </h2>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
          {[
            {
              title: 'Firm-Specific Workflows',
              desc: 'Create reusable templates for earnings prep, comp tables, sector deep dives, and deal memos. Run in one click.',
              icon: '⟳',
              tags: ['Earnings prep', 'Comp tables', 'Deal memos'],
            },
            {
              title: 'AI Table Builder',
              desc: 'Generate structured data tables across any set of companies. Ask in plain English, get a formatted, exportable table.',
              icon: '⊞',
              tags: ['Excel export', 'Live data', 'Custom metrics'],
            },
            {
              title: 'Material Generation',
              desc: 'Output research to PowerPoint decks, PDF memos, or Excel models — formatted and ready to share in seconds.',
              icon: '↗',
              tags: ['PowerPoint', 'PDF', 'Excel'],
            },
          ].map((card, i) => (
            <div key={card.title} style={{ background: '#0A1628', borderRadius: 16, padding: '32px 28px', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: 44, height: 44, borderRadius: 10, background: 'rgba(27,79,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, marginBottom: 24, border: '1px solid rgba(27,79,255,0.3)' }}>{card.icon}</div>
              <h3 style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 400, letterSpacing: '-0.4px', color: '#fff', marginBottom: 10 }}>{card.title}</h3>
              <p style={{ fontFamily: T.sans, fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.65, marginBottom: 20 }}>{card.desc}</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {card.tags.map(tag => (
                  <span key={tag} style={{ fontFamily: T.sans, fontSize: 11, fontWeight: 600, color: '#93B4FF', background: 'rgba(27,79,255,0.12)', borderRadius: 999, padding: '3px 10px', border: '1px solid rgba(27,79,255,0.2)' }}>{tag}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── DATA PROVIDERS ── */}
      <section style={{ padding: '0 80px 96px', borderTop: `1px solid ${T.gray100}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '380px 1fr', gap: 80, alignItems: 'start' }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(28px, 3vw, 40px)', fontWeight: 400, letterSpacing: '-1px', marginBottom: 16 }}>Trusted Data</h2>
            <p style={{ fontFamily: T.sans, fontSize: 15, color: T.gray600, lineHeight: 1.7, marginBottom: 24 }}>
              We partner with the best financial data providers — not scrape from unreliable sources. Every data point has a provenance chain.
            </p>
            <Link href="#pricing" style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.black, textDecoration: 'none', borderBottom: `1.5px solid ${T.black}` }}>See what's included →</Link>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            {[
              { name: 'Polygon.io',   icon: '⬡',   bg: '#1B4FFF', fg: '#fff', type: 'Live market data' },
              { name: 'FMP',          icon: 'F',    bg: '#059669', fg: '#fff', type: 'Fundamentals' },
              { name: 'EODHD',        icon: 'E',    bg: '#0891B2', fg: '#fff', type: 'EOD + macro' },
              { name: 'SEC EDGAR',    icon: '🏛',   bg: T.gray100, fg: T.black, type: 'US filings' },
              { name: 'FRED',         icon: '📊',   bg: T.gray100, fg: T.black, type: 'Macro data' },
              { name: 'CoreSignal',   icon: 'CS',   bg: '#7C3AED', fg: '#fff', type: 'Private cos.' },
              { name: 'Finnhub',      icon: 'Fh',   bg: T.gray100, fg: T.black, type: 'Sentiment & news' },
              { name: 'OpenAI',       icon: '◎',   bg: T.black,   fg: '#fff', type: 'AI reasoning' },
              { name: 'Anthropic',    icon: 'A',    bg: '#C2410C', fg: '#fff', type: 'Claude models' },
            ].map(p => (
              <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: T.white, border: `1px solid ${T.gray200}`, borderRadius: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: 8, background: p.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: p.icon.length > 2 ? 14 : p.icon.length > 1 ? 12 : 16, fontWeight: 700, color: p.fg, fontFamily: T.sans, flexShrink: 0 }}>{p.icon}</div>
                <div>
                  <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 600, color: T.black }}>{p.name}</div>
                  <div style={{ fontFamily: T.sans, fontSize: 11, color: T.gray400 }}>{p.type}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECURITY BANNER ── */}
      <section id="security" style={{ margin: '0 80px 96px', borderRadius: 24, background: T.black, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <div style={{ padding: '72px 64px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 40 }}>
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '2.5px', color: 'rgba(255,255,255,0.3)', fontFamily: T.sans }}>SECURITY</span>
            </div>
            <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 400, color: 'rgba(255,255,255,0.35)', letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 4px' }}>Built for enterprise.</h2>
            <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(24px, 3vw, 38px)', fontWeight: 400, color: '#fff', letterSpacing: '-1px', lineHeight: 1.15, margin: '0 0 36px' }}>Secure by design.</h2>
            {['We never train on your data', 'End-to-end encryption at rest and in transit', 'SOC 2 Type II compliance (in progress)', 'Single-tenant deployment available for Enterprise'].map(item => (
              <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ color: '#10B981', fontSize: 13 }}>✓</span>
                <span style={{ fontFamily: T.sans, fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{item}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
            {[
              { label: 'SOC 2', icon: '🔒', status: 'In progress' },
              { label: 'GDPR', icon: '🇪🇺', status: 'Compliant' },
              { label: 'CCPA', icon: '🌴', status: 'Compliant' },
              { label: 'ISO 27001', icon: '📋', status: 'Roadmap' },
            ].map((c, i) => (
              <div key={c.label} style={{ padding: '48px 36px', borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.06)' : 'none', borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                <span style={{ fontSize: 32 }}>{c.icon}</span>
                <div>
                  <div style={{ fontFamily: T.sans, fontSize: 16, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{c.label}</div>
                  <div style={{ fontFamily: T.sans, fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{c.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section style={{ padding: '0 80px 96px', borderTop: `1px solid ${T.gray100}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 400, letterSpacing: '-1.2px', marginBottom: 8, lineHeight: 1.1 }}>
              Trusted by analysts<br />who move markets
            </h2>
            <p style={{ fontFamily: T.sans, fontSize: 15, color: T.gray600, lineHeight: 1.6, marginBottom: 32 }}>From solo investors to institutional teams.</p>
            <div style={{ display: 'flex', gap: 8 }}>
              {TESTIMONIALS.map((_, i) => (
                <button key={i} onClick={() => setTestimonialIdx(i)} style={{
                  width: i === testimonialIdx ? 28 : 8, height: 8, borderRadius: 4,
                  background: i === testimonialIdx ? T.black : T.gray200,
                  border: 'none', cursor: 'pointer', padding: 0, transition: 'width 0.3s, background 0.3s',
                }} />
              ))}
            </div>
          </div>

          <div style={{ background: T.gray100, borderRadius: 20, padding: '40px 44px', border: `1px solid ${T.gray200}`, transition: 'all 0.3s' }}>
            <p style={{ fontFamily: T.serif, fontSize: 20, fontWeight: 400, letterSpacing: '-0.5px', lineHeight: 1.6, color: T.black, marginBottom: 28, fontStyle: 'italic' }}>
              "{testimonial.quote}"
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 44, height: 44, borderRadius: '50%', background: T.black, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.sans, fontWeight: 700, fontSize: 14, color: T.white }}>
                {testimonial.initials}
              </div>
              <div>
                <div style={{ fontFamily: T.sans, fontSize: 14, fontWeight: 600, color: T.black }}>{testimonial.name}</div>
                <div style={{ fontFamily: T.sans, fontSize: 12, color: T.gray400, marginTop: 2 }}>{testimonial.title}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ padding: '0 80px 96px', borderTop: `1px solid ${T.gray100}` }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(32px, 4vw, 52px)', fontWeight: 400, letterSpacing: '-1.5px', marginBottom: 16 }}>
            Simple, transparent pricing
          </h2>
          <p style={{ fontFamily: T.sans, fontSize: 16, color: T.gray600 }}>No hidden fees. Cancel anytime.</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
          {PLANS.map((plan, i) => (
            <div key={plan.name} className="pricing-card" style={{
              background: plan.highlight ? T.black : T.white,
              border: `1.5px solid ${plan.highlight ? T.black : T.gray200}`,
              borderRadius: 20, padding: '40px 36px',
              position: 'relative',
              boxShadow: plan.highlight ? '0 20px 60px rgba(0,0,0,0.2)' : 'none',
            }}>
              {plan.highlight && (
                <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: T.accent, color: T.white, fontFamily: T.sans, fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', padding: '4px 14px', borderRadius: 999 }}>MOST POPULAR</div>
              )}
              <div style={{ marginBottom: 28 }}>
                <div style={{ fontFamily: T.sans, fontSize: 13, fontWeight: 700, color: plan.highlight ? 'rgba(255,255,255,0.5)' : T.gray400, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{plan.name}</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 6 }}>
                  <span style={{ fontFamily: T.serif, fontSize: 44, fontWeight: 400, color: plan.highlight ? T.white : T.black, letterSpacing: '-2px' }}>{plan.price}</span>
                  <span style={{ fontFamily: T.sans, fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.4)' : T.gray400 }}>{plan.period}</span>
                </div>
                <div style={{ fontFamily: T.sans, fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.5)' : T.gray600 }}>{plan.desc}</div>
              </div>

              <Link href={plan.name === 'Enterprise' ? 'mailto:hello@finsyt.com' : '/auth/signup'} style={{
                display: 'block', textAlign: 'center',
                background: plan.highlight ? T.white : T.black,
                color: plan.highlight ? T.black : T.white,
                borderRadius: 9999, padding: '12px 24px',
                fontFamily: T.sans, fontSize: 15, fontWeight: 600,
                textDecoration: 'none', marginBottom: 28,
                border: 'none',
                transition: 'opacity 0.15s',
              }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
              >{plan.cta}</Link>

              <div style={{ height: 1, background: plan.highlight ? 'rgba(255,255,255,0.1)' : T.gray100, marginBottom: 24 }} />

              <ul style={{ listStyle: 'none', padding: 0 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                    <span style={{ color: plan.highlight ? '#10B981' : '#059669', fontSize: 13, flexShrink: 0 }}>✓</span>
                    <span style={{ fontFamily: T.sans, fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.7)' : T.gray600 }}>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={{ padding: '80px', borderTop: `1px solid ${T.gray100}` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: 32 }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginBottom: 36 }}>
              <div style={{ width: 32, height: 32, borderLeft: `3px solid ${T.black}`, borderTop: `3px solid ${T.black}`, borderRadius: '4px 0 0 0', marginBottom: 4 }} />
              <div style={{ width: 20, height: 20, borderLeft: `3px solid ${T.black}`, borderBottom: `3px solid ${T.black}`, borderRadius: '0 0 0 4px', marginBottom: 32 }} />
            </div>
            <h2 style={{ fontFamily: T.serif, fontSize: 'clamp(36px, 5vw, 68px)', fontWeight: 400, letterSpacing: '-2.5px', lineHeight: 1.0 }}>
              Unlock financial AI<br /><span style={{ color: T.gray400 }}>for your firm</span>
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'flex-end' }}>
            <Link href="/auth/signup" className="cta-btn" style={{
              background: T.black, color: T.white, borderRadius: 9999,
              padding: '14px 32px', fontSize: 15, fontWeight: 600,
              textDecoration: 'none', fontFamily: T.sans, textAlign: 'center',
              display: 'inline-block',
            }}>Start for free</Link>
            <Link href="mailto:hello@finsyt.com" style={{ fontFamily: T.sans, fontSize: 14, color: T.gray400, textDecoration: 'none', textAlign: 'center' }}>Contact sales →</Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: T.gray50, borderTop: `1px solid ${T.gray200}`, padding: '56px 80px 40px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr', gap: 40, marginBottom: 48 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{ width: 28, height: 28, borderRadius: 7, background: T.black, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: T.serif, fontSize: 14, fontWeight: 400, color: T.white }}>F</div>
              <span style={{ fontFamily: T.serif, fontSize: 18, fontWeight: 400, color: T.black }}>Finsyt</span>
            </div>
            <p style={{ fontFamily: T.sans, fontSize: 13, color: T.gray600, lineHeight: 1.7, maxWidth: 240 }}>AI-powered financial intelligence for founders, operators, and analysts.</p>
          </div>
          {[
            { title: 'PLATFORM', links: ['Dashboard', 'AI Research', 'Screener', 'Markets', 'Filings'] },
            { title: 'COMPANY', links: ['About', 'Careers', 'Blog', 'Press'] },
            { title: 'LEGAL', links: ['Privacy Policy', 'Terms of Use', 'Cookie Policy'] },
            { title: 'CONTACT', links: ['hello@finsyt.com', 'Request Demo', 'LinkedIn', 'Twitter'] },
          ].map(col => (
            <div key={col.title}>
              <p style={{ fontFamily: T.sans, fontSize: 10, fontWeight: 700, letterSpacing: '2.5px', color: T.gray400, marginBottom: 16 }}>{col.title}</p>
              {col.links.map(link => (
                <div key={link} style={{ marginBottom: 8 }}>
                  <a href="#" style={{ fontFamily: T.sans, fontSize: 13, color: T.gray600, textDecoration: 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.color = T.black)}
                    onMouseLeave={e => (e.currentTarget.style.color = T.gray600)}
                  >{link}</a>
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ borderTop: `1px solid ${T.gray200}`, paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <span style={{ fontFamily: T.sans, fontSize: 12, color: T.gray400 }}>© 2026 Finsyt Ltd. All rights reserved.</span>
          <span style={{ fontFamily: T.sans, fontSize: 12, color: T.gray400 }}>Built to beat Bloomberg.</span>
        </div>
      </footer>
    </div>
  )
}
