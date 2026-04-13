'use client'
import { useEffect, useState, use, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  ComposedChart, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend
} from 'recharts'
import { fmtLarge, fmtPct, fmt, fmtNum, changeClass, formatDate } from '@/lib/utils'

// ─── Constants ──────────────────────────────────────────────────────────────
const RANGES = ['1W','1M','3M','6M','1Y','5Y']
const TABS   = ['overview','financials','estimates','transcripts','filings','comps','news']

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmtV(v: any, unit?: string): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return String(v)
  if (unit === '%') return `${(n * 100).toFixed(1)}%`
  if (unit === '$large') return fmtLarge(n)
  if (unit === '$') return `$${fmt(n)}`
  if (unit === 'x') return `${fmt(n)}x`
  return fmt(n)
}

function csvExport(rows: any[], filename: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function CompanyPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = use(params)
  const SYM = symbol?.toUpperCase()

  const [quote, setQuote]           = useState<any>(null)
  const [tab, setTab]               = useState<string>('overview')
  const [range, setRange]           = useState('1Y')
  const [chartData, setChartData]   = useState<any[]>([])
  const [loading, setLoading]       = useState(true)
  const [news, setNews]             = useState<any[]>([])

  // Financials
  const [finPeriod, setFinPeriod]   = useState<'annual'|'quarter'>('annual')
  const [finTab, setFinTab]         = useState<'income'|'balance'|'cashflow'>('income')
  const [finData, setFinData]       = useState<Record<string, any[]>>({})
  const [finLoading, setFinLoading] = useState(false)

  // Estimates
  const [estimates, setEstimates]   = useState<any>(null)
  const [estLoading, setEstLoading] = useState(false)

  // Transcripts
  const [transcripts, setTranscripts] = useState<any[]>([])
  const [selTranscript, setSelTranscript] = useState<any>(null)
  const [transcriptContent, setTranscriptContent] = useState<any>(null)
  const [txLoading, setTxLoading]   = useState(false)
  const [txSearch, setTxSearch]     = useState('')

  // Filings
  const [filings, setFilings]       = useState<any[]>([])
  const [filLoading, setFilLoading] = useState(false)

  // AI Chat
  const [chatOpen, setChatOpen]     = useState(false)
  const [chatInput, setChatInput]   = useState('')
  const [chatMsgs, setChatMsgs]     = useState<{role:'user'|'assistant', content:string}[]>([
    { role: 'assistant', content: `Hi! I'm your Finsyt AI analyst. Ask me anything about ${SYM} — earnings, valuation, growth drivers, risks, or how it compares to peers.` }
  ])
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ── Simulated price chart ───────────────────────────────────────────────────
  function genChart(price: number, rangeKey: string) {
    const points: Record<string,number> = {'1W':7,'1M':30,'3M':90,'6M':180,'1Y':252,'5Y':1260}
    const n = points[rangeKey] || 252
    const data = []
    let p = price * (0.7 + Math.random()*0.3)
    const trend = (price - p) / n
    for (let i = 0; i < n; i++) {
      p += trend + (Math.random()-0.46)*price*0.018
      const vol = Math.floor(Math.random()*30000000+5000000)
      const d = new Date(); d.setDate(d.getDate() - (n - i))
      data.push({ date: d.toLocaleDateString('en-GB',{month:'short',day:'numeric'}), price: parseFloat(p.toFixed(2)), volume: vol })
    }
    data[data.length-1].price = price
    return data
  }

  // ── Initial load ────────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true)
    Promise.all([
      fetch(`/api/quote?symbol=${SYM}`).then(r=>r.json()).catch(()=>({})),
      fetch(`/api/news?symbol=${SYM}&limit=8`).then(r=>r.json()).catch(()=>({})),
    ]).then(([q, n]) => {
      if (!q.error) { setQuote(q); setChartData(genChart(q.price, range)) }
      setNews(n.articles || [])
      setLoading(false)
    })
  }, [SYM])

  useEffect(() => {
    if (quote?.price) setChartData(genChart(quote.price, range))
  }, [range])

  // ── Financials load ─────────────────────────────────────────────────────────
  const loadFinancials = useCallback(async (stmt: string, period: string) => {
    const key = `${stmt}-${period}`
    if (finData[key]) return
    setFinLoading(true)
    try {
      const r = await fetch(`/api/financials/statements?symbol=${SYM}&statement=${stmt}&period=${period}&limit=10`)
      const d = await r.json()
      setFinData(prev => ({ ...prev, [key]: d.rows || [] }))
    } catch {}
    setFinLoading(false)
  }, [SYM, finData])

  useEffect(() => {
    if (tab === 'financials') {
      const stmtMap: Record<string,string> = { income: 'income-statement', balance: 'balance-sheet-statement', cashflow: 'cash-flow-statement' }
      loadFinancials(stmtMap[finTab], finPeriod)
    }
  }, [tab, finTab, finPeriod])

  // ── Estimates load ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'estimates' || estimates) return
    setEstLoading(true)
    fetch(`/api/estimates?symbol=${SYM}`)
      .then(r=>r.json()).then(d=>setEstimates(d)).catch(()=>setEstimates(null))
      .finally(()=>setEstLoading(false))
  }, [tab])

  // ── Transcripts load ────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'transcripts' || transcripts.length) return
    setTxLoading(true)
    fetch(`/api/transcripts?symbol=${SYM}`)
      .then(r=>r.json()).then(d=>setTranscripts(d.transcripts||[]))
      .catch(()=>[]).finally(()=>setTxLoading(false))
  }, [tab])

  const loadTranscript = async (t: any) => {
    setSelTranscript(t); setTranscriptContent(null); setTxSearch('')
    const r = await fetch(`/api/transcripts?symbol=${SYM}&year=${t.year}&quarter=${t.quarter}`)
    const d = await r.json()
    setTranscriptContent(d)
  }

  // ── Filings load ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'filings' || filings.length) return
    setFilLoading(true)
    fetch(`/api/filings?symbol=${SYM}`)
      .then(r=>r.json()).then(d=>setFilings(d.filings||[]))
      .catch(()=>[]).finally(()=>setFilLoading(false))
  }, [tab])

  // ── AI Chat ─────────────────────────────────────────────────────────────────
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [chatMsgs])

  const sendChat = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setChatMsgs(prev => [...prev, { role: 'user', content: userMsg }])
    setChatLoading(true)
    try {
      const context = `You are Finsyt AI, a financial analyst assistant. The user is viewing ${SYM}${quote ? ` (${quote.name}, ${quote.sector}, price $${fmt(quote.price)}, market cap ${fmtLarge(quote.marketCap)})` : ''}. Answer concisely and professionally.`
      const r = await fetch('/api/ai-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg, context, mode: 'chat' })
      })
      const d = await r.json()
      setChatMsgs(prev => [...prev, { role: 'assistant', content: d.answer || d.result || d.content || 'Unable to get a response.' }])
    } catch {
      setChatMsgs(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    }
    setChatLoading(false)
  }

  // ── Peer comps data (static enriched) ──────────────────────────────────────
  const PEERS: Record<string, any[]> = {
    AAPL: [
      {s:'AAPL',n:'Apple',mc:3.1e12,pe:33,ps:8.2,pb:48.2,roe:160,gm:44.5,ebitda:35.2,rev:385e9,growth:2.3,debt:1.1,div:0.5},
      {s:'MSFT',n:'Microsoft',mc:3.1e12,pe:34,ps:13.1,pb:12.8,roe:38.7,gm:70.1,ebitda:42.3,rev:228e9,growth:17.6,debt:0.3,div:0.7},
      {s:'GOOGL',n:'Alphabet',mc:2.2e12,pe:22,ps:6.4,pb:6.8,roe:28.4,gm:56.9,ebitda:31.2,rev:340e9,growth:14.1,debt:0.1,div:0},
      {s:'META',n:'Meta',mc:1.3e12,pe:27,ps:9.1,pb:8.3,roe:32.1,gm:81.5,ebitda:38.7,rev:147e9,growth:22.4,debt:0.1,div:0},
      {s:'NVDA',n:'NVIDIA',mc:2.9e12,pe:52,ps:26.4,pb:42.1,roe:124.5,gm:74.3,ebitda:57.4,rev:110e9,growth:122,debt:0.2,div:0.1},
    ],
  }
  const peers = PEERS[SYM] || PEERS['AAPL']

  // ─────────────────────────────────────────────────────────────────────────────
  if (loading) return (
    <div className="page-content">
      <div style={{display:'flex',alignItems:'center',gap:16,marginBottom:24}}>
        <Link href="/app" className="btn btn-ghost btn-sm">← Back</Link>
        <div className="skeleton" style={{height:32,width:200}} />
      </div>
      {[1,2,3].map(i=><div key={i} className="metric-card" style={{height:80,marginBottom:12}}><div className="skeleton" style={{height:'100%'}} /></div>)}
    </div>
  )

  if (!quote) return (
    <div className="page-content">
      <Link href="/app" className="btn btn-ghost btn-sm" style={{marginBottom:16}}>← Back</Link>
      <div className="card" style={{padding:64,textAlign:'center'}}>
        <p style={{fontSize:18,fontWeight:700,color:'#0A1628',marginBottom:8}}>Symbol not found: {SYM}</p>
        <p style={{color:'#7D8FA9'}}>Try AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM</p>
        <Link href="/app/screener" className="btn btn-primary" style={{marginTop:16}}>Browse Screener</Link>
      </div>
    </div>
  )

  const pricePos   = quote.changePct >= 0
  const chartColor = pricePos ? '#059669' : '#DC2626'

  return (
    <div className="page-content" style={{paddingBottom:100}}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div style={{display:'flex',alignItems:'flex-start',gap:16,marginBottom:24,flexWrap:'wrap'}}>
        <Link href="/app" className="btn btn-ghost btn-sm" style={{marginTop:6}}>← Back</Link>
        <div style={{display:'flex',alignItems:'center',gap:16,flex:1}}>
          <div style={{width:48,height:48,borderRadius:12,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:900,fontSize:18,flexShrink:0}}>{SYM[0]}</div>
          <div>
            <div style={{display:'flex',alignItems:'center',gap:10,flexWrap:'wrap'}}>
              <h1 style={{fontSize:'1.5rem',fontWeight:900,color:'#0A1628',letterSpacing:'-0.025em'}}>{quote.name}</h1>
              <span className="badge badge-gray">{SYM}</span>
              <span className="badge badge-gray">{quote.exchange}</span>
            </div>
            <p style={{fontSize:13,color:'#7D8FA9',marginTop:2}}>{quote.sector} · {quote.industry}</p>
          </div>
        </div>
        <div style={{textAlign:'right'}}>
          <div style={{fontSize:'2rem',fontWeight:900,color:'#0A1628',letterSpacing:'-0.03em'}}>${fmt(quote.price)}</div>
          <div style={{display:'flex',alignItems:'center',gap:8,justifyContent:'flex-end'}}>
            <span style={{fontSize:14,fontWeight:700,color:chartColor}}>{pricePos?'+':''}{fmt(quote.change)}</span>
            <span className={`badge ${pricePos?'badge-green':'badge-red'}`}>{fmtPct(quote.changePct)}</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="tab-bar" style={{marginBottom:20,overflowX:'auto',whiteSpace:'nowrap'}}>
        {TABS.map(t=>(
          <button key={t} className={`tab-btn ${tab===t?'active':''}`}
            onClick={()=>setTab(t)}
            style={{textTransform:'capitalize'}}>
            {t==='estimates'?'📊 Estimates':t==='transcripts'?'🎙 Transcripts':t==='filings'?'📄 Filings':t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
           OVERVIEW TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab==='overview' && (
        <div>
          {/* KPI grid */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12,marginBottom:20}}>
            {[
              {l:'Market Cap',v:fmtLarge(quote.marketCap)},{l:'P/E Ratio',v:quote.pe>0?`${fmt(quote.pe)}x`:'—'},
              {l:'EPS (TTM)',v:quote.eps>0?`$${fmt(quote.eps)}`:'—'},{l:'52W High',v:`$${fmt(quote.week52High)}`},
              {l:'52W Low',v:`$${fmt(quote.week52Low)}`},{l:'Div Yield',v:quote.dividendYield>0?fmtPct(quote.dividendYield*100):'—'},
              {l:'Beta',v:quote.beta>0?fmt(quote.beta,2):'—'},{l:'Analyst Target',v:quote.analystTarget>0?`$${fmt(quote.analystTarget)}`:'—'},
              {l:'Fwd P/E',v:quote.forwardPE>0?`${fmt(quote.forwardPE)}x`:'—'},{l:'P/B Ratio',v:quote.priceToBook>0?`${fmt(quote.priceToBook)}x`:'—'},
              {l:'ROE',v:quote.returnOnEquity>0?fmtPct(quote.returnOnEquity*100):'—'},{l:'Profit Margin',v:quote.profitMargin>0?fmtPct(quote.profitMargin*100):'—'},
            ].map(m=>(
              <div key={m.l} className="metric-card" style={{padding:'12px 16px'}}>
                <div className="label" style={{marginBottom:6}}>{m.l}</div>
                <div style={{fontWeight:800,fontSize:'1rem',color:'#0A1628'}}>{m.v}</div>
              </div>
            ))}
          </div>

          {/* Price chart */}
          <PriceChart data={chartData} range={range} setRange={setRange} symbol={SYM} quote={quote} chartColor={chartColor} pricePos={pricePos} />

          {/* Description */}
          {quote.description && (
            <div className="card" style={{padding:20,marginBottom:20}}>
              <div className="section-title">About {quote.name}</div>
              <p style={{fontSize:14,color:'#4A5568',lineHeight:1.7}}>{quote.description}</p>
            </div>
          )}

          {/* Latest news snippet */}
          {news.length > 0 && (
            <div className="card" style={{padding:20}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
                <div className="section-title" style={{marginBottom:0}}>Latest News</div>
                <button className="btn btn-ghost btn-sm" onClick={()=>setTab('news')}>See all →</button>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:12}}>
                {news.slice(0,3).map((n,i)=>(
                  <div key={i} style={{display:'flex',gap:12,paddingBottom:12,borderBottom:i<2?'1px solid #F0F4FA':'none'}}>
                    <div style={{flex:1}}>
                      <a href={n.url} target="_blank" rel="noopener" style={{fontSize:14,fontWeight:600,color:'#0A1628',textDecoration:'none',lineHeight:1.4}}>{n.headline}</a>
                      <div style={{fontSize:12,color:'#7D8FA9',marginTop:4}}>{n.source} · {formatDate(n.datetime)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           FINANCIALS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab==='financials' && (
        <FinancialsTab
          symbol={SYM}
          finPeriod={finPeriod} setFinPeriod={setFinPeriod}
          finTab={finTab} setFinTab={setFinTab}
          finData={finData} finLoading={finLoading}
          loadFinancials={loadFinancials}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           ESTIMATES TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab==='estimates' && (
        <EstimatesTab symbol={SYM} data={estimates} loading={estLoading} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           TRANSCRIPTS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab==='transcripts' && (
        <TranscriptsTab
          symbol={SYM}
          transcripts={transcripts} loading={txLoading}
          selTranscript={selTranscript} onSelect={loadTranscript}
          content={transcriptContent}
          search={txSearch} setSearch={setTxSearch}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           FILINGS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab==='filings' && (
        <FilingsTab symbol={SYM} filings={filings} loading={filLoading} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           COMPS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab==='comps' && (
        <CompsTab symbol={SYM} peers={peers} />
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           NEWS TAB
      ══════════════════════════════════════════════════════════════════════ */}
      {tab==='news' && (
        <div>
          <div className="section-title">Recent News — {SYM}</div>
          <div style={{display:'flex',flexDirection:'column',gap:12}}>
            {news.map((n,i)=>(
              <div key={i} className="card" style={{padding:'16px 20px'}}>
                <a href={n.url} target="_blank" rel="noopener" style={{fontSize:15,fontWeight:700,color:'#0A1628',textDecoration:'none',lineHeight:1.5,display:'block',marginBottom:6}}>{n.headline}</a>
                {n.summary&&<p style={{fontSize:13,color:'#4A5568',marginBottom:8,lineHeight:1.6}}>{n.summary}</p>}
                <div style={{fontSize:12,color:'#7D8FA9'}}>{n.source} · {formatDate(n.datetime)}</div>
              </div>
            ))}
            {!news.length&&<div className="card" style={{padding:48,textAlign:'center',color:'#7D8FA9'}}>No news found.</div>}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════════
           ALWAYS-ON AI CHAT BUTTON + WINDOW
      ══════════════════════════════════════════════════════════════════════ */}
      {/* Floating button */}
      <button
        onClick={()=>setChatOpen(o=>!o)}
        style={{
          position:'fixed',bottom:24,right:24,zIndex:1000,
          width:56,height:56,borderRadius:'50%',
          background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',
          border:'none',cursor:'pointer',
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:'0 4px 24px rgba(27,79,255,0.4)',
          fontSize:24,color:'#fff',transition:'transform 0.2s',
        }}
        title="Ask Finsyt AI"
      >{chatOpen ? '✕' : '💬'}</button>

      {/* Chat window */}
      {chatOpen && (
        <div style={{
          position:'fixed',bottom:92,right:24,zIndex:999,
          width:380,maxWidth:'calc(100vw - 48px)',height:480,
          background:'#fff',borderRadius:20,
          boxShadow:'0 8px 48px rgba(0,0,0,0.18)',
          display:'flex',flexDirection:'column',overflow:'hidden',
          border:'1px solid #E2E8F2',
        }}>
          {/* Chat header */}
          <div style={{padding:'14px 18px',borderBottom:'1px solid #F0F4FA',background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',gap:10}}>
            <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(255,255,255,0.2)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>🤖</div>
            <div>
              <div style={{color:'#fff',fontWeight:700,fontSize:14}}>Finsyt AI — {SYM}</div>
              <div style={{color:'rgba(255,255,255,0.75)',fontSize:11}}>Ask anything about this company</div>
            </div>
          </div>

          {/* Messages */}
          <div style={{flex:1,overflowY:'auto',padding:'14px 16px',display:'flex',flexDirection:'column',gap:10}}>
            {chatMsgs.map((m,i)=>(
              <div key={i} style={{display:'flex',justifyContent:m.role==='user'?'flex-end':'flex-start'}}>
                <div style={{
                  maxWidth:'85%',padding:'10px 14px',borderRadius:m.role==='user'?'16px 16px 4px 16px':'16px 16px 16px 4px',
                  background:m.role==='user'?'linear-gradient(135deg,#1B4FFF,#0D9FE8)':'#F5F7FB',
                  color:m.role==='user'?'#fff':'#1C2B4A',
                  fontSize:13,lineHeight:1.55,fontWeight:m.role==='user'?600:400,
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && (
              <div style={{display:'flex',justifyContent:'flex-start'}}>
                <div style={{background:'#F5F7FB',padding:'10px 14px',borderRadius:'16px 16px 16px 4px',fontSize:13,color:'#7D8FA9'}}>
                  <span style={{animation:'pulse 1.2s infinite'}}>Analysing…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef}/>
          </div>

          {/* Quick prompts */}
          <div style={{padding:'8px 12px',borderTop:'1px solid #F0F4FA',display:'flex',gap:6,overflowX:'auto',flexShrink:0}}>
            {['Key risks?','Revenue growth outlook','Valuation vs peers','Latest earnings beat?'].map(q=>(
              <button key={q} onClick={()=>{setChatInput(q)}}
                style={{whiteSpace:'nowrap',padding:'4px 10px',borderRadius:999,border:'1px solid #E2E8F2',background:'#F5F7FB',fontSize:11,fontWeight:600,color:'#4A5568',cursor:'pointer',flexShrink:0}}>
                {q}
              </button>
            ))}
          </div>

          {/* Input */}
          <div style={{padding:'10px 12px',borderTop:'1px solid #F0F4FA',display:'flex',gap:8,flexShrink:0}}>
            <input
              value={chatInput}
              onChange={e=>setChatInput(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&sendChat()}
              placeholder={`Ask about ${SYM}…`}
              style={{flex:1,padding:'9px 14px',borderRadius:10,border:'1.5px solid #E2E8F2',fontSize:13,outline:'none',fontFamily:'inherit',color:'#1C2B4A'}}
            />
            <button onClick={sendChat} disabled={chatLoading||!chatInput.trim()}
              style={{padding:'9px 16px',borderRadius:10,background:chatLoading?'#B0BCD0':'#1B4FFF',color:'#fff',border:'none',fontWeight:700,fontSize:13,cursor:chatLoading?'not-allowed':'pointer'}}>
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Price Chart Component ────────────────────────────────────────────────────
function PriceChart({ data, range, setRange, symbol, quote, chartColor, pricePos }: any) {
  const { fmt, fmtPct } = { fmt: (n:number,d=2)=>n==null||isNaN(n)?'—':n.toFixed(d), fmtPct: (n:number)=>n==null?'—':`${n>=0?'+':''}${n.toFixed(2)}%` }
  return (
    <div className="card" style={{padding:20,marginBottom:20}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div>
          <span style={{fontWeight:700,fontSize:15,color:'#0A1628'}}>{symbol} Price Chart</span>
          <span style={{marginLeft:12,fontSize:13,fontWeight:700,color:chartColor}}>{pricePos?'+':''}{fmt(quote.change)} ({fmtPct(quote.changePct)})</span>
        </div>
        <div style={{display:'flex',gap:4}}>
          {['1W','1M','3M','6M','1Y','5Y'].map(r=>(
            <button key={r} onClick={()=>setRange(r)}
              style={{padding:'4px 10px',borderRadius:6,fontSize:12,fontWeight:600,cursor:'pointer',border:'1.5px solid',
                borderColor:range===r?'#1B4FFF':'#E2E8F2',background:range===r?'#EEF3FF':'transparent',color:range===r?'#1B4FFF':'#7D8FA9'}}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div style={{height:280}}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{top:4,right:0,bottom:0,left:0}}>
            <defs>
              <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={chartColor} stopOpacity={0.15}/>
                <stop offset="95%" stopColor={chartColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA"/>
            <XAxis dataKey="date" tick={{fontSize:10,fill:'#B0BCD0'}} interval="preserveStartEnd" axisLine={false} tickLine={false}/>
            <YAxis yAxisId="price" orientation="right" tick={{fontSize:10,fill:'#B0BCD0'}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`} domain={['auto','auto']}/>
            <YAxis yAxisId="vol" orientation="left" tick={false} axisLine={false} tickLine={false}/>
            <Tooltip contentStyle={{background:'#fff',border:'1px solid #E2E8F2',borderRadius:8,fontSize:12}} formatter={(v:any,n:string)=>[n==='price'?`$${v}`:v.toLocaleString(),n==='price'?'Price':'Volume']}/>
            <Bar yAxisId="vol" dataKey="volume" fill="#E8EFF8" opacity={0.5} radius={[2,2,0,0]}/>
            <Area yAxisId="price" type="monotone" dataKey="price" stroke={chartColor} strokeWidth={2} fill="url(#priceGrad)"/>
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ─── Financials Tab ───────────────────────────────────────────────────────────
function FinancialsTab({ symbol, finPeriod, setFinPeriod, finTab, setFinTab, finData, finLoading, loadFinancials }: any) {
  const stmtMap: Record<string,string> = { income:'income-statement', balance:'balance-sheet-statement', cashflow:'cash-flow-statement' }
  const key = `${stmtMap[finTab]}-${finPeriod}`
  const rows: any[] = finData[key] || []

  // Field configs per tab
  const INCOME_FIELDS = [
    {key:'revenue',label:'Revenue',unit:'$large'},{key:'grossProfit',label:'Gross Profit',unit:'$large'},
    {key:'grossProfitRatio',label:'Gross Margin',unit:'%'},{key:'ebitda',label:'EBITDA',unit:'$large'},
    {key:'ebitdaratio',label:'EBITDA Margin',unit:'%'},{key:'operatingIncome',label:'EBIT',unit:'$large'},
    {key:'operatingIncomeRatio',label:'EBIT Margin',unit:'%'},{key:'netIncome',label:'Net Income',unit:'$large'},
    {key:'netIncomeRatio',label:'Net Margin',unit:'%'},{key:'epsdiluted',label:'EPS (Diluted)',unit:'$'},
    {key:'eps',label:'EPS (Basic)',unit:'$'},{key:'researchAndDevelopmentExpenses',label:'R&D Expense',unit:'$large'},
    {key:'sellingGeneralAndAdministrativeExpenses',label:'SG&A',unit:'$large'},{key:'depreciationAndAmortization',label:'D&A',unit:'$large'},
    {key:'interestExpense',label:'Interest Expense',unit:'$large'},{key:'incomeTaxExpense',label:'Income Tax',unit:'$large'},
    {key:'weightedAverageShsOutDil',label:'Diluted Shares',unit:'$large'},
  ]
  const BALANCE_FIELDS = [
    {key:'totalAssets',label:'Total Assets',unit:'$large'},{key:'totalCurrentAssets',label:'Current Assets',unit:'$large'},
    {key:'cashAndCashEquivalents',label:'Cash & Equivalents',unit:'$large'},{key:'cashAndShortTermInvestments',label:'Cash + ST Investments',unit:'$large'},
    {key:'netReceivables',label:'Receivables',unit:'$large'},{key:'inventory',label:'Inventory',unit:'$large'},
    {key:'propertyPlantEquipmentNet',label:'PP&E (Net)',unit:'$large'},{key:'goodwill',label:'Goodwill',unit:'$large'},
    {key:'intangibleAssets',label:'Intangibles',unit:'$large'},{key:'totalLiabilities',label:'Total Liabilities',unit:'$large'},
    {key:'totalCurrentLiabilities',label:'Current Liabilities',unit:'$large'},{key:'shortTermDebt',label:'Short-Term Debt',unit:'$large'},
    {key:'longTermDebt',label:'Long-Term Debt',unit:'$large'},{key:'totalDebt',label:'Total Debt',unit:'$large'},
    {key:'netDebt',label:'Net Debt',unit:'$large'},{key:'totalStockholdersEquity',label:"Shareholders' Equity",unit:'$large'},
    {key:'bookValuePerShare',label:'Book Value/Share',unit:'$'},{key:'retainedEarnings',label:'Retained Earnings',unit:'$large'},
  ]
  const CF_FIELDS = [
    {key:'operatingCashFlow',label:'Operating Cash Flow',unit:'$large'},{key:'capitalExpenditure',label:'CapEx',unit:'$large'},
    {key:'freeCashFlow',label:'Free Cash Flow',unit:'$large'},{key:'netCashUsedForInvestingActivites',label:'Investing Activities',unit:'$large'},
    {key:'netCashUsedProvidedByFinancingActivities',label:'Financing Activities',unit:'$large'},
    {key:'dividendsPaid',label:'Dividends Paid',unit:'$large'},{key:'stockBasedCompensation',label:'Stock-Based Comp',unit:'$large'},
    {key:'commonStockRepurchased',label:'Buybacks',unit:'$large'},{key:'netChangeInCash',label:'Net Change in Cash',unit:'$large'},
  ]

  const fields = finTab==='income'?INCOME_FIELDS:finTab==='balance'?BALANCE_FIELDS:CF_FIELDS

  // Build chart data (revenue + net income for income; CFO + FCF for cashflow; assets + equity for balance)
  const chartMetrics: Record<string, {keys:string[], labels:string[], colors:string[]}> = {
    income: { keys:['revenue','netIncome'], labels:['Revenue','Net Income'], colors:['#1B4FFF','#059669'] },
    balance:{ keys:['totalAssets','totalStockholdersEquity'], labels:['Total Assets','Equity'], colors:['#1B4FFF','#D97706'] },
    cashflow:{keys:['operatingCashFlow','freeCashFlow'], labels:['Operating CF','Free CF'], colors:['#1B4FFF','#059669'] },
  }
  const cm = chartMetrics[finTab]
  const chartRows = [...rows].reverse().map(r=>({ period: r.period||r.calendarYear||r.date?.slice(0,7)||'—', [cm.keys[0]]: r[cm.keys[0]], [cm.keys[1]]: r[cm.keys[1]] }))

  function exportCSV() {
    csvExport(rows.map(r=>({period:r.period||r.date,...Object.fromEntries(fields.map(f=>[f.label,r[f.key]]))})), `${symbol}_${finTab}_${finPeriod}.csv`)
  }

  return (
    <div>
      {/* Controls */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:12}}>
        <div style={{display:'flex',gap:0,border:'1px solid #E2E8F2',borderRadius:8,overflow:'hidden'}}>
          {(['income','balance','cashflow'] as const).map(t=>(
            <button key={t} onClick={()=>{setFinTab(t);loadFinancials(stmtMap[t],finPeriod)}}
              style={{padding:'7px 16px',fontSize:13,fontWeight:600,cursor:'pointer',border:'none',
                background:finTab===t?'#1B4FFF':'#fff',color:finTab===t?'#fff':'#7D8FA9',transition:'all 0.15s'}}>
              {t==='income'?'Income':t==='balance'?'Balance Sheet':'Cash Flow'}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <div style={{display:'flex',gap:0,border:'1px solid #E2E8F2',borderRadius:8,overflow:'hidden'}}>
            {(['annual','quarter'] as const).map(p=>(
              <button key={p} onClick={()=>{setFinPeriod(p);loadFinancials(stmtMap[finTab],p)}}
                style={{padding:'7px 14px',fontSize:12,fontWeight:600,cursor:'pointer',border:'none',
                  background:finPeriod===p?'#EEF3FF':'#fff',color:finPeriod===p?'#1B4FFF':'#7D8FA9'}}>
                {p==='annual'?'Annual':'Quarterly'}
              </button>
            ))}
          </div>
          <button onClick={exportCSV} className="btn btn-ghost btn-sm" style={{display:'flex',alignItems:'center',gap:6}}>
            ⬇ Export CSV
          </button>
        </div>
      </div>

      {/* Chart */}
      {chartRows.length>0 && (
        <div className="card" style={{padding:20,marginBottom:20}}>
          <div className="section-title">{finTab==='income'?'Revenue & Net Income':finTab==='balance'?'Assets & Equity':'Cash Flow'}</div>
          <div style={{height:220}}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartRows} margin={{top:4,right:8,bottom:0,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA"/>
                <XAxis dataKey="period" tick={{fontSize:10,fill:'#B0BCD0'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#B0BCD0'}} axisLine={false} tickLine={false} tickFormatter={v=>v>=1e9?`${(v/1e9).toFixed(0)}B`:v>=1e6?`${(v/1e6).toFixed(0)}M`:v}/>
                <Tooltip contentStyle={{background:'#fff',border:'1px solid #E2E8F2',borderRadius:8,fontSize:12}} formatter={(v:any)=>[v>=1e9?`$${(v/1e9).toFixed(2)}B`:v>=1e6?`$${(v/1e6).toFixed(2)}M`:`$${v}`,'']}/>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Bar dataKey={cm.keys[0]} name={cm.labels[0]} fill={cm.colors[0]} radius={[3,3,0,0]}/>
                <Bar dataKey={cm.keys[1]} name={cm.labels[1]} fill={cm.colors[1]} radius={[3,3,0,0]}/>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Table */}
      {finLoading ? <div className="skeleton" style={{height:300,borderRadius:12}}/> : rows.length > 0 ? (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:'2px solid #E2E8F2',background:'#F8FAFD'}}>
                  <th style={{padding:'10px 16px',textAlign:'left',fontWeight:700,color:'#1C2B4A',minWidth:180,whiteSpace:'nowrap'}}>Metric</th>
                  {rows.map((r,i)=>(
                    <th key={i} style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:'#1C2B4A',whiteSpace:'nowrap'}}>
                      {r.period||(r.calendarYear&&`FY ${r.calendarYear}`)||r.date?.slice(0,7)||`Period ${i+1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {fields.map((f,fi)=>(
                  <tr key={f.key} style={{borderBottom:'1px solid #F0F4FA',background:fi%2===0?'#fff':'#FAFBFD'}}>
                    <td style={{padding:'9px 16px',color:'#4A5568',fontWeight:600,whiteSpace:'nowrap'}}>{f.label}</td>
                    {rows.map((r,i)=>{
                      const v = r[f.key]
                      const n = typeof v==='number'?v:parseFloat(v)
                      return (
                        <td key={i} style={{padding:'9px 14px',textAlign:'right',fontWeight:700,color:
                          f.unit==='%'?(n>0?'#059669':n<0?'#DC2626':'#0A1628'):'#0A1628',
                          whiteSpace:'nowrap'}}>
                          {fmtV(v,f.unit)}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{padding:48,textAlign:'center',color:'#7D8FA9'}}>No financial data available.</div>
      )}
    </div>
  )
}

// ─── Estimates Tab ────────────────────────────────────────────────────────────
function EstimatesTab({ symbol, data, loading }: any) {
  const [estPeriod, setEstPeriod] = useState<'annual'|'quarter'>('annual')

  if (loading) return <div className="skeleton" style={{height:400,borderRadius:12}}/>
  if (!data) return <div className="card" style={{padding:48,textAlign:'center',color:'#7D8FA9'}}>Estimates unavailable.</div>

  const estimates: any[] = (data.estimates||[]).filter((e:any)=> estPeriod==='annual' ? e.period==='annual' : e.period==='quarter')
  const pt = Array.isArray(data.priceTarget) ? data.priceTarget[0] : data.priceTarget
  const recs: any[] = data.recommendations || []
  const upgrades = data.upgrades

  // Consensus recommendation
  const latestRec = recs[0]
  const recLabel = latestRec?.analystRatingsStrongBuy > latestRec?.analystRatingsStrongSell ? 'Strong Buy' :
    latestRec?.analystRatingsBuy > latestRec?.analystRatingsSell ? 'Buy' :
    latestRec?.analystRatingsSell > latestRec?.analystRatingsBuy ? 'Sell' : 'Hold'
  const recColor = recLabel.includes('Buy')?'#059669':recLabel==='Sell'?'#DC2626':'#D97706'

  // Chart: EPS estimates
  const chartData = [...estimates].reverse().slice(-8).map(e=>({
    period: e.period==='annual'?`FY ${e.calendarYear||e.date?.slice(0,4)}`:`Q${e.quarter||''} ${e.calendarYear||''}`,
    epsAvg: e.estimatedEpsAvg, epsHigh: e.estimatedEpsHigh, epsLow: e.estimatedEpsLow,
    revAvg: e.estimatedRevenueAvg,
  }))

  function exportCSV() {
    csvExport(estimates.map(e=>({
      period:e.period, date:e.date,
      'EPS Avg':e.estimatedEpsAvg,'EPS High':e.estimatedEpsHigh,'EPS Low':e.estimatedEpsLow,'# Analysts':e.numberAnalystEstimatedEps,
      'Rev Avg':e.estimatedRevenueAvg,'Rev High':e.estimatedRevenueHigh,'Rev Low':e.estimatedRevenueLow,
      'EBITDA Avg':e.estimatedEbitdaAvg,'Net Inc Avg':e.estimatedNetIncomeAvg,
    })), `${symbol}_estimates.csv`)
  }

  return (
    <div>
      {/* Consensus banner */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:12,marginBottom:20}}>
        {pt && <>
          <div className="metric-card" style={{padding:'14px 18px'}}>
            <div className="label" style={{marginBottom:6}}>Consensus Target</div>
            <div style={{fontSize:'1.4rem',fontWeight:900,color:'#0A1628'}}>${fmt(pt.targetConsensus||pt.priceTarget)}</div>
            <div style={{fontSize:12,color:'#7D8FA9',marginTop:2}}>Last 12 months</div>
          </div>
          <div className="metric-card" style={{padding:'14px 18px'}}>
            <div className="label" style={{marginBottom:6}}>Target High</div>
            <div style={{fontSize:'1.4rem',fontWeight:900,color:'#059669'}}>${fmt(pt.targetHigh)}</div>
          </div>
          <div className="metric-card" style={{padding:'14px 18px'}}>
            <div className="label" style={{marginBottom:6}}>Target Low</div>
            <div style={{fontSize:'1.4rem',fontWeight:900,color:'#DC2626'}}>${fmt(pt.targetLow)}</div>
          </div>
        </>}
        {latestRec && (
          <div className="metric-card" style={{padding:'14px 18px'}}>
            <div className="label" style={{marginBottom:6}}>Analyst Consensus</div>
            <div style={{fontSize:'1.2rem',fontWeight:900,color:recColor}}>{recLabel}</div>
            <div style={{fontSize:12,color:'#7D8FA9',marginTop:2}}>
              {latestRec.analystRatingsStrongBuy||0} Strong Buy · {latestRec.analystRatingsBuy||0} Buy · {latestRec.analystRatingsHold||0} Hold · {latestRec.analystRatingsSell||0} Sell
            </div>
          </div>
        )}
        {upgrades && (
          <div className="metric-card" style={{padding:'14px 18px'}}>
            <div className="label" style={{marginBottom:6}}>Upgrades / Downgrades</div>
            <div style={{fontSize:'1.2rem',fontWeight:900,color:'#1B4FFF'}}>{upgrades.strongBuy||upgrades.buy||0} Bullish</div>
            <div style={{fontSize:12,color:'#7D8FA9',marginTop:2}}>{upgrades.sell||upgrades.strongSell||0} Bearish / {upgrades.hold||0} Hold</div>
          </div>
        )}
      </div>

      {/* EPS Estimate chart */}
      {chartData.length > 0 && (
        <div className="card" style={{padding:20,marginBottom:20}}>
          <div className="section-title">EPS Estimates — Avg / High / Low</div>
          <div style={{height:220}}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{top:4,right:8,bottom:0,left:8}}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA"/>
                <XAxis dataKey="period" tick={{fontSize:10,fill:'#B0BCD0'}} axisLine={false} tickLine={false}/>
                <YAxis tick={{fontSize:10,fill:'#B0BCD0'}} axisLine={false} tickLine={false} tickFormatter={v=>`$${v}`}/>
                <Tooltip contentStyle={{background:'#fff',border:'1px solid #E2E8F2',borderRadius:8,fontSize:12}} formatter={(v:any)=>[`$${v}`,'']}/>
                <Legend wrapperStyle={{fontSize:12}}/>
                <Bar dataKey="epsAvg" name="EPS Avg" fill="#1B4FFF" radius={[3,3,0,0]}/>
                <Line type="monotone" dataKey="epsHigh" name="EPS High" stroke="#059669" strokeWidth={2} dot={false}/>
                <Line type="monotone" dataKey="epsLow" name="EPS Low" stroke="#DC2626" strokeWidth={2} dot={false} strokeDasharray="4 2"/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Controls + Table */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:0,border:'1px solid #E2E8F2',borderRadius:8,overflow:'hidden'}}>
          {(['annual','quarter'] as const).map(p=>(
            <button key={p} onClick={()=>setEstPeriod(p)}
              style={{padding:'7px 14px',fontSize:12,fontWeight:600,cursor:'pointer',border:'none',
                background:estPeriod===p?'#EEF3FF':'#fff',color:estPeriod===p?'#1B4FFF':'#7D8FA9'}}>
              {p==='annual'?'Annual':'Quarterly'}
            </button>
          ))}
        </div>
        <button onClick={exportCSV} className="btn btn-ghost btn-sm">⬇ Export CSV</button>
      </div>

      {estimates.length > 0 ? (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
              <thead>
                <tr style={{borderBottom:'2px solid #E2E8F2',background:'#F8FAFD'}}>
                  {['Period','Date','EPS Avg','EPS High','EPS Low','# Analysts','Rev Avg','Rev High','Rev Low','EBITDA Avg','Net Inc Avg'].map(h=>(
                    <th key={h} style={{padding:'10px 14px',textAlign:'right',fontWeight:700,color:'#1C2B4A',whiteSpace:'nowrap',':first-child':{textAlign:'left'}}}
                      className={h==='Period'||h==='Date'?'':''}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estimates.map((e:any,i:number)=>(
                  <tr key={i} style={{borderBottom:'1px solid #F0F4FA',background:i%2===0?'#fff':'#FAFBFD'}}>
                    <td style={{padding:'9px 14px',fontWeight:700,color:'#0A1628',whiteSpace:'nowrap'}}>{e.period==='annual'?`FY ${e.calendarYear||e.date?.slice(0,4)}`:`Q${e.quarter} ${e.calendarYear}`}</td>
                    <td style={{padding:'9px 14px',color:'#7D8FA9',whiteSpace:'nowrap'}}>{e.date?.slice(0,10)||'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',fontWeight:700,color:'#1B4FFF'}}>{e.estimatedEpsAvg!=null?`$${fmt(e.estimatedEpsAvg)}`:'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',color:'#059669',fontWeight:600}}>{e.estimatedEpsHigh!=null?`$${fmt(e.estimatedEpsHigh)}`:'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',color:'#DC2626',fontWeight:600}}>{e.estimatedEpsLow!=null?`$${fmt(e.estimatedEpsLow)}`:'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',color:'#7D8FA9'}}>{e.numberAnalystEstimatedEps||'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',fontWeight:700,color:'#0A1628'}}>{e.estimatedRevenueAvg!=null?fmtLarge(e.estimatedRevenueAvg):'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',color:'#059669'}}>{e.estimatedRevenueHigh!=null?fmtLarge(e.estimatedRevenueHigh):'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',color:'#DC2626'}}>{e.estimatedRevenueLow!=null?fmtLarge(e.estimatedRevenueLow):'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',color:'#7D8FA9'}}>{e.estimatedEbitdaAvg!=null?fmtLarge(e.estimatedEbitdaAvg):'—'}</td>
                    <td style={{padding:'9px 14px',textAlign:'right',color:'#7D8FA9'}}>{e.estimatedNetIncomeAvg!=null?fmtLarge(e.estimatedNetIncomeAvg):'—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{padding:48,textAlign:'center',color:'#7D8FA9'}}>No estimates data for this period.</div>
      )}
    </div>
  )
}

// ─── Transcripts Tab ──────────────────────────────────────────────────────────
function TranscriptsTab({ symbol, transcripts, loading, selTranscript, onSelect, content, search, setSearch }: any) {
  const filtered = content?.segments?.filter((s:any)=>
    !search || s.text.toLowerCase().includes(search.toLowerCase()) || s.speaker.toLowerCase().includes(search.toLowerCase())
  ) || []

  if (loading) return <div className="skeleton" style={{height:300,borderRadius:12}}/>

  return (
    <div style={{display:'grid',gridTemplateColumns:selTranscript?'280px 1fr':'1fr',gap:16}}>
      {/* List panel */}
      <div>
        <div className="section-title">Earnings Calls</div>
        {transcripts.length === 0 ? (
          <div className="card" style={{padding:32,textAlign:'center',color:'#7D8FA9',fontSize:13}}>No transcripts found.</div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:8}}>
            {transcripts.map((t:any,i:number)=>(
              <button key={i} onClick={()=>onSelect(t)}
                style={{
                  padding:'12px 16px',borderRadius:10,border:'1.5px solid',cursor:'pointer',textAlign:'left',
                  borderColor:selTranscript?.year===t.year&&selTranscript?.quarter===t.quarter?'#1B4FFF':'#E2E8F2',
                  background:selTranscript?.year===t.year&&selTranscript?.quarter===t.quarter?'#EEF3FF':'#fff',
                  transition:'all 0.15s',
                }}>
                <div style={{fontWeight:700,color:'#0A1628',fontSize:14}}>Q{t.quarter} {t.year}</div>
                <div style={{fontSize:12,color:'#7D8FA9',marginTop:2}}>{t.date||'Earnings Call'}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Transcript viewer */}
      {selTranscript && (
        <div>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12,flexWrap:'wrap',gap:8}}>
            <div>
              <div className="section-title" style={{marginBottom:2}}>Q{selTranscript.quarter} {selTranscript.year} Earnings Call</div>
              <div style={{fontSize:12,color:'#7D8FA9'}}>{content?.date||''}</div>
            </div>
            <div style={{display:'flex',gap:8}}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search transcript…"
                style={{padding:'7px 12px',borderRadius:8,border:'1.5px solid #E2E8F2',fontSize:13,width:200,outline:'none',fontFamily:'inherit'}}/>
              {content && (
                <button onClick={()=>csvExport(content.segments,`${symbol}_Q${selTranscript.quarter}_${selTranscript.year}_transcript.csv`)}
                  className="btn btn-ghost btn-sm">⬇ Export</button>
              )}
            </div>
          </div>

          {!content ? (
            <div className="skeleton" style={{height:400,borderRadius:12}}/>
          ) : (
            <div className="card" style={{padding:0,overflow:'hidden',maxHeight:600,overflowY:'auto'}}>
              {filtered.map((seg:any,i:number)=>(
                <div key={i} style={{padding:'14px 20px',borderBottom:'1px solid #F0F4FA',display:'flex',gap:14}}>
                  <div style={{width:120,flexShrink:0}}>
                    <div style={{fontSize:12,fontWeight:700,color:seg.role==='Operator'?'#7D8FA9':'#1B4FFF'}}>{seg.speaker}</div>
                    <div style={{fontSize:11,color:'#B0BCD0',marginTop:2}}>{seg.role}</div>
                  </div>
                  <div style={{fontSize:13,color:'#2D3748',lineHeight:1.65,flex:1}}>
                    {search ? highlightText(seg.text, search) : seg.text}
                  </div>
                </div>
              ))}
              {filtered.length===0&&<div style={{padding:48,textAlign:'center',color:'#7D8FA9'}}>No matching segments.</div>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function highlightText(text: string, query: string) {
  if (!query) return text
  const parts = text.split(new RegExp(`(${query})`, 'gi'))
  return <>{parts.map((p,i)=>p.toLowerCase()===query.toLowerCase()?<mark key={i} style={{background:'#FEF9C3',borderRadius:2}}>{p}</mark>:p)}</>
}

// ─── Filings Tab ──────────────────────────────────────────────────────────────
function FilingsTab({ symbol, filings, loading }: any) {
  const [filter, setFilter] = useState('all')
  const types = ['all', ...Array.from(new Set(filings.map((f:any)=>f.type||f.formType).filter(Boolean)))] as string[]
  const shown = filter==='all' ? filings : filings.filter((f:any)=>(f.type||f.formType)===filter)

  if (loading) return <div className="skeleton" style={{height:300,borderRadius:12}}/>

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:16,flexWrap:'wrap',gap:8}}>
        <div className="section-title" style={{marginBottom:0}}>SEC Filings — {symbol}</div>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {types.slice(0,8).map(t=>(
            <button key={t} onClick={()=>setFilter(t)}
              style={{padding:'4px 12px',borderRadius:999,fontSize:12,fontWeight:600,cursor:'pointer',border:'1.5px solid',
                borderColor:filter===t?'#1B4FFF':'#E2E8F2',background:filter===t?'#EEF3FF':'#fff',color:filter===t?'#1B4FFF':'#7D8FA9'}}>
              {t.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card" style={{padding:48,textAlign:'center',color:'#7D8FA9'}}>No filings found.</div>
      ) : (
        <div className="card" style={{overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'2px solid #E2E8F2',background:'#F8FAFD'}}>
                <th style={{padding:'10px 16px',textAlign:'left',fontWeight:700,color:'#1C2B4A'}}>Type</th>
                <th style={{padding:'10px 16px',textAlign:'left',fontWeight:700,color:'#1C2B4A'}}>Description</th>
                <th style={{padding:'10px 14px',textAlign:'left',fontWeight:700,color:'#1C2B4A'}}>Filed</th>
                <th style={{padding:'10px 14px',textAlign:'center',fontWeight:700,color:'#1C2B4A'}}>Links</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((f:any,i:number)=>(
                <tr key={i} style={{borderBottom:'1px solid #F0F4FA',background:i%2===0?'#fff':'#FAFBFD'}}>
                  <td style={{padding:'10px 16px'}}>
                    <span className={`badge ${['10-K','20-F'].includes(f.type||f.formType)?'badge-blue':['10-Q'].includes(f.type||f.formType)?'badge-amber':'badge-gray'}`}>
                      {f.type||f.formType||'—'}
                    </span>
                  </td>
                  <td style={{padding:'10px 16px',color:'#2D3748',maxWidth:300}}>
                    <div style={{fontWeight:600,color:'#0A1628',marginBottom:2}}>{f.title||f.description||'—'}</div>
                    {f.cik&&<div style={{fontSize:11,color:'#B0BCD0'}}>CIK: {f.cik}</div>}
                  </td>
                  <td style={{padding:'10px 14px',color:'#7D8FA9',whiteSpace:'nowrap'}}>{f.filedAt||f.date||'—'}</td>
                  <td style={{padding:'10px 14px',textAlign:'center'}}>
                    <div style={{display:'flex',gap:8,justifyContent:'center'}}>
                      {(f.linkToFilingDetails||f.url||f.link) && (
                        <a href={f.linkToFilingDetails||f.url||f.link} target="_blank" rel="noopener"
                          className="btn btn-ghost btn-sm" style={{fontSize:11,padding:'3px 8px'}}>View</a>
                      )}
                      {f.linkToHtmlFile && (
                        <a href={f.linkToHtmlFile} target="_blank" rel="noopener"
                          className="btn btn-primary btn-sm" style={{fontSize:11,padding:'3px 8px'}}>HTML</a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Comps Tab ────────────────────────────────────────────────────────────────
function CompsTab({ symbol, peers }: any) {
  const [sortKey, setSortKey] = useState('mc')
  const [sortDir, setSortDir] = useState(-1)
  const sorted = [...peers].sort((a,b)=>(a[sortKey]-b[sortKey])*sortDir)

  const cols = [
    {key:'s',label:'Ticker',fmt:(v:any)=>v},{key:'n',label:'Company',fmt:(v:any)=>v},
    {key:'mc',label:'Mkt Cap',fmt:fmtLarge},{key:'pe',label:'P/E',fmt:(v:any)=>`${v}x`},
    {key:'ps',label:'P/S',fmt:(v:any)=>`${v}x`},{key:'pb',label:'P/B',fmt:(v:any)=>`${v}x`},
    {key:'roe',label:'ROE %',fmt:(v:any)=>`${v}%`},{key:'gm',label:'Gross Margin',fmt:(v:any)=>`${v}%`},
    {key:'ebitda',label:'EBITDA %',fmt:(v:any)=>`${v}%`},{key:'rev',label:'Revenue',fmt:fmtLarge},
    {key:'growth',label:'Rev Growth',fmt:(v:any)=>`${v}%`},{key:'div',label:'Div Yield',fmt:(v:any)=>v?`${v}%`:'—'},
  ]

  function toggleSort(k:string) { if(sortKey===k){setSortDir(d=>d*-1)}else{setSortKey(k);setSortDir(-1)} }
  function exportCSV() { csvExport(sorted.map(p=>({Ticker:p.s,Company:p.n,'Market Cap':p.mc,PE:p.pe,PS:p.ps,PB:p.pb,ROE:p.roe,GrossMargin:p.gm,EBITDAMargin:p.ebitda,Revenue:p.rev,Growth:p.growth,DivYield:p.div})), `${symbol}_peers.csv`) }

  return (
    <div>
      <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}>
        <button onClick={exportCSV} className="btn btn-ghost btn-sm">⬇ Export CSV</button>
      </div>
      <div className="card" style={{overflow:'hidden'}}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{borderBottom:'2px solid #E2E8F2',background:'#F8FAFD'}}>
                {cols.map(c=>(
                  <th key={c.key} onClick={()=>['s','n'].includes(c.key)?null:toggleSort(c.key)}
                    style={{padding:'10px 14px',textAlign:c.key==='s'||c.key==='n'?'left':'right',fontWeight:700,color:'#1C2B4A',whiteSpace:'nowrap',cursor:['s','n'].includes(c.key)?'default':'pointer',userSelect:'none'}}>
                    {c.label}{sortKey===c.key?(sortDir>0?' ↑':' ↓'):''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((p:any,i:number)=>(
                <tr key={p.s} style={{borderBottom:'1px solid #F0F4FA',background:p.s===symbol?'#EEF3FF':i%2===0?'#fff':'#FAFBFD'}}>
                  {cols.map(c=>(
                    <td key={c.key} style={{padding:'10px 14px',textAlign:c.key==='s'||c.key==='n'?'left':'right',
                      fontWeight:c.key==='s'?800:600,color:c.key==='s'?'#1B4FFF':'#0A1628',whiteSpace:'nowrap'}}>
                      {c.key==='s'?<Link href={`/app/company/${p.s}`} style={{color:'#1B4FFF',textDecoration:'none'}}>{p.s}</Link>:c.fmt(p[c.key])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Utility (local for use in sub-components) ────────────────────────────────
function fmtV(v: any, unit?: string): string {
  if (v == null || v === '') return '—'
  const n = typeof v === 'string' ? parseFloat(v) : v
  if (isNaN(n)) return String(v)
  if (unit === '%') return `${(n * 100).toFixed(1)}%`
  if (unit === '$large') return fmtLarge(n)
  if (unit === '$') return `$${fmt(n)}`
  if (unit === 'x') return `${fmt(n)}x`
  return fmt(n)
}

function csvExport(rows: any[], filename: string) {
  if (!rows.length) return
  const keys = Object.keys(rows[0])
  const csv = [keys.join(','), ...rows.map(r => keys.map(k => JSON.stringify(r[k] ?? '')).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; a.click()
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null || isNaN(n as number)) return '—'
  return (n as number).toFixed(decimals)
}
