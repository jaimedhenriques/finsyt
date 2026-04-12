'use client'
import { useState, useEffect, useRef } from 'react'
import { AreaChart, Area, BarChart, Bar, LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts'
import Link from 'next/link'
import { useParams } from 'next/navigation'

type Tab = 'overview'|'financials'|'news'|'insider'|'filings'|'estimates'|'transcripts'|'ownership'|'dcf'

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ data, color }: { data: number[]; color: string }) {
  const pts = data.map((v, i) => ({ v }))
  return (
    <ResponsiveContainer width="100%" height={40}>
      <AreaChart data={pts} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={`sg-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={color} stopOpacity={0.2} />
            <stop offset="95%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} fill={`url(#sg-${color})`} dot={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

// ── Live Overview Tab ─────────────────────────────────────────────────────────
function OverviewTab({ symbol, profile }: { symbol: string; profile: any }) {
  const [chart, setChart] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<'1M'|'3M'|'1Y'|'5Y'>('1Y')

  useEffect(() => {
    const ranges: Record<string, { from: string; to: string }> = {
      '1M': { from: new Date(Date.now()-30*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
      '3M': { from: new Date(Date.now()-90*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
      '1Y': { from: new Date(Date.now()-365*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
      '5Y': { from: new Date(Date.now()-1825*864e5).toISOString().slice(0,10), to: new Date().toISOString().slice(0,10) },
    }
    const { from, to } = ranges[period]
    setLoading(true)
    fetch(`/api/aggs?symbol=${symbol}&from=${from}&to=${to}&timespan=day`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.results) setChart(d.results.map((x: any) => ({ date: new Date(x.t).toLocaleDateString('en-US',{month:'short',day:'numeric'}), close: x.c, volume: x.v })))
        setLoading(false)
      }).catch(() => setLoading(false))
  }, [symbol, period])

  const p = profile
  if (!p) return <div style={{ padding: 40, color: 'rgba(255,255,255,0.4)', textAlign: 'center' }}>Loading...</div>

  const pos = (p.changesPercentage ?? p.changePct ?? 0) >= 0
  const pct = Math.abs(p.changesPercentage ?? p.changePct ?? 0).toFixed(2)
  const price = (p.price ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const kpis = [
    { label: 'Market Cap', value: p.mktCap ? `$${(p.mktCap/1e9).toFixed(1)}B` : (p.marketCap ? `$${p.marketCap}B` : '—') },
    { label: 'P/E Ratio',  value: p.pe ? p.pe.toFixed(1) : (p.peRatio?.toFixed(1) ?? '—') },
    { label: 'EPS (TTM)',  value: p.eps ? `$${p.eps.toFixed(2)}` : '—' },
    { label: 'Revenue',    value: p.revenue ? `$${(p.revenue/1e9).toFixed(1)}B` : (profile.revenue ? `$${profile.revenue}B` : '—') },
    { label: '52W High',   value: p.yearHigh ? `$${p.yearHigh.toFixed(2)}` : '—' },
    { label: '52W Low',    value: p.yearLow ? `$${p.yearLow.toFixed(2)}` : '—' },
    { label: 'Avg Volume', value: p.volAvg ? `${(p.volAvg/1e6).toFixed(1)}M` : '—' },
    { label: 'Beta',       value: p.beta ? p.beta.toFixed(2) : '—' },
  ]

  return (
    <div>
      {/* Price header */}
      <div style={{ display:'flex', alignItems:'baseline', gap:16, marginBottom:8 }}>
        <span style={{ fontSize:40, fontWeight:800, color:'#fff', letterSpacing:'-0.03em' }}>${price}</span>
        <span style={{ fontSize:16, fontWeight:600, color: pos ? '#34d399' : '#f87171' }}>
          {pos?'+':'-'}{pct}%
        </span>
        <span style={{ fontSize:13, color:'rgba(255,255,255,0.3)', marginLeft:'auto' }}>{p.exchangeShortName ?? p.exchange}</span>
      </div>

      {/* Chart */}
      <div style={{ background:'rgba(255,255,255,0.02)', borderRadius:12, padding:'16px 8px 8px', marginBottom:24, border:'1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display:'flex', gap:8, marginBottom:16, paddingLeft:8 }}>
          {(['1M','3M','1Y','5Y'] as const).map(p => (
            <button key={p} onClick={()=>setPeriod(p)} style={{ padding:'4px 12px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background: period===p ? '#1B4FFF' : 'rgba(255,255,255,0.06)', color: period===p ? '#fff' : 'rgba(255,255,255,0.5)' }}>{p}</button>
          ))}
        </div>
        {loading ? (
          <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.2)', fontSize:13 }}>Loading chart...</div>
        ) : chart.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={chart} margin={{ top:0, right:8, left:-20, bottom:0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1B4FFF" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#1B4FFF" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{ fill:'rgba(255,255,255,0.25)', fontSize:10 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
              <YAxis tick={{ fill:'rgba(255,255,255,0.25)', fontSize:10 }} tickLine={false} axisLine={false} domain={['auto','auto']} tickFormatter={(v:number)=>`$${v.toFixed(0)}`} />
              <Tooltip contentStyle={{ background:'#0d1b32', border:'1px solid rgba(27,79,255,0.25)', borderRadius:8, fontSize:12 }} labelStyle={{ color:'rgba(255,255,255,0.6)' }} itemStyle={{ color:'#93c5fd' }} formatter={(v:any)=>[`$${Number(v).toFixed(2)}`,'Price']} />
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
              <Area type="monotone" dataKey="close" stroke="#1B4FFF" strokeWidth={2} fill="url(#priceGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div style={{ height:180, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.2)', fontSize:13 }}>No chart data</div>
        )}
      </div>

      {/* KPI grid */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:24 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{k.label}</div>
            <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Description */}
      {p.description && (
        <div style={{ background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:10 }}>Company Overview</div>
          <p style={{ fontSize:13.5, color:'rgba(255,255,255,0.65)', lineHeight:1.75 }}>{p.description.slice(0,600)}{p.description.length>600?'…':''}</p>
        </div>
      )}
    </div>
  )
}

// ── Live News Tab ─────────────────────────────────────────────────────────────
function NewsTab({ symbol }: { symbol: string }) {
  const [news, setNews] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch(`/api/news?symbol=${symbol}&limit=20`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setNews(d); else if (d?.news) setNews(d.news); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol])

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Loading news...</div>
  if (!news.length) return <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>No news found</div>

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {news.slice(0,15).map((n: any, i: number) => (
        <a key={i} href={n.url || n.link || '#'} target="_blank" rel="noopener noreferrer" style={{ display:'block', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, padding:'16px 18px', textDecoration:'none', transition:'border-color 0.15s' }}
          onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(27,79,255,0.3)')}
          onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.06)')}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:16, marginBottom:8 }}>
            <span style={{ fontSize:14, fontWeight:600, color:'#fff', lineHeight:1.45, flex:1 }}>{n.title}</span>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)', whiteSpace:'nowrap' }}>{n.publishedDate ? new Date(n.publishedDate).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : ''}</span>
          </div>
          {n.text && <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.45)', lineHeight:1.6, margin:0 }}>{n.text.slice(0,160)}…</p>}
          <div style={{ marginTop:8, fontSize:11, color:'rgba(255,255,255,0.25)' }}>{n.site || n.publisher || ''}</div>
        </a>
      ))}
    </div>
  )
}

// ── Live Insider Tab ──────────────────────────────────────────────────────────
function InsiderTab({ symbol }: { symbol: string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch(`/api/insider?symbol=${symbol}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setData(d); else if (d?.data) setData(d.data); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol])

  const buys = data.filter((x:any) => ['P','A','M'].includes(x.transactionType ?? x.acquistionOrDisposition ?? ''))
  const sells = data.filter((x:any) => ['S','D'].includes(x.transactionType ?? x.acquistionOrDisposition ?? ''))

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Loading insider data...</div>

  return (
    <div>
      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
        <div style={{ background:'rgba(52,211,153,0.06)', border:'1px solid rgba(52,211,153,0.15)', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(52,211,153,0.7)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Buys (last 90d)</div>
          <div style={{ fontSize:28, fontWeight:800, color:'#34d399' }}>{buys.length}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:4 }}>transactions</div>
        </div>
        <div style={{ background:'rgba(248,113,113,0.06)', border:'1px solid rgba(248,113,113,0.15)', borderRadius:10, padding:16 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'rgba(248,113,113,0.7)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8 }}>Sells (last 90d)</div>
          <div style={{ fontSize:28, fontWeight:800, color:'#f87171' }}>{sells.length}</div>
          <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:4 }}>transactions</div>
        </div>
      </div>
      {/* Table */}
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
              {['Date','Insider','Title','Type','Shares','Value','Price'].map(h => (
                <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'rgba(255,255,255,0.35)', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.slice(0,30).map((row: any, i: number) => {
              const isBuy = ['P','A','M'].includes(row.transactionType ?? row.acquistionOrDisposition ?? '')
              return (
                <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.5)' }}>{row.transactionDate?.slice(0,10) ?? '—'}</td>
                  <td style={{ padding:'10px 12px', color:'#fff', fontWeight:600 }}>{row.reportingName ?? row.insiderName ?? '—'}</td>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.4)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{row.typeOfOwner ?? row.title ?? '—'}</td>
                  <td style={{ padding:'10px 12px' }}><span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:4, background: isBuy?'rgba(52,211,153,0.12)':'rgba(248,113,113,0.12)', color: isBuy?'#34d399':'#f87171' }}>{isBuy?'BUY':'SELL'}</span></td>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.7)' }}>{row.securitiesTransacted?.toLocaleString() ?? row.shares?.toLocaleString() ?? '—'}</td>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.7)' }}>{row.securitiesTransacted && row.price ? `$${(row.securitiesTransacted*row.price/1e6).toFixed(2)}M` : '—'}</td>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.5)' }}>{row.price ? `$${Number(row.price).toFixed(2)}` : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── Live Ownership Tab ────────────────────────────────────────────────────────
function OwnershipTab({ symbol }: { symbol: string }) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    fetch(`https://financialmodelingprep.com/stable/institutional-ownership/symbol-ownership?symbol=${symbol}&apikey=${process.env.NEXT_PUBLIC_FMP_API_KEY || ''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setData(d.slice(0,20)); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol])

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Loading ownership data...</div>
  if (!data.length) return <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>No ownership data available</div>

  const total = data.reduce((acc: number, x: any) => acc + (x.shares ?? 0), 0)

  return (
    <div style={{ overflowX:'auto' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
        <thead>
          <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
            {['Institution','Shares','% of Portfolio','Change','Filed'].map(h => (
              <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'rgba(255,255,255,0.35)', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row: any, i: number) => {
            const chg = row.changeInSharesNumberPercentage ?? 0
            return (
              <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ padding:'10px 12px', color:'#fff', fontWeight:600 }}>{row.investorName ?? '—'}</td>
                <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.7)' }}>{row.shares?.toLocaleString() ?? '—'}</td>
                <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.6)' }}>{total > 0 ? ((row.shares/total)*100).toFixed(2)+'%' : '—'}</td>
                <td style={{ padding:'10px 12px' }}>
                  <span style={{ fontSize:11, fontWeight:700, color: chg > 0 ? '#34d399' : chg < 0 ? '#f87171' : 'rgba(255,255,255,0.4)' }}>
                    {chg > 0 ? '+' : ''}{chg.toFixed(1)}%
                  </span>
                </td>
                <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.4)' }}>{row.date?.slice(0,10) ?? '—'}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Live Filings Tab ──────────────────────────────────────────────────────────
function FilingsTab({ symbol }: { symbol: string }) {
  const [filings, setFilings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [type, setType] = useState('all')
  useEffect(() => {
    setLoading(true)
    fetch(`/api/sec/filings?symbol=${symbol}&limit=20${type!=='all'?`&type=${type}`:''}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (Array.isArray(d)) setFilings(d); else if (d?.filings) setFilings(d.filings); setLoading(false) })
      .catch(() => setLoading(false))
  }, [symbol, type])

  const TYPES = ['all','10-K','10-Q','8-K','DEF 14A','S-1']
  const typeColors: Record<string,string> = { '10-K':'#1B4FFF','10-Q':'#059669','8-K':'#D97706','DEF 14A':'#8B5CF6','S-1':'#EC4899','4':'#6b7280' }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {TYPES.map(t => (
          <button key={t} onClick={()=>setType(t)} style={{ padding:'5px 14px', borderRadius:6, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background: type===t ? '#1B4FFF' : 'rgba(255,255,255,0.06)', color: type===t ? '#fff' : 'rgba(255,255,255,0.5)' }}>{t}</button>
        ))}
      </div>
      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Loading filings...</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {filings.slice(0,20).map((f: any, i: number) => (
            <a key={i} href={f.linkToFilingDetails ?? f.url ?? '#'} target="_blank" rel="noopener noreferrer"
              style={{ display:'flex', alignItems:'center', gap:16, padding:'14px 16px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:9, textDecoration:'none', transition:'border-color 0.15s' }}
              onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(27,79,255,0.3)')}
              onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.06)')}>
              <span style={{ fontSize:10, fontWeight:800, padding:'3px 8px', borderRadius:5, background: `${typeColors[f.type]||'#6b7280'}22`, color: typeColors[f.type]||'#6b7280', minWidth:48, textAlign:'center' }}>{f.type}</span>
              <span style={{ fontSize:13.5, color:'#fff', fontWeight:500, flex:1 }}>{f.description ?? f.title ?? f.formType ?? 'Filing'}</span>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.35)', whiteSpace:'nowrap' }}>{f.filedAt?.slice(0,10) ?? f.date?.slice(0,10) ?? ''}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 0 1 0h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            </a>
          ))}
          {!filings.length && <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>No filings found</div>}
        </div>
      )}
    </div>
  )
}

// ── Live Estimates Tab ────────────────────────────────────────────────────────
function EstimatesTab({ symbol }: { symbol: string }) {
  const [consensus, setConsensus] = useState<any>(null)
  const [estimates, setEstimates] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    Promise.all([
      fetch(`https://financialmodelingprep.com/stable/price-target-consensus?symbol=${symbol}&apikey=${process.env.NEXT_PUBLIC_FMP_API_KEY||''}`).then(r=>r.ok?r.json():null),
      fetch(`https://financialmodelingprep.com/stable/analyst-estimates?symbol=${symbol}&period=annual&limit=4&apikey=${process.env.NEXT_PUBLIC_FMP_API_KEY||''}`).then(r=>r.ok?r.json():null),
    ]).then(([c, e]) => {
      if (c && c[0]) setConsensus(c[0])
      if (Array.isArray(e)) setEstimates(e)
      setLoading(false)
    }).catch(()=>setLoading(false))
  }, [symbol])

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Loading estimates...</div>

  return (
    <div>
      {consensus && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:24 }}>
          {[
            { label:'Consensus PT', value: consensus.targetConsensus ? `$${consensus.targetConsensus.toFixed(2)}` : '—' },
            { label:'High PT', value: consensus.targetHigh ? `$${consensus.targetHigh.toFixed(2)}` : '—' },
            { label:'Low PT', value: consensus.targetLow ? `$${consensus.targetLow.toFixed(2)}` : '—' },
          ].map(k => (
            <div key={k.label} style={{ background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.07)', borderRadius:10, padding:16 }}>
              <div style={{ fontSize:11, fontWeight:600, color:'rgba(255,255,255,0.35)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:6 }}>{k.label}</div>
              <div style={{ fontSize:22, fontWeight:700, color:'#93B4FF' }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}
      {estimates.length > 0 && (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                {['Year','Revenue Est.','EPS Est. Low','EPS Est. High','EPS Est. Avg'].map(h => (
                  <th key={h} style={{ padding:'8px 12px', textAlign:'left', color:'rgba(255,255,255,0.35)', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {estimates.map((row: any, i: number) => (
                <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.6)', fontWeight:600 }}>{row.date?.slice(0,4)}</td>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.8)' }}>${((row.revenueAvg||0)/1e9).toFixed(1)}B</td>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.6)' }}>${(row.epsAvgLow||0).toFixed(2)}</td>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.6)' }}>${(row.epsAvgHigh||0).toFixed(2)}</td>
                  <td style={{ padding:'10px 12px', color:'#93B4FF', fontWeight:600 }}>${(row.epsAvg||0).toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Live Transcripts Tab ──────────────────────────────────────────────────────
function TranscriptsTab({ symbol }: { symbol: string }) {
  const [list, setList] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadingText, setLoadingText] = useState(false)
  useEffect(() => {
    fetch(`/api/transcripts?symbol=${symbol}&limit=8`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(Array.isArray(d))setList(d); else if(d?.transcripts)setList(d.transcripts); setLoading(false) })
      .catch(()=>setLoading(false))
  },[symbol])

  const loadTranscript = (item: any) => {
    if (item.content) { setSelected(item); return }
    setLoadingText(true)
    const url = `https://financialmodelingprep.com/stable/earnings-call-transcript?symbol=${symbol}&year=${item.year}&quarter=${item.quarter}&apikey=${process.env.NEXT_PUBLIC_FMP_API_KEY||''}`
    fetch(url).then(r=>r.ok?r.json():null).then(d=>{
      const t = Array.isArray(d)?d[0]:d
      setSelected({ ...item, content: t?.content || 'Transcript not available.' })
      setLoadingText(false)
    }).catch(()=>setLoadingText(false))
  }

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Loading transcripts...</div>

  if (selected) return (
    <div>
      <button onClick={()=>setSelected(null)} style={{ display:'flex', alignItems:'center', gap:6, marginBottom:20, background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:13, fontWeight:600, padding:0 }}>
        ← Back to list
      </button>
      <h3 style={{ fontSize:16, fontWeight:700, color:'#fff', marginBottom:16 }}>{selected.title ?? `Q${selected.quarter} ${selected.year} Earnings Call`}</h3>
      {loadingText ? (
        <div style={{ color:'rgba(255,255,255,0.3)', fontSize:13 }}>Loading transcript...</div>
      ) : (
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.7)', lineHeight:1.8, whiteSpace:'pre-wrap', maxHeight:500, overflowY:'auto', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:10, padding:20 }}>
          {selected.content}
        </div>
      )}
    </div>
  )

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
      {list.map((item: any, i: number) => (
        <button key={i} onClick={()=>loadTranscript(item)} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 18px', background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.06)', borderRadius:9, cursor:'pointer', textAlign:'left', transition:'border-color 0.15s' }}
          onMouseEnter={e=>(e.currentTarget.style.borderColor='rgba(27,79,255,0.3)')}
          onMouseLeave={e=>(e.currentTarget.style.borderColor='rgba(255,255,255,0.06)')}>
          <div>
            <div style={{ fontSize:14, fontWeight:600, color:'#fff' }}>{item.title ?? `Q${item.quarter} ${item.year} Earnings Call`}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:4 }}>{item.date?.slice(0,10) ?? ''}</div>
          </div>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      ))}
      {!list.length && <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>No transcripts available</div>}
    </div>
  )
}

// ── Live Financials Tab ───────────────────────────────────────────────────────
function FinancialsTab({ symbol }: { symbol: string }) {
  const [stmt, setStmt] = useState<'income'|'balance'|'cashflow'>('income')
  const [period, setPeriod] = useState<'annual'|'quarterly'>('annual')
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    const map = { income:'income-statement', balance:'balance-sheet-statement', cashflow:'cash-flow-statement' }
    fetch(`https://financialmodelingprep.com/stable/${map[stmt]}?symbol=${symbol}&period=${period}&limit=8&apikey=${process.env.NEXT_PUBLIC_FMP_API_KEY||''}`)
      .then(r=>r.ok?r.json():null)
      .then(d=>{ if(Array.isArray(d))setData(d); setLoading(false) })
      .catch(()=>setLoading(false))
  },[symbol,stmt,period])

  const INCOME_ROWS = [
    { key:'revenue', label:'Revenue' },
    { key:'grossProfit', label:'Gross Profit' },
    { key:'grossProfitRatio', label:'Gross Margin', pct:true },
    { key:'operatingIncome', label:'Operating Income' },
    { key:'operatingIncomeRatio', label:'Operating Margin', pct:true },
    { key:'netIncome', label:'Net Income' },
    { key:'netIncomeRatio', label:'Net Margin', pct:true },
    { key:'eps', label:'EPS' },
    { key:'ebitda', label:'EBITDA' },
  ]
  const BALANCE_ROWS = [
    { key:'totalCurrentAssets', label:'Current Assets' },
    { key:'cashAndCashEquivalents', label:'Cash & Equivalents' },
    { key:'totalAssets', label:'Total Assets' },
    { key:'totalCurrentLiabilities', label:'Current Liabilities' },
    { key:'totalDebt', label:'Total Debt' },
    { key:'totalStockholdersEquity', label:'Total Equity' },
  ]
  const CASHFLOW_ROWS = [
    { key:'operatingCashFlow', label:'Operating CF' },
    { key:'capitalExpenditure', label:'CapEx' },
    { key:'freeCashFlow', label:'Free Cash Flow' },
    { key:'dividendsPaid', label:'Dividends Paid' },
    { key:'stockRepurchased', label:'Buybacks' },
  ]
  const rows = stmt==='income'?INCOME_ROWS:stmt==='balance'?BALANCE_ROWS:CASHFLOW_ROWS

  const fmt = (v:any, pct:boolean=false) => {
    if(v===null||v===undefined) return '—'
    if(pct) return `${(v*100).toFixed(1)}%`
    const n = Math.abs(v)
    if(n>=1e9) return `${v<0?'-':''}$${(n/1e9).toFixed(1)}B`
    if(n>=1e6) return `${v<0?'-':''}$${(n/1e6).toFixed(0)}M`
    return `${v<0?'-':''}$${n.toFixed(2)}`
  }

  return (
    <div>
      <div style={{ display:'flex', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        {(['income','balance','cashflow'] as const).map(s => (
          <button key={s} onClick={()=>setStmt(s)} style={{ padding:'6px 16px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:stmt===s?'#1B4FFF':'rgba(255,255,255,0.06)', color:stmt===s?'#fff':'rgba(255,255,255,0.5)' }}>
            {s==='income'?'Income Statement':s==='balance'?'Balance Sheet':'Cash Flow'}
          </button>
        ))}
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {(['annual','quarterly'] as const).map(p => (
            <button key={p} onClick={()=>setPeriod(p)} style={{ padding:'6px 14px', borderRadius:7, border:'none', cursor:'pointer', fontSize:12, fontWeight:600, background:period===p?'rgba(27,79,255,0.25)':'rgba(255,255,255,0.04)', color:period===p?'#93B4FF':'rgba(255,255,255,0.4)' }}>
              {p==='annual'?'Annual':'Quarterly'}
            </button>
          ))}
        </div>
      </div>
      {loading ? <div style={{ padding:40, textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Loading...</div> : (
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.08)' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', color:'rgba(255,255,255,0.35)', fontWeight:700, fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em', minWidth:160 }}>Metric</th>
                {data.map((d:any) => (
                  <th key={d.date} style={{ padding:'8px 12px', textAlign:'right', color:'rgba(255,255,255,0.5)', fontWeight:600, fontSize:11 }}>{d.date?.slice(0,7)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.key} style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ padding:'10px 12px', color:'rgba(255,255,255,0.65)', fontWeight:500 }}>{row.label}</td>
                  {data.map((d:any, i:number) => (
                    <td key={i} style={{ padding:'10px 12px', textAlign:'right', color:(row as any).pct?'rgba(255,255,255,0.65)':d[row.key]<0?'#f87171':'rgba(255,255,255,0.8)', fontWeight:600 }}>
                      {fmt(d[row.key],(row as any).pct)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── DCF Placeholder ───────────────────────────────────────────────────────────
function DCFTab({ symbol }: { symbol: string }) {
  return (
    <div style={{ padding:40, textAlign:'center' }}>
      <div style={{ fontSize:40, marginBottom:16 }}>📊</div>
      <div style={{ fontSize:18, fontWeight:700, color:'#fff', marginBottom:8 }}>DCF Model</div>
      <div style={{ fontSize:14, color:'rgba(255,255,255,0.4)' }}>Interactive DCF builder coming soon — set your own assumptions, see fair value range.</div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CompanyPage() {
  const params = useParams()
  const symbol = (params.symbol as string)?.toUpperCase() ?? ''
  const [tab, setTab] = useState<Tab>('overview')
  const [profile, setProfile] = useState<any>(null)
  const [profileLoading, setProfileLoading] = useState(true)

  const TABS: { id: Tab; label: string }[] = [
    { id:'overview',    label:'Overview' },
    { id:'financials',  label:'Financials' },
    { id:'news',        label:'News' },
    { id:'insider',     label:'Insider' },
    { id:'filings',     label:'Filings' },
    { id:'estimates',   label:'Estimates' },
    { id:'transcripts', label:'Transcripts' },
    { id:'ownership',   label:'Ownership' },
    { id:'dcf',         label:'DCF' },
  ]

  useEffect(() => {
    if (!symbol) return
    fetch(`/api/quote?symbol=${symbol}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        // FMP quote returns array
        const q = Array.isArray(d) ? d[0] : d
        if (q) setProfile(q)
        // Also fetch profile for description
        return fetch(`https://financialmodelingprep.com/stable/profile?symbol=${symbol}&apikey=${process.env.NEXT_PUBLIC_FMP_API_KEY||''}`)
      })
      .then(r => r && r.ok ? r.json() : null)
      .then(d => {
        const p = Array.isArray(d) ? d[0] : d
        if (p) setProfile((prev: any) => ({ ...prev, ...p }))
        setProfileLoading(false)
      })
      .catch(() => setProfileLoading(false))
  }, [symbol])

  const pos = (profile?.changesPercentage ?? 0) >= 0

  return (
    <div style={{ minHeight:'100vh', background:'#080d1a', color:'#fff', fontFamily:'Inter,system-ui,sans-serif' }}>
      {/* Header */}
      <div style={{ padding:'28px 32px 0', maxWidth:1280, margin:'0 auto' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, fontSize:13, color:'rgba(255,255,255,0.4)' }}>
          <Link href="/app/research" style={{ color:'rgba(255,255,255,0.4)', textDecoration:'none' }}>Research</Link>
          <span>/</span>
          <span style={{ color:'rgba(255,255,255,0.7)' }}>{symbol}</span>
        </div>

        {profileLoading ? (
          <div style={{ height:80, display:'flex', alignItems:'center' }}>
            <div style={{ fontSize:14, color:'rgba(255,255,255,0.3)' }}>Loading {symbol}...</div>
          </div>
        ) : profile ? (
          <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:28 }}>
            {/* Logo */}
            <div style={{ width:52, height:52, borderRadius:12, background:'rgba(255,255,255,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'#fff', border:'1px solid rgba(255,255,255,0.1)', flexShrink:0 }}>
              {profile.image ? <img src={profile.image} alt={symbol} style={{ width:36, height:36, objectFit:'contain' }} onError={e=>(e.currentTarget.style.display='none')} /> : symbol.slice(0,1)}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', alignItems:'baseline', gap:12, flexWrap:'wrap' }}>
                <h1 style={{ fontSize:24, fontWeight:800, color:'#fff', letterSpacing:'-0.025em', margin:0 }}>{profile.companyName ?? symbol}</h1>
                <span style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,0.3)', background:'rgba(255,255,255,0.07)', padding:'3px 10px', borderRadius:6 }}>{symbol}</span>
                <span style={{ fontSize:13, color:'rgba(255,255,255,0.3)' }}>{profile.exchangeShortName} · {profile.sector}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:16, marginTop:6 }}>
                <span style={{ fontSize:28, fontWeight:800, color:'#fff', letterSpacing:'-0.025em' }}>
                  ${(profile.price ?? 0).toLocaleString('en-US',{ minimumFractionDigits:2, maximumFractionDigits:2 })}
                </span>
                <span style={{ fontSize:15, fontWeight:700, color: pos ? '#34d399' : '#f87171' }}>
                  {pos ? '+' : ''}{(profile.changesPercentage ?? 0).toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div style={{ marginBottom:28 }}>
            <h1 style={{ fontSize:24, fontWeight:800, color:'#fff', margin:0 }}>{symbol}</h1>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.4)', marginTop:4 }}>Live data unavailable</div>
          </div>
        )}

        {/* Tab nav */}
        <div style={{ display:'flex', gap:0, borderBottom:'1px solid rgba(255,255,255,0.08)', overflowX:'auto' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              padding:'10px 18px', background:'none', border:'none', cursor:'pointer',
              fontFamily:'inherit', fontSize:13, fontWeight:600,
              color: tab===t.id ? '#fff' : 'rgba(255,255,255,0.38)',
              borderBottom: `2px solid ${tab===t.id ? '#1B4FFF' : 'transparent'}`,
              transition:'all 0.12s', whiteSpace:'nowrap',
            }}>{t.label}</button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ maxWidth:1280, margin:'0 auto', padding:'28px 32px 60px' }}>
        {tab === 'overview'    && <OverviewTab symbol={symbol} profile={profile} />}
        {tab === 'financials'  && <FinancialsTab symbol={symbol} />}
        {tab === 'news'        && <NewsTab symbol={symbol} />}
        {tab === 'insider'     && <InsiderTab symbol={symbol} />}
        {tab === 'filings'     && <FilingsTab symbol={symbol} />}
        {tab === 'estimates'   && <EstimatesTab symbol={symbol} />}
        {tab === 'transcripts' && <TranscriptsTab symbol={symbol} />}
        {tab === 'ownership'   && <OwnershipTab symbol={symbol} />}
        {tab === 'dcf'         && <DCFTab symbol={symbol} />}
      </div>
    </div>
  )
}
