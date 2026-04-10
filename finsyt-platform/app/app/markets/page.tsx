'use client'
import { useState } from 'react'
import Link from 'next/link'
import { fmtPct, fmt, changeClass } from '@/lib/utils'

const INDICES = [
  { label:'S&P 500', ticker:'.SPX', price:5254.35, change:0.42, ytd:7.8 },
  { label:'NASDAQ 100', ticker:'.NDX', price:18391.2, change:0.61, ytd:9.2 },
  { label:'Dow Jones', ticker:'.DJI', price:39127.8, change:0.22, ytd:5.1 },
  { label:'FTSE 100', ticker:'.FTSE', price:8204.6, change:0.14, ytd:3.8 },
  { label:'EURO STOXX 50', ticker:'.STOXX50E', price:4947.7, change:0.31, ytd:6.4 },
  { label:'Nikkei 225', ticker:'.N225', price:38804.1, change:-0.52, ytd:12.1 },
  { label:'Hang Seng', ticker:'.HSI', price:17651.4, change:-0.84, ytd:-2.1 },
  { label:'DAX', ticker:'.GDAXI', price:18492.5, change:0.41, ytd:8.2 },
]

const FUTURES = [
  { label:'CBOT E-mini Dow Futures', ticker:'1YMcv1', price:39151.0, change:0.01 },
  { label:'CME E-mini S&P 500 Futures', ticker:'ESccv1', price:5247.25, change:0.05 },
  { label:'CME E-mini NASDAQ 100 Futures', ticker:'NQccv1', price:20062.75, change:0.16 },
  { label:'ICE Europe FTSE 100 Futures', ticker:'FFIc1', price:8277.0, change:-0.05 },
  { label:'Eurex EURO STOXX 50 Futures', ticker:'STXEc1', price:4949.0, change:0.04 },
]

const FOREX = [
  { name:'Euro', code:'EUR', pair:'EUR/USD', bid:'1.07', ask:'39/43', last:1.07, change:-0.03, mtd:-0.94, m3:-1.64, ytd:-1.31, prev:1.0747, contributor:'BARCLAYS' },
  { name:'Japanese Yen', code:'JPY', pair:'USD/JPY', bid:'156.', ask:'06/09', last:156, change:-0.01, mtd:0.48, m3:4.21, ytd:-10.15, prev:157.91, contributor:'NEDBANK LTD' },
  { name:'British Pound', code:'GBP', pair:'GBP/USD', bid:'1.37', ask:'12/16', last:1.37, change:-0.04, mtd:-0.21, m3:-0.58, ytd:0.55, prev:1.2722, contributor:'BARCLAYS' },
  { name:'Swiss Franc', code:'CHF', pair:'USD/CHF', bid:'0.88', ask:'38/43', last:0.88, change:-0.05, mtd:-2.07, m3:-4.34, ytd:2.41, prev:0.8918, contributor:'SEB' },
  { name:'Canadian Dollar', code:'CAD', pair:'USD/CAD', bid:'1.37', ask:'13/14', last:1.37, change:+0.04, mtd:0.64, m3:2.04, ytd:2.04, prev:1.3706, contributor:'ZUERCHER KB' },
  { name:'Australian Dollar', code:'AUD', pair:'AUD/USD', bid:'0.66', ask:'72/73', last:0.66, change:+0.01, mtd:0.90, m3:1.32, ytd:-0.85, prev:0.6573, contributor:'SEB' },
  { name:'New Zealand $', code:'NZD', pair:'NZD/USD', bid:'0.61', ask:'31/35', last:0.61, change:-0.02, mtd:-0.18, m3:0.84, ytd:-1.83, prev:0.6132, contributor:'SEB' },
  { name:'Euro/SwissFranc', code:'EURCHF', pair:'EUR/CHF', bid:'0.94', ask:'92/98', last:0.94, change:-0.09, mtd:-3.03, m3:-1.93, ytd:0.57, prev:0.9498, contributor:'SEB' },
  { name:'Euro/GBPound', code:'EURGBP', pair:'EUR/GBP', bid:'0.84', ask:'45/50', last:0.84, change:+0.01, mtd:-0.81, m3:-1.11, ytd:-2.44, prev:0.8448, contributor:'SEB' },
  { name:'Euro/Yen', code:'EURJPY', pair:'EUR/JPY', bid:'169.', ask:'77/81', last:169, change:-0.24, mtd:-0.49, m3:3.12, ytd:8.05, prev:161.71, contributor:'SOC GENERALE' },
  { name:'Euro/SwedenKr', code:'EURSEK', pair:'EUR/SEK', bid:'11.23', ask:'06/32', last:11.23, change:+0.05, mtd:1.68, m3:1.65, ytd:0.83, prev:11.2247, contributor:'ZUERCHER KB' },
  { name:'Euro/NorwayKr', code:'EURNOK', pair:'EUR/NOK', bid:'11.33', ask:'43/85', last:11.33, change:+0.02, mtd:-0.18, m3:-1.52, ytd:0.32, prev:11.3510, contributor:'ZUERCHER KB' },
]

const SECTORS = [
  { name:'Technology', change:1.42, ytd:8.3, mcap:'$14.2T', top:'NVDA +2.8%' },
  { name:'Healthcare', change:0.31, ytd:3.1, mcap:'$6.8T', top:'LLY +1.5%' },
  { name:'Financials', change:-0.12, ytd:5.2, mcap:'$7.1T', top:'JPM +0.3%' },
  { name:'Energy', change:-0.82, ytd:-2.1, mcap:'$3.4T', top:'XOM -0.8%' },
  { name:'Consumer Disc.', change:0.64, ytd:4.8, mcap:'$4.9T', top:'AMZN +1.1%' },
  { name:'Consumer Staples', change:0.18, ytd:1.2, mcap:'$3.1T', top:'WMT +0.4%' },
  { name:'Industrials', change:0.22, ytd:2.8, mcap:'$4.2T', top:'HON +0.5%' },
  { name:'Utilities', change:-0.45, ytd:-0.8, mcap:'$1.4T', top:'NEE -0.3%' },
  { name:'Real Estate', change:-0.67, ytd:-3.2, mcap:'$1.2T', top:'AMT -0.7%' },
  { name:'Materials', change:0.35, ytd:1.9, mcap:'$2.1T', top:'LIN +0.4%' },
  { name:'Communication', change:0.91, ytd:6.1, mcap:'$4.4T', top:'META +0.9%' },
]

const MOVERS = {
  gainers:[{symbol:'NVDA',name:'NVIDIA',change:2.88,price:924.8},{symbol:'AMD',name:'Advanced Micro',change:2.14,price:158.4},{symbol:'TSLA',name:'Tesla',change:1.92,price:248.2},{symbol:'NFLX',name:'Netflix',change:1.87,price:890.4},{symbol:'AVGO',name:'Broadcom',change:1.41,price:218.5}],
  losers:[{symbol:'INTC',name:'Intel',change:-2.31,price:32.4},{symbol:'XOM',name:'Exxon',change:-0.84,price:116.4},{symbol:'NEE',name:'NextEra',change:-0.72,price:64.2},{symbol:'AMT',name:'American Tower',change:-0.68,price:184.3},{symbol:'INTL',name:'ICE',change:-0.55,price:88.1}],
}

export default function MarketsPage() {
  const [tab, setTab] = useState<'overview'|'forex'|'futures'|'sectors'>('overview')
  const [moversTab, setMoversTab] = useState<'gainers'|'losers'>('gainers')

  return (
    <div className="page-content">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:12}}>
        <div>
          <h1 className="page-title">Markets</h1>
          <p style={{fontSize:13,marginTop:2,color:'#7D8FA9'}}>Global indices, FX, futures & sector performance</p>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:'#059669',animation:'pulse 2s infinite'}}/>
          <span style={{fontSize:12,fontWeight:600,color:'#059669'}}>Live Data</span>
        </div>
      </div>

      <div className="tab-bar" style={{marginBottom:20}}>
        {[['overview','Overview'],['forex','Forex'],['futures','Futures'],['sectors','Sectors']].map(([v,l])=>(
          <button key={v} className={`tab-btn ${tab===v?'active':''}`} onClick={()=>setTab(v as any)}>{l}</button>
        ))}
      </div>

      {tab==='overview' && (
        <div>
          <div className="card" style={{marginBottom:20,overflow:'hidden'}}>
            <div style={{padding:'12px 20px',borderBottom:'1px solid #E2E8F2',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontWeight:700,fontSize:14,color:'#0A1628'}}>Global Indices</span>
              <span style={{fontSize:12,color:'#7D8FA9'}}>NAME · LAST · % CHANGE</span>
            </div>
            <table className="data-table">
              <thead><tr><th>Index</th><th>Ticker</th><th className="right">Last</th><th className="right">% Change</th><th className="right">YTD</th></tr></thead>
              <tbody>
                {INDICES.map((idx,i)=>(
                  <tr key={i}>
                    <td style={{fontWeight:600,fontSize:13,color:'#0A1628'}}>{idx.label}</td>
                    <td style={{fontSize:12,color:'#B0BCD0',fontFamily:'monospace'}}>{idx.ticker}</td>
                    <td className="right" style={{fontWeight:700,fontSize:13}}>{idx.price.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                    <td className={`right ${changeClass(idx.change)}`} style={{fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                      <span>{idx.change>=0?'▲':'▼'}</span>{Math.abs(idx.change).toFixed(2)}%
                    </td>
                    <td className={`right ${changeClass(idx.ytd)}`} style={{fontSize:13}}>{fmtPct(idx.ytd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:16}}>
            <div className="card" style={{overflow:'hidden'}}>
              <div style={{padding:'12px 20px',borderBottom:'1px solid #E2E8F2'}}><span style={{fontWeight:700,fontSize:14,color:'#0A1628'}}>Sector Heatmap</span></div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:8,padding:16}}>
                {SECTORS.map(s=>{
                  const bg = s.change>0?`rgba(5,150,105,${0.07+Math.min(Math.abs(s.change)/2,1)*0.15})`:`rgba(220,38,38,${0.07+Math.min(Math.abs(s.change)/2,1)*0.15})`
                  const bc = s.change>0?'rgba(5,150,105,0.2)':'rgba(220,38,38,0.2)'
                  return <div key={s.name} style={{borderRadius:10,padding:'10px 12px',background:bg,border:`1px solid ${bc}`}}>
                    <div style={{fontSize:11,fontWeight:600,color:'#1C2B4A',marginBottom:4}}>{s.name}</div>
                    <div style={{fontWeight:900,fontSize:'1.125rem',color:s.change>0?'#059669':'#DC2626',letterSpacing:'-0.02em'}}>{fmtPct(s.change)}</div>
                    <div style={{fontSize:10,color:'#7D8FA9',marginTop:2}}>{s.mcap}</div>
                  </div>
                })}
              </div>
            </div>
            <div className="card" style={{overflow:'hidden'}}>
              <div style={{padding:'12px 20px',borderBottom:'1px solid #E2E8F2'}}>
                <div style={{display:'flex',gap:0}}>
                  {(['gainers','losers'] as const).map(t=>(
                    <button key={t} onClick={()=>setMoversTab(t)} className={`tab-btn ${moversTab===t?'active':''}`} style={{fontSize:12,textTransform:'capitalize',padding:'4px 12px'}}>{t==='gainers'?'▲ Top Gainers':'▼ Top Losers'}</button>
                  ))}
                </div>
              </div>
              {MOVERS[moversTab].map((m,i)=>(
                <div key={i} onClick={()=>window.location.href=`/app/company/${m.symbol}`}
                  style={{display:'flex',alignItems:'center',gap:12,padding:'12px 20px',borderBottom:i<4?'1px solid #F0F4FA':'none',cursor:'pointer'}}>
                  <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,#1B4FFF,#0D9FE8)',display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontSize:12,fontWeight:900,flexShrink:0}}>{m.symbol[0]}</div>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:13,color:'#0A1628'}}>{m.symbol}</div>
                    <div style={{fontSize:11,color:'#7D8FA9'}}>{m.name}</div>
                  </div>
                  <div style={{textAlign:'right'}}>
                    <div style={{fontWeight:600,fontSize:13}}>${fmt(m.price)}</div>
                    <div style={{fontWeight:700,fontSize:12,color:m.change>0?'#059669':'#DC2626'}}>{fmtPct(m.change)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {tab==='forex' && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'12px 20px',borderBottom:'1px solid #E2E8F2',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontWeight:700,fontSize:14,color:'#0A1628'}}>Forex — Major Pairs</span>
            <div style={{display:'flex',gap:16,fontSize:11,color:'#B0BCD0'}}>
              <span>ENTITIES</span><span style={{color:'#1B4FFF',fontWeight:700,borderBottom:'2px solid #1B4FFF',paddingBottom:2}}>RATES</span><span>RELATED NEWS</span>
            </div>
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="data-table">
              <thead><tr>
                <th>NAME</th><th className="right">BID/OFFER</th><th className="right">% S.CHNG</th>
                <th>TIME · CONTRIBUTOR</th><th className="right">MTD %</th><th className="right">3M %</th>
                <th className="right">YTD %</th><th className="right">S/U CLOSE</th>
              </tr></thead>
              <tbody>
                {FOREX.map((f,i)=>(
                  <tr key={i}>
                    <td>
                      <div style={{fontWeight:600,fontSize:13,color:'#0A1628'}}>{f.name}</div>
                      <div style={{fontSize:11,color:'#B0BCD0',fontFamily:'monospace'}}>{f.pair}</div>
                    </td>
                    <td className="right" style={{fontSize:13,fontWeight:700}}>
                      {f.last.toFixed(2)} <span style={{color:'#1B4FFF',fontSize:12}}>{f.ask}</span>
                    </td>
                    <td className={`right ${changeClass(f.change)}`} style={{fontSize:13,fontWeight:600}}>{fmtPct(f.change)}</td>
                    <td style={{fontSize:11,color:'#7D8FA9'}}>10:13 · {f.contributor}</td>
                    <td className={`right ${changeClass(f.mtd)}`} style={{fontSize:12}}>{fmtPct(f.mtd)}</td>
                    <td className={`right ${changeClass(f.m3)}`} style={{fontSize:12}}>{fmtPct(f.m3)}</td>
                    <td className={`right ${changeClass(f.ytd)}`} style={{fontSize:12,fontWeight:600}}>{fmtPct(f.ytd)}</td>
                    <td className="right" style={{fontSize:12,color:'#7D8FA9'}}>{f.prev.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab==='futures' && (
        <div className="card" style={{overflow:'hidden'}}>
          <div style={{padding:'12px 20px',borderBottom:'1px solid #E2E8F2'}}>
            <span style={{fontWeight:700,fontSize:14,color:'#0A1628'}}>Index Futures</span>
          </div>
          <table className="data-table">
            <thead><tr><th>Contract Name</th><th>Ticker</th><th className="right">Last</th><th className="right">% Change</th><th>Time</th></tr></thead>
            <tbody>
              {FUTURES.map((f,i)=>(
                <tr key={i}>
                  <td style={{fontWeight:600,fontSize:13,color:'#0A1628'}}>{f.label}</td>
                  <td style={{fontSize:12,color:'#B0BCD0',fontFamily:'monospace'}}>{f.ticker}</td>
                  <td className="right" style={{fontWeight:700,fontSize:13}}>{f.price.toLocaleString('en-US',{minimumFractionDigits:2})}</td>
                  <td className={`right ${changeClass(f.change)}`} style={{fontSize:13,fontWeight:600,display:'flex',alignItems:'center',justifyContent:'flex-end',gap:4}}>
                    <span>{f.change>=0?'▲':'▼'}</span>{Math.abs(f.change).toFixed(2)}%
                  </td>
                  <td style={{fontSize:11,color:'#B0BCD0'}}>10:{(i*2+13).toString().padStart(2,'0')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab==='sectors' && (
        <div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:12,marginBottom:20}}>
            {SECTORS.map(s=>{
              const bg = s.change>0?`rgba(5,150,105,${0.07+Math.min(Math.abs(s.change)/2,1)*0.18})`:`rgba(220,38,38,${0.07+Math.min(Math.abs(s.change)/2,1)*0.18})`
              return <div key={s.name} style={{borderRadius:12,padding:'1rem 1.25rem',background:bg,border:`1px solid ${s.change>0?'rgba(5,150,105,0.2)':'rgba(220,38,38,0.2)'}`}}>
                <div style={{fontWeight:700,fontSize:13,color:'#0A1628',marginBottom:6}}>{s.name}</div>
                <div style={{fontWeight:900,fontSize:'1.5rem',color:s.change>0?'#059669':'#DC2626',letterSpacing:'-0.02em'}}>{fmtPct(s.change)}</div>
                <div style={{display:'flex',justifyContent:'space-between',marginTop:8,fontSize:12}}>
                  <span style={{color:'#7D8FA9'}}>YTD {fmtPct(s.ytd)}</span>
                  <span style={{color:'#B0BCD0'}}>{s.mcap}</span>
                </div>
                <div style={{fontSize:11,color:'#7D8FA9',marginTop:4}}>{s.top}</div>
              </div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
