'use client'
import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, RadialBarChart, RadialBar, PieChart, Pie, Cell, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import Link from 'next/link'
import { useParams } from 'next/navigation'

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'overview'|'financials'|'segments'|'estimates'|'transcripts'|'filings'|'comparisons'|'dcf'

// ── Mock data helpers ─────────────────────────────────────────────────────────
const COMPANY_PROFILES: Record<string, any> = {
  NVDA: {
    name:'NVIDIA Corporation', exchange:'NASDAQ', country:'US', sector:'Technology', industry:'Semiconductors',
    price:924.80, change:23.45, changePct:2.60, marketCap:2270, peRatio:42.3, psRatio:25.4, evEbitda:38.1,
    revenue:39.3, revenueGrowth:73.4, grossMargin:75.9, netMargin:49.1, fcfMargin:39.4,
    eps:0.78, epsGrowth:82.0, nextEarnings:'May 28, 2026',
    logo:'N', color:'#76B900',
    aiSummary: "NVIDIA delivered record Q4 FY2026 revenue of $39.3B (+73% YoY), driven by explosive Data Center demand for Blackwell GPUs. Gross margin expanded to 75.9% (+380bps) as Blackwell mix shift improved. Management guided Q1 FY2027 to ~$43B, above consensus of $41.5B. The Blackwell architecture is supply-constrained through mid-2026; Jensen Huang cited $3-4T annual AI infrastructure spend by 2030. Key risks: US-China export controls on H20, customer concentration, and AMD MI300X share gains.",
    aiSignal: 'Bullish',
    analysts: { buy:42, hold:7, sell:1, avgPT:1050, highPT:1300, lowPT:700, currentPT:924.80 },
    segments: [
      { name:'Data Center',    q4:35820, q3:30770, q2:26300, q1:22600, yoy:94, color:'#1B4FFF' },
      { name:'Gaming',         q4:2480,  q3:3279,  q2:2880,  q1:2647,  yoy:-7, color:'#059669' },
      { name:'Professional Viz',q4:511,  q3:486,   q2:454,   q1:427,   yoy:17, color:'#D97706' },
      { name:'Automotive',     q4:448,   q3:449,   q2:346,   q1:329,   yoy:60, color:'#8B5CF6' },
      { name:'OEM & Other',    q4:39,    q3:44,    q2:88,    q1:46,    yoy:-8, color:'#B0BCD0' },
    ],
    kpis: [
      { label:'H100/H200 GPUs shipped (Q4)', value:'~1M units', delta:'+65% QoQ', source:'Mgmt commentary' },
      { label:'Blackwell revenue (Q4)',       value:'$11B+',     delta:'First full quarter', source:'10-K' },
      { label:'Data Center % of revenue',    value:'91.1%',     delta:'+8pp YoY', source:'10-K' },
      { label:'Backlog / deferred revenue',  value:'$3.2B',     delta:'New disclosure', source:'10-K' },
      { label:'NVLink + Networking revenue', value:'~$5B',      delta:'Est. +120% YoY', source:'Analysts' },
      { label:'CUDA developer ecosystem',    value:'6M+',       delta:'+50% YoY', source:'Mgmt commentary' },
      { label:'ROE',                         value:'128.3%',    delta:'+34pp YoY', source:'FMP' },
      { label:'Net cash',                    value:'$17.5B',    delta:'+$4.2B QoQ', source:'FMP' },
    ],
  },
  AAPL: {
    name:'Apple Inc.', exchange:'NASDAQ', country:'US', sector:'Technology', industry:'Consumer Electronics',
    price:192.35, change:-1.20, changePct:-0.62, marketCap:2940, peRatio:29.4, psRatio:7.8, evEbitda:22.1,
    revenue:124.3, revenueGrowth:4.0, grossMargin:47.4, netMargin:26.4, fcfMargin:25.8,
    eps:2.40, epsGrowth:7.2, nextEarnings:'May 1, 2026',
    logo:'A', color:'#6D6D6D',
    aiSummary: "Apple reported Q1 FY2026 revenue of $124.3B (+4% YoY), in-line with expectations. Services continues to outperform (+15% YoY to $26.3B), now representing 21% of revenue and carrying 74% gross margins. iPhone revenue was flat as the iPhone 17 cycle showed modest unit growth in China. Apple Intelligence features drove meaningful upgrades in the Americas and Europe. Management did not provide formal Q2 guidance but implied low-single-digit growth. Buyback pace remained aggressive at ~$25B per quarter.",
    aiSignal: 'Neutral',
    analysts: { buy:28, hold:15, sell:2, avgPT:225, highPT:275, lowPT:150, currentPT:192.35 },
    segments:[
      { name:'iPhone',      q4:69800, q3:45963, q2:48482, q1:51334, yoy:1,  color:'#1B4FFF' },
      { name:'Services',    q4:26337, q3:24213, q2:23117, q1:21213, yoy:15, color:'#059669' },
      { name:'Mac',         q4:7941,  q3:7994,  q2:7028,  q1:6840,  yoy:5,  color:'#D97706' },
      { name:'iPad',        q4:8087,  q3:6950,  q2:5593,  q1:7023,  yoy:15, color:'#8B5CF6' },
      { name:'Wearables',   q4:12265, q3:9032,  q2:8099,  q1:8757,  yoy:-3, color:'#B0BCD0' },
    ],
    kpis:[
      { label:'Services gross margin', value:'74.2%', delta:'+2.1pp YoY', source:'10-Q' },
      { label:'Active installed base', value:'2.3B+', delta:'New record', source:'Mgmt commentary' },
      { label:'iPhone 17 mix (Pro%)',  value:'52%',   delta:'+4pp YoY', source:'Analysts' },
      { label:'China revenue',        value:'$18.5B', delta:'-5% YoY', source:'10-Q' },
      { label:'Buybacks (Q4)',        value:'$25.1B', delta:'Steady pace', source:'10-Q' },
      { label:'Cash & investments',   value:'$141B',  delta:'+$8B QoQ', source:'FMP' },
    ],
  },
  MSFT: {
    name:'Microsoft Corporation', exchange:'NASDAQ', country:'US', sector:'Technology', industry:'Software',
    price:378.80, change:4.15, changePct:1.11, marketCap:2812, peRatio:30.2, psRatio:12.4, evEbitda:24.8,
    revenue:69.6, revenueGrowth:13.3, grossMargin:69.4, netMargin:37.2, fcfMargin:33.1,
    eps:3.23, epsGrowth:18.0, nextEarnings:'Apr 30, 2026',
    logo:'M', color:'#00A4EF',
    aiSummary:"Microsoft Q3 FY2026 revenue of $70.6B (+13% YoY) beat consensus by $2.1B, driven by Azure growth of +35% CC — re-accelerating from 31% last quarter. Copilot M365 paid seat additions are ramping, now at 50M+ seats. Operating margin expanded to 46.4% (+220bps). Management signalled Azure will continue to re-accelerate through FY2027 as new data centre capacity comes online. OpenAI equity stake is marked at significant gain. Capital intensity remains elevated at ~$17B/quarter for AI infrastructure.",
    aiSignal: 'Bullish',
    analysts:{ buy:50, hold:5, sell:0, avgPT:480, highPT:575, lowPT:370, currentPT:378.80 },
    segments:[
      { name:'Intelligent Cloud',    q4:31800, q3:30000, q2:28000, q1:26000, yoy:21, color:'#1B4FFF' },
      { name:'Productivity & Biz',   q4:29900, q3:28000, q2:27000, q1:25900, yoy:11, color:'#059669' },
      { name:'More Personal Computing',q4:13400,q3:14000,q2:14000,q1:14000, yoy:-1, color:'#D97706' },
    ],
    kpis:[
      { label:'Azure growth (CC)',    value:'+35%',  delta:'+4pp re-acceleration', source:'10-Q' },
      { label:'M365 Copilot seats',   value:'50M+',  delta:'New record', source:'Mgmt commentary' },
      { label:'AI revenue run rate',  value:'$13B+', delta:'Annualised', source:'Mgmt commentary' },
      { label:'CapEx (Q3)',           value:'$17.3B',delta:'+62% YoY', source:'10-Q' },
      { label:'Operating margin',     value:'46.4%', delta:'+220bps YoY', source:'FMP' },
    ],
  },
}

const DEFAULT_PROFILE = {
  name:'Company', exchange:'NYSE', country:'US', sector:'—', industry:'—',
  price:100, change:0, changePct:0, marketCap:10, peRatio:20, psRatio:5, evEbitda:15,
  revenue:5, revenueGrowth:10, grossMargin:50, netMargin:20, fcfMargin:15,
  eps:1.0, epsGrowth:10, nextEarnings:'—',
  logo:'?', color:'#1B4FFF',
  aiSummary:'AI summary loading…',
  aiSignal:'Neutral' as const,
  analysts:{ buy:10, hold:5, sell:2, avgPT:110, highPT:130, lowPT:85, currentPT:100 },
  segments:[], kpis:[],
}

// Mock historical price
function mockPrice(base:number, n=52) {
  const d=[]; let v=base*0.65
  for(let i=0;i<n;i++){
    v=v*(1+(Math.random()-0.44)*0.04)
    d.push({ t:`W${i+1}`, v:Math.round(v*100)/100 })
  }
  d[d.length-1].v=base
  return d
}

// Mock quarterly financials
function mockFinancials(rev:number, gm:number, nm:number) {
  return Array.from({length:8},(_,i)=>{
    const q = i%4+1; const yr = 2024+Math.floor(i/4)
    const r = rev*(0.55+i*0.065)
    return {
      label:`Q${q}'${String(yr).slice(2)}`,
      revenue:Math.round(r*10)/10,
      grossProfit:Math.round(r*(gm/100)*10)/10,
      netIncome:Math.round(r*(nm/100)*10)/10,
      eps:Math.round(r*(nm/100)*0.02*100)/100,
      fcf:Math.round(r*(nm/100)*0.75*10)/10,
    }
  })
}

// ── Metric chip ───────────────────────────────────────────────────────────────
function MetricChip({ label, value, sub, bold, green, red }: { label:string;value:string;sub?:string;bold?:boolean;green?:boolean;red?:boolean }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
      <span style={{ fontSize:10, color:'#7D8FA9', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
      <span style={{ fontSize:bold?15:14, fontWeight:bold?800:700, color:green?'#059669':red?'#DC2626':'#0A1628', letterSpacing:'-0.01em' }}>{value}</span>
      {sub && <span style={{ fontSize:10, color:green?'#059669':red?'#DC2626':'#B0BCD0', fontWeight:600 }}>{sub}</span>}
    </div>
  )
}

// ── AI signal badge ───────────────────────────────────────────────────────────
function SignalBadge({ signal }: { signal: string }) {
  const c: Record<string,string> = { Bullish:'#059669', Neutral:'#D97706', Bearish:'#DC2626' }
  const bg: Record<string,string> = { Bullish:'#ECFDF5', Neutral:'#FFFBEB', Bearish:'#FEF2F2' }
  return <span style={{ fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:999, background:bg[signal]||'#F0F4FA', color:c[signal]||'#7D8FA9', border:`1px solid ${c[signal]||'#E8EDF4'}30` }}>▲ {signal}</span>
}

// ── Analyst bar ───────────────────────────────────────────────────────────────
function AnalystBar({ buy,hold,sell }: {buy:number;hold:number;sell:number}) {
  const total = buy+hold+sell
  return (
    <div>
      <div style={{ display:'flex', borderRadius:6, overflow:'hidden', height:8, marginBottom:6 }}>
        <div style={{ flex:buy/total, background:'#059669' }} />
        <div style={{ flex:hold/total, background:'#D97706' }} />
        <div style={{ flex:sell/total, background:'#DC2626' }} />
      </div>
      <div style={{ display:'flex', gap:14 }}>
        {[{l:'Buy',n:buy,c:'#059669'},{l:'Hold',n:hold,c:'#D97706'},{l:'Sell',n:sell,c:'#DC2626'}].map(x=>(
          <div key={x.l} style={{ display:'flex', alignItems:'center', gap:4 }}>
            <div style={{ width:7, height:7, borderRadius:'50%', background:x.c }} />
            <span style={{ fontSize:11, color:'#7D8FA9' }}>{x.l}</span>
            <span style={{ fontSize:11, fontWeight:700, color:'#0A1628' }}>{x.n}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CompanyPage() {
  const params = useParams()
  const rawSym = (params.symbol as string || 'NVDA').toUpperCase()
  // Handle NasdaqGS-NVDA style from fiscal.ai
  const symbol = rawSym.includes('-') ? rawSym.split('-').pop()! : rawSym

  const profile = COMPANY_PROFILES[symbol] || { ...DEFAULT_PROFILE, name: symbol }
  const [tab, setTab]         = useState<Tab>('overview')
  const [period, setPeriod]   = useState<'quarterly'|'annual'>('quarterly')
  const [chartRange, setChartRange] = useState<'1M'|'3M'|'6M'|'1Y'|'3Y'>('1Y')
  const [priceData]           = useState(() => mockPrice(profile.price))
  const [financials]          = useState(() => mockFinancials(profile.revenue, profile.grossMargin, profile.netMargin))
  const [searchInput, setSearchInput] = useState(symbol)
  const [copilotOpen, setCopilotOpen] = useState(false)
  const [copilotQ, setCopilotQ] = useState('')
  const [copilotAns, setCopilotAns] = useState('')
  const [copilotLoading, setCopilotLoading] = useState(false)

  const priceUp = profile.changePct >= 0

  async function askCopilot() {
    if (!copilotQ.trim()) return
    setCopilotLoading(true)
    try {
      const res = await fetch('/api/ai-research', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ query: `${copilotQ} (context: ${symbol} — ${profile.name})`, symbol }),
      })
      const d = await res.json()
      setCopilotAns(d.bullets ? d.bullets.join('\n\n') : d.content || 'No answer.')
    } catch { setCopilotAns('AI service temporarily unavailable. Please retry.') }
    setCopilotLoading(false)
  }

  const TABS: {id:Tab;label:string}[] = [
    {id:'overview',     label:'Overview'},
    {id:'financials',   label:'Financials'},
    {id:'segments',     label:'Segments & KPIs'},
    {id:'estimates',    label:'Estimates'},
    {id:'transcripts',  label:'Transcripts'},
    {id:'filings',      label:'Filings'},
    {id:'comparisons',  label:'Comparisons'},
    {id:'dcf',          label:'DCF Model'},
  ]

  const SUGGEST_COMPANIES = ['NVDA','AAPL','MSFT','GOOGL','META','AMZN','TSLA','AMD','INTC','TSM']

  return (
    <div style={{ background:'#F7F9FC', minHeight:'calc(100vh - 60px)' }}>
      {/* ── HEADER STRIP ── */}
      <div style={{ background:'#0A1628', padding:'0 24px' }}>
        <div style={{ maxWidth:1200, margin:'0 auto' }}>
          {/* Search bar */}
          <div style={{ padding:'12px 0 8px', display:'flex', alignItems:'center', gap:10 }}>
            <form onSubmit={e=>{e.preventDefault(); window.location.href=`/app/company/${searchInput.toUpperCase()}`}} style={{ display:'flex', alignItems:'center', gap:8, flex:1 }}>
              <div style={{ position:'relative', maxWidth:320 }}>
                <svg style={{ position:'absolute', left:10, top:'50%', transform:'translateY(-50%)' }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4B6080" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                <input value={searchInput} onChange={e=>setSearchInput(e.target.value)} placeholder="Search ticker or company…" style={{ width:'100%', padding:'7px 12px 7px 30px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:8, fontSize:13, color:'#fff', fontFamily:'inherit', outline:'none', boxSizing:'border-box' }} />
              </div>
            </form>
            <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
              {SUGGEST_COMPANIES.map(s=>(
                <Link key={s} href={`/app/company/${s}`} style={{ padding:'4px 10px', borderRadius:6, background:s===symbol?'rgba(27,79,255,0.3)':'rgba(255,255,255,0.06)', border:`1px solid ${s===symbol?'rgba(27,79,255,0.6)':'rgba(255,255,255,0.08)'}`, fontSize:11, fontWeight:700, color:s===symbol?'#93B4FF':'rgba(255,255,255,0.5)', textDecoration:'none', transition:'all 0.12s' }}>
                  {s}
                </Link>
              ))}
            </div>
          </div>

          {/* Company hero */}
          <div style={{ padding:'8px 0 0' }}>
            <div style={{ display:'flex', alignItems:'flex-start', gap:16, paddingBottom:20 }}>
              {/* Logo */}
              <div style={{ width:48, height:48, borderRadius:12, background:profile.color+'22', border:`2px solid ${profile.color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:900, color:profile.color, flexShrink:0 }}>
                {profile.logo}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:4 }}>
                  <h1 style={{ fontSize:'1.25rem', fontWeight:900, color:'#fff', letterSpacing:'-0.025em' }}>{profile.name}</h1>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)', background:'rgba(255,255,255,0.06)', padding:'2px 8px', borderRadius:5 }}>{symbol}</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{profile.exchange} · {profile.sector}</span>
                  <SignalBadge signal={profile.aiSignal} />
                </div>
                <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
                  <span style={{ fontSize:'1.75rem', fontWeight:900, color:'#fff', letterSpacing:'-0.04em' }}>${profile.price.toFixed(2)}</span>
                  <span style={{ fontSize:14, fontWeight:700, color:priceUp?'#10B981':'#EF4444' }}>{priceUp?'▲':'▼'} {Math.abs(profile.changePct).toFixed(2)}% ({priceUp?'+':''}{profile.change.toFixed(2)})</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>Apr 10, 2026 Close</span>
                </div>
              </div>

              {/* Key metrics row */}
              <div style={{ display:'flex', gap:20, marginLeft:'auto', flexShrink:0 }}>
                {[
                  { l:'Mkt Cap',    v:`$${profile.marketCap}B` },
                  { l:'P/E (NTM)',  v:`${profile.peRatio}x` },
                  { l:'EV/EBITDA',  v:`${profile.evEbitda}x` },
                  { l:'P/S',        v:`${profile.psRatio}x` },
                  { l:'Revenue',    v:`$${profile.revenue}B`, s:`+${profile.revenueGrowth}% YoY` },
                  { l:'Gross Margin',v:`${profile.grossMargin}%` },
                  { l:'Next Earnings',v:profile.nextEarnings },
                ].map(m=>(
                  <div key={m.l} style={{ textAlign:'right' }}>
                    <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>{m.l}</div>
                    <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{m.v}</div>
                    {m.s && <div style={{ fontSize:10, color:'#10B981', fontWeight:600 }}>{m.s}</div>}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Tab navigation */}
          <div style={{ display:'flex', gap:0, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
            {TABS.map(t=>(
              <button key={t.id} onClick={()=>setTab(t.id)} style={{ padding:'10px 16px', background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', fontSize:13, fontWeight:600, color:tab===t.id?'#fff':'rgba(255,255,255,0.4)', borderBottom:`2px solid ${tab===t.id?'#1B4FFF':'transparent'}`, transition:'all 0.12s', whiteSpace:'nowrap' }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ maxWidth:1200, margin:'0 auto', padding:'20px 24px' }}>
        {/* ── AI SUMMARY BANNER (fiscal.ai style) ── */}
        <div style={{ background:'linear-gradient(135deg, #0A3828 0%, #0A1628 100%)', border:'1px solid rgba(5,150,105,0.25)', borderRadius:14, padding:'16px 20px', marginBottom:20, position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:0, right:0, width:200, height:200, borderRadius:'50%', background:'rgba(16,185,129,0.04)', transform:'translate(60px,-80px)' }} />
          <div style={{ display:'flex', alignItems:'flex-start', gap:14 }}>
            <div style={{ width:32, height:32, borderRadius:8, background:'rgba(16,185,129,0.15)', border:'1px solid rgba(16,185,129,0.3)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, marginTop:2 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                <span style={{ fontSize:11, fontWeight:800, color:'#10B981', textTransform:'uppercase', letterSpacing:'0.08em' }}>Finsyt AI Summary</span>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>Q4 FY2026 · Updated Apr 10, 2026</span>
                <SignalBadge signal={profile.aiSignal} />
              </div>
              <p style={{ fontSize:13.5, color:'rgba(255,255,255,0.80)', lineHeight:1.65, margin:0 }}>{profile.aiSummary}</p>
            </div>
            <button onClick={()=>setCopilotOpen(o=>!o)} style={{ padding:'7px 14px', background:copilotOpen?'rgba(27,79,255,0.3)':'rgba(27,79,255,0.15)', border:'1px solid rgba(27,79,255,0.4)', borderRadius:8, fontSize:12, fontWeight:700, color:'#93B4FF', cursor:'pointer', fontFamily:'inherit', flexShrink:0, whiteSpace:'nowrap' }}>
              Ask Copilot
            </button>
          </div>
          {/* Copilot drawer */}
          {copilotOpen && (
            <div style={{ marginTop:14, borderTop:'1px solid rgba(255,255,255,0.08)', paddingTop:14 }}>
              <div style={{ display:'flex', gap:8 }}>
                <input value={copilotQ} onChange={e=>setCopilotQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askCopilot()} placeholder={`Ask anything about ${symbol}…`}
                  style={{ flex:1, padding:'8px 12px', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.12)', borderRadius:8, fontSize:13, color:'#fff', fontFamily:'inherit', outline:'none' }} />
                <button onClick={askCopilot} disabled={copilotLoading} style={{ padding:'8px 16px', background:'#1B4FFF', color:'#fff', border:'none', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', opacity:copilotLoading?0.6:1 }}>
                  {copilotLoading ? '…' : 'Ask'}
                </button>
              </div>
              {!copilotAns && !copilotLoading && (
                <div style={{ display:'flex', gap:6, marginTop:8, flexWrap:'wrap' }}>
                  {[`What drove ${symbol} margin expansion?`,`Summarise ${symbol} guidance`,`Key risks for ${symbol}`,`${symbol} vs peers valuation`].map(s=>(
                    <button key={s} onClick={()=>{setCopilotQ(s);setTimeout(askCopilot,100)}} style={{ fontSize:11, padding:'4px 10px', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:6, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontFamily:'inherit' }}>{s}</button>
                  ))}
                </div>
              )}
              {copilotLoading && <div style={{ marginTop:8, fontSize:12, color:'rgba(255,255,255,0.4)' }}>Analysing {symbol} with live data…</div>}
              {copilotAns && (
                <div style={{ marginTop:10, fontSize:13, color:'rgba(255,255,255,0.75)', lineHeight:1.65, whiteSpace:'pre-wrap' }}>{copilotAns}</div>
              )}
            </div>
          )}
        </div>

        {/* ── OVERVIEW TAB ── */}
        {tab === 'overview' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>
            <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
              {/* Price chart */}
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'16px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:'#0A1628' }}>Price History</span>
                  <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    {(['1M','3M','6M','1Y','3Y'] as const).map(r=>(
                      <button key={r} onClick={()=>setChartRange(r)} style={{ padding:'3px 9px', borderRadius:6, border:'1.5px solid', borderColor:chartRange===r?'#1B4FFF':'#E8EDF4', background:chartRange===r?'#EEF3FF':'transparent', color:chartRange===r?'#1B4FFF':'#7D8FA9', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}>{r}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={priceData} margin={{top:5,right:5,bottom:0,left:0}}>
                    <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={priceUp?'#10B981':'#EF4444'} stopOpacity={0.15}/><stop offset="95%" stopColor={priceUp?'#10B981':'#EF4444'} stopOpacity={0}/></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                    <XAxis dataKey="t" tick={{fontSize:9,fill:'#B0BCD0'}} interval={7} />
                    <YAxis domain={['auto','auto']} tick={{fontSize:9,fill:'#B0BCD0'}} width={50} tickFormatter={v=>`$${v}`} />
                    <Tooltip formatter={(v:any)=>[`$${Number(v).toFixed(2)}`,symbol]} contentStyle={{fontSize:12,borderRadius:8,border:'1px solid #E8EDF4'}} />
                    <Area type="monotone" dataKey="v" stroke={priceUp?'#10B981':'#EF4444'} strokeWidth={2} fill="url(#pg)" dot={false} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Revenue trend */}
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'16px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:'#0A1628' }}>Revenue & Margins</span>
                  <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
                    {(['quarterly','annual'] as const).map(p=>(
                      <button key={p} onClick={()=>setPeriod(p)} style={{ padding:'3px 9px', borderRadius:6, border:'1.5px solid', borderColor:period===p?'#1B4FFF':'#E8EDF4', background:period===p?'#EEF3FF':'transparent', color:period===p?'#1B4FFF':'#7D8FA9', fontSize:11, fontWeight:700, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>{p}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={financials} margin={{top:5,right:5,bottom:0,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                    <XAxis dataKey="label" tick={{fontSize:9,fill:'#B0BCD0'}} />
                    <YAxis tick={{fontSize:9,fill:'#B0BCD0'}} tickFormatter={v=>`$${v}B`} />
                    <Tooltip formatter={(v:any,n)=>[`$${Number(v).toFixed(1)}B`,n]} contentStyle={{fontSize:12,borderRadius:8,border:'1px solid #E8EDF4'}} />
                    <Bar dataKey="revenue"    name="Revenue"     fill="#1B4FFF" radius={[3,3,0,0]} />
                    <Bar dataKey="grossProfit" name="Gross Profit" fill="#059669" radius={[3,3,0,0]} />
                    <Bar dataKey="netIncome"  name="Net Income"  fill="#8B5CF6" radius={[3,3,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Right column */}
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {/* Analyst consensus */}
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'16px 18px' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:12 }}>Analyst Consensus</div>
                <AnalystBar buy={profile.analysts.buy} hold={profile.analysts.hold} sell={profile.analysts.sell} />
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginTop:14 }}>
                  <MetricChip label="Avg Price Target" value={`$${profile.analysts.avgPT}`} sub={`${(((profile.analysts.avgPT/profile.price)-1)*100).toFixed(0)}% upside`} green />
                  <MetricChip label="High PT" value={`$${profile.analysts.highPT}`} green />
                  <MetricChip label="Low PT" value={`$${profile.analysts.lowPT}`} />
                  <MetricChip label="Coverage" value={`${profile.analysts.buy+profile.analysts.hold+profile.analysts.sell} analysts`} />
                </div>
              </div>

              {/* Key metrics */}
              <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'16px 18px' }}>
                <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:12 }}>Key Metrics</div>
                <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
                  {[
                    ['Revenue (TTM)',   `$${profile.revenue}B`,   `+${profile.revenueGrowth}%`,'green'],
                    ['Gross Margin',    `${profile.grossMargin}%`, '',''],
                    ['Net Margin',      `${profile.netMargin}%`,   '',''],
                    ['FCF Margin',      `${profile.fcfMargin}%`,   '',''],
                    ['EPS (TTM)',       `$${profile.eps}`,         `+${profile.epsGrowth}% YoY`,'green'],
                    ['P/E (NTM)',       `${profile.peRatio}x`,     '',''],
                    ['EV/EBITDA',       `${profile.evEbitda}x`,    '',''],
                    ['P/S',            `${profile.psRatio}x`,     '',''],
                  ].map(([l,v,s,c],i)=>(
                    <div key={i} style={{ display:'flex', alignItems:'center', padding:'7px 0', borderBottom:'1px solid #F5F7FB' }}>
                      <span style={{ flex:1, fontSize:12, color:'#7D8FA9' }}>{l}</span>
                      <span style={{ fontSize:12, fontWeight:700, color:'#0A1628' }}>{v}</span>
                      {s && <span style={{ fontSize:11, fontWeight:600, color:c==='green'?'#059669':'#DC2626', marginLeft:8 }}>{s}</span>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Quick actions */}
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                <button onClick={()=>setTab('transcripts')} style={{ width:'100%', padding:'9px 14px', background:'#fff', border:'1.5px solid #E8EDF4', borderRadius:9, fontSize:12, fontWeight:700, color:'#0A1628', cursor:'pointer', fontFamily:'inherit', textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
                  <span>📋</span> Latest Earnings Transcript
                </button>
                <button onClick={()=>setTab('filings')} style={{ width:'100%', padding:'9px 14px', background:'#fff', border:'1.5px solid #E8EDF4', borderRadius:9, fontSize:12, fontWeight:700, color:'#0A1628', cursor:'pointer', fontFamily:'inherit', textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
                  <span>📄</span> Latest 10-K / 10-Q
                </button>
                <button onClick={()=>setTab('dcf')} style={{ width:'100%', padding:'9px 14px', background:'#EEF3FF', border:'1.5px solid #93B4FF', borderRadius:9, fontSize:12, fontWeight:700, color:'#1B4FFF', cursor:'pointer', fontFamily:'inherit', textAlign:'left', display:'flex', alignItems:'center', gap:8 }}>
                  <span>🔢</span> Open DCF Model
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── SEGMENTS & KPIs TAB ── */}
        {tab === 'segments' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            {/* Revenue by segment */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'18px 20px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:14 }}>Revenue by Segment (Q4 FY2026, $M)</div>
              {profile.segments.length > 0 ? (
                <>
                  {profile.segments.map((s:any) => {
                    const total = profile.segments.reduce((a:number,x:any)=>a+x.q4,0)
                    const pct = Math.round((s.q4/total)*100)
                    return (
                      <div key={s.name} style={{ marginBottom:10 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                          <span style={{ flex:1, fontSize:12, color:'#3D4F6E', fontWeight:600 }}>{s.name}</span>
                          <span style={{ fontSize:12, fontWeight:800, color:'#0A1628' }}>${(s.q4/1000).toFixed(1)}B</span>
                          <span style={{ fontSize:11, fontWeight:600, color:s.yoy>0?'#059669':'#DC2626', minWidth:50, textAlign:'right' }}>{s.yoy>0?'+':''}{s.yoy}% YoY</span>
                          <span style={{ fontSize:11, color:'#B0BCD0', minWidth:32, textAlign:'right' }}>{pct}%</span>
                        </div>
                        <div style={{ height:6, background:'#F0F4FA', borderRadius:3, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${pct}%`, background:s.color, borderRadius:3, transition:'width 0.6s' }} />
                        </div>
                      </div>
                    )
                  })}
                  {/* Segment pie */}
                  <div style={{ height:160, marginTop:16 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={profile.segments.map((s:any)=>({name:s.name,value:s.q4,color:s.color}))} dataKey="value" cx="50%" cy="50%" innerRadius={40} outerRadius={70}>
                          {profile.segments.map((s:any,i:number)=><Cell key={i} fill={s.color} />)}
                        </Pie>
                        <Tooltip formatter={(v:any)=>`$${(Number(v)/1000).toFixed(1)}B`} contentStyle={{fontSize:11,borderRadius:8}} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : <div style={{ color:'#B0BCD0', fontSize:13, textAlign:'center', padding:'30px 0' }}>Segment data not available</div>}
            </div>

            {/* KPI panel */}
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'18px 20px' }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                <span style={{ fontSize:13, fontWeight:800, color:'#0A1628' }}>Proprietary KPIs</span>
                <span style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:'#EEF3FF', color:'#1B4FFF', fontWeight:700 }}>Source-linked</span>
              </div>
              {profile.kpis.length > 0 ? profile.kpis.map((k:any,i:number)=>(
                <div key={i} style={{ padding:'10px 12px', background:i%2===0?'#F9FAFB':'#fff', borderRadius:8, marginBottom:4 }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:8 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:11.5, fontWeight:600, color:'#7D8FA9', marginBottom:2 }}>{k.label}</div>
                      <div style={{ fontSize:15, fontWeight:900, color:'#0A1628', letterSpacing:'-0.02em' }}>{k.value}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#059669' }}>{k.delta}</div>
                      <div style={{ fontSize:9, color:'#B0BCD0', marginTop:2, padding:'1px 6px', borderRadius:3, background:'#F5F7FB', display:'inline-block' }}>{k.source}</div>
                    </div>
                  </div>
                </div>
              )) : <div style={{ color:'#B0BCD0', fontSize:13, textAlign:'center', padding:'30px 0' }}>KPI data not available</div>}
            </div>

            {/* Segment trend chart */}
            <div style={{ gridColumn:'1/-1', background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'18px 20px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:14 }}>Segment Revenue Trend (last 4 quarters, $M)</div>
              {profile.segments.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={['Q1','Q2','Q3','Q4'].map((q,i)=>({
                    label:q,
                    ...Object.fromEntries(profile.segments.map((s:any)=>[s.name,s[`q${i+1}`]]))
                  }))} margin={{top:5,right:5,bottom:0,left:0}}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                    <XAxis dataKey="label" tick={{fontSize:10,fill:'#B0BCD0'}} />
                    <YAxis tick={{fontSize:10,fill:'#B0BCD0'}} tickFormatter={v=>`$${(v/1000).toFixed(0)}B`} />
                    <Tooltip formatter={(v:any,n)=>[`$${(Number(v)/1000).toFixed(1)}B`,n]} contentStyle={{fontSize:11,borderRadius:8,border:'1px solid #E8EDF4'}} />
                    {profile.segments.map((s:any)=><Bar key={s.name} dataKey={s.name} stackId="a" fill={s.color} radius={s===profile.segments[profile.segments.length-1]?[3,3,0,0]:[0,0,0,0]} />)}
                  </BarChart>
                </ResponsiveContainer>
              ) : null}
            </div>
          </div>
        )}

        {/* ── FINANCIALS TAB ── */}
        {tab === 'financials' && (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {(['quarterly','annual'] as const).map(p=>(
                <button key={p} onClick={()=>setPeriod(p)} style={{ padding:'5px 14px', borderRadius:7, border:'1.5px solid', borderColor:period===p?'#1B4FFF':'#E8EDF4', background:period===p?'#EEF3FF':'#fff', color:period===p?'#1B4FFF':'#7D8FA9', fontSize:12, fontWeight:700, cursor:'pointer', fontFamily:'inherit', textTransform:'capitalize' }}>{p}</button>
              ))}
            </div>
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, overflow:'hidden' }}>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#F7F9FC', borderBottom:'1px solid #E8EDF4' }}>
                    {['Metric','Q1 \'25','Q2 \'25','Q3 \'25','Q4 \'25','Q1 \'26','Q2 \'26','Q3 \'26','Q4 \'26'].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign:h==='Metric'?'left':'right', fontWeight:700, color:'#7D8FA9', fontSize:11 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ['Revenue ($B)', financials.map(f=>f.revenue.toFixed(1))],
                    ['Gross Profit ($B)', financials.map(f=>f.grossProfit.toFixed(1))],
                    ['Net Income ($B)', financials.map(f=>f.netIncome.toFixed(1))],
                    ['EPS (Diluted)', financials.map(f=>`$${f.eps.toFixed(2)}`)],
                    ['FCF ($B)', financials.map(f=>f.fcf.toFixed(1))],
                    ['Gross Margin', financials.map(_=>`${profile.grossMargin.toFixed(1)}%`)],
                    ['Net Margin', financials.map(_=>`${profile.netMargin.toFixed(1)}%`)],
                    ['FCF Margin', financials.map(_=>`${profile.fcfMargin.toFixed(1)}%`)],
                  ].map(([label,vals],ri)=>(
                    <tr key={ri} style={{ borderBottom:'1px solid #F5F7FB', background:ri%2===0?'#fff':'#FAFBFC' }}>
                      <td style={{ padding:'9px 14px', fontWeight:600, color:'#3D4F6E', fontSize:12 }}>{label as string}</td>
                      {(vals as string[]).map((v,ci)=>(
                        <td key={ci} style={{ padding:'9px 14px', textAlign:'right', fontWeight:700, color:'#0A1628', fontSize:12 }}>{v}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── ESTIMATES TAB ── */}
        {tab === 'estimates' && (
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'18px 20px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:14 }}>Revenue Estimates</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={[
                  {q:'Q1\'26',actual:43.0,est:41.5},
                  {q:'Q2\'26',actual:null,est:46.2},
                  {q:'Q3\'26',actual:null,est:49.8},
                  {q:'Q4\'26',actual:null,est:53.5},
                ]} margin={{top:5,right:5,bottom:0,left:0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                  <XAxis dataKey="q" tick={{fontSize:10,fill:'#B0BCD0'}} />
                  <YAxis tick={{fontSize:10,fill:'#B0BCD0'}} tickFormatter={v=>`$${v}B`} />
                  <Tooltip formatter={(v:any,n)=>[`$${Number(v).toFixed(1)}B`,n]} contentStyle={{fontSize:11,borderRadius:8}} />
                  <Bar dataKey="actual" name="Actual" fill="#1B4FFF" radius={[3,3,0,0]} />
                  <Bar dataKey="est" name="Consensus Est." fill="#E8EDF4" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'18px 20px' }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#0A1628', marginBottom:14 }}>Beat / Miss History</div>
              <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                {[
                  {q:"Q4 FY'26",rev:39.3,est:38.1,beat:true,eps:0.78,epsEst:0.74},
                  {q:"Q3 FY'26",rev:35.1,est:32.8,beat:true,eps:0.74,epsEst:0.71},
                  {q:"Q2 FY'26",rev:30.0,est:28.6,beat:true,eps:0.67,epsEst:0.64},
                  {q:"Q1 FY'26",rev:26.0,est:24.6,beat:true,eps:0.60,epsEst:0.57},
                ].map((r,i)=>(
                  <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#F9FAFB', borderRadius:8 }}>
                    <span style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', minWidth:60 }}>{r.q}</span>
                    <span style={{ fontSize:11, padding:'2px 7px', borderRadius:4, background:r.beat?'#ECFDF5':'#FEF2F2', color:r.beat?'#059669':'#DC2626', fontWeight:700 }}>{r.beat?'✓ Beat':'✗ Miss'}</span>
                    <span style={{ fontSize:11, color:'#3D4F6E', flex:1 }}>Rev ${r.rev}B vs ${r.est}B est.</span>
                    <span style={{ fontSize:11, color:'#3D4F6E' }}>EPS ${r.eps} vs ${r.epsEst}</span>
                    <span style={{ fontSize:11, fontWeight:700, color:'#059669' }}>+{(((r.rev/r.est)-1)*100).toFixed(1)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TRANSCRIPTS TAB ── */}
        {tab === 'transcripts' && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {[
              {q:'Q4 FY2026',date:'Feb 26, 2026',speakers:['Jensen Huang','Colette Kress'],highlight:'Blackwell demand continues to exceed supply. We expect to ship significantly more in Q1.',type:'Earnings Call'},
              {q:'Q3 FY2026',date:'Nov 20, 2025',speakers:['Jensen Huang','Colette Kress'],highlight:'Data center revenue of $30.8B, up 112% YoY. H200 and Blackwell ramping well.',type:'Earnings Call'},
              {q:'Q2 FY2026',date:'Aug 28, 2025',speakers:['Jensen Huang','Colette Kress'],highlight:'Revenue of $30.0B beat $28.6B consensus by $1.4B. Gross margin 75.1%.',type:'Earnings Call'},
              {q:'Analyst Day 2025',date:'Mar 18, 2025',speakers:['Jensen Huang'],highlight:'$3-4T annual AI infrastructure spend by 2030. Foresee sovereign AI as major driver.',type:'Analyst Day'},
            ].map((t,i)=>(
              <div key={i} style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'14px 18px' }}>
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ width:36, height:36, borderRadius:8, background:'#EEF3FF', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1B4FFF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:13, fontWeight:800, color:'#0A1628' }}>{t.q} — {symbol}</span>
                      <span style={{ fontSize:10, padding:'2px 8px', borderRadius:4, background:'#F0F4FA', color:'#7D8FA9', fontWeight:600 }}>{t.type}</span>
                      <span style={{ fontSize:11, color:'#B0BCD0', marginLeft:'auto' }}>{t.date}</span>
                    </div>
                    <p style={{ fontSize:12.5, color:'#3D4F6E', margin:'0 0 8px', lineHeight:1.6, fontStyle:'italic' }}>"{t.highlight}"</p>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ fontSize:11, color:'#B0BCD0' }}>Speakers: {t.speakers.join(', ')}</div>
                      <button style={{ marginLeft:'auto', fontSize:11, fontWeight:700, color:'#1B4FFF', background:'#EEF3FF', border:'none', borderRadius:6, padding:'4px 10px', cursor:'pointer', fontFamily:'inherit' }}>Read full transcript →</button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── FILINGS TAB ── */}
        {tab === 'filings' && (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {[
              {form:'10-K',  date:'Feb 21, 2026', desc:'Annual Report — FY2026', size:'12.4 MB'},
              {form:'10-Q',  date:'Nov 22, 2025', desc:'Quarterly Report — Q3 FY2026', size:'4.2 MB'},
              {form:'8-K',   date:'Feb 26, 2026', desc:'Earnings Release & MD&A', size:'0.8 MB'},
              {form:'DEF 14A',date:'Apr 3, 2026',  desc:'Proxy Statement — Annual Meeting', size:'3.1 MB'},
              {form:'10-Q',  date:'Aug 29, 2025', desc:'Quarterly Report — Q2 FY2026', size:'4.0 MB'},
              {form:'4',     date:'Mar 15, 2026', desc:'Form 4 — Insider Transaction (Huang)', size:'0.1 MB'},
            ].map((f,i)=>(
              <div key={i} style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:10, padding:'12px 16px', display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:40, height:40, borderRadius:8, background:f.form.startsWith('10')?'#EEF3FF':'#F0FFF4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:10, fontWeight:800, color:f.form.startsWith('10')?'#1B4FFF':'#059669' }}>{f.form}</span>
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:13, fontWeight:700, color:'#0A1628' }}>{f.desc}</div>
                  <div style={{ fontSize:11, color:'#B0BCD0', marginTop:1 }}>{f.date} · {f.size}</div>
                </div>
                <button style={{ fontSize:11, fontWeight:700, color:'#1B4FFF', background:'#EEF3FF', border:'none', borderRadius:6, padding:'5px 12px', cursor:'pointer', fontFamily:'inherit', display:'flex', alignItems:'center', gap:5 }}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  SEC.gov
                </button>
              </div>
            ))}
          </div>
        )}

        {/* ── COMPARISONS TAB ── */}
        {tab === 'comparisons' && (
          <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, overflow:'hidden' }}>
            <div style={{ padding:'14px 18px', borderBottom:'1px solid #F0F4FA', fontSize:13, fontWeight:800, color:'#0A1628' }}>Peer Comparison — Semiconductor / AI Accelerators</div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', fontSize:12, borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'#F7F9FC' }}>
                    {['Company','Price','Mkt Cap','Revenue','Rev Growth','Gross Margin','Net Margin','P/E','EV/EBITDA','Signal'].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign:h==='Company'||h==='Signal'?'left':'right', fontWeight:700, color:'#7D8FA9', fontSize:11, whiteSpace:'nowrap', borderBottom:'1px solid #E8EDF4' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { sym:'NVDA', name:'NVIDIA',  price:924.8,  mcap:2270, rev:39.3, rg:73.4, gm:75.9, nm:49.1, pe:42.3, evebitda:38.1, signal:'Bullish', highlight:symbol==='NVDA' },
                    { sym:'AMD',  name:'AMD',     price:168.2,  mcap:272,  rev:7.4,  rg:25.0, gm:51.7, nm:5.8,  pe:28.4, evebitda:22.1, signal:'Bullish', highlight:false },
                    { sym:'INTC', name:'Intel',   price:19.8,   mcap:85,   rev:12.2, rg:-7.4, gm:39.2, nm:-8.1, pe:null, evebitda:8.9,  signal:'Neutral', highlight:symbol==='INTC' },
                    { sym:'QCOM', name:'Qualcomm',price:142.0,  mcap:155,  rev:10.8, rg:13.3, gm:55.9, nm:22.5, pe:15.2, evebitda:12.4, signal:'Neutral', highlight:false },
                    { sym:'TSM',  name:'TSMC',    price:178.5,  mcap:926,  rev:25.5, rg:38.9, gm:56.1, nm:35.2, pe:24.8, evebitda:18.9, signal:'Bullish', highlight:symbol==='TSM' },
                  ].map((r,i)=>(
                    <tr key={i} style={{ borderBottom:'1px solid #F5F7FB', background:r.highlight?'#EEF3FF':i%2===0?'#fff':'#FAFBFC' }}>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <div style={{ width:22, height:22, borderRadius:5, background:'#1B4FFF22', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, fontWeight:800, color:'#1B4FFF' }}>{r.sym[0]}</div>
                          <div>
                            <div style={{ fontWeight:700, color:r.highlight?'#1B4FFF':'#0A1628' }}>{r.sym}</div>
                            <div style={{ fontSize:10, color:'#B0BCD0' }}>{r.name}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, color:'#0A1628' }}>${r.price}</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', color:'#3D4F6E' }}>${r.mcap}B</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', color:'#3D4F6E' }}>${r.rev}B</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, color:r.rg>0?'#059669':'#DC2626' }}>{r.rg>0?'+':''}{r.rg}%</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', color:'#3D4F6E' }}>{r.gm}%</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', color:r.nm>0?'#3D4F6E':'#DC2626' }}>{r.nm}%</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', color:'#3D4F6E' }}>{r.pe ? `${r.pe}x` : 'N/M'}</td>
                      <td style={{ padding:'10px 14px', textAlign:'right', color:'#3D4F6E' }}>{r.evebitda}x</td>
                      <td style={{ padding:'10px 14px' }}><SignalBadge signal={r.signal} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── DCF TAB ── */}
        {tab === 'dcf' && (
          <DCFModel symbol={symbol} profile={profile} />
        )}
      </div>
    </div>
  )
}

// ── DCF Model component ───────────────────────────────────────────────────────
function DCFModel({ symbol, profile }: { symbol:string; profile:any }) {
  const [revGrowth, setRevGrowth]       = useState([35,28,22,18,14])
  const [termGrowth, setTermGrowth]     = useState(3.5)
  const [wacc, setWacc]                 = useState(10.5)
  const [margin, setMargin]             = useState(profile.netMargin)
  const [sharesOut, setSharesOut]       = useState(24.5)

  const baseRev = profile.revenue
  let revs=[baseRev], fcfs=[]
  for(let i=0;i<5;i++){
    const r = revs[revs.length-1]*(1+revGrowth[i]/100)
    revs.push(r)
    fcfs.push(r*(margin/100)*0.85)
  }
  revs=revs.slice(1)
  const termVal = (fcfs[4]*(1+termGrowth/100))/(wacc/100-termGrowth/100)
  const pvFcfs = fcfs.reduce((acc,f,i)=>acc+f/Math.pow(1+wacc/100,i+1),0)
  const pvTerm = termVal/Math.pow(1+wacc/100,5)
  const enterpriseVal = pvFcfs + pvTerm
  const equityVal = enterpriseVal + 17.5 - 8.5  // + cash - debt
  const impliedPrice = (equityVal*1e9) / (sharesOut*1e9)
  const upside = ((impliedPrice/profile.price)-1)*100

  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>
      <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'20px' }}>
        <div style={{ fontSize:14, fontWeight:800, color:'#0A1628', marginBottom:16 }}>DCF Model — {symbol}</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          {[
            { l:'WACC (%)',        v:wacc,       set:setWacc,       min:6, max:16, step:0.5 },
            { l:'Terminal Growth (%)',v:termGrowth,set:setTermGrowth,min:1, max:6,  step:0.5 },
            { l:'FCF Margin (%)',  v:margin,     set:setMargin,     min:10,max:60, step:0.5 },
            { l:'Shares Out (B)', v:sharesOut,  set:setSharesOut,  min:20,max:30, step:0.1 },
          ].map(f=>(
            <div key={f.l}>
              <label style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', display:'block', marginBottom:5 }}>{f.l}</label>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <input type="range" min={f.min} max={f.max} step={f.step} value={f.v} onChange={e=>f.set(Number(e.target.value))} style={{ flex:1, accentColor:'#1B4FFF', cursor:'pointer' }} />
                <span style={{ fontSize:13, fontWeight:800, color:'#0A1628', minWidth:42, textAlign:'right' }}>{f.v.toFixed(1)}</span>
              </div>
            </div>
          ))}
        </div>
        <div style={{ marginBottom:12 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.06em' }}>Revenue Growth Assumptions</div>
          <div style={{ display:'flex', gap:8 }}>
            {revGrowth.map((g,i)=>(
              <div key={i} style={{ flex:1, textAlign:'center' }}>
                <div style={{ fontSize:10, color:'#B0BCD0', marginBottom:4 }}>Y{i+1}</div>
                <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <span style={{ fontSize:13, fontWeight:800, color:'#0A1628' }}>{g}%</span>
                  <input type="range" min={5} max={80} step={1} value={g} onChange={e=>{const ng=[...revGrowth];ng[i]=Number(e.target.value);setRevGrowth(ng)}} style={{ width:'100%', accentColor:'#1B4FFF', cursor:'pointer' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={revs.map((r,i)=>({y:`Y${i+1}`,rev:Math.round(r*10)/10,fcf:Math.round(fcfs[i]*10)/10}))} margin={{top:5,right:5,bottom:0,left:0}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
            <XAxis dataKey="y" tick={{fontSize:10,fill:'#B0BCD0'}} />
            <YAxis tick={{fontSize:10,fill:'#B0BCD0'}} tickFormatter={v=>`$${v.toFixed(0)}B`} />
            <Tooltip formatter={(v:any,n)=>[`$${Number(v).toFixed(1)}B`,n]} contentStyle={{fontSize:11,borderRadius:8}} />
            <Bar dataKey="rev" name="Revenue" fill="#E8EDF4" radius={[3,3,0,0]} />
            <Bar dataKey="fcf" name="FCF" fill="#1B4FFF" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ background:'#fff', border:'1px solid #E8EDF4', borderRadius:12, padding:'18px' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#7D8FA9', marginBottom:12, textTransform:'uppercase', letterSpacing:'0.06em' }}>Valuation Output</div>
          {[
            ['PV of FCFs',        `$${pvFcfs.toFixed(1)}B`,''],
            ['PV of Terminal',    `$${pvTerm.toFixed(1)}B`,''],
            ['Enterprise Value',  `$${enterpriseVal.toFixed(1)}B`,'bold'],
            ['+ Cash',            '$17.5B',''],
            ['- Debt',            '$8.5B',''],
            ['Equity Value',      `$${equityVal.toFixed(1)}B`,''],
            ['Implied Price',     `$${impliedPrice.toFixed(2)}`,'bold'],
            ['Upside / (Downside)',`${upside.toFixed(1)}%`,upside>0?'green':'red'],
          ].map(([l,v,style],i)=>(
            <div key={i} style={{ display:'flex', padding:'7px 0', borderBottom:'1px solid #F5F7FB', borderTop:style==='bold'&&i>1?'1px solid #E8EDF4':'none' }}>
              <span style={{ flex:1, fontSize:12, color:'#7D8FA9' }}>{l}</span>
              <span style={{ fontSize:12, fontWeight:style==='bold'?900:700, color:style==='green'?'#059669':style==='red'?'#DC2626':'#0A1628' }}>{v}</span>
            </div>
          ))}
        </div>
        <div style={{ background:upside>0?'#ECFDF5':'#FEF2F2', border:`1px solid ${upside>0?'#A7F3D0':'#FECACA'}`, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
          <div style={{ fontSize:11, fontWeight:700, color:upside>0?'#065F46':'#991B1B', marginBottom:4 }}>DCF Implied Price</div>
          <div style={{ fontSize:28, fontWeight:900, color:upside>0?'#059669':'#DC2626', letterSpacing:'-0.03em' }}>${impliedPrice.toFixed(2)}</div>
          <div style={{ fontSize:13, fontWeight:700, color:upside>0?'#059669':'#DC2626' }}>{upside>0?'+':''}{upside.toFixed(1)}% vs current</div>
          <div style={{ fontSize:10, color:upside>0?'#6EE7B7':'#FCA5A5', marginTop:6 }}>Current: ${profile.price.toFixed(2)}</div>
        </div>
      </div>
    </div>
  )
}
