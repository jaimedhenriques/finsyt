'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, Button, Badge, Tabs, Skeleton, DataTable, ContextualAskBar, type DataColumn } from '@/components/ui'

interface IndexQuote { label:string; ticker:string; price:number; change:number; changePct:number; spark?:number[] }
interface ForexRate   { pair:string; from:string; to:string; rate:number; changePct?:number }
interface Mover       { symbol:string; name:string; price:number; changePct:number }
interface PredictionMarket { id:string; provider:string; source:string; question:string; category:string|null; yesProbability:number|null; oneDayChange:number|null; volume:number|null; closeDate:string|null; url:string }

const INDEX_TICKERS = [
  { label:'S&P 500',       ticker:'SPY',     display:'.SPX'      },
  { label:'NASDAQ 100',    ticker:'QQQ',     display:'.NDX'      },
  { label:'Dow Jones',     ticker:'DIA',     display:'.DJI'      },
  { label:'FTSE 100',      ticker:'ISF.L',   display:'.FTSE'     },
  { label:'EURO STOXX 50', ticker:'FEZ',     display:'.STOXX50E' },
  { label:'Nikkei 225',    ticker:'EWJ',     display:'.N225'     },
  { label:'Hang Seng',     ticker:'2800.HK', display:'.HSI'      },
  { label:'DAX',           ticker:'EWG',     display:'.GDAXI'    },
]
const FOREX_PAIRS = [
  {from:'EUR',to:'USD'},{from:'GBP',to:'USD'},{from:'USD',to:'JPY'},{from:'USD',to:'CHF'},
  {from:'USD',to:'CAD'},{from:'AUD',to:'USD'},{from:'NZD',to:'USD'},{from:'EUR',to:'GBP'},
]
const SECTORS = [
  {name:'Technology',    chg:1.42},
  {name:'Healthcare',    chg:0.31},
  {name:'Financials',    chg:-0.12},
  {name:'Energy',        chg:-0.82},
  {name:'Consumer Disc.',chg:0.64},
  {name:'Industrials',   chg:0.22},
  {name:'Utilities',     chg:-0.45},
  {name:'Materials',     chg:0.35},
  {name:'Communication', chg:0.91},
  {name:'Real Estate',   chg:-0.67},
  {name:'Staples',       chg:0.18},
]

function Sparkline({data,pos}:{data:number[];pos:boolean}) {
  if(!data?.length) return <div style={{width:80,height:32}}/>
  return (
    <ResponsiveContainer width={80} height={32}>
      <AreaChart data={data.map((v,i)=>({v,i}))}>
        <defs><linearGradient id={`sg${pos?'g':'r'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={pos?'var(--pos)':'var(--neg)'} stopOpacity={0.25}/>
          <stop offset="95%" stopColor={pos?'var(--pos)':'var(--neg)'} stopOpacity={0}/>
        </linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={pos?'var(--pos)':'var(--neg)'} strokeWidth={1.5} fill={`url(#sg${pos?'g':'r'})`} dot={false}/>
        <Tooltip content={()=>null}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

function fmt(n:number,dp=2){return n==null?'—':n.toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp})}
function fmtPct(n:number){return n==null?'—':(n>=0?'+':'')+n.toFixed(2)+'%'}

export default function MarketsPage() {
  const [tab, setTab] = useState<'overview'|'forex'|'movers'|'predictions'>('overview')
  const [indices, setIndices]   = useState<IndexQuote[]>([])
  const [forex, setForex]       = useState<ForexRate[]>([])
  const [movers, setMovers]     = useState<{gainers:Mover[];losers:Mover[]}>({gainers:[],losers:[]})
  const [loading, setLoading]   = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date|null>(null)
  const [predictions, setPredictions]       = useState<PredictionMarket[]>([])
  const [predictionsSource, setPredictionsSource] = useState<string>('')
  const [predictionsLoading, setPredictionsLoading] = useState(false)
  const [predictionsLoaded, setPredictionsLoaded]   = useState(false)
  const [predictionQuery, setPredictionQuery]       = useState('')

  const load = useCallback(async () => {
    try {
      const [qRes, fxRes, mRes] = await Promise.all([
        fetch('/api/quote?symbols='+INDEX_TICKERS.map(t=>t.ticker).join(',')),
        fetch('/api/forex?pairs='+FOREX_PAIRS.map(p=>`${p.from}/${p.to}`).join(',')),
        fetch('/api/market-trends'),
      ])
      const [qData, fxData, mData] = await Promise.all([qRes.json(), fxRes.json(), mRes.json()])
      if (qData.quotes) {
        const map = Object.fromEntries(qData.quotes.map((q:any) => [q.symbol, q]))
        setIndices(INDEX_TICKERS.map(t => {
          const q = map[t.ticker] || {}
          return { label:t.label, ticker:t.ticker, price:q.price||q.c||0, change:q.change||q.d||0, changePct:q.changePct||q.dp||0, spark:q.spark||[] }
        }))
      }
      if (fxData.rates) setForex(fxData.rates)
      if (mData.gainers || mData.losers) setMovers({ gainers:mData.gainers||[], losers:mData.losers||[] })
      setLastUpdate(new Date())
    } catch {}
    setLoading(false)
  }, [])

  useEffect(() => { load(); const id=setInterval(load,60000); return ()=>clearInterval(id) }, [load])

  const loadPredictions = useCallback(async (q?: string) => {
    setPredictionsLoading(true)
    try {
      const url = '/api/prediction-markets?limit=40' + (q ? '&q=' + encodeURIComponent(q) : '')
      const res = await fetch(url)
      const data = await res.json()
      setPredictions(Array.isArray(data?.markets) ? data.markets : [])
      setPredictionsSource(data?.source || 'none')
    } catch {
      setPredictions([])
      setPredictionsSource('none')
    }
    setPredictionsLoading(false)
    setPredictionsLoaded(true)
  }, [])

  useEffect(() => { if (tab === 'predictions' && !predictionsLoaded) loadPredictions() }, [tab, predictionsLoaded, loadPredictions])

  const indexCols: DataColumn<IndexQuote>[] = [
    { key:'label', header:'Index', render: ix => (
      <>
        <div style={{fontWeight:700,color:'var(--text-primary)'}}>{ix.label}</div>
        <div style={{fontSize:11,color:'var(--text-secondary)'}}>{ix.ticker}</div>
      </>
    )},
    { key:'price', header:'Price', align:'right', render: ix => loading ? <Skeleton width={80} height={16}/> : <span style={{fontWeight:700,fontSize:15,color:'var(--text-primary)'}}>{fmt(ix.price)}</span> },
    { key:'change', header:'Change', align:'right', render: ix => <span className={ix.change>=0?'pos':'neg'}>{ix.change>=0?'+':''}{fmt(ix.change)}</span> },
    { key:'changePct', header:'Change %', align:'right', render: ix => <span className={ix.changePct>=0?'pos':'neg'} style={{fontWeight:700}}>{fmtPct(ix.changePct)}</span> },
    { key:'spark', header:'7-Day', render: ix => <Sparkline data={ix.spark||[]} pos={ix.changePct>=0}/> },
  ]

  const forexCols: DataColumn<ForexRate>[] = [
    { key:'pair', header:'Pair', render: r => (
      <>
        <span style={{fontWeight:700,fontSize:14,color:'var(--text-primary)'}}>{r.from}</span>
        <span style={{color:'var(--text-secondary)',margin:'0 4px'}}>/</span>
        <span style={{fontWeight:700,fontSize:14,color:'var(--text-primary)'}}>{r.to}</span>
      </>
    )},
    { key:'rate', header:'Rate', align:'right', render: r => r.rate ? <span style={{fontWeight:700,fontSize:15}}>{fmt(r.rate,4)}</span> : <Skeleton width={70} height={16}/> },
    { key:'changePct', header:'Change %', align:'right', render: r => <span className={(r.changePct||0)>=0?'pos':'neg'} style={{fontWeight:600}}>{r.changePct?fmtPct(r.changePct):'—'}</span> },
    { key:'dir', header:'Direction', render: r => <span style={{fontSize:18}} className={(r.changePct||0)>=0?'pos':'neg'}>{(r.changePct||0)>=0?'↑':'↓'}</span> },
  ]

  const moverCols: DataColumn<Mover>[] = [
    { key:'symbol', header:'Symbol', render: m => (
      <Link href={`/app/company/${m.symbol}`} style={{textDecoration:'none'}}>
        <div style={{fontWeight:700,color:'var(--text-primary)'}}>{m.symbol}</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}}>{m.name}</div>
      </Link>
    )},
    { key:'price', header:'Price', align:'right', render: m => <span style={{fontWeight:700}}>${fmt(m.price)}</span> },
    { key:'changePct', header:'Change %', align:'right', render: m => <span className={m.changePct>=0?'pos':'neg'} style={{fontWeight:700,fontSize:15}}>{fmtPct(m.changePct)}</span> },
  ]

  const predictionCols: DataColumn<PredictionMarket>[] = [
    { key:'question', header:'Market', render: p => (
      <a href={p.url} target="_blank" rel="noopener noreferrer" style={{textDecoration:'none'}}>
        <div style={{fontWeight:600,color:'var(--text-primary)',maxWidth:480,whiteSpace:'normal'}}>{p.question}</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2,display:'flex',alignItems:'center',gap:6}}>
          <Badge tone={p.provider==='kalshi'?'blue':'violet'}>{p.source}</Badge>
          {p.category && <span>{p.category}</span>}
          {p.closeDate && <span>· closes {new Date(p.closeDate).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}</span>}
        </div>
      </a>
    )},
    { key:'yesProbability', header:'Implied odds', align:'right', render: p => p.yesProbability==null
      ? <span style={{color:'var(--text-secondary)'}}>—</span>
      : <span style={{fontWeight:800,fontSize:15,color:'var(--text-primary)'}}>{Math.round(p.yesProbability*100)}%</span> },
    { key:'oneDayChange', header:'24h', align:'right', render: p => p.oneDayChange==null
      ? <span style={{color:'var(--text-secondary)'}}>—</span>
      : <span className={p.oneDayChange>=0?'pos':'neg'} style={{fontWeight:600}}>{(p.oneDayChange>=0?'+':'')+(p.oneDayChange*100).toFixed(1)}pts</span> },
    { key:'volume', header:'Volume', align:'right', render: p => p.volume==null
      ? <span style={{color:'var(--text-secondary)'}}>—</span>
      : <span style={{fontWeight:600,color:'var(--text-secondary)'}}>${p.volume>=1e6?(p.volume/1e6).toFixed(1)+'M':p.volume>=1e3?(p.volume/1e3).toFixed(0)+'K':fmt(p.volume,0)}</span> },
  ]

  const fxRows = forex.length ? forex : FOREX_PAIRS.map(p=>({pair:`${p.from}/${p.to}`,from:p.from,to:p.to,rate:0,changePct:0}))
  const moverFallback = [
    {symbol:'NVDA',name:'NVIDIA',price:878,changePct:4.2},
    {symbol:'AMD',name:'AMD',price:156,changePct:3.1},
    {symbol:'MSTR',name:'MicroStrategy',price:1340,changePct:5.8},
  ]

  return (
    <div style={{padding:'1.75rem',maxWidth:1400,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 className="page-title">Markets</h1>
          <p style={{fontSize:13,color:'#9BAFC8',marginTop:3}}>Global indices, forex, and sector performance</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {lastUpdate && <span style={{fontSize:12,color:'var(--text-secondary)'}}>Updated {lastUpdate.toLocaleTimeString()}</span>}
          <Badge tone="green"><span style={{width:6,height:6,borderRadius:'50%',background:'var(--pos)',display:'inline-block',marginRight:4}}/>Live</Badge>
          <Button variant="secondary" size="sm" onClick={load}>↻ Refresh</Button>
        </div>
      </div>

      <ContextualAskBar
        context="Markets"
        contextData={{ page: 'markets', tab }}
        chips={[
          { label: 'Sector rotation',  prompt: 'Show me sector rotation today and over the past month — what is leading and lagging?' },
          { label: 'Currency moves',   prompt: 'Which currency pairs are moving and what is driving them today?' },
          { label: 'Outliers vs S&P',  prompt: 'Find names trading more than two standard deviations from the S&P 500 today.' },
          { label: 'Cross-asset signals', prompt: 'Read across equities, rates, FX and commodities — what is the cross-asset narrative right now?' },
        ]}
        placeholder="Ask Finsyt about today's markets…"
        style={{ margin: '0 0 16px' }}
      />

      <div style={{marginBottom:20}}>
        <Tabs
          value={tab}
          onChange={v => setTab(v as 'overview'|'forex'|'movers'|'predictions')}
          items={[
            {id:'overview',label:'Overview'},
            {id:'forex',label:'Forex / FX'},
            {id:'movers',label:'Movers'},
            {id:'predictions',label:'Predictions'},
          ]}
        />
      </div>

      {tab==='overview' && (
        <>
          <Card padding={0} style={{marginBottom:20,overflow:'hidden'}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>Global Indices</span>
              <span style={{fontSize:12,color:'var(--text-secondary)'}}>Real-time · Auto-refresh 60s</span>
            </div>
            <DataTable
              columns={indexCols}
              rows={loading ? INDEX_TICKERS.map(t=>({label:t.label,ticker:t.ticker,price:0,change:0,changePct:0})) : indices}
              getRowKey={ix => ix.ticker}
            />
          </Card>

          <Card padding={20}>
            <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:16}}>Sector Performance</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10}}>
              {SECTORS.map(s=>{
                const pos = s.chg >= 0
                return (
                  <div key={s.name} style={{borderRadius:10,padding:'12px 14px',background:pos?'var(--pos-dim)':'var(--neg-dim)',border:`1px solid ${pos?'var(--pos-dim)':'var(--neg-dim)'}`,cursor:'pointer'}}>
                    <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)',marginBottom:6}}>{s.name}</div>
                    <div style={{fontSize:16,fontWeight:800,color:pos?'var(--pos)':'var(--neg)'}}>{pos?'+':''}{s.chg.toFixed(2)}%</div>
                  </div>
                )
              })}
            </div>
          </Card>
        </>
      )}

      {tab==='forex' && (
        <Card padding={0} style={{overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>Foreign Exchange Rates</span>
          </div>
          <DataTable columns={forexCols} rows={fxRows} getRowKey={r => r.pair}/>
        </Card>
      )}

      {tab==='movers' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          {(['gainers','losers'] as const).map(side=>{
            const rows = movers[side].length ? movers[side] : moverFallback.map(m=>side==='losers'?{...m,changePct:-m.changePct}:m)
            return (
              <Card key={side} padding={0} style={{overflow:'hidden'}}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{side==='gainers'?'Top Gainers':'Top Losers'}</span>
                  <Badge tone={side==='gainers'?'green':'red'}>{side==='gainers'?'↑ Leading':'↓ Lagging'}</Badge>
                </div>
                <DataTable columns={moverCols} rows={rows} getRowKey={m => m.symbol}/>
              </Card>
            )
          })}
        </div>
      )}

      {tab==='predictions' && (
        <Card padding={0} style={{overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}>
            <div>
              <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>Prediction Markets</span>
              <div style={{fontSize:11,color:'var(--text-secondary)',marginTop:2}}>
                Implied odds from {predictionsSource && predictionsSource!=='none' ? predictionsSource : 'Polymarket + Kalshi'} · Read-only research signal
              </div>
            </div>
            <form
              onSubmit={e => { e.preventDefault(); loadPredictions(predictionQuery.trim()) }}
              style={{display:'flex',gap:8,alignItems:'center'}}
            >
              <input
                value={predictionQuery}
                onChange={e => setPredictionQuery(e.target.value)}
                placeholder="Search markets (e.g. rate cut, election)…"
                style={{padding:'7px 12px',borderRadius:8,border:'1px solid var(--border)',background:'var(--bg-elevated)',color:'var(--text-primary)',fontSize:12,minWidth:220}}
              />
              <Button type="submit" variant="secondary">Search</Button>
              {predictionQuery && (
                <Button type="button" variant="ghost" onClick={()=>{ setPredictionQuery(''); loadPredictions() }}>Clear</Button>
              )}
            </form>
          </div>
          {predictionsLoading ? (
            <div style={{padding:20,display:'flex',flexDirection:'column',gap:10}}>
              {Array.from({length:6}).map((_,i)=><Skeleton key={i} height={40}/>)}
            </div>
          ) : predictions.length === 0 ? (
            <div style={{padding:'48px 20px',textAlign:'center',color:'var(--text-secondary)',fontSize:13}}>
              No active prediction markets found{predictionQuery?` for “${predictionQuery}”`:''}.
            </div>
          ) : (
            <DataTable columns={predictionCols} rows={predictions} getRowKey={p => p.id}/>
          )}
        </Card>
      )}
    </div>
  )
}
