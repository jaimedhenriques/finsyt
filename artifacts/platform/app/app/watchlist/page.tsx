'use client'
import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer } from 'recharts'
import { Card, Button, Input, DataTable, PageHero, ContextualAskBar, InlineAgentMenu, type DataColumn } from '@/components/ui'
import { providerLabel } from '@/lib/provider-labels'

interface WatchItem { symbol:string; name:string; price:number; change:number; changePct:number; marketCap:number; volume:number; high52w:number; low52w:number; spark?:number[] }

const DEFAULT_SYMBOLS = ['AAPL','MSFT','NVDA','GOOGL','AMZN','META','TSLA','JPM','V','LLY']

function Sparkline({data,pos}:{data:number[];pos:boolean}) {
  if(!data?.length) return <div style={{width:80,height:28}}/>
  return (
    <ResponsiveContainer width={80} height={28}>
      <AreaChart data={data.map((v,i)=>({v,i}))}>
        <defs><linearGradient id={`wsg${pos?'g':'r'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%"  stopColor={pos?'var(--pos)':'var(--neg)'} stopOpacity={0.25}/>
          <stop offset="95%" stopColor={pos?'var(--pos)':'var(--neg)'} stopOpacity={0}/>
        </linearGradient></defs>
        <Area type="monotone" dataKey="v" stroke={pos?'var(--pos)':'var(--neg)'} strokeWidth={1.5} fill={`url(#wsg${pos?'g':'r'})`} dot={false}/>
      </AreaChart>
    </ResponsiveContainer>
  )
}

function fmt(n:any,dp=2){return n==null||isNaN(n)?'—':Number(n).toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp})}
function fmtLarge(n:any){if(!n)return'—';const v=Number(n);if(v>=1e12)return'$'+(v/1e12).toFixed(2)+'T';if(v>=1e9)return'$'+(v/1e9).toFixed(1)+'B';return'$'+(v/1e6).toFixed(0)+'M'}

interface CalendarEvent { symbol:string; name?:string; date:string; reportType?:string; timing?:string }

function RangeBar({price,low,high}:{price:number;low:number;high:number}){
  if(!low||!high||price<low)return <div style={{width:100}}/>
  const pct=((price-low)/(high-low))*100
  return (
    <div style={{width:100}}>
      <div style={{height:4,borderRadius:2,background:'rgba(255,255,255,0.10)',position:'relative'}}>
        <div style={{position:'absolute',left:0,top:0,height:'100%',width:pct+'%',borderRadius:2,background:'linear-gradient(90deg,var(--neg),var(--pos))'}}/>
        <div style={{position:'absolute',top:-3,left:pct+'%',width:10,height:10,borderRadius:'50%',background:'var(--bg-elevated)',border:'2px solid var(--text-primary)',transform:'translateX(-50%)'}}/>
      </div>
      <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'var(--text-secondary)',marginTop:3}}>
        <span>${fmt(low,0)}</span><span>${fmt(high,0)}</span>
      </div>
    </div>
  )
}

export default function WatchlistPage() {
  const [items, setItems]           = useState<WatchItem[]>([])
  const [loading, setLoading]       = useState(true)
  const [sortBy, setSortBy]         = useState<keyof WatchItem>('marketCap')
  const [sortDir, setSortDir]       = useState<'asc'|'desc'>('desc')
  const [addInput, setAddInput]     = useState('')
  const [lastUpdate, setLastUpdate] = useState<Date|null>(null)
  const [source, setSource]         = useState<string|null>(null)
  const [selected, setSelected]     = useState<Set<string>>(new Set())
  const [events, setEvents]         = useState<CalendarEvent[]>([])
  const [eventsLoading, setEventsLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/quote?symbols='+DEFAULT_SYMBOLS.join(','))
      const data = await res.json()
      if (data.quotes?.length) {
        setItems(data.quotes.map((q:any) => ({
          symbol:q.symbol, name:q.name||q.symbol, price:q.price||q.c||0,
          change:q.change||q.d||0, changePct:q.changePct||q.dp||0,
          marketCap:q.marketCap||0, volume:q.volume||0,
          high52w:q.high52w||q['52WeekHigh']||0, low52w:q.low52w||q['52WeekLow']||0,
          spark:q.spark||[],
        })))
        setLastUpdate(new Date())
        const counts = new Map<string, number>()
        for (const q of data.quotes as any[]) {
          if (q.source) counts.set(q.source, (counts.get(q.source) || 0) + 1)
        }
        const dominant = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        setSource(dominant || null)
      }
    } catch {}
    finally { setLoading(false) }
  }, [])

  useEffect(()=>{ load(); const id=setInterval(load,60000); return()=>clearInterval(id) },[load])

  // Pull confirmed earnings dates for the next 7 days for the watchlist symbols.
  // Drives the "Upcoming Events" panel — never seeded with fake events.
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10)
    const to    = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
    fetch(`/api/earnings-calendar?from=${today}&to=${to}&symbols=${DEFAULT_SYMBOLS.join(',')}`)
      .then(r => r.json())
      .then(d => {
        const list: any[] = Array.isArray(d?.earnings) ? d.earnings : []
        const watchSet = new Set(DEFAULT_SYMBOLS)
        const filtered = list
          .filter(e => watchSet.has(e.symbol))
          .map(e => ({ symbol: e.symbol, name: e.name, date: e.date, reportType: e.reportType, timing: e.timing }))
          .slice(0, 6)
        setEvents(filtered)
      })
      .catch(() => {})
      .finally(() => setEventsLoading(false))
  }, [])

  function toggleSort(col:string){
    if(sortBy===col) setSortDir(d=>d==='desc'?'asc':'desc')
    else { setSortBy(col as keyof WatchItem); setSortDir('desc') }
  }

  const sorted = useMemo(()=>[...items].sort((a,b)=>{
    const av=a[sortBy] as number,bv=b[sortBy] as number
    if(typeof av==='string') return sortDir==='desc'?String(bv).localeCompare(String(av)):String(av).localeCompare(String(bv))
    return sortDir==='desc'?bv-av:av-bv
  }),[items,sortBy,sortDir])

  const allSelected = selected.size > 0 && selected.size === sorted.length
  function toggleAll(){
    if(allSelected) setSelected(new Set())
    else setSelected(new Set(sorted.map(s=>s.symbol)))
  }
  function toggleOne(sym:string){
    setSelected(prev=>{ const n=new Set(prev); n.has(sym)?n.delete(sym):n.add(sym); return n })
  }
  function bulkDelete(){
    setItems(prev=>prev.filter(i=>!selected.has(i.symbol)))
    setSelected(new Set())
  }
  function bulkAlert(){
    const syms=[...selected].join(',')
    if(syms) window.location.href = `/app/alerts?symbols=${syms}`
  }

  const columns: DataColumn<WatchItem>[] = [
    { key:'_select', header: (
        <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
      ), width:36, render: s => (
        <input
          type="checkbox"
          checked={selected.has(s.symbol)}
          onChange={()=>toggleOne(s.symbol)}
          aria-label={`Select ${s.symbol}`}
          style={selected.has(s.symbol)?{accentColor:'var(--accent)'}:undefined}
        />
      )
    },
    { key:'symbol', header:'Symbol', sortable:true, render: s => (
      <Link href={`/app/company/${s.symbol}`} style={{textDecoration:'none',display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:36,height:36,borderRadius:8,background:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'var(--text-primary)',flexShrink:0}}>{s.symbol.slice(0,2)}</div>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{s.symbol}</div>
          <div style={{fontSize:11,color:'var(--text-secondary)',maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
        </div>
      </Link>
    )},
    { key:'price', header:'Price', sortable:true, align:'right', render: s => (
      <span style={{fontWeight:800,fontSize:15,color:'var(--text-primary)'}}>${fmt(s.price)}</span>
    )},
    { key:'changePct', header:'Chg %', sortable:true, align:'right', render: s => (
      <div className={s.changePct>=0?'pos':'neg'} style={{fontWeight:700,fontSize:14}}>
        {s.changePct>=0?'+':''}{s.changePct?.toFixed(2)}%
        <div style={{fontSize:11,fontWeight:500,color:'var(--text-secondary)'}}>{s.change>=0?'+':''}{fmt(s.change)}</div>
      </div>
    )},
    { key:'marketCap', header:'Mkt Cap', sortable:true, align:'right', render: s => <span style={{color:'var(--text-primary)'}}>{fmtLarge(s.marketCap)}</span> },
    { key:'volume', header:'Volume', sortable:true, align:'right', render: s => <span style={{color:'var(--text-primary)'}}>{s.volume?(s.volume/1e6).toFixed(1)+'M':'—'}</span> },
    { key:'_spark', header:'7-Day Trend', render: s => <Sparkline data={s.spark||[]} pos={s.changePct>=0}/> },
    { key:'_range', header:'52W Range', render: s => <RangeBar price={s.price} low={s.low52w} high={s.high52w}/> },
    { key:'_actions', header:'', render: s => (
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <Link href={`/app/company/${s.symbol}`} className="btn btn-outline btn-sm">View</Link>
        <InlineAgentMenu
          subject={s.symbol}
          variant="icon"
          align="right"
          contextData={{ page:'watchlist', symbol:s.symbol, name:s.name, price:s.price, changePct:s.changePct }}
          actions={[
            { label:`Summarise ${s.symbol} today`,           prompt:`Give me a one-paragraph summary of what moved ${s.symbol} (${s.name}) today, citing news and price action.` },
            { label:`Compare ${s.symbol} with peers`,        prompt:`Compare ${s.symbol} with its closest sector peers on growth, margin, and valuation, and tell me where it stands.` },
            { label:`Latest news on ${s.symbol}`,            prompt:`Pull the latest 5 news headlines for ${s.symbol} and tell me what each implies for the stock.` },
            { label:`Risk + catalyst check on ${s.symbol}`,  prompt:`What are the near-term catalysts and the top risks for ${s.symbol} over the next 90 days? Be specific.` },
          ]}
        />
      </div>
    )},
  ]

  // Footer summary across the visible (sorted) set
  const totalGain = sorted.reduce((sum,s)=>sum+(s.change||0),0)
  const avgPct = sorted.length ? sorted.reduce((s,r)=>s+r.changePct,0)/sorted.length : 0
  const totalVol = sorted.reduce((s,r)=>s+(r.volume||0),0)

  return (
    <div style={{padding:'0 0 96px',maxWidth:1400,margin:'0 auto'}}>
      <PageHero
        eyebrow="My Watchlist"
        title="Track what moves your book."
        accentWord="moves"
        subtitle="Live prices, trending transcript topics across your coverage, and an event horizon for the week ahead."
        actions={
          <>
            <div style={{display:'flex',gap:6,alignItems:'center'}}>
              <Input fieldSize="sm" value={addInput} onChange={e=>setAddInput(e.target.value.toUpperCase())} placeholder="Add ticker..." maxLength={6} style={{width:140}}/>
              <Button variant="primary" size="sm" onClick={()=>{ if(addInput.trim()&&!items.find(i=>i.symbol===addInput)) setAddInput('') }}>+</Button>
            </div>
            <Button variant="secondary" size="sm" onClick={load} ariaLabel="Refresh">↻</Button>
          </>
        }
      />

      <div style={{ padding: '0 1.75rem' }}>
        <ContextualAskBar
          context="My Watchlist"
          contextData={{ page: 'watchlist', symbols: items.map(i => i.symbol) }}
          chips={[
            { label: 'Overnight moves',     prompt: 'Summarise overnight moves across my watchlist and flag any names that broke recent ranges.' },
            { label: 'Volume anomalies',    prompt: 'Which names on my watchlist have unusual volume today vs their 30-day average?' },
            { label: 'Earnings next 7 days',prompt: 'Which earnings prints in the next 7 days affect my watchlist? Highlight setups worth pre-reading.' },
            { label: 'Add a name',          prompt: 'Suggest 3 names to add to my watchlist that complement my current sector exposure.' },
          ]}
          placeholder="Ask Finsyt about your watchlist…"
          style={{ margin: '0 0 16px' }}
        />
      </div>

      <div style={{padding:'0 1.75rem 20px',display:'grid',gridTemplateColumns:'repeat(3, minmax(0,1fr))',gap:14}}>
        <WatchPanel title="Portfolio Monitor" hint={lastUpdate?`Updated ${lastUpdate.toLocaleTimeString()}${source?` · ${providerLabel(source)}`:''}`:'Live'}>
          {sorted.slice(0,4).map(s=>(
            <Link key={s.symbol} href={`/app/company/${s.symbol}`} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'8px 4px',borderBottom:'1px solid var(--border)',textDecoration:'none'}}>
              <div>
                <div style={{fontSize:12,fontWeight:800,color:'var(--text-primary)'}}>{s.symbol}</div>
                <div style={{fontSize:10,color:'var(--text-secondary)',maxWidth:110,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>${fmt(s.price)}</div>
                <div className={s.changePct>=0?'pos':'neg'} style={{fontSize:11,fontWeight:700}}>{s.changePct>=0?'+':''}{s.changePct?.toFixed(2)}%</div>
              </div>
            </Link>
          ))}
        </WatchPanel>
        <WatchPanel title="Trending Transcript Topics" hint="Coming soon">
          <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',height:'100%',padding:'18px 8px',textAlign:'center',gap:8}}>
            <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.55}}>
              Topic clustering across your covered transcripts is not yet wired to a live source. We&apos;d rather show nothing than synthesise mentions counts.
            </div>
            <Link href="/app/research" style={{fontSize:11,fontWeight:700,color:'var(--accent-text)',textDecoration:'none'}}>Search transcripts directly →</Link>
          </div>
        </WatchPanel>
        <WatchPanel title="Upcoming Events" hint={eventsLoading?'Loading…':'Next 7 days'}>
          {eventsLoading ? (
            <div style={{padding:'10px 4px',fontSize:11,color:'var(--text-secondary)'}}>Loading earnings calendar…</div>
          ) : events.length === 0 ? (
            <div style={{display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center',height:'100%',padding:'18px 8px',textAlign:'center'}}>
              <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.55,marginBottom:8}}>No confirmed earnings for your watchlist in the next 7 days.</div>
              <Link href="/app/calendar" style={{fontSize:11,fontWeight:700,color:'var(--accent-text)',textDecoration:'none'}}>Open full calendar →</Link>
            </div>
          ) : events.map(ev => {
            const dt = new Date(ev.date + 'T00:00:00Z')
            const dLabel = dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
            return (
              <Link key={ev.date+ev.symbol} href={`/app/company/${ev.symbol}`} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 4px',borderBottom:'1px solid var(--border)',textDecoration:'none'}}>
                <div style={{width:48,textAlign:'center',padding:'4px 0',borderRadius:6,background:'var(--bg-elevated)',fontSize:10,fontWeight:800,color:'var(--text-primary)'}}>{dLabel}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:700,color:'var(--text-primary)'}}>{ev.symbol}</div>
                  <div style={{fontSize:10,color:'var(--text-secondary)'}}>{ev.reportType || 'Earnings'} · {ev.timing || 'TBD'}</div>
                </div>
              </Link>
            )
          })}
        </WatchPanel>
      </div>

      <div style={{padding:'0 1.75rem'}}>
      <Card padding={0} style={{overflow:'hidden'}}>
        <DataTable
          columns={columns}
          rows={sorted}
          sortBy={sortBy as string}
          sortDir={sortDir}
          onSort={toggleSort}
          getRowKey={s => s.symbol}
        />
      </Card>
      </div>

      {/* Sticky footer summary + bulk actions */}
      <div style={{position:'fixed',left:0,right:0,bottom:0,zIndex:30,background:'rgba(10,22,40,0.92)',backdropFilter:'blur(10px)',borderTop:'1px solid var(--border)'}}>
        <div style={{maxWidth:1400,margin:'0 auto',padding:'12px 1.75rem',display:'flex',alignItems:'center',gap:18,flexWrap:'wrap'}}>
          {selected.size>0 ? (
            <>
              <span style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{selected.size} selected</span>
              <button className="btn btn-outline btn-sm" onClick={bulkAlert}>Create alerts</button>
              <button className="btn btn-danger btn-sm" onClick={bulkDelete}>Remove</button>
              <button className="btn btn-ghost btn-sm" onClick={()=>setSelected(new Set())}>Clear</button>
            </>
          ) : (
            <>
              <Stat label="Holdings" value={`${sorted.length}`}/>
              <Stat label="Gainers" value={`${sorted.filter(s=>s.changePct>0).length}`} color="var(--pos)"/>
              <Stat label="Losers" value={`${sorted.filter(s=>s.changePct<0).length}`} color="var(--neg)"/>
              <Stat label="Avg %" value={`${avgPct>=0?'+':''}${avgPct.toFixed(2)}%`} color={avgPct>=0?'var(--pos)':'var(--neg)'}/>
              <Stat label="Net change" value={`${totalGain>=0?'+':''}${fmt(totalGain)}`} color={totalGain>=0?'var(--pos)':'var(--neg)'}/>
              <Stat label="Total volume" value={`${(totalVol/1e6).toFixed(1)}M`}/>
              <span style={{marginLeft:'auto',fontSize:11,color:'var(--text-secondary)'}}>Tip: select rows to bulk delete or create alerts</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function WatchPanel({title,hint,children}:{title:string;hint?:string;children:React.ReactNode}){
  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:14,minHeight:220,display:'flex',flexDirection:'column'}}>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,paddingBottom:8,borderBottom:'1px solid var(--border)'}}>
        <span style={{fontSize:11,fontWeight:800,color:'var(--text-primary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{title}</span>
        {hint && <span style={{fontSize:10,color:'var(--text-muted)'}}>{hint}</span>}
      </div>
      <div style={{flex:1}}>{children}</div>
    </div>
  )
}

function Stat({label,value,color}:{label:string;value:string;color?:string}){
  return (
    <div style={{display:'flex',flexDirection:'column'}}>
      <span style={{fontSize:10,fontWeight:600,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>{label}</span>
      <span style={{fontSize:14,fontWeight:800,color:color||'var(--text-primary)'}}>{value}</span>
    </div>
  )
}
