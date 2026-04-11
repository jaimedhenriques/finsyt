'use client'
import { useState } from 'react'
import Link from 'next/link'

const NAV_LINKS = [
  { label: 'Platform', href: '#platform' },
  { label: 'Pricing',  href: '#pricing'  },
  { label: 'Data',     href: '#data'     },
]

const STATS = [
  { value: '23', label: 'MCP Tools'     },
  { value: '22', label: 'API Endpoints' },
  { value: '39', label: 'AI Skills'     },
  { value: '9',  label: 'Data Providers'},
]

const FEATURES = [
  {
    tag: 'Research Chat',
    title: 'AI-powered financial research in natural language',
    desc: 'Ask any financial question and get source-cited answers drawn from SEC filings, market data, and economic indicators. Every response includes verifiable data sources.',
    bullets: [
      'Natural language queries across all financial data',
      'Source citations linked to SEC EDGAR, FRED, Finnhub',
      'Follow-up conversations with full context retention',
      'Export answers to formatted reports',
    ],
    demo: {
      query: 'What drove Microsoft\'s revenue growth in the latest quarter?',
      answer: 'Microsoft reported $69.6B in Q2 FY2026 revenue. Intelligent Cloud segment grew 19% YoY driven by Azure, which saw 31% constant-currency growth...',
      badges: ['SEC 10-Q', 'Finnhub'],
    },
  },
  {
    tag: 'Market Monitor',
    title: 'Real-time market data across indices, FX, and commodities',
    desc: 'Track global markets, sector performance, and economic indicators in one live dashboard — powered by 9 data providers.',
    bullets: [
      'Global indices: S&P 500, NASDAQ, FTSE, Nikkei and more',
      'Forex and commodities with live quotes',
      'Sector heatmaps and performance tracking',
      'FRED macro indicators: GDP, CPI, unemployment, rates',
    ],
  },
  {
    tag: 'AI Agents',
    title: 'Autonomous financial workflows',
    desc: 'Go beyond chat. Finsyt AI agents can run multi-step research tasks, monitor signals, and generate investment memos — automatically.',
    bullets: [
      'Agentic step-by-step research with source tracing',
      'Scheduled alerts on earnings, filings, and price moves',
      'Auto-generated investment memos and DD reports',
      'MCP server for Claude, GPT, and custom LLMs',
    ],
  },
  {
    tag: 'Excel Plugin',
    title: 'Capital IQ-style formulas in your spreadsheet',
    desc: 'Pull live financial data directly into Excel using familiar formula syntax. 22 formulas covering income statements, balance sheets, ratios, and macro data.',
    bullets: [
      '=FINSYT("AAPL", "IQ_TOTAL_REV") — live revenue',
      '=FINSYT("MSFT", "IQ_EBITDA") — live EBITDA',
      'Auto-refreshing data every market session',
      'No Bloomberg terminal required',
    ],
  },
]

const PROVIDERS = [
  { name: 'SEC EDGAR',      type: 'Government',    desc: '10-K, 10-Q, 8-K, proxy statements, insider filings.' },
  { name: 'Finnhub',        type: 'Market Data',   desc: 'Real-time stock prices, company fundamentals, insider transactions.' },
  { name: 'Financial Modeling Prep', type: 'Fundamentals', desc: 'Financial statements, ratios, DCF models, and company profiles.' },
  { name: 'FRED',           type: 'Economics',     desc: 'Federal Reserve Economic Data — 800,000+ economic time series.' },
  { name: 'Yahoo Finance',  type: 'Market Data',   desc: 'Market quotes, historical prices, options chains.' },
  { name: 'Alpha Vantage',  type: 'Market Data',   desc: 'Intraday and daily time series, forex, crypto, technical indicators.' },
  { name: 'Polygon.io',     type: 'Market Data',   desc: 'Tick-level stock data, options, forex, and crypto.' },
  { name: 'Tiingo',         type: 'Market Data',   desc: 'End-of-day stock prices, fundamentals, news feeds.' },
  { name: 'IEX Cloud',      type: 'Fundamentals',  desc: 'Curated financial data including quotes, financials, and estimates.' },
]

const STEPS = [
  { num: '01', title: 'Ask any financial question', desc: 'Type in natural language. "What are the key risks in MSFT\'s latest 10-K?" or "Compare NVDA vs AMD gross margins over 5 years." Finsyt understands financial context.' },
  { num: '02', title: 'AI retrieves and analyzes',  desc: 'Finsyt queries SEC EDGAR, FRED, Finnhub, and other providers in real time. AI agents synthesize filings, market data, and economic indicators into a coherent analysis.' },
  { num: '03', title: 'Get source-cited answers',   desc: 'Every data point links back to its source. Export to Excel, generate investment memos, or continue the conversation with follow-up questions.' },
]

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    sub: 'Individual investors exploring AI research',
    cta: 'Get Started Free',
    ctaStyle: 'outline',
    features: ['50 queries/mo', '100 API calls/day', 'Stock quotes and company profiles', 'SEC filings (unlimited)', 'Basic financial statements', 'Historical price data', 'MCP server (self-hosted)', 'Excel plugin (basic formulas)', 'Community support'],
  },
  {
    name: 'Pro',
    price: '$33',
    period: '/mo',
    annualNote: '$390/yr billed annually',
    sub: 'Analysts who need depth and speed',
    cta: 'Start 14-Day Free Trial',
    ctaStyle: 'primary',
    badge: 'MOST POPULAR',
    features: ['2,000 queries/mo', '2,000 API calls/day', 'Everything in Free', 'Analyst estimates and price targets', 'Insider and congressional trading', 'ESG scores and supply chain data', 'ETF holdings and exposure', 'Earnings calendar and surprises', 'FRED economic indicators', 'Financial news with sentiment', 'Natural language stock screener', 'Full Excel plugin (all formulas)', 'Priority email support'],
  },
  {
    name: 'Team',
    price: '$66',
    period: '/mo per seat',
    annualNote: '$790/yr per seat',
    sub: 'Research teams and small funds',
    cta: 'Start Team Trial',
    ctaStyle: 'outline',
    features: ['10,000 queries/seat/mo', '10,000 API calls/day', 'Everything in Pro', 'Shared team workspaces', 'Collaborative research and notes', 'Document generation (memos, DD)', 'Custom report templates', 'Team admin and permissions', 'SSO / SAML authentication', 'Dedicated Slack support'],
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    sub: 'Banks, PE firms, and asset managers',
    cta: 'Contact Sales',
    ctaStyle: 'outline',
    features: ['Unlimited queries', 'Unlimited API calls', 'Everything in Team', 'Custom data integrations', 'Internal document ingestion', 'On-premise / private cloud', 'Custom AI model fine-tuning', 'SOC 2 Type II compliance', 'Dedicated account manager', 'SLA (99.9% uptime)', 'Audit logging and RBAC', 'White-glove onboarding'],
  },
]

const COMPARISON = [
  { feature: 'Annual cost',          finsyt: '$0 – $468',    bloomberg: '$30,000+',    alphasense: '$10,000+', rogo: '$3,300+' },
  { feature: 'AI Research Chat',     finsyt: '✓',            bloomberg: '—',           alphasense: '✓',        rogo: '✓'      },
  { feature: 'SEC Filings',          finsyt: '✓',            bloomberg: '✓',           alphasense: '✓',        rogo: '✓'      },
  { feature: 'Free tier',            finsyt: '✓ Always free',bloomberg: '—',           alphasense: 'Trial only',rogo: '—'     },
  { feature: 'Excel plugin',         finsyt: '✓',            bloomberg: '✓',           alphasense: '—',        rogo: '—'      },
  { feature: 'MCP / API access',     finsyt: '✓',            bloomberg: '—',           alphasense: '—',        rogo: '—'      },
  { feature: 'Source citations',     finsyt: '✓',            bloomberg: 'Partial',     alphasense: '✓',        rogo: '✓'      },
  { feature: 'FRED macro data',      finsyt: '✓',            bloomberg: '✓',           alphasense: '—',        rogo: '—'      },
]

export default function LandingPage() {
  const [billingAnnual, setBillingAnnual] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif", background: '#fff', color: '#0A1628', overflowX: 'hidden' }}>
      {/* ── NAV ── */}
      <nav style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)', borderBottom: '1px solid #E8EDF4', padding: '0 24px', height: 60, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 32, height: 32, background: 'linear-gradient(135deg, #1B4FFF, #06B6D4)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16 }}>F</div>
          <span style={{ fontWeight: 800, fontSize: 18, color: '#0A1628', letterSpacing: '-0.02em' }}>Finsyt</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          {NAV_LINKS.map(l => (
            <a key={l.label} href={l.href} style={{ fontSize: 14, fontWeight: 500, color: '#5A6B82', textDecoration: 'none' }}>{l.label}</a>
          ))}
          <Link href="/app" style={{ padding: '8px 18px', background: '#1B4FFF', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            Get Started Free
          </Link>
        </div>
      </nav>

      {/* ── HERO ── */}
      <section style={{ textAlign: 'center', padding: '80px 24px 60px', maxWidth: 780, margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 14px', background: '#EEF3FF', borderRadius: 20, fontSize: 13, fontWeight: 600, color: '#1B4FFF', marginBottom: 28 }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#1B4FFF', display: 'inline-block' }} />
          AI-Powered Financial Intelligence
        </div>
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.03em', marginBottom: 20, color: '#0A1628' }}>
          Research smarter.<br />
          <span style={{ background: 'linear-gradient(135deg, #1B4FFF, #06B6D4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Decide faster.</span>
        </h1>
        <p style={{ fontSize: 18, color: '#5A6B82', lineHeight: 1.6, marginBottom: 36, maxWidth: 560, margin: '0 auto 36px' }}>
          Finsyt is the AI research platform purpose-built for finance. Analyze SEC filings, earnings calls, market data, and economic indicators — all from one unified interface.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <Link href="/app/research" style={{ padding: '14px 28px', background: '#1B4FFF', color: '#fff', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            Get Started Free <span>→</span>
          </Link>
          <a href="mailto:demo@finsyt.com" style={{ padding: '14px 28px', background: '#fff', color: '#0A1628', border: '1.5px solid #E8EDF4', borderRadius: 10, fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>
            Book a Demo
          </a>
        </div>
        <p style={{ fontSize: 13, color: '#A0AEBF' }}>Free to start · No credit card required · Real financial data</p>
      </section>

      {/* ── DEMO PREVIEW ── */}
      <section style={{ maxWidth: 700, margin: '0 auto 80px', padding: '0 24px' }}>
        <div style={{ background: '#0A1628', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 80px rgba(27,79,255,0.15)' }}>
          <div style={{ padding: '10px 16px', background: '#131F35', display: 'flex', alignItems: 'center', gap: 6 }}>
            {['#EF4444','#F59E0B','#10B981'].map((c,i) => <div key={i} style={{ width:10,height:10,borderRadius:'50%',background:c }} />)}
            <span style={{ marginLeft: 8, fontSize: 12, color: '#5A6B82' }}>app.finsyt.com/research</span>
          </div>
          <div style={{ padding: 24 }}>
            <div style={{ background: '#131F35', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, color: '#5A6B82', marginBottom: 4 }}>SC</div>
              <div style={{ fontSize: 14, color: '#E2E8F0' }}>Analyze Apple's latest 10-K filing. What are the key risk factors for investors?</div>
            </div>
            <div style={{ background: '#0F1E36', borderRadius: 10, padding: '16px', borderLeft: '3px solid #1B4FFF' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#1B4FFF', marginBottom: 8 }}>Apple Inc. (AAPL) — 10-K Risk Analysis</div>
              <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6, marginBottom: 12 }}>
                Filing Source: <span style={{ color: '#E2E8F0' }}>SEC EDGAR 10-K</span> · Risk Factors Found: <span style={{ color: '#E2E8F0' }}>28 identified</span>
                <br />Top risk categories: supply chain concentration (32% of components from single region), regulatory exposure in EU/China markets, and Services revenue dependency growth rate deceleration...
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {['3 sources cited', 'SEC verified'].map(b => (
                  <span key={b} style={{ padding: '3px 10px', background: '#1B4FFF22', color: '#60A5FA', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{b}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section style={{ background: '#F8FAFF', padding: '48px 24px', borderTop: '1px solid #E8EDF4', borderBottom: '1px solid #E8EDF4', marginBottom: 80 }}>
        <div style={{ maxWidth: 800, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24, textAlign: 'center' }}>
          {STATS.map(s => (
            <div key={s.label}>
              <div style={{ fontSize: 40, fontWeight: 800, color: '#1B4FFF', letterSpacing: '-0.03em' }}>{s.value}</div>
              <div style={{ fontSize: 13, color: '#7D8FA9', fontWeight: 500, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="platform" style={{ maxWidth: 1100, margin: '0 auto 100px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 56 }}>
          <h2 style={{ fontSize: 'clamp(28px, 4vw, 44px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>A single platform for every financial workflow</h2>
          <p style={{ fontSize: 16, color: '#7D8FA9', maxWidth: 520, margin: '0 auto' }}>From conversational research to autonomous AI agents, Finsyt covers the entire financial intelligence lifecycle.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 64 }}>
          {FEATURES.map((f, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
              <div style={{ order: i % 2 === 1 ? 1 : 0 }}>
                <div style={{ display: 'inline-block', padding: '4px 12px', background: '#EEF3FF', color: '#1B4FFF', borderRadius: 6, fontSize: 12, fontWeight: 700, marginBottom: 16 }}>{f.tag}</div>
                <h3 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 12, lineHeight: 1.3 }}>{f.title}</h3>
                <p style={{ fontSize: 15, color: '#5A6B82', lineHeight: 1.7, marginBottom: 20 }}>{f.desc}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {f.bullets.map((b, bi) => (
                    <li key={bi} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#3D4F6E' }}>
                      <span style={{ color: '#1B4FFF', fontWeight: 700, marginTop: 1 }}>✓</span> {b}
                    </li>
                  ))}
                </ul>
                <Link href="/app/research" style={{ display: 'inline-block', marginTop: 24, padding: '10px 22px', background: '#1B4FFF', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>Try it free →</Link>
              </div>
              <div style={{ order: i % 2 === 1 ? 0 : 1 }}>
                {f.demo ? (
                  <div style={{ background: '#0A1628', borderRadius: 14, padding: 20, boxShadow: '0 16px 48px rgba(27,79,255,0.12)' }}>
                    <div style={{ fontSize: 12, color: '#5A6B82', marginBottom: 8 }}>Your query</div>
                    <div style={{ background: '#131F35', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#E2E8F0', marginBottom: 16 }}>{f.demo.query}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#1B4FFF', marginBottom: 8 }}>Finsyt AI</div>
                    <div style={{ fontSize: 13, color: '#94A3B8', lineHeight: 1.6, marginBottom: 12 }}>{f.demo.answer}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      {f.demo.badges.map(b => <span key={b} style={{ padding: '3px 10px', background: '#1B4FFF22', color: '#60A5FA', borderRadius: 5, fontSize: 11, fontWeight: 600 }}>{b}</span>)}
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'linear-gradient(135deg, #EEF3FF 0%, #F0FDFF 100%)', borderRadius: 14, padding: 32, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: 48 }}>{['📊', '🤖', '📝'][i - 1]}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={{ background: '#F8FAFF', padding: '80px 24px', borderTop: '1px solid #E8EDF4', borderBottom: '1px solid #E8EDF4', marginBottom: 80 }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>From question to insight in three steps</h2>
            <p style={{ fontSize: 15, color: '#7D8FA9' }}>No complex setup. No vendor calls. Start researching in under two minutes.</p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {STEPS.map((s, i) => (
              <div key={i} style={{ background: '#fff', borderRadius: 14, padding: '28px 24px', border: '1px solid #E8EDF4' }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: '#1B4FFF', letterSpacing: '0.1em', marginBottom: 12 }}>STEP {s.num}</div>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 10, color: '#0A1628', lineHeight: 1.3 }}>{s.title}</h3>
                <p style={{ fontSize: 14, color: '#7D8FA9', lineHeight: 1.6 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── DATA PROVIDERS ── */}
      <section id="data" style={{ maxWidth: 1100, margin: '0 auto 80px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>9 authoritative data providers, one platform</h2>
          <p style={{ fontSize: 15, color: '#7D8FA9' }}>Finsyt aggregates real financial data from trusted, authoritative sources. No simulated data. Every number is verifiable.</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {PROVIDERS.map((p, i) => (
            <div key={i} style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '20px 22px', transition: 'box-shadow 0.2s' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 36, height: 36, background: 'linear-gradient(135deg, #EEF3FF, #E0F7FF)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>
                  {['🏛️','📈','💹','🏦','📊','⚡','🔷','📉','☁️'][i]}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#0A1628' }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: '#1B4FFF', fontWeight: 600 }}>{p.type}</div>
                </div>
              </div>
              <p style={{ fontSize: 13, color: '#7D8FA9', lineHeight: 1.5 }}>{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" style={{ background: '#F8FAFF', padding: '80px 24px', borderTop: '1px solid #E8EDF4', borderBottom: '1px solid #E8EDF4', marginBottom: 80 }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <p style={{ fontSize: 13, color: '#7D8FA9', marginBottom: 8 }}>23 MCP tools · 22 API endpoints · 14 Excel formulas</p>
            <h2 style={{ fontSize: 'clamp(26px, 4vw, 40px)', fontWeight: 800, letterSpacing: '-0.03em', marginBottom: 12 }}>Institutional-grade financial data. Individual pricing.</h2>
            <p style={{ fontSize: 15, color: '#7D8FA9', marginBottom: 28 }}>The same data Wall Street pays $30,000+/year for. Start free, upgrade when you need more.</p>
            <div style={{ display: 'inline-flex', background: '#E8EDF4', borderRadius: 10, padding: 4, gap: 4 }}>
              {['Monthly', 'Annual (-17%)'].map((l, i) => (
                <button key={l} onClick={() => setBillingAnnual(i === 1)}
                  style={{ padding: '8px 18px', borderRadius: 7, border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    background: billingAnnual === (i === 1) ? '#fff' : 'transparent',
                    color: billingAnnual === (i === 1) ? '#0A1628' : '#7D8FA9',
                    boxShadow: billingAnnual === (i === 1) ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            {PLANS.map((plan, i) => (
              <div key={i} style={{ background: plan.ctaStyle === 'primary' ? '#0A1628' : '#fff', border: plan.ctaStyle === 'primary' ? 'none' : '1px solid #E8EDF4', borderRadius: 16, padding: '28px 22px', position: 'relative' }}>
                {plan.badge && <div style={{ position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)', background: '#1B4FFF', color: '#fff', fontSize: 11, fontWeight: 800, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>{plan.badge}</div>}
                <div style={{ fontSize: 15, fontWeight: 700, color: plan.ctaStyle === 'primary' ? '#fff' : '#0A1628', marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 13, color: plan.ctaStyle === 'primary' ? '#94A3B8' : '#7D8FA9', marginBottom: 16, lineHeight: 1.4 }}>{plan.sub}</div>
                <div style={{ marginBottom: 20 }}>
                  <span style={{ fontSize: 36, fontWeight: 800, color: plan.ctaStyle === 'primary' ? '#fff' : '#0A1628' }}>{plan.price}</span>
                  <span style={{ fontSize: 14, color: plan.ctaStyle === 'primary' ? '#94A3B8' : '#7D8FA9' }}>{plan.period}</span>
                  {plan.annualNote && billingAnnual && <div style={{ fontSize: 12, color: '#10B981', marginTop: 4 }}>{plan.annualNote}</div>}
                </div>
                <Link href="/app" style={{ display: 'block', padding: '10px', textAlign: 'center', borderRadius: 8, fontSize: 14, fontWeight: 700, textDecoration: 'none', marginBottom: 20,
                  background: plan.ctaStyle === 'primary' ? '#1B4FFF' : 'transparent',
                  color: plan.ctaStyle === 'primary' ? '#fff' : '#1B4FFF',
                  border: plan.ctaStyle === 'primary' ? 'none' : '1.5px solid #1B4FFF' }}>
                  {plan.cta}
                </Link>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {plan.features.map((f, fi) => (
                    <li key={fi} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: plan.ctaStyle === 'primary' ? '#CBD5E1' : '#5A6B82' }}>
                      <span style={{ color: '#10B981', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ── */}
      <section style={{ maxWidth: 900, margin: '0 auto 80px', padding: '0 24px' }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <h2 style={{ fontSize: 'clamp(24px, 3vw, 36px)', fontWeight: 800, letterSpacing: '-0.02em', marginBottom: 8 }}>How Finsyt compares</h2>
          <p style={{ fontSize: 14, color: '#7D8FA9' }}>Same data sources. Fraction of the cost.</p>
        </div>
        <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 16, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#F8FAFF', borderBottom: '2px solid #E8EDF4' }}>
                {['Capability', 'Finsyt', 'Bloomberg', 'AlphaSense', 'Rogo'].map((h, i) => (
                  <th key={h} style={{ padding: '14px 16px', textAlign: i === 0 ? 'left' : 'center', fontWeight: 700, color: i === 1 ? '#1B4FFF' : '#0A1628', fontSize: i === 1 ? 14 : 13 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid #F0F4FA', background: i % 2 === 0 ? '#fff' : '#FAFBFF' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 500, color: '#3D4F6E' }}>{row.feature}</td>
                  {[row.finsyt, row.bloomberg, row.alphasense, row.rogo].map((v, vi) => (
                    <td key={vi} style={{ padding: '12px 16px', textAlign: 'center', fontWeight: vi === 0 ? 700 : 400, color: vi === 0 ? '#1B4FFF' : v === '—' ? '#C5CFDF' : '#3D4F6E' }}>{v}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 11, color: '#A0AEBF', textAlign: 'center', marginTop: 12 }}>Pricing based on publicly available information as of 2025. Bloomberg pricing is per-seat annual subscription.</p>
      </section>

      {/* ── CTA ── */}
      <section style={{ background: 'linear-gradient(135deg, #0A1628 0%, #0F2050 100%)', padding: '80px 24px', textAlign: 'center', marginBottom: 0 }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 'clamp(26px, 4vw, 42px)', fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', marginBottom: 16 }}>Start making better investment decisions today</h2>
          <p style={{ fontSize: 16, color: '#94A3B8', marginBottom: 32 }}>Free tier with real financial data. No credit card. No sales call. Just sign up and start researching.</p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/app/research" style={{ padding: '14px 28px', background: '#1B4FFF', color: '#fff', borderRadius: 10, fontSize: 16, fontWeight: 700, textDecoration: 'none' }}>Get Started Free</Link>
            <Link href="#pricing" style={{ padding: '14px 28px', background: 'transparent', color: '#fff', border: '1.5px solid #334155', borderRadius: 10, fontSize: 16, fontWeight: 600, textDecoration: 'none' }}>View Pricing Plans</Link>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={{ background: '#0A1628', padding: '48px 24px 32px', color: '#94A3B8' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 40, marginBottom: 40 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 28, height: 28, background: 'linear-gradient(135deg, #1B4FFF, #06B6D4)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 14 }}>F</div>
                <span style={{ fontWeight: 800, fontSize: 16, color: '#fff' }}>Finsyt</span>
              </div>
              <p style={{ fontSize: 13, lineHeight: 1.6, maxWidth: 240 }}>Beyond insights. AI-powered financial research and intelligence for the world's leading institutions.</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {['SOC 2 Type II', 'GDPR', 'CCPA'].map(b => (
                  <span key={b} style={{ padding: '3px 10px', background: '#131F35', borderRadius: 5, fontSize: 11, fontWeight: 600, color: '#60A5FA' }}>{b}</span>
                ))}
              </div>
            </div>
            {[
              { title: 'Platform', links: ['AI Research Chat', 'AI Agents', 'Financial Data', 'Excel Plugin', 'MCP Server', 'Pricing'] },
              { title: 'Resources', links: ['Documentation', 'API Reference', 'Security & Compliance', 'System Status', 'Changelog'] },
              { title: 'Company',  links: ['About', 'Careers', 'Blog', 'Contact', 'Privacy Policy', 'Terms of Service'] },
            ].map(col => (
              <div key={col.title}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>{col.title}</div>
                {col.links.map(l => <div key={l} style={{ fontSize: 13, marginBottom: 8, cursor: 'pointer', color: '#94A3B8' }}>{l}</div>)}
              </div>
            ))}
          </div>
          <div style={{ borderTop: '1px solid #1E2D45', paddingTop: 24, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 12 }}>© 2026 Finsyt, Inc. All rights reserved.</span>
            <span style={{ fontSize: 12 }}>SOC 2 Type II | GDPR | CCPA Compliant</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
