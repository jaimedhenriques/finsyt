'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer, Tooltip } from 'recharts'

interface IndexQuote { label:string; ticker:string; price:number; change:number; changePct:number; spark?:number[] }
interface ForexRate   { pair:string; from:string; to:string; rate:number; changePct?:number }
interface Mover       { symbol:string; name:string; price:number; changePct:number }

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
  {name:'Technology',    chg:1.42, bg:'#ECFDF5',bc:'#D1FAE5',tc:'#059669'},
  {name:'Healthcare',    chg:0.31, bg:'#ECFDF5',bc:'#D1FAE5',tc:'#059669'},
  {name:'Financials',    chg:-0.12,bg:'#FEF2F2',bc:'#FEE2E2',tc:'#DC2626'},
  {name:'Energy',        chg:-0.82,bg:'#FEF2F2',bc:'#FEE2E2',tc:'#DC2626'},
  {name:'Consumer Disc.',chg:0.64, bg:'#ECFDF5',bc:'#D1FAE5',tc:'#059669'},
  {name:'Industrials',   chg:0.22, bg:'#ECFDF5',bc:'#D1FAE5',tc:'#059669'},
  {name:'Utilities',     chg:-0.45,bg:'#FEF2F2',bc:'#FEE2E2',tc:'#DC2626'},
  {name:'Materials',     chg:0.35, bg:'#ECFDF5',bc:'#D1FAE5',tc:'#059669'},
  {name:'Communication', chg:0.91, bg:'#ECFDF5',bc:'#D1FAE5',tc:'#059669'},
  {name:'Real Estate',   chg:-0.67,bg:'#FEF2F2',bc:'#FEE2E2',tc:'#DC2626'},
  {name:'Staples',       chg:0.18, bg:'#ECFDF5',bc:'#D1FAE5',tc:'#059669'},
]

function Sparkline({data,pos}:{data:number[];pos:boolean}) {
  if(!data?.length) return <div style={{width:80,height:32}}/>
  return (
    <ResponsiveContainer width={80} height={32}>
      <AreaChart data={data.map((v,i)=>({v,i}))}>
        <defs><linearGradient id={`sg${pos?'g':'r'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={pos?'#059669':'#DC2626'} stopOpacity={0.25}/>
          <stop offset="95%" stopColor={pos?'#059669':'#DC2626'} stopOpacity={0}/>
        </linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={pos?'#059669':'#DC2626'} strokeWidth={1.5} fill={`url(#sg${pos?'g':'r'})`} dot={false}/>
        <Tooltip content={()=>null}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

function fmt(n:number,dp=2){return n==null?'—':n.toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp})}
function fmtPct(n:number){return n==null?'—':(n>=0?'+':'')+n.toFixed(2)+'%'}

export default function MarketsPage() {
  const [tab, setTab] = useState<'overview'|'forex'|'movers'>('overview')
  const [indices, setIndices]   = useState<IndexQuote[]>([])
  const [forex, setForex]       = useState<ForexRate[]>([])
  const [movers, setMovers]     = useState<{gainers:Mover[];losers:Mover[]}>({gainers:[],losers:[]})
  const [loading, setLoading]   = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date|null>(null)

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

  return (
    <div style={{padding:'1.75rem',maxWidth:1400,margin:'0 auto'}}>
      {/* Header */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <div>
          <h1 className="page-title">Markets</h1>
          <p style={{fontSize:13,color:'#9BAFC8',marginTop:3}}>Global indices, forex, and sector performance</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          {lastUpdate && <span style={{fontSize:12,color:'#9BAFC8'}}>Updated {lastUpdate.toLocaleTimeString()}</span>}
          <div style={{display:'flex',alignItems:'center',gap:6,padding:'5px 12px',borderRadius:20,background:'#ECFDF5',border:'1px solid #D1FAE5'}}>
            <div style={{width:6,height:6,borderRadius:'50%',background:'#059669'}}/>
            <span style={{fontSize:12,fontWeight:600,color:'#059669'}}>Live</span>
          </div>
          <button onClick={load} className="btn btn-outline btn-sm">↻ Refresh</button>
        </div>
      </div>

      {/* Tabs */}
      <div className="tab-bar">
        {(['overview','forex','movers'] as const).map(t => (
          <button key={t} className={`tab-btn${tab===t?' active':''}`} onClick={()=>setTab(t)}>
            {t==='overview'?'Overview':t==='forex'?'Forex / FX':'Movers'}
          </button>
        ))}
      </div>

      {tab==='overview' && (
        <>
          {/* Indices grid */}
          <div className="card" style={{marginBottom:20,overflow:'hidden'}}>
            <div style={{padding:'14px 20px',borderBottom:'1px solid #E2E8F2',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <span style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>Global Indices</span>
              <span style={{fontSize:12,color:'#9BAFC8'}}>Real-time · Auto-refresh 60s</span>
            </div>
            <div style={{overflowX:'auto'}}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Index</th><th className="right">Price</th><th className="right">Change</th>
                    <th className="right">Change %</th><th>7-Day</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? INDEX_TICKERS.map(t=>(
                    <tr key={t.ticker}><td>{t.label}</td><td className="right"><span className="skeleton" style={{width:80,height:16}}/></td><td/><td/><td/></tr>
                  )) : indices.map(ix=>(
                    <tr key={ix.ticker}>
                      <td><div style={{fontWeight:700,color:'#0A1628'}}>{ix.label}</div><div style={{fontSize:11,color:'#9BAFC8'}}>{ix.ticker}</div></td>
                      <td className="right" style={{fontWeight:700,fontSize:15,color:'#0A1628'}}>{fmt(ix.price)}</td>
                      <td className={`right ${ix.change>=0?'pos':'neg'}`}>{ix.change>=0?'+':''}{fmt(ix.change)}</td>
                      <td className={`right ${ix.changePct>=0?'pos':'neg'}`} style={{fontWeight:700}}>{fmtPct(ix.changePct)}</td>
                      <td><Sparkline data={ix.spark||[]} pos={ix.changePct>=0}/></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Sectors */}
          <div className="card" style={{padding:20}}>
            <div style={{fontSize:13,fontWeight:700,color:'#0A1628',marginBottom:16}}>Sector Performance</div>
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:10}}>
              {SECTORS.map(s=>(
                <div key={s.name} style={{borderRadius:10,padding:'12px 14px',background:s.bg,border:`1px solid ${s.bc}`,cursor:'pointer'}}>
                  <div style={{fontSize:12,fontWeight:700,color:'#0A1628',marginBottom:6}}>{s.name}</div>
                  <div style={{fontSize:16,fontWeight:800,color:s.tc}}>{s.chg>=0?'+':''}{s.chg.toFixed(2)}%</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab==='forex' && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'14px 20px',borderBottom:'1px solid #E2E8F2'}}>
            <span style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>Foreign Exchange Rates</span>
          </div>
          <table className="data-table">
            <thead><tr><th>Pair</th><th className="right">Rate</th><th className="right">Change %</th><th>Direction</th></tr></thead>
            <tbody>
              {(forex.length ? forex : FOREX_PAIRS.map(p=>({pair:`${p.from}/${p.to}`,from:p.from,to:p.to,rate:0,changePct:0}))).map(r=>(
                <tr key={r.pair}>
                  <td><span style={{fontWeight:700,fontSize:14,color:'#0A1628'}}>{r.from}</span><span style={{color:'#9BAFC8',margin:'0 4px'}}>/</span><span style={{fontWeight:700,fontSize:14,color:'#0A1628'}}>{r.to}</span></td>
                  <td className="right" style={{fontWeight:700,fontSize:15}}>{r.rate?fmt(r.rate,4):<span className="skeleton" style={{width:70,height:16}}/>}</td>
                  <td className={`right ${(r.changePct||0)>=0?'pos':'neg'}`} style={{fontWeight:600}}>{r.changePct?fmtPct(r.changePct):'—'}</td>
                  <td><span style={{fontSize:18,color:(r.changePct||0)>=0?'#059669':'#DC2626'}}>{(r.changePct||0)>=0?'↑':'↓'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='movers' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
          {(['gainers','losers'] as const).map(side=>(
            <div key={side} className="card" style={{overflow:'hidden'}}>
              <div style={{padding:'14px 20px',borderBottom:'1px solid #E2E8F2',display:'flex',alignItems:'center',gap:8}}>
                <span style={{fontSize:13,fontWeight:700,color:'#0A1628'}}>{side==='gainers'?'Top Gainers':'Top Losers'}</span>
                <span className={`badge ${side==='gainers'?'badge-green':'badge-red'}`}>{side==='gainers'?'↑ Leading':'↓ Lagging'}</span>
              </div>
              <table className="data-table">
                <thead><tr><th>Symbol</th><th className="right">Price</th><th className="right">Change %</th></tr></thead>
                <tbody>
                  {(movers[side].length?movers[side]:[{symbol:'NVDA',name:'NVIDIA',price:878,changePct:4.2},{symbol:'AMD',name:'AMD',price:156,changePct:3.1},{symbol:'MSTR',name:'MicroStrategy',price:1340,changePct:5.8}].map(m=>side==='losers'?{...m,changePct:-m.changePct}:m)).map(m=>(
                    <tr key={m.symbol}>
                      <td>
                        <Link href={`/app/company/${m.symbol}`} style={{textDecoration:'none'}}>
                          <div style={{fontWeight:700,color:'#0A1628'}}>{m.symbol}</div>
                          <div style={{fontSize:11,color:'#9BAFC8',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:180}}>{m.name}</div>
                        </Link>
                      </td>
                      <td className="right" style={{fontWeight:700}}>${fmt(m.price)}</td>
                      <td className={`right ${m.changePct>=0?'pos':'neg'}`} style={{fontWeight:700,fontSize:15}}>{fmtPct(m.changePct)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
