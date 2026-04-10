'use client'
import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { useLocale } from '@/lib/i18n/LocaleContext'
import { t } from '@/lib/i18n/translations'

// ── Static feed data ──────────────────────────────────────────────────────────
const LIVE_EARNINGS = [
  { symbol: 'TSLA', name: 'Tesla', color: '#CC0000', ago: 'Now', live: true },
  { symbol: 'MSFT', name: 'Microsoft', color: '#00A4EF', ago: '14m', live: true },
  { symbol: 'NVDA', name: 'NVIDIA', color: '#76B900', ago: '28m', live: true },
  { symbol: 'AMZN', name: 'Amazon', color: '#FF9900', ago: '41m', live: false },
  { symbol: 'META', name: 'Meta', color: '#0866FF', ago: '1h', live: false },
]

const TRANSCRIPT_ITEMS = [
  { symbol: 'TSLA', company: 'Tesla Inc.', quarter: 'Q1 2026', event: 'Earnings Call', mins: 2, sentiment: 'positive', excerpt: '"We expect to return to significant growth this year, with our energy business now contributing meaningfully to margins..."', speaker: 'Elon Musk', role: 'CEO' },
  { symbol: 'MSFT', company: 'Microsoft Corp.', quarter: 'Q3 FY2026', event: 'Earnings Call', mins: 14, sentiment: 'positive', excerpt: '"Azure growth reaccelerated to 35% this quarter, driven by AI workloads. We are seeing broad-based adoption across enterprise..."', speaker: 'Satya Nadella', role: 'CEO' },
  { symbol: 'JPM', company: 'JPMorgan Chase', quarter: 'Q1 2026', event: 'Earnings Call', mins: 28, sentiment: 'neutral', excerpt: '"We remain cautious on the macro outlook. Credit quality is holding but we are watching consumer delinquencies closely..."', speaker: 'Jamie Dimon', role: 'Chairman & CEO' },
  { symbol: 'NVDA', company: 'NVIDIA Corp.', quarter: 'Q4 FY2026', event: 'Analyst Day', mins: 45, sentiment: 'positive', excerpt: '"Blackwell demand continues to exceed supply. We expect data centre revenue to double again in fiscal 2027..."', speaker: 'Jensen Huang', role: 'CEO' },
  { symbol: 'AAPL', company: 'Apple Inc.', quarter: 'Q2 FY2026', event: 'Earnings Call', mins: 61, sentiment: 'neutral', excerpt: '"iPhone cycle is playing out as expected. We see a significant upgrade opportunity ahead tied to Apple Intelligence features..."', speaker: 'Tim Cook', role: 'CEO' },
]

const FILING_ITEMS = [
  { symbol: 'TSLA', company: 'Tesla Inc.', type: '10-Q', title: 'Quarterly Report (Q1 2026)', mins: 5, tag: 'Earnings', pages: 87 },
  { symbol: 'NVDA', company: 'NVIDIA Corp.', type: '8-K', title: 'Material Event — Blackwell B300 Production Update', mins: 18, tag: 'Product', pages: 4 },
  { symbol: 'MSFT', company: 'Microsoft Corp.', type: '10-Q', title: 'Quarterly Report (Q3 FY2026)', mins: 33, tag: 'Earnings', pages: 102 },
  { symbol: 'META', company: 'Meta Platforms', type: 'DEF 14A', title: 'Proxy Statement — Annual Meeting 2026', mins: 52, tag: 'Governance', pages: 64 },
  { symbol: 'AMZN', company: 'Amazon.com Inc.', type: '8-K', title: 'AWS re:Invent 2026 Key Announcements', mins: 71, tag: 'Strategic', pages: 6 },
]

const NEWS_ITEMS = [
  { symbol: 'TSLA', company: 'Tesla', tag: 'Earnings', sentiment: 'bullish', mins: 3, headline: 'Tesla Q1 2026 Earnings: EPS Beats, Energy Margin Expands to Record 25%', body: 'Tesla reported Q1 EPS of $0.72, beating consensus of $0.62. Energy storage deployments hit 10.4 GWh, a quarterly record, with gross margins expanding to 25.4%.' },
  { symbol: 'FED', company: 'Federal Reserve', tag: 'Macro', sentiment: 'neutral', mins: 15, headline: 'Fed Signals Rate Hold Through Mid-2026 as Inflation Stalls at 2.8%', body: 'Fed minutes released Wednesday show policymakers remain in a wait-and-see posture, with June rate cut odds falling to 28% from 41% last week.' },
  { symbol: 'NVDA', company: 'NVIDIA', tag: 'Technology', sentiment: 'bullish', mins: 22, headline: 'NVIDIA Blackwell B300 Shipments Ahead of Schedule, Sources Say', body: 'Supply chain checks indicate NVIDIA has resolved CoWoS-L packaging bottlenecks. Analysts expect Blackwell to contribute >70% of data centre revenue by Q3.' },
  { symbol: 'MSFT', company: 'Microsoft', tag: 'AI', sentiment: 'bullish', mins: 38, headline: 'Microsoft Azure OpenAI Revenue Run Rate Crosses $10bn Annualised', body: 'Microsoft Azure AI services are now on a $10bn+ annualised run rate, according to analyst estimates following this week\'s Q3 FY2026 earnings call.' },
  { symbol: 'GS', company: 'Goldman Sachs', tag: 'Research', sentiment: 'neutral', mins: 55, headline: 'Goldman Raises S&P 500 Target to 6,500, Cites Earnings Resilience', body: 'Goldman Sachs equity strategists raise their 12-month S&P 500 price target to 6,500 from 6,200, citing better-than-expected Q1 earnings growth of 12% YoY.' },
]

const SUGGESTED_PROMPTS = [
  { icon: '📋', label: 'Tesla Q1 earnings call — key analyst questions and management tone' },
  { icon: '📄', label: 'Summarise NVIDIA latest 10-Q: revenue mix, risk factors, capex guidance' },
  { icon: '📰', label: 'Top macro stories this week and impact on rate-sensitive equities' },
  { icon: '🔍', label: 'Compare Microsoft and Google AI revenue commentary from latest transcripts' },
  { icon: '⚠️', label: 'Flag any new risk disclosures in recent Big Tech 8-K filings' },
]

// ── Agent response simulation ────────────────────────────────────────────────
const AGENT_STEPS = [
  { label: 'Identifying relevant sources', ms: 600 },
  { label: 'Searching earnings transcripts & filings', ms: 1400 },
  { label: 'Extracting key passages', ms: 2200 },
  { label: 'Synthesising insights', ms: 3000 },
]

const DEMO_RESPONSE = `**Tesla Q1 2026 Earnings Call — Key Analyst Highlights**

Management delivered a broadly positive tone, with particular emphasis on energy storage margin expansion and the robotaxi timeline.

**Top analyst questions:**

1. *Morgan Stanley (Adam Jonas)*: "Can you walk us through the sustainability of the 25% energy margin?" — Musk confirmed the margin profile reflects structural cost reductions at Megapack, not one-time items.[¹]

2. *Goldman Sachs (Mark Delaney)*: "When do you expect Cybercab volume production to begin?" — Management guided to "late 2026" with initial deliveries in Austin and San Francisco.[²]

3. *JP Morgan (Ryan Brinkman)*: "How should we think about automotive margin recovery through the year?" — CFO Vaibhav Taneja noted 18.2% gross margin in Q1, guiding toward 19–20% by Q4 on volume leverage.[³]

**Tone assessment:** More optimistic than Q4 2025 — management used forward-looking language more freely and avoided the cautious hedging seen in prior calls.`

// ── Colour helpers ─────────────────────────────────────────────────────────
const COMPANY_COLORS: Record<string, string> = {
  TSLA: '#CC0000', MSFT: '#00A4EF', NVDA: '#76B900', AAPL: '#555', META: '#0866FF',
  AMZN: '#FF9900', JPM: '#003087', GS: '#6DB33F', FED: '#1B4FFF',
}
function companyBg(sym: string) { return COMPANY_COLORS[sym] ?? '#1B4FFF' }
function sentimentBadge(s: string) {
  if (s === 'bullish' || s === 'positive') return { bg: '#ECFDF5', color: '#059669', label: s === 'bullish' ? 'Bullish' : 'Positive' }
  if (s === 'bearish' || s === 'negative') return { bg: '#FEF2F2', color: '#DC2626', label: s === 'bearish' ? 'Bearish' : 'Negative' }
  return { bg: '#F5F7FB', color: '#7D8FA9', label: 'Neutral' }
}

// ── Mini avatar ──────────────────────────────────────────────────────────────
function Avatar({ sym, size = 32 }: { sym: string; size?: number }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.28, flexShrink: 0,
      background: companyBg(sym), display: 'flex', alignItems: 'center',
      justifyContent: 'center', color: '#fff', fontWeight: 800,
      fontSize: size * 0.38, letterSpacing: '-0.02em',
    }}>{sym[0]}</div>
  )
}

// ── Rendered markdown-ish response ─────────────────────────────────────────
function AgentResponse({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <div style={{ fontSize: 14, lineHeight: 1.7, color: '#1C2B4A' }}>
      {lines.map((line, i) => {
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} style={{ fontWeight: 800, fontSize: 15, marginTop: i > 0 ? 16 : 0, marginBottom: 4 }}>{line.replace(/\*\*/g, '')}</p>
        }
        if (line.startsWith('*') && line.endsWith('*')) {
          return <p key={i} style={{ fontStyle: 'italic', color: '#3D4F6E', marginBottom: 2 }}>{line.replace(/\*/g, '')}</p>
        }
        if (line.match(/^\d\./)) {
          const parts = line.split('*')
          return (
            <p key={i} style={{ marginBottom: 8, paddingLeft: 16 }}>
              {parts.map((p, j) => j % 2 === 1 ? <em key={j}>{p}</em> : p)}
            </p>
          )
        }
        if (!line.trim()) return <div key={i} style={{ height: 6 }} />
        // inline citations [¹] [²] [³]
        const cited = line.replace(/\[([¹²³⁴⁵])\]/g, (_, n) => `<cite>${n}</cite>`)
        return <p key={i} style={{ marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: cited.replace(/<cite>(.*?)<\/cite>/g, '<sup style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;border-radius:3px;font-size:9px;font-weight:800;background:#EEF3FF;color:#1B4FFF;border:1px solid #C7D7FF;margin-left:1px;cursor:pointer">$1</sup>') }} />
      })}
    </div>
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AppOverview() {
  const { locale } = useLocale()
  const tr = (key: string) => t(locale, key)

  const [activeTab, setActiveTab] = useState<'news' | 'transcripts' | 'filings'>('news')
  const [query, setQuery] = useState('')
  const [agentState, setAgentState] = useState<'idle' | 'thinking' | 'done'>('idle')
  const [currentStep, setCurrentStep] = useState(0)
  const [response, setResponse] = useState('')
  const [hoveredItem, setHoveredItem] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const hour = new Date().getHours()
  const greeting = hour < 12 ? tr('good_morning') : hour < 17 ? tr('good_afternoon') : tr('good_evening')

  function runAgent(q: string) {
    if (!q.trim()) return
    setAgentState('thinking')
    setCurrentStep(0)
    setResponse('')
    AGENT_STEPS.forEach((step, i) => {
      setTimeout(() => setCurrentStep(i), step.ms)
    })
    setTimeout(() => {
      setAgentState('done')
      setResponse(DEMO_RESPONSE)
    }, 3400)
  }

  const TABS = [
    { key: 'news', label: tr('news_tab') },
    { key: 'transcripts', label: tr('transcripts') },
    { key: 'filings', label: tr('filings_tab') },
  ] as const

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 60px)', background: '#F7F9FC' }}>
      {/* ── LEFT COLUMN ── */}
      <div style={{ flex: 1, minWidth: 0, padding: '1.5rem 1.25rem 1.5rem 1.5rem', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Greeting + Live strip */}
        <div>
          <p style={{ fontSize: 12, fontWeight: 600, color: '#93B4B8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{tr('home_subtitle')}</p>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0A1628', letterSpacing: '-0.03em', marginBottom: 16 }}>{greeting} 👋</h1>

          {/* Live earnings strip — Quartr style */}
          <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, padding: '12px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#DC2626' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#DC2626', display: 'inline-block', animation: 'pulse 1.4s infinite' }} />
                {tr('earnings_live').toUpperCase()}
              </span>
              <span style={{ fontSize: 11, color: '#B0BCD0' }}>· {LIVE_EARNINGS.length} {tr('companies')}</span>
            </div>
            <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 2 }}>
              {LIVE_EARNINGS.map(e => (
                <div key={e.symbol} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
                  <div style={{ position: 'relative' }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: '50%',
                      border: `2px solid ${e.live ? '#DC2626' : '#E8EDF4'}`,
                      padding: 2,
                    }}>
                      <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: e.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 12 }}>{e.symbol[0]}</div>
                    </div>
                    {e.live && <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: '#DC2626', border: '2px solid #fff' }} />}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#0A1628' }}>{e.symbol}</span>
                  <span style={{ fontSize: 10, color: e.live ? '#DC2626' : '#B0BCD0', fontWeight: 600 }}>{e.live ? tr('live') : e.ago}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Agent query bar */}
        <div style={{ background: '#fff', border: '1.5px solid #E8EDF4', borderRadius: 14, overflow: 'hidden', boxShadow: agentState !== 'idle' ? '0 0 0 3px rgba(27,79,255,0.08)' : 'none', transition: 'box-shadow 0.2s' }}>
          <div style={{ display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10, borderBottom: agentState !== 'idle' ? '1px solid #F0F4FA' : 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B4FFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && runAgent(query)}
              placeholder={tr('ask_placeholder')}
              style={{ flex: 1, border: 'none', outline: 'none', padding: '14px 0', fontSize: 14, color: '#0A1628', background: 'transparent', fontFamily: 'inherit' }}
            />
            {query && (
              <button onClick={() => runAgent(query)} style={{
                background: '#1B4FFF', color: '#fff', border: 'none', borderRadius: 8,
                padding: '6px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
              }}>{tr('run_analysis')}</button>
            )}
          </div>

          {/* Agent thinking state */}
          {agentState === 'thinking' && (
            <div style={{ padding: '16px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>F</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1B4FFF' }}>Finsyt Agent</span>
              </div>
              {AGENT_STEPS.map((step, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8, opacity: i <= currentStep ? 1 : 0.3, transition: 'opacity 0.3s' }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                    background: i < currentStep ? '#059669' : i === currentStep ? '#1B4FFF' : '#E8EDF4',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {i < currentStep
                      ? <svg width="9" height="9" viewBox="0 0 12 12" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="2 6 5 9 10 3"/></svg>
                      : i === currentStep
                        ? <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff', animation: 'pulse 1s infinite' }} />
                        : null}
                  </div>
                  <span style={{ fontSize: 12, color: i <= currentStep ? '#1C2B4A' : '#B0BCD0', fontWeight: i === currentStep ? 600 : 400 }}>{step.label}</span>
                </div>
              ))}
            </div>
          )}

          {/* Agent response */}
          {agentState === 'done' && (
            <div style={{ padding: '16px 20px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'linear-gradient(135deg,#1B4FFF,#0D9FE8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ color: '#fff', fontSize: 10, fontWeight: 900 }}>F</span>
                </div>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#1B4FFF' }}>Finsyt Agent</span>
                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B0BCD0' }}>3 {tr('sources_found')}</span>
                <button onClick={() => { setAgentState('idle'); setQuery('') }} style={{ fontSize: 11, color: '#7D8FA9', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 8px', borderRadius: 6, fontFamily: 'inherit' }}>✕</button>
              </div>
              <AgentResponse text={response} />
              <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                <Link href="/app/research" style={{ fontSize: 12, color: '#1B4FFF', fontWeight: 600, textDecoration: 'none', padding: '5px 12px', background: '#EEF3FF', borderRadius: 7 }}>Open in Research →</Link>
                <button style={{ fontSize: 12, color: '#7D8FA9', fontWeight: 600, background: '#F5F7FB', border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 7, fontFamily: 'inherit' }}>Export</button>
              </div>
            </div>
          )}

          {/* Suggested prompts (idle only) */}
          {agentState === 'idle' && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 14px', flexWrap: 'wrap', borderTop: '1px solid #F5F7FB' }}>
              {SUGGESTED_PROMPTS.slice(0, 3).map((p, i) => (
                <button key={i} onClick={() => { setQuery(p.label); setTimeout(() => runAgent(p.label), 50) }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 11px', background: '#F5F7FB', border: '1px solid #E8EDF4', borderRadius: 999, fontSize: 12, color: '#3D4F6E', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.12s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => { e.currentTarget.style.background = '#EEF3FF'; e.currentTarget.style.borderColor = '#C7D7FF'; e.currentTarget.style.color = '#1B4FFF' }}
                  onMouseLeave={e => { e.currentTarget.style.background = '#F5F7FB'; e.currentTarget.style.borderColor = '#E8EDF4'; e.currentTarget.style.color = '#3D4F6E' }}
                >
                  <span>{p.icon}</span><span>{p.label.length > 42 ? p.label.slice(0, 42) + '…' : p.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Feed tabs */}
        <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 14, overflow: 'hidden', flex: 1 }}>
          {/* Tab bar */}
          <div style={{ display: 'flex', borderBottom: '1px solid #E8EDF4', padding: '0 16px' }}>
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  padding: '12px 14px', fontSize: 13, fontWeight: 600, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit',
                  color: activeTab === tab.key ? '#0A1628' : '#7D8FA9',
                  borderBottom: `2px solid ${activeTab === tab.key ? '#1B4FFF' : 'transparent'}`,
                  marginBottom: -1, transition: 'all 0.12s',
                }}>{tab.label}</button>
            ))}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
              <Link href="/app/news" style={{ fontSize: 12, color: '#7D8FA9', textDecoration: 'none', padding: '4px 8px' }}>{tr('view_all')} →</Link>
            </div>
          </div>

          {/* News feed */}
          {activeTab === 'news' && NEWS_ITEMS.map((item, i) => {
            const { bg, color, label } = sentimentBadge(item.sentiment)
            return (
              <div key={i}
                onMouseEnter={() => setHoveredItem(i)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{ padding: '14px 18px', borderBottom: i < NEWS_ITEMS.length - 1 ? '1px solid #F5F7FB' : 'none', cursor: 'pointer', background: hoveredItem === i ? '#FAFBFD' : '#fff', transition: 'background 0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <Avatar sym={item.symbol} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0A1628' }}>{item.company}</span>
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: '#F0F4FA', color: '#7D8FA9', fontWeight: 600 }}>{item.tag}</span>
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: bg, color, fontWeight: 700 }}>{label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B0BCD0' }}>{item.mins}m ago</span>
                    </div>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', lineHeight: 1.4, marginBottom: 4 }}>{item.headline}</p>
                    <p style={{ fontSize: 12, color: '#7D8FA9', lineHeight: 1.5 }}>{item.body}</p>
                    {hoveredItem === i && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={() => { setQuery(`Analyse: ${item.headline}`); runAgent(`Analyse: ${item.headline}`) }} style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: '#EEF3FF', color: '#1B4FFF', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('ask_ai')}</button>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: '#F5F7FB', color: '#7D8FA9', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('save')}</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Transcripts feed */}
          {activeTab === 'transcripts' && TRANSCRIPT_ITEMS.map((item, i) => {
            const { bg, color, label } = sentimentBadge(item.sentiment)
            return (
              <div key={i}
                onMouseEnter={() => setHoveredItem(100 + i)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{ padding: '14px 18px', borderBottom: i < TRANSCRIPT_ITEMS.length - 1 ? '1px solid #F5F7FB' : 'none', cursor: 'pointer', background: hoveredItem === 100 + i ? '#FAFBFD' : '#fff', transition: 'background 0.1s' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                  <Avatar sym={item.symbol} size={34} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#0A1628' }}>{item.company}</span>
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: '#F0F4FA', color: '#7D8FA9', fontWeight: 600 }}>{item.quarter} · {item.event}</span>
                      <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: bg, color, fontWeight: 700 }}>{label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B0BCD0' }}>{item.mins}m ago</span>
                    </div>
                    {/* Speaker */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#E8EDF4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#7D8FA9' }}>{item.speaker[0]}</div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#3D4F6E' }}>{item.speaker}</span>
                      <span style={{ fontSize: 11, color: '#B0BCD0' }}>· {item.role}</span>
                    </div>
                    {/* Excerpt — ProntoNLP style */}
                    <p style={{ fontSize: 12.5, color: '#1C2B4A', lineHeight: 1.55, fontStyle: 'italic', borderLeft: '2px solid #E8EDF4', paddingLeft: 10 }}>{item.excerpt}</p>
                    {hoveredItem === 100 + i && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button onClick={() => { setQuery(`Summarise ${item.company} ${item.quarter} ${item.event}`); runAgent(`Summarise ${item.company} ${item.quarter} ${item.event}`) }}
                          style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: '#EEF3FF', color: '#1B4FFF', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('ask_ai')}</button>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: '#F5F7FB', color: '#7D8FA9', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('highlight')}</button>
                        <button style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: '#F5F7FB', color: '#7D8FA9', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('save')}</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}

          {/* Filings feed */}
          {activeTab === 'filings' && FILING_ITEMS.map((item, i) => (
            <div key={i}
              onMouseEnter={() => setHoveredItem(200 + i)}
              onMouseLeave={() => setHoveredItem(null)}
              style={{ padding: '14px 18px', borderBottom: i < FILING_ITEMS.length - 1 ? '1px solid #F5F7FB' : 'none', cursor: 'pointer', background: hoveredItem === 200 + i ? '#FAFBFD' : '#fff', transition: 'background 0.1s' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <Avatar sym={item.symbol} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#0A1628' }}>{item.company}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: '#EEF3FF', color: '#1B4FFF', fontWeight: 700 }}>{item.type}</span>
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 999, background: '#F0F4FA', color: '#7D8FA9', fontWeight: 600 }}>{item.tag}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 11, color: '#B0BCD0' }}>{item.mins}m ago</span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0A1628', lineHeight: 1.4, marginBottom: 4 }}>{item.title}</p>
                  <p style={{ fontSize: 11, color: '#B0BCD0' }}>{item.pages} pages</p>
                  {hoveredItem === 200 + i && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                      <button onClick={() => { setQuery(`Summarise ${item.company} ${item.type}: ${item.title}`); runAgent(`Summarise ${item.company} ${item.type}: ${item.title}`) }}
                        style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: '#EEF3FF', color: '#1B4FFF', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('ask_ai')}</button>
                      <button style={{ fontSize: 11, fontWeight: 600, padding: '3px 10px', background: '#F5F7FB', color: '#7D8FA9', border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: 'inherit' }}>{tr('open_source')}</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── RIGHT COLUMN ── */}
      <div style={{ width: 280, flexShrink: 0, padding: '1.5rem 1.5rem 1.5rem 0', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* More suggested prompts */}
        <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #F5F7FB', fontSize: 12, fontWeight: 700, color: '#0A1628' }}>{tr('suggested_prompts')}</div>
          {SUGGESTED_PROMPTS.map((p, i) => (
            <button key={i} onClick={() => { setQuery(p.label); runAgent(p.label) }}
              style={{ display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '10px 14px', borderBottom: i < SUGGESTED_PROMPTS.length - 1 ? '1px solid #F5F7FB' : 'none', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', transition: 'background 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.background = '#FAFBFD')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <span style={{ fontSize: 14, flexShrink: 0, marginTop: 1 }}>{p.icon}</span>
              <span style={{ fontSize: 12, color: '#3D4F6E', lineHeight: 1.45 }}>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Quick nav cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[
            { href: '/app/research', icon: '◎', label: tr('ai_research'), desc: 'Deep research with citations', color: '#1B4FFF' },
            { href: '/app/filings', icon: '📄', label: tr('filings'), desc: 'SEC, Companies House & more', color: '#059669' },
            { href: '/app/screener', icon: '▤', label: tr('screener'), desc: 'Filter by any metric', color: '#D97706' },
          ].map(c => (
            <Link key={c.href} href={c.href} style={{ textDecoration: 'none' }}>
              <div style={{ background: '#fff', border: '1px solid #E8EDF4', borderRadius: 10, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', transition: 'all 0.12s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = c.color; (e.currentTarget as HTMLDivElement).style.boxShadow = `0 0 0 2px ${c.color}18` }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = '#E8EDF4'; (e.currentTarget as HTMLDivElement).style.boxShadow = 'none' }}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${c.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>{c.icon}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0A1628' }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: '#B0BCD0' }}>{c.desc}</div>
                </div>
                <svg style={{ marginLeft: 'auto', color: '#B0BCD0', flexShrink: 0 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
      `}</style>
    </div>
  )
}
