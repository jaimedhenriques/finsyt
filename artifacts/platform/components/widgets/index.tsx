'use client'
import { useState } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'

// ── Colour helpers ────────────────────────────────────────────────────────────
const CC: Record<string,string> = { TSLA:'#CC0000',MSFT:'#00A4EF',NVDA:'#76B900',AAPL:'#555',META:'#0866FF',AMZN:'#FF9900',JPM:'#003087',GS:'#6DB33F',FED:'var(--accent)',INTC:'#0068B5',AMD:'#ED1C24',TSM:'#EE1C25',AVGO:'#CA2026' }
const cBg = (s:string) => CC[s] ?? 'var(--accent)'

// ── EarningsLiveWidget ────────────────────────────────────────────────────────
const LIVE_E = [
  { symbol:'TSLA', color:'#CC0000', ago:'Now', live:true },
  { symbol:'MSFT', color:'#00A4EF', ago:'14m', live:true },
  { symbol:'NVDA', color:'#76B900', ago:'28m', live:true },
  { symbol:'AMZN', color:'#FF9900', ago:'41m', live:false },
  { symbol:'META', color:'#0866FF', ago:'1h',  live:false },
  { symbol:'AAPL', color:'#555',    ago:'2h',  live:false },
]
export function EarningsLiveWidget() {
  return (
    <div style={{ padding:'10px 14px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10 }}>
        <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, color:'var(--neg)' }}>
          <span style={{ width:6, height:6, borderRadius:'50%', background:'var(--neg)', display:'inline-block', animation:'livePulse 1.4s infinite' }} />
          EARNINGS LIVE
        </span>
        <span style={{ fontSize:11, color:'var(--text-muted)' }}>· {LIVE_E.length} companies</span>
        <Link href="/app/research" style={{ marginLeft:'auto', fontSize:11, color:'var(--accent)', fontWeight:600, textDecoration:'none' }}>View all →</Link>
      </div>
      <div style={{ display:'flex', gap:14, overflowX:'auto', paddingBottom:2 }}>
        {LIVE_E.map(e => (
          <div key={e.symbol} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5, cursor:'pointer', flexShrink:0 }}>
            <div style={{ position:'relative' }}>
              <div style={{ width:42, height:42, borderRadius:'50%', border:`2.5px solid ${e.live?'var(--neg)':'var(--border)'}`, padding:2 }}>
                <div style={{ width:'100%', height:'100%', borderRadius:'50%', background:e.color, display:'flex', alignItems:'center', justifyContent:'center', color: '#fff', fontWeight:800, fontSize:12 }}>{e.symbol[0]}</div>
              </div>
              {e.live && <span style={{ position:'absolute', bottom:0, right:0, width:10, height:10, borderRadius:'50%', background:'var(--neg)', border:'2px solid #fff' }} />}
            </div>
            <span style={{ fontSize:10, fontWeight:700, color:'var(--bg-elevated)' }}>{e.symbol}</span>
            <span style={{ fontSize:10, color:e.live?'var(--neg)':'var(--text-muted)', fontWeight:600 }}>{e.live?'Live':e.ago}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── IndicesWidget ─────────────────────────────────────────────────────────────
const IDXS = [
  { name:'S&P 500',  val:6816.89,  chg:-0.11, spark:[68,69,67,70,68,71,70,72,69,68] },
  { name:'NASDAQ',   val:22902.89, chg:0.35,  spark:[228,229,227,231,230,232,231,233,230,229] },
  { name:'Dow Jones',val:47916.57, chg:-0.56, spark:[478,479,477,481,479,482,480,483,479,478] },
  { name:'FTSE 100', val:8204.60,  chg:0.14,  spark:[81,82,80,83,82,84,83,85,82,82] },
]
export function IndicesWidget() {
  return (
    <div style={{ display:'flex', gap:0, padding:'8px 0', overflowX:'auto' }}>
      {IDXS.map((idx,i) => {
        const pos = idx.chg >= 0
        const data = idx.spark.map(v=>({v}))
        return (
          <div key={idx.name} style={{ flex:'0 0 auto', minWidth:150, padding:'6px 16px', borderRight:i<IDXS.length-1?'1px solid #E8EDF4':'none' }}>
            <div style={{ fontSize:11, color:'#7D8FA9', marginBottom:2 }}>{idx.name}</div>
            <div style={{ fontSize:16, fontWeight:900, color:'var(--bg-elevated)', letterSpacing:'-0.02em' }}>{idx.val.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}</div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:pos?'var(--pos)':'var(--neg)' }}>{pos?'+':''}{idx.chg.toFixed(2)}%</span>
              <div style={{ width:60, height:24 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{top:2,right:0,bottom:2,left:0}}>
                    <defs><linearGradient id={`ig${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor={pos?'var(--pos)':'var(--neg)'} stopOpacity={0.2}/><stop offset="95%" stopColor={pos?'var(--pos)':'var(--neg)'} stopOpacity={0}/></linearGradient></defs>
                    <Area type="monotone" dataKey="v" stroke={pos?'var(--pos)':'var(--neg)'} strokeWidth={1.5} fill={`url(#ig${i})`} dot={false}/>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── MarketMoversWidget ────────────────────────────────────────────────────────
const MOVERS = [
  { name:'NVIDIA Corporation',    ticker:'NVDA', price:188.74, chg:2.57 },
  { name:'Palantir Technologies', ticker:'PLTR', price:128.11, chg:-1.86 },
  { name:'Tesla, Inc.',           ticker:'TSLA', price:285.42, chg:8.34 },
  { name:'ServiceNow, Inc.',      ticker:'NOW',  price:83.00,  chg:-7.58 },
  { name:'Amazon.com, Inc.',      ticker:'AMZN', price:238.38, chg:2.02 },
]
export function MarketMoversWidget() {
  const [tab,setTab]=useState<'active'|'gain'|'loss'>('active')
  return (
    <div style={{ padding:'10px 14px' }}>
      <div style={{ display:'flex', gap:12, marginBottom:10, borderBottom:'1px solid #F0F4FA', paddingBottom:8 }}>
        {(['active','gain','loss'] as const).map(k=>(
          <button key={k} onClick={()=>setTab(k)} style={{ fontSize:11, fontWeight:600, background:'none', border:'none', cursor:'pointer', fontFamily:'inherit', color:tab===k?'var(--bg-elevated)':'#7D8FA9', borderBottom:`2px solid ${tab===k?'var(--neg)':'transparent'}`, paddingBottom:4, paddingLeft:0, paddingRight:0, whiteSpace:'nowrap' }}>
            {k==='active'?'Most Active':k==='gain'?'Top Gainers':'Top Losers'}
          </button>
        ))}
      </div>
      {MOVERS.map((m,i)=>(
        <div key={i} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 0', borderBottom:i<MOVERS.length-1?'1px solid #F5F7FB':'none' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:26,height:26,borderRadius:7,background:cBg(m.ticker),display:'flex',alignItems:'center',justifyContent:'center',color: '#fff',fontWeight:800,fontSize:10,flexShrink:0 }}>{m.ticker[0]}</div>
            <div>
              <div style={{ fontSize:11.5, fontWeight:700, color:'var(--bg-elevated)' }}>{m.ticker}</div>
              <div style={{ fontSize:10, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:100 }}>{m.name}</div>
            </div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:800, color:'var(--bg-elevated)' }}>${m.price.toFixed(2)}</div>
            <div style={{ fontSize:11, fontWeight:700, color:m.chg>=0?'var(--pos)':'var(--neg)' }}>{m.chg>=0?'▲':'▼'} {Math.abs(m.chg).toFixed(2)}%</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── EarningsBeatWidget ────────────────────────────────────────────────────────
export function EarningsBeatWidget() {
  const beat=87,bc=53,mc=6
  return (
    <div style={{ padding:'12px 16px' }}>
      <p style={{ fontSize:13, color:'#3D4F6E', marginBottom:10 }}>
        <strong style={{ color:'var(--pos)' }}>{beat}%</strong> of S&P 500 companies <strong style={{ color:'var(--pos)' }}>beat</strong> estimates this quarter.
      </p>
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:18, marginBottom:2 }}>🏆</div>
          <div style={{ fontSize:16, fontWeight:900, color:'var(--pos)' }}>{bc}</div>
          <div style={{ fontSize:10, color:'var(--pos)', fontWeight:600 }}>Beat</div>
        </div>
        <div style={{ flex:1, height:12, background:'var(--neg-dim)', borderRadius:999, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${(bc/(bc+mc))*100}%`, background:'linear-gradient(90deg,#059669,#10B981)', borderRadius:999 }} />
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:18, marginBottom:2 }}>🌧️</div>
          <div style={{ fontSize:16, fontWeight:900, color:'var(--neg)' }}>{mc}</div>
          <div style={{ fontSize:10, color:'var(--neg)', fontWeight:600 }}>Miss</div>
        </div>
      </div>
    </div>
  )
}

// ── SectorPerfWidget ──────────────────────────────────────────────────────────
const SECTORS = [
  {name:'Info Tech',chg:0.76},{name:'Materials',chg:0.64},{name:'Consumer Disc',chg:0.55},
  {name:'Real Estate',chg:0.17},{name:'Comms',chg:-0.28},{name:'Industrials',chg:-0.43},
  {name:'Utilities',chg:-0.44},{name:'Energy',chg:-0.80},{name:'Financials',chg:-1.06},
  {name:'Health Care',chg:-1.33},{name:'Cons Staples',chg:-1.43},
]
export function SectorPerfWidget() {
  const max=Math.max(...SECTORS.map(s=>Math.abs(s.chg)))
  return (
    <div style={{ padding:'10px 14px', display:'flex', flexDirection:'column', gap:3 }}>
      {SECTORS.map(s=>{
        const pos=s.chg>=0
        const w=(Math.abs(s.chg)/max)*40
        return (
          <div key={s.name} style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:80, fontSize:10, color:'#3D4F6E', textAlign:'right', flexShrink:0 }}>{s.name}</div>
            <div style={{ flex:1, height:8, background:'var(--bg-page)', borderRadius:999, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${(Math.abs(s.chg)/max)*100}%`, background:pos?'var(--pos)':'var(--neg)', borderRadius:999 }} />
            </div>
            <span style={{ fontSize:10, fontWeight:700, color:pos?'var(--pos)':'var(--neg)', width:44, textAlign:'right', flexShrink:0 }}>{pos?'+':''}{s.chg.toFixed(2)}%</span>
          </div>
        )
      })}
    </div>
  )
}

// ── LiveNewsFeedWidget ────────────────────────────────────────────────────────
const NEWS = [
  { sym:'NVDA', tag:'Tech',    sentiment:'bullish', mins:3,  headline:'Blackwell B300 Shipments Ahead of Schedule' },
  { sym:'TSLA', tag:'Earnings',sentiment:'bullish', mins:15, headline:'Tesla Q1 EPS Beats — Energy Margin Hits Record 25.4%' },
  { sym:'FED',  tag:'Macro',   sentiment:'neutral', mins:28, headline:'Fed Holds Rates — June Cut Odds Fall to 28%' },
  { sym:'MSFT', tag:'AI',      sentiment:'bullish', mins:42, headline:'Azure OpenAI Now on $10bn+ Annualised Run Rate' },
]
export function LiveNewsFeedWidget() {
  const sb=(s:string)=>s==='bullish'?{bg:'var(--pos-dim)',c:'var(--pos)',l:'Bullish'}:s==='bearish'?{bg:'var(--neg-dim)',c:'var(--neg)',l:'Bearish'}:{bg:'#F5F7FB',c:'#7D8FA9',l:'Neutral'}
  return (
    <div>
      {NEWS.map((n,i)=>{
        const {bg,c,l}=sb(n.sentiment)
        return (
          <div key={i} style={{ display:'flex', gap:10, padding:'10px 14px', borderBottom:i<NEWS.length-1?'1px solid #F5F7FB':'none', cursor:'pointer' }}>
            <div style={{ width:28,height:28,borderRadius:7,background:cBg(n.sym),display:'flex',alignItems:'center',justifyContent:'center',color: '#fff',fontWeight:800,fontSize:11,flexShrink:0 }}>{n.sym[0]}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', gap:5, marginBottom:3, flexWrap:'wrap' }}>
                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:999, background:'var(--bg-page)', color:'#7D8FA9', fontWeight:600 }}>{n.tag}</span>
                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:999, background:bg, color:c, fontWeight:700 }}>{l}</span>
                <span style={{ fontSize:9, color:'var(--text-muted)', marginLeft:'auto' }}>{n.mins}m</span>
              </div>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--bg-elevated)', lineHeight:1.35, margin:0 }}>{n.headline}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── TranscriptFeedWidget ──────────────────────────────────────────────────────
const TRANS = [
  { sym:'TSLA', co:'Tesla', qtr:'Q1 2026', speaker:'Elon Musk', role:'CEO', excerpt:'"We expect to return to significant growth this year, with energy contributing meaningfully to margins..."' },
  { sym:'MSFT', co:'Microsoft', qtr:'Q3 FY26', speaker:'Satya Nadella', role:'CEO', excerpt:'"Azure growth reaccelerated to 35% driven by AI workloads across enterprise..."' },
  { sym:'NVDA', co:'NVIDIA', qtr:'Q4 FY26', speaker:'Jensen Huang', role:'CEO', excerpt:'"Blackwell demand continues to exceed supply. We expect DC revenue to double in FY27..."' },
]
export function TranscriptFeedWidget() {
  return (
    <div>
      {TRANS.map((tr,i)=>(
        <div key={i} style={{ padding:'10px 14px', borderBottom:i<TRANS.length-1?'1px solid #F5F7FB':'none', cursor:'pointer' }}>
          <div style={{ display:'flex', gap:8 }}>
            <div style={{ width:28,height:28,borderRadius:7,background:cBg(tr.sym),display:'flex',alignItems:'center',justifyContent:'center',color: '#fff',fontWeight:800,fontSize:11,flexShrink:0 }}>{tr.sym[0]}</div>
            <div style={{ flex:1, minWidth:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                <span style={{ fontSize:11, fontWeight:700, color:'var(--bg-elevated)' }}>{tr.co}</span>
                <span style={{ fontSize:9, padding:'1px 5px', borderRadius:999, background:'var(--bg-page)', color:'#7D8FA9', fontWeight:600 }}>{tr.qtr}</span>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
                <span style={{ fontSize:10, fontWeight:600, color:'#3D4F6E' }}>{tr.speaker}</span>
                <span style={{ fontSize:10, color:'var(--text-muted)' }}>· {tr.role}</span>
              </div>
              <p style={{ fontSize:11.5, color:'#1C2B4A', lineHeight:1.5, fontStyle:'italic', borderLeft:'2px solid #E8EDF4', paddingLeft:8, margin:0 }}>{tr.excerpt}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── FilingFeedWidget ──────────────────────────────────────────────────────────
const FILINGS = [
  { sym:'TSLA', co:'Tesla Inc.',    type:'10-Q', title:'Quarterly Report Q1 2026',            mins:5,  tag:'Earnings', docColor:'#8B5CF6' },
  { sym:'NVDA', co:'NVIDIA Corp.',  type:'8-K',  title:'Blackwell B300 Production Update',    mins:18, tag:'Product',  docColor:'var(--pos)' },
  { sym:'MSFT', co:'Microsoft',     type:'10-Q', title:'Quarterly Report Q3 FY2026',          mins:33, tag:'Earnings', docColor:'#8B5CF6' },
]
export function FilingFeedWidget() {
  return (
    <div>
      {FILINGS.map((f,i)=>(
        <div key={i} style={{ display:'flex', gap:10, padding:'10px 14px', borderBottom:i<FILINGS.length-1?'1px solid #F5F7FB':'none', cursor:'pointer' }}>
          <div style={{ width:28,height:28,borderRadius:7,background:f.docColor+'18',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={f.docColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          </div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', gap:5, marginBottom:3 }}>
              <span style={{ fontSize:9, padding:'1px 5px', borderRadius:999, background:'var(--accent-dim)', color:'var(--accent)', fontWeight:700 }}>{f.type}</span>
              <span style={{ fontSize:9, padding:'1px 5px', borderRadius:999, background:'var(--bg-page)', color:'#7D8FA9', fontWeight:600 }}>{f.tag}</span>
              <span style={{ fontSize:9, color:'var(--text-muted)', marginLeft:'auto' }}>{f.mins}m</span>
            </div>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--bg-elevated)', lineHeight:1.35, margin:0 }}>{f.title}</p>
            <p style={{ fontSize:10, color:'var(--text-muted)', marginTop:2 }}>{f.co}</p>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── AiQueryWidget ─────────────────────────────────────────────────────────────
export function AiQueryWidget() {
  return (
    <div style={{ padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke='var(--accent)' strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
      <Link href="/app/research" style={{ flex:1, fontSize:13.5, color:'var(--text-muted)', textDecoration:'none' }}>Ask anything — earnings calls, filings, expert insights...</Link>
      <Link href="/app/research" style={{ background:'var(--accent)', color: '#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, textDecoration:'none', whiteSpace:'nowrap' }}>Open Research →</Link>
    </div>
  )
}

// ── CompanySummaryWidget ──────────────────────────────────────────────────────
export function CompanySummaryWidget() {
  const [sym, setSym] = useState('NVDA')
  const summaries: Record<string,string> = {
    NVDA:'NVIDIA dominates the AI accelerator market with ~80% share in training GPUs. Blackwell architecture is driving a supercycle in data centre investment. Revenue is growing 70%+ YoY with gross margins above 75%. Key risks: customer concentration, geopolitical supply chain, and AMD/Intel competition.',
    TSLA:'Tesla is transitioning from a pure EV company to an energy and AI platform. Energy storage deployments are growing rapidly at 25%+ gross margins. Robotaxi remains a key optionality event. Automotive margins at 18.2% — below peak — as pricing pressure continues.',
    MSFT:'Microsoft is the enterprise AI platform of record. Azure AI services are on a $10bn+ annualised run rate with GitHub Copilot driving productivity suite attachment. Operating leverage is improving — FY2026 operating margin expected above 45%.',
  }
  return (
    <div style={{ padding:'12px 14px' }}>
      <div style={{ display:'flex', gap:6, marginBottom:10 }}>
        {['NVDA','TSLA','MSFT'].map(s=>(
          <button key={s} onClick={()=>setSym(s)} style={{ fontSize:11, fontWeight:700, padding:'3px 8px', borderRadius:6, border:'none', cursor:'pointer', fontFamily:'inherit', background:sym===s?cBg(s):'var(--bg-page)', color:sym===s?'#fff':'#7D8FA9' }}>{s}</button>
        ))}
      </div>
      <div style={{ display:'flex', gap:8, marginBottom:8 }}>
        <div style={{ width:32,height:32,borderRadius:9,background:cBg(sym),display:'flex',alignItems:'center',justifyContent:'center',color: '#fff',fontWeight:900,fontSize:13 }}>{sym[0]}</div>
        <div>
          <div style={{ fontSize:12, fontWeight:700, color:'var(--bg-elevated)' }}>{sym}</div>
          <div style={{ fontSize:10, color:'var(--pos)', fontWeight:600 }}>AI Summary</div>
        </div>
      </div>
      <p style={{ fontSize:12.5, color:'#1C2B4A', lineHeight:1.6, margin:0 }}>{summaries[sym]}</p>
      <Link href={`/app/company/${sym}`} style={{ fontSize:11, fontWeight:700, color:'var(--accent)', textDecoration:'none', marginTop:8, display:'inline-block' }}>View full profile →</Link>
    </div>
  )
}

// ── WatchlistWidget ───────────────────────────────────────────────────────────
const WL = [
  { symbol:'AAPL', name:'Apple Inc.',       price:189.30, chg:1.21 },
  { symbol:'MSFT', name:'Microsoft Corp.',  price:415.20, chg:-0.41 },
  { symbol:'NVDA', name:'NVIDIA Corp.',     price:924.80, chg:2.88 },
  { symbol:'GOOGL',name:'Alphabet Inc.',    price:178.50, chg:0.62 },
  { symbol:'META', name:'Meta Platforms',   price:529.30, chg:0.92 },
]
export function WatchlistWidget() {
  return (
    <div>
      {WL.map((q,i)=>(
        <div key={q.symbol} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:i<WL.length-1?'1px solid #F5F7FB':'none', cursor:'pointer' }}>
          <div style={{ width:28,height:28,borderRadius:7,background:cBg(q.symbol),display:'flex',alignItems:'center',justifyContent:'center',color: '#fff',fontWeight:800,fontSize:11,flexShrink:0 }}>{q.symbol[0]}</div>
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'var(--bg-elevated)' }}>{q.symbol}</div>
            <div style={{ fontSize:10, color:'var(--text-muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{q.name}</div>
          </div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:12, fontWeight:800, color:'var(--bg-elevated)' }}>${q.price.toFixed(2)}</div>
            <div style={{ fontSize:11, fontWeight:700, color:q.chg>=0?'var(--pos)':'var(--neg)' }}>{q.chg>=0?'+':''}{q.chg.toFixed(2)}%</div>
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Registry ──────────────────────────────────────────────────────────────────
export const WIDGET_REGISTRY: Record<string, React.ComponentType> = {
  earnings_live:   EarningsLiveWidget,
  indices:         IndicesWidget,
  market_movers:   MarketMoversWidget,
  earnings_bar:    EarningsBeatWidget,
  sector_perf:     SectorPerfWidget,
  live_feed:       LiveNewsFeedWidget,
  transcript_feed: TranscriptFeedWidget,
  filing_feed:     FilingFeedWidget,
  ai_query:        AiQueryWidget,
  company_summary: CompanySummaryWidget,
  watchlist:       WatchlistWidget,
}
