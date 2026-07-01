'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'
import { Card, Button, Badge, Tabs, Skeleton, DataTable, ContextualAskBar, type DataColumn } from '@/components/ui'

// `available` is false when the provider returned no data for that ticker —
// we never render 0.00 as a price; unavailable cells show '—' instead.
interface IndexQuote {
  label: string; ticker: string
  price: number | null; change: number | null; changePct: number | null
  spark?: number[]; available: boolean
}
interface ForexRate   { pair:string; from:string; to:string; rate:number; changePct?:number }
interface Mover       { symbol:string; name:string; price:number; changePct:number }
interface AssetRow    { symbol:string; name:string; price:number; change:number; changePct:number; spark?:number[]; unit?:string; decimals?:number; source?:string }
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
const CRYPTO_SYMBOLS    = ['BTC-USD','ETH-USD','SOL-USD','XRP-USD','ADA-USD','DOGE-USD','AVAX-USD','LINK-USD','DOT-USD','MATIC-USD','LTC-USD','BCH-USD']
const COMMODITY_SYMBOLS = ['GOLD','SILVER','PLATINUM','COPPER','WTI','BRENT','NATGAS','CORN','WHEAT','SOYBEAN','SUGAR','COFFEE']
const RATE_SYMBOLS      = ['US3M','US1Y','US2Y','US5Y','US7Y','US10Y','US20Y','US30Y']
type AssetTab = 'crypto'|'commodities'|'rates'

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

function fmt(n: number | null, dp=2): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return n.toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp})
}
function fmtPct(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + n.toFixed(2) + '%'
}
function fmtPrice(n: number | null): string {
  if (n === null || n === undefined || Number.isNaN(n) || n === 0) return '—'
  return n >= 1000
    ? n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})
    : n.toFixed(2)
}

function UnavailableCell() {
  return <span style={{color:'var(--text-muted)',fontStyle:'italic',fontSize:12}}>unavailable</span>
}

function MoversEmptyState({ source }: { source?: string }) {
  return (
    <div style={{padding:'32px 20px',textAlign:'center',color:'var(--text-muted)',fontSize:13}}>
      <div style={{fontSize:28,marginBottom:10}}>📊</div>
      <div style={{fontWeight:600,color:'var(--text-secondary)',marginBottom:6}}>
        {source === 'none' ? 'No market data provider configured' : 'Movers unavailable right now'}
      </div>
      <div style={{fontSize:12}}>
        {source === 'none'
          ? 'Configure an FMP API key to see live gainers and losers.'
          : 'Could not load movers — the provider may be temporarily unavailable.'}
      </div>
    </div>
  )
}

export default function MarketsPage() {
  const [tab, setTab] = useState<'overview'|'crypto'|'commodities'|'rates'|'forex'|'movers'|'predictions'>('overview')
  const [indices, setIndices]   = useState<IndexQuote[]>([])
  const [indicesSource, setIndicesSource] = useState('')
  const [forex, setForex]       = useState<ForexRate[]>([])
  const [movers, setMovers]     = useState<{gainers:Mover[];losers:Mover[];source?:string}>({gainers:[],losers:[]})
  const [loading, setLoading]   = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date|null>(null)
  const [predictions, setPredictions]       = useState<PredictionMarket[]>([])
  const [predictionsSource, setPredictionsSource] = useState<string>('')
  const [predictionsLoading, setPredictionsLoading] = useState(false)
  const [predictionsLoaded, setPredictionsLoaded]   = useState(false)
  const [predictionQuery, setPredictionQuery]       = useState('')
  const [assetData, setAssetData]     = useState<Record<AssetTab, AssetRow[]>>({ crypto:[], commodities:[], rates:[] })
  const [assetLoading, setAssetLoading] = useState<Record<AssetTab, boolean>>({ crypto:false, commodities:false, rates:false })
  const [assetLoaded, setAssetLoaded]   = useState<Record<AssetTab, boolean>>({ crypto:false, commodities:false, rates:false })

  const load = useCallback(async () => {
    try {
      const [qRes, fxRes, mRes] = await Promise.all([
        fetch('/api/quote?symbols='+INDEX_TICKERS.map(t=>t.ticker).join(',')),
        fetch('/api/forex?pairs='+FOREX_PAIRS.map(p=>`${p.from}/${p.to}`).join(',')),
        fetch('/api/movers'),
      ])
      const [qData, fxData, mData] = await Promise.all([qRes.json(), fxRes.json(), mRes.json()])

      // Build indices — only mark a ticker as `available` when the provider
      // returned a non-zero price.  Zero / missing price renders as '—'.
      if (qData.quotes) {
        const map = Object.fromEntries(qData.quotes.map((q:any) => [q.symbol, q]))
        setIndicesSource(qData.source || '')
        setIndices(INDEX_TICKERS.map(t => {
          const q: any = map[t.ticker]
          const price     = q ? (Number(q.price ?? q.c   ?? null)) : null
          const change    = q ? (Number(q.change ?? q.d  ?? null)) : null
          const changePct = q ? (Number(q.changePct ?? q.dp ?? null)) : null
          const available = price !== null && price > 0
          return {
            label: t.label, ticker: t.ticker,
            price:     available ? price     : null,
            change:    available ? change    : null,
            changePct: available ? changePct : null,
            spark:     Array.isArray(q?.spark) ? q.spark : [],
            available,
          }
        }))
      } else {
        // API error — mark all as unavailable, no zeros shown
        setIndices(INDEX_TICKERS.map(t => ({
          label: t.label, ticker: t.ticker,
          price: null, change: null, changePct: null, available: false,
        })))
      }

      if (fxData.rates) setForex(fxData.rates)
      setMovers({
        gainers: mData.gainers || [],
        losers:  mData.losers  || [],
        source:  mData.source,
      })
      setLastUpdate(new Date())
    } catch {
      // Mark all indices unavailable on network error
      setIndices(INDEX_TICKERS.map(t => ({
        label: t.label, ticker: t.ticker,
        price: null, change: null, changePct: null, available: false,
      })))
    }
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

  const loadAssetClass = useCallback(async (cls: AssetTab, symbols: string[]) => {
    setAssetLoading(s => ({ ...s, [cls]: true }))
    try {
      // Bare commodity names (GOLD, WTI, CORN…) collide with real equity
      // tickers, so the classifier only treats them as commodities behind the
      // explicit CMDTY: namespace. Request prefixed, render the clean key.
      const prefix = cls === 'commodities' ? 'CMDTY:' : ''
      const res  = await fetch('/api/quote?symbols=' + symbols.map(s => prefix + s).join(','))
      const data = await res.json()
      const map  = Object.fromEntries((data.quotes || []).map((q: any) => [q.symbol, q]))
      const rows: AssetRow[] = symbols.map(sym => {
        const q = map[prefix + sym] || {}
        return {
          symbol: sym, name: q.name || sym,
          price: q.price || 0, change: q.change || 0, changePct: q.changePct || 0,
          spark: q.spark || [], unit: q.unit, decimals: q.decimals ?? 2, source: q.source,
        }
      }).filter(r => r.price)
      setAssetData(s => ({ ...s, [cls]: rows }))
    } catch { /* leave empty */ }
    setAssetLoading(s => ({ ...s, [cls]: false }))
    setAssetLoaded(s => ({ ...s, [cls]: true }))
  }, [])

  useEffect(() => {
    if (tab === 'crypto' && !assetLoaded.crypto)           loadAssetClass('crypto', CRYPTO_SYMBOLS)
    if (tab === 'commodities' && !assetLoaded.commodities) loadAssetClass('commodities', COMMODITY_SYMBOLS)
    if (tab === 'rates' && !assetLoaded.rates)             loadAssetClass('rates', RATE_SYMBOLS)
  }, [tab, assetLoaded, loadAssetClass])

  const indexCols: DataColumn<IndexQuote>[] = [
    { key:'label', header:'Index', render: ix => (
      <>
        <div style={{fontWeight:700,color:'var(--text-primary)'}}>{ix.label}</div>
        <div style={{fontSize:11,color:'var(--text-secondary)'}}>{ix.ticker}</div>
      </>
    )},
    { key:'price', header:'Price', align:'right', render: ix =>
        loading
          ? <Skeleton width={80} height={16}/>
          : ix.available
            ? <span style={{fontWeight:700,fontSize:15,color:'var(--text-primary)'}}>{fmtPrice(ix.price)}</span>
            : <UnavailableCell/>
    },
    { key:'change', header:'Change', align:'right', render: ix =>
        ix.available
          ? <span className={(ix.change ?? 0) >= 0 ? 'pos' : 'neg'}>{(ix.change ?? 0) >= 0 ? '+' : ''}{fmt(ix.change)}</span>
          : <span style={{color:'var(--text-muted)'}}>—</span>
    },
    { key:'changePct', header:'Change %', align:'right', render: ix =>
        ix.available
          ? <span className={(ix.changePct ?? 0) >= 0 ? 'pos' : 'neg'} style={{fontWeight:700}}>{fmtPct(ix.changePct)}</span>
          : <span style={{color:'var(--text-muted)'}}>—</span>
    },
    { key:'spark', header:'7-Day', render: ix => <Sparkline data={ix.spark||[]} pos={(ix.changePct??0)>=0}/> },
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

  const assetCols = (cls: AssetTab): DataColumn<AssetRow>[] => [
    { key:'name', header: cls==='crypto' ? 'Coin' : cls==='commodities' ? 'Commodity' : 'Instrument', render: a => (
      <Link href={`/app/company/${encodeURIComponent(a.symbol)}`} style={{textDecoration:'none'}}>
        <div style={{fontWeight:700,color:'var(--text-primary)'}}>{a.symbol}</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:200}}>{a.name}</div>
      </Link>
    )},
    { key:'price', header: cls==='rates' ? 'Yield' : 'Price', align:'right', render: a => assetLoading[cls]
      ? <Skeleton width={80} height={16}/>
      : <span style={{fontWeight:700,fontSize:15,color:'var(--text-primary)'}}>
          {cls==='rates' ? `${fmt(a.price, a.decimals ?? 3)}%` : `${cls==='crypto' ? '$' : ''}${fmt(a.price, a.decimals ?? 2)}${a.unit && cls!=='crypto' ? ` ${a.unit}` : ''}`}
        </span> },
    { key:'change', header:'Change', align:'right', render: a => <span className={a.change>=0?'pos':'neg'}>{a.change>=0?'+':''}{fmt(a.change, a.decimals ?? 2)}{cls==='rates'?'pp':''}</span> },
    { key:'changePct', header:'Change %', align:'right', render: a => <span className={a.changePct>=0?'pos':'neg'} style={{fontWeight:700}}>{fmtPct(a.changePct)}</span> },
    { key:'spark', header:'30-Day', render: a => <Sparkline data={a.spark||[]} pos={a.changePct>=0}/> },
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
  const loadingIndices = INDEX_TICKERS.map(t=>({label:t.label,ticker:t.ticker,price:null,change:null,changePct:null,available:false}))

  return (
    <div style={{padding:'1.75rem',maxWidth:1400,margin:'0 auto'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 className="page-title">Markets</h1>
          <p style={{fontSize:13,color:'#9BAFC8',marginTop:3}}>Global indices, forex, and market movers</p>
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
          { label: 'Sector rotation',     prompt: 'Show me sector rotation today and over the past month — what is leading and lagging?' },
          { label: 'Currency moves',      prompt: 'Which currency pairs are moving and what is driving them today?' },
          { label: 'Outliers vs S&P',     prompt: 'Find names trading more than two standard deviations from the S&P 500 today.' },
          { label: 'Cross-asset signals', prompt: 'Read across equities, rates, FX and commodities — what is the cross-asset narrative right now?' },
        ]}
        placeholder="Ask Finsyt about today's markets…"
        style={{ margin: '0 0 16px' }}
      />

      <div style={{marginBottom:20}}>
        <Tabs
          value={tab}
          onChange={v => setTab(v as 'overview'|'crypto'|'commodities'|'rates'|'forex'|'movers'|'predictions')}
          items={[
            {id:'overview',label:'Overview'},
            {id:'crypto',label:'Crypto'},
            {id:'commodities',label:'Commodities'},
            {id:'rates',label:'Rates'},
            {id:'forex',label:'Forex / FX'},
            {id:'movers',label:'Movers'},
            {id:'predictions',label:'Predictions'},
          ]}
        />
      </div>

      {tab==='overview' && (
        <Card padding={0} style={{marginBottom:20,overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>Global Indices</span>
            <span style={{fontSize:12,color:'var(--text-secondary)'}}>
              Real-time · Auto-refresh 60s{indicesSource ? ` · source: ${indicesSource}` : ''}
            </span>
          </div>
          <DataTable
            columns={indexCols}
            rows={loading ? loadingIndices : indices}
            getRowKey={ix => ix.ticker}
          />
        </Card>
      )}

      {(tab==='crypto'||tab==='commodities'||tab==='rates') && (() => {
        const meta = {
          crypto:      { title:'Cryptocurrencies', sub:'Spot prices vs USD · Auto-refresh on open' },
          commodities: { title:'Commodities',      sub:'Futures front-month · spot benchmarks' },
          rates:       { title:'Treasury Yields',  sub:'US Treasury constant-maturity yields' },
        }[tab]
        const rows = assetData[tab]
        const dominant = (() => {
          const counts = new Map<string,number>()
          for (const r of rows) if (r.source) counts.set(r.source, (counts.get(r.source)||0)+1)
          return [...counts.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]
        })()
        const ranked = [...rows].sort((a,b)=>b.changePct-a.changePct)
        const gainers = ranked.filter(r=>r.changePct>0).slice(0,3)
        const losers  = ranked.filter(r=>r.changePct<0).slice(-3).reverse()
        return (
          <>
            {tab!=='rates' && !assetLoading[tab] && (gainers.length>0 || losers.length>0) && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20,marginBottom:20}}>
                {([['gainers',gainers],['losers',losers]] as const).map(([side,list])=>(
                  <Card key={side} padding={0} style={{overflow:'hidden'}}>
                    <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                      <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{side==='gainers'?'Top Gainers':'Top Losers'}</span>
                      <Badge tone={side==='gainers'?'green':'red'}>{side==='gainers'?'↑ Leading':'↓ Lagging'}</Badge>
                    </div>
                    {list.length === 0 ? (
                      <div style={{padding:'18px 20px',fontSize:12,color:'var(--text-secondary)'}}>No {side} right now.</div>
                    ) : list.map(r=>(
                      <div key={r.symbol} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',borderBottom:'1px solid var(--border)'}}>
                        <div><div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{r.symbol}</div><div style={{fontSize:11,color:'var(--text-secondary)'}}>{r.name}</div></div>
                        <div style={{textAlign:'right'}}>
                          <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{tab==='crypto'?'$':''}{fmt(r.price, r.decimals ?? 2)}{r.unit&&tab!=='crypto'?` ${r.unit}`:''}</div>
                          <div className={r.changePct>=0?'pos':'neg'} style={{fontSize:11,fontWeight:700}}>{fmtPct(r.changePct)}</div>
                        </div>
                      </div>
                    ))}
                  </Card>
                ))}
              </div>
            )}
            <Card padding={0} style={{overflow:'hidden'}}>
              <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{meta.title}</span>
                <span style={{fontSize:12,color:'var(--text-secondary)'}}>{meta.sub}{dominant?` · source: ${dominant}`:''}</span>
              </div>
              {assetLoaded[tab] && !assetLoading[tab] && rows.length===0 ? (
                <div style={{padding:'48px 20px',textAlign:'center',color:'var(--text-secondary)',fontSize:13}}>No data available right now — every provider is exhausted.</div>
              ) : (
                <DataTable
                  columns={assetCols(tab)}
                  rows={assetLoading[tab]
                    ? (tab==='crypto'?CRYPTO_SYMBOLS:tab==='commodities'?COMMODITY_SYMBOLS:RATE_SYMBOLS).map(s=>({symbol:s,name:s,price:0,change:0,changePct:0}))
                    : rows}
                  getRowKey={a => a.symbol}
                />
              )}
            </Card>
          </>
        )
      })()}

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
            const rows = movers[side]
            return (
              <Card key={side} padding={0} style={{overflow:'hidden'}}>
                <div style={{padding:'14px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{side==='gainers'?'Top Gainers':'Top Losers'}</span>
                  <Badge tone={side==='gainers'?'green':'red'}>{side==='gainers'?'↑ Leading':'↓ Lagging'}</Badge>
                  {movers.source && movers.source !== 'none' && (
                    <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-muted)'}}>source: {movers.source}</span>
                  )}
                </div>
                {rows.length
                  ? <DataTable columns={moverCols} rows={rows} getRowKey={m => m.symbol}/>
                  : <MoversEmptyState source={movers.source}/>
                }
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
