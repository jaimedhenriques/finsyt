'use client'
import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { useWorkspace, type ScreenerPreset } from '../../../lib/workspace'
import { Card, Badge, DataTable, ContextualAskBar, InlineAgentMenu, type DataColumn } from '@/components/ui'

interface Stock { symbol:string; name:string; price:number; changePct:number; marketCap:number; peRatio:number; sector:string; volume:number; exchange:string; dividendYield?:number; beta?:number }

const SECTORS = ['All','Technology','Healthcare','Financials','Energy','Consumer Disc.','Industrials','Utilities','Materials','Communication','Real Estate']
const EXCHANGES = ['All','NYSE','NASDAQ','LSE','TSX']

function fmt(n:number,dp=2){return n==null?'—':n.toLocaleString('en-US',{minimumFractionDigits:dp,maximumFractionDigits:dp})}
function fmtB(n:number){
  if(!n)return'—'
  if(n>=1e12)return`$${(n/1e12).toFixed(2)}T`
  if(n>=1e9)return`$${(n/1e9).toFixed(1)}B`
  if(n>=1e6)return`$${(n/1e6).toFixed(0)}M`
  return`$${n.toLocaleString()}`
}

const FALLBACK:Stock[]=[
  {symbol:'AAPL',name:'Apple Inc.',             price:173.50,changePct:0.72,  marketCap:2.7e12,peRatio:28.4,sector:'Technology',    volume:58e6, exchange:'NASDAQ',dividendYield:0.5,beta:1.20},
  {symbol:'MSFT',name:'Microsoft Corp.',         price:415.80,changePct:-0.50,marketCap:3.1e12,peRatio:35.2,sector:'Technology',    volume:22e6, exchange:'NASDAQ',dividendYield:0.7,beta:0.95},
  {symbol:'NVDA',name:'NVIDIA Corporation',      price:878.40,changePct:1.42, marketCap:2.2e12,peRatio:68.1,sector:'Technology',    volume:42e6, exchange:'NASDAQ',dividendYield:0.0,beta:1.65},
  {symbol:'GOOGL',name:'Alphabet Inc.',          price:170.30,changePct:0.38, marketCap:2.1e12,peRatio:23.5,sector:'Communication',  volume:18e6, exchange:'NASDAQ',dividendYield:0.0,beta:1.05},
  {symbol:'AMZN',name:'Amazon.com Inc.',         price:185.70,changePct:1.15, marketCap:1.9e12,peRatio:43.7,sector:'Consumer Disc.', volume:31e6, exchange:'NASDAQ',dividendYield:0.0,beta:1.20},
  {symbol:'META',name:'Meta Platforms',          price:493.50,changePct:0.94, marketCap:1.3e12,peRatio:26.4,sector:'Communication',  volume:14e6, exchange:'NASDAQ',dividendYield:0.4,beta:1.25},
  {symbol:'TSLA',name:'Tesla Inc.',              price:175.20,changePct:-2.66,marketCap:5.6e11,peRatio:48.9,sector:'Consumer Disc.', volume:95e6, exchange:'NASDAQ',dividendYield:0.0,beta:2.05},
  {symbol:'JPM',name:'JPMorgan Chase',           price:195.80,changePct:0.33, marketCap:5.7e11,peRatio:11.2,sector:'Financials',    volume:9e6,  exchange:'NYSE',  dividendYield:2.4,beta:1.10},
  {symbol:'LLY', name:'Eli Lilly',               price:735.40,changePct:1.52, marketCap:6.98e11,peRatio:55.1,sector:'Healthcare',   volume:3e6,  exchange:'NYSE',  dividendYield:0.7,beta:0.45},
  {symbol:'V',   name:'Visa Inc.',               price:275.60,changePct:0.21, marketCap:5.5e11,peRatio:29.8,sector:'Financials',    volume:5e6,  exchange:'NYSE',  dividendYield:0.7,beta:0.95},
  {symbol:'XOM', name:'ExxonMobil Corp.',        price:112.40,changePct:-0.82,marketCap:4.5e11,peRatio:13.4,sector:'Energy',        volume:16e6, exchange:'NYSE',  dividendYield:3.4,beta:0.95},
  {symbol:'WMT', name:'Walmart Inc.',            price:62.30, changePct:0.44, marketCap:5.0e11,peRatio:27.2,sector:'Consumer Disc.',volume:8e6,  exchange:'NYSE',  dividendYield:1.3,beta:0.55},
]

interface FactorState {
  marketCap: [number, number]
  pe: [number, number]
  changePct: [number, number]
  dividend: [number, number]
  beta: [number, number]
}

const DEFAULT_FACTORS: FactorState = {
  marketCap: [0, 4000],
  pe: [0, 100],
  changePct: [-15, 15],
  dividend: [0, 10],
  beta: [0, 3],
}

// Geo (Census) filter — restricts results to companies whose registered HQ
// state has a Census ACS5 median household income above a chosen threshold.
interface GeoFilterState {
  enabled: boolean
  minStateMedianIncomeK: number  // thousands of dollars; e.g. 70 → $70,000
}
const DEFAULT_GEO: GeoFilterState = { enabled: false, minStateMedianIncomeK: 0 }

interface CensusStateRow {
  stateFips: string
  postalCode: string
  name: string
  medianIncome: number | null
  population: number | null
}

interface ScreenerFilterShape {
  search: string
  sector: string
  exchange: string
  factors: FactorState
  geo?: GeoFilterState
}

function isFactorTuple(v: unknown): v is [number, number] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number'
}

function presetToFilters(p: ScreenerPreset): ScreenerFilterShape | null {
  const f = p.filters as Partial<ScreenerFilterShape> | undefined
  if (!f || typeof f !== 'object') return null
  const fac = (f.factors as Partial<FactorState>) || {}
  if (!isFactorTuple(fac.marketCap) || !isFactorTuple(fac.pe) || !isFactorTuple(fac.changePct)
    || !isFactorTuple(fac.dividend) || !isFactorTuple(fac.beta)) return null
  const rawGeo = (f.geo as Partial<GeoFilterState>) || {}
  const geo: GeoFilterState = {
    enabled: typeof rawGeo.enabled === 'boolean' ? rawGeo.enabled : false,
    minStateMedianIncomeK: typeof rawGeo.minStateMedianIncomeK === 'number' ? rawGeo.minStateMedianIncomeK : 0,
  }
  return {
    search: typeof f.search === 'string' ? f.search : '',
    sector: typeof f.sector === 'string' ? f.sector : 'All',
    exchange: typeof f.exchange === 'string' ? f.exchange : 'All',
    factors: {
      marketCap: fac.marketCap,
      pe: fac.pe,
      changePct: fac.changePct,
      dividend: fac.dividend,
      beta: fac.beta,
    },
    geo,
  }
}

export default function ScreenerPage() {
  const { screenerPresets, screenerPresetsSynced, saveScreenerPreset, deleteScreenerPreset, renameScreenerPreset, updateScreenerPreset } = useWorkspace()
  const [stocks, setStocks]       = useState<Stock[]>(FALLBACK)
  const [search, setSearch]       = useState('')
  const [sector, setSector]       = useState('All')
  const [exchange, setExchange]   = useState('All')
  const [factors, setFactors]     = useState<FactorState>(DEFAULT_FACTORS)
  const [geo, setGeo]             = useState<GeoFilterState>(DEFAULT_GEO)
  const [stateRows, setStateRows] = useState<CensusStateRow[]>([])
  const [stateRowsErr, setStateRowsErr] = useState<string | null>(null)
  const [hqStates, setHqStates]   = useState<Record<string, string>>({}) // symbol → USPS state
  const [hqLoading, setHqLoading] = useState(false)
  const [sortBy, setSortBy]       = useState<keyof Stock>('marketCap')
  const [sortDir, setSortDir]     = useState<'asc'|'desc'>('desc')
  const [activePresetId, setActivePresetId] = useState<string | null>(null)
  const [savingPreset, setSavingPreset] = useState(false)
  const [presetName, setPresetName] = useState('')
  const [presetShared, setPresetShared] = useState(false)
  const [presetError, setPresetError] = useState<string | null>(null)
  const [renamingPresetId, setRenamingPresetId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [updatedFlashId, setUpdatedFlashId] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/screener?limit=50')
      .then(r=>r.json())
      .then(d=>{ if(d.results?.length) setStocks(d.results) })
      .catch(()=>{})
  }, [])

  // Lazy-load Census state-income reference data the first time the geo
  // filter is enabled. Backed by /api/census/state-incomes (24h server cache).
  useEffect(() => {
    if (!geo.enabled || stateRows.length > 0) return
    let cancelled = false
    fetch((process.env.NEXT_PUBLIC_BASE_PATH || '') + '/api/census/state-incomes')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.error) { setStateRowsErr(d.error); return }
        setStateRows(Array.isArray(d.rows) ? d.rows : [])
      })
      .catch(e => { if (!cancelled) setStateRowsErr((e as Error).message) })
    return () => { cancelled = true }
  }, [geo.enabled, stateRows.length])

  // When the geo filter is on, batch-fetch the HQ state for every loaded
  // ticker so we can join with the Census state-income table client-side.
  useEffect(() => {
    if (!geo.enabled || !stocks.length) return
    const missing = stocks.map(s => s.symbol).filter(s => hqStates[s] == null)
    if (!missing.length) return
    let cancelled = false
    setHqLoading(true)
    fetch(`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/api/screener/hq-states?symbols=${encodeURIComponent(missing.join(','))}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !Array.isArray(d.rows)) return
        setHqStates(prev => {
          const next = { ...prev }
          for (const r of d.rows) next[r.symbol] = r.country === 'US' ? (r.state || '') : ''
          return next
        })
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setHqLoading(false) })
    return () => { cancelled = true }
  }, [geo.enabled, stocks, hqStates])

  // Set of state postal codes whose Census ACS5 median household income
  // meets the threshold. Empty when geo is off or data not yet loaded.
  const qualifyingStates = useMemo(() => {
    if (!geo.enabled) return null
    const min = geo.minStateMedianIncomeK * 1000
    return new Set(stateRows.filter(s => (s.medianIncome ?? 0) >= min).map(s => s.postalCode))
  }, [geo.enabled, geo.minStateMedianIncomeK, stateRows])

  const filtered = useMemo(() => stocks
    .filter(s => (!search || s.symbol.includes(search.toUpperCase()) || s.name.toLowerCase().includes(search.toLowerCase())))
    .filter(s => sector==='All' || s.sector===sector)
    .filter(s => exchange==='All' || s.exchange===exchange)
    .filter(s => {
      const mcapB = (s.marketCap || 0) / 1e9
      if (mcapB < factors.marketCap[0] || mcapB > factors.marketCap[1]) return false
      if ((s.peRatio || 0) < factors.pe[0] || (s.peRatio || 0) > factors.pe[1]) return false
      if (s.changePct < factors.changePct[0] || s.changePct > factors.changePct[1]) return false
      const dy = s.dividendYield ?? 0
      if (dy < factors.dividend[0] || dy > factors.dividend[1]) return false
      const beta = s.beta ?? 1
      if (beta < factors.beta[0] || beta > factors.beta[1]) return false
      return true
    })
    // Census-backed geo filter: drop tickers whose HQ is outside the set of
    // qualifying US states (median household income above the threshold).
    // Tickers without a known HQ state are excluded while data is loading.
    .filter(s => {
      if (!qualifyingStates) return true
      const st = hqStates[s.symbol]
      if (st === undefined) return false  // not yet loaded → hide
      if (!st) return false                 // non-US or unknown
      return qualifyingStates.has(st)
    })
    .sort((a,b) => {
      const av: Stock[keyof Stock] = a[sortBy]
      const bv: Stock[keyof Stock] = b[sortBy]
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir==='desc' ? bv.localeCompare(av) : av.localeCompare(bv)
      }
      const an = typeof av === 'number' ? av : 0
      const bn = typeof bv === 'number' ? bv : 0
      return sortDir==='desc' ? bn - an : an - bn
    })
  , [stocks, search, sector, exchange, factors, sortBy, sortDir, qualifyingStates, hqStates])

  function toggleSort(col: string) {
    if(sortBy===col) setSortDir(d=>d==='desc'?'asc':'desc')
    else { setSortBy(col as keyof Stock); setSortDir('desc') }
  }

  function resetFactors() {
    setFactors(DEFAULT_FACTORS); setSearch(''); setSector('All'); setExchange('All')
    setGeo(DEFAULT_GEO)
    setActivePresetId(null)
  }

  function applyPreset(p: ScreenerPreset) {
    const parsed = presetToFilters(p)
    if (!parsed) return
    setSearch(parsed.search)
    setSector(parsed.sector)
    setExchange(parsed.exchange)
    setFactors(parsed.factors)
    if (parsed.geo) setGeo(parsed.geo)
    setActivePresetId(p.id)
  }

  async function commitPreset() {
    const name = presetName.trim()
    if (!name) return
    const filters: ScreenerFilterShape = { search, sector, exchange, factors, geo }
    setPresetError(null)
    try {
      const created = await saveScreenerPreset(name, { ...filters }, { shared: presetShared })
      setActivePresetId(created.id)
      setPresetName('')
      setPresetShared(false)
      setSavingPreset(false)
    } catch (e) {
      setPresetError(e instanceof Error ? e.message : 'Could not save preset')
    }
  }

  function startRename(p: ScreenerPreset) {
    setRenamingPresetId(p.id)
    setRenameDraft(p.name)
  }

  function commitRename() {
    if (!renamingPresetId) return
    const name = renameDraft.trim()
    const targetId = renamingPresetId
    if (name) {
      renameScreenerPreset(targetId, name).catch(()=>{ /* swallow — list refreshes on remount */ })
    }
    setRenamingPresetId(null)
    setRenameDraft('')
  }

  function updateActivePresetFromCurrent() {
    if (!activePresetId) return
    const filters: ScreenerFilterShape = { search, sector, exchange, factors, geo }
    const targetId = activePresetId
    updateScreenerPreset(targetId, { ...filters })
      .then(() => {
        setUpdatedFlashId(targetId)
        setTimeout(() => setUpdatedFlashId(id => id === targetId ? null : id), 1600)
      })
      .catch(() => { /* swallow — list refreshes on remount */ })
  }

  // Whether the active preset can be edited by the current user. For
  // synced presets this means owner; for local presets it is always true.
  const activePreset = activePresetId ? screenerPresets.find(p => p.id === activePresetId) : null
  const canEditActive = !!activePreset && (!screenerPresetsSynced || activePreset.ownedByMe === true)

  const columns: DataColumn<Stock>[] = [
    { key:'symbol', header:'Symbol', sortable:true, render: s => (
      <Link href={`/app/company/${s.symbol}`} style={{textDecoration:'none'}}>
        <div style={{fontWeight:700,color:'var(--text-primary)'}}>{s.symbol}</div>
        <div style={{fontSize:11,color:'var(--text-secondary)',maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
      </Link>
    )},
    { key:'price', header:'Price', sortable:true, align:'right', render: s => <span style={{fontWeight:700,fontSize:14}}>${fmt(s.price)}</span> },
    { key:'changePct', header:'Change %', sortable:true, align:'right', render: s => (
      <span className={s.changePct>=0?'pos':'neg'} style={{fontWeight:700}}>{s.changePct>=0?'+':''}{s.changePct?.toFixed(2)}%</span>
    )},
    { key:'marketCap', header:'Mkt Cap', sortable:true, align:'right', render: s => <span style={{color:'var(--text-primary)'}}>{fmtB(s.marketCap)}</span> },
    { key:'peRatio', header:'P/E', sortable:true, align:'right', render: s => <span style={{color:'var(--text-primary)'}}>{s.peRatio?fmt(s.peRatio,1):'—'}</span> },
    { key:'volume', header:'Volume', sortable:true, align:'right', render: s => <span style={{color:'var(--text-primary)'}}>{s.volume?(s.volume/1e6).toFixed(1)+'M':'—'}</span> },
    { key:'sector', header:'Sector', render: s => <Badge tone="gray">{s.sector||'—'}</Badge> },
    { key:'exchange', header:'Exchange', render: s => <span style={{fontSize:12,color:'var(--text-secondary)'}}>{s.exchange}</span> },
    { key:'_view', header:'', render: s => (
      <div style={{display:'flex',gap:6,alignItems:'center',justifyContent:'flex-end'}}>
        <Link href={`/app/company/${s.symbol}`} className="btn btn-outline btn-sm">View →</Link>
        <InlineAgentMenu
          subject={s.symbol}
          variant="icon"
          align="right"
          contextData={{ page:'screener', symbol:s.symbol, name:s.name, sector:s.sector, peRatio:s.peRatio, marketCap:s.marketCap, changePct:s.changePct }}
          actions={[
            { label:`Why is ${s.symbol} on this list?`,    prompt:`Given the active screener factors, explain why ${s.symbol} (${s.name}, ${s.sector}) qualifies and which factors it scores best on.` },
            { label:`Compare ${s.symbol} vs sector`,       prompt:`Compare ${s.symbol} against the median ${s.sector} name on growth, margin, and valuation. Highlight where it stands out.` },
            { label:`Is ${s.symbol} cheap right now?`,     prompt:`Tell me whether ${s.symbol} looks cheap or expensive at today's price relative to its 5-year history and peers — quote the multiples.` },
            { label:`Top risks for ${s.symbol}`,           prompt:`What are the top 3 risks an analyst would flag for ${s.symbol} over the next 12 months? Be concrete.` },
          ]}
        />
      </div>
    )},
  ]

  return (
    <div style={{padding:'1.5rem 1.75rem',maxWidth:1500,margin:'0 auto'}}>
      <div style={{marginBottom:18,display:'flex',justifyContent:'space-between',alignItems:'flex-end',flexWrap:'wrap',gap:12}}>
        <div>
          <h1 className="page-title">Stock Screener</h1>
          <p style={{fontSize:13,color:'var(--text-secondary)',marginTop:3}}>Tune factors on the left — results update live</p>
        </div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <span style={{fontSize:12,color:'var(--text-secondary)'}}>{filtered.length} of {stocks.length} match</span>
          <button className="btn btn-ghost btn-sm" onClick={resetFactors}>Reset</button>
        </div>
      </div>

      <ContextualAskBar
        context="Stock Screener"
        contextData={{ page: 'screener', resultCount: filtered.length }}
        chips={[
          { label: 'Quality compounders', prompt: 'Build a screener preset for quality compounders trading below 20x forward earnings with returns on capital above 15%.' },
          { label: 'High-FCF small caps', prompt: 'Find small-cap names (under $5B) with high free cash flow yield and net cash on the balance sheet.' },
          { label: 'Net-cash deep value', prompt: 'Show me deep-value names trading below tangible book with net cash and positive operating cash flow.' },
          { label: 'Build me a screen',   prompt: 'Help me design a custom screen for the next leg of the AI infrastructure trade.' },
        ]}
        placeholder="Describe a screen and Finsyt will build it…"
        style={{ margin: '0 0 16px' }}
      />

      <div style={{display:'grid',gridTemplateColumns:'280px 1fr',gap:16,alignItems:'start'}}>
        {/* LEFT: factor rail */}
        <Card padding={16} style={{position:'sticky',top:16}}>
          {/* Saved presets — pinned to the top of the rail */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>Saved Presets</div>
            {!savingPreset && (
              <button className="btn btn-ghost btn-sm" onClick={()=>setSavingPreset(true)} style={{padding:'2px 8px',fontSize:11}} aria-label="Save current filters as a preset">+ Save</button>
            )}
          </div>

          {savingPreset && (
            <div style={{marginBottom:10}}>
              <div style={{display:'flex',gap:6}}>
                <input
                  className="input"
                  autoFocus
                  placeholder="Name this preset"
                  value={presetName}
                  onChange={e=>setPresetName(e.target.value)}
                  onKeyDown={e=>{
                    if(e.key==='Enter'){ e.preventDefault(); commitPreset() }
                    if(e.key==='Escape'){ setSavingPreset(false); setPresetName(''); setPresetShared(false); setPresetError(null) }
                  }}
                  maxLength={60}
                  style={{fontSize:12,flex:1}}
                  aria-label="Preset name"
                />
                <button className="btn btn-primary btn-sm" onClick={commitPreset} disabled={!presetName.trim()} style={{padding:'4px 10px',fontSize:11}}>Save</button>
                <button className="btn btn-ghost btn-sm" onClick={()=>{setSavingPreset(false); setPresetName(''); setPresetShared(false); setPresetError(null)}} style={{padding:'4px 8px',fontSize:11}} aria-label="Cancel">×</button>
              </div>
              {screenerPresetsSynced ? (
                <label style={{display:'flex',alignItems:'center',gap:6,marginTop:6,fontSize:11,color:'var(--text-secondary)',cursor:'pointer'}}>
                  <input
                    type="checkbox"
                    checked={presetShared}
                    onChange={e=>setPresetShared(e.target.checked)}
                    aria-label="Share with workspace"
                    style={{margin:0}}
                  />
                  Share with workspace
                </label>
              ) : (
                <div style={{marginTop:6,fontSize:10,color:'var(--text-secondary)',lineHeight:1.4}}>
                  Sign in to a workspace to sync this preset across devices.
                </div>
              )}
              {presetError && (
                <div role="alert" style={{marginTop:6,fontSize:10,color:'var(--danger, #c0392b)'}}>{presetError}</div>
              )}
            </div>
          )}

          {screenerPresets.length === 0 ? (
            !savingPreset && (
              <div style={{fontSize:11,color:'var(--text-secondary)',marginBottom:14,padding:'8px 10px',border:'1px dashed var(--border)',borderRadius:6,lineHeight:1.4}}>
                No presets yet. Tune the filters below, then click <b style={{color:'var(--text-primary)'}}>+ Save</b> to remember this combo.
              </div>
            )
          ) : (
            <div style={{display:'flex',flexWrap:'wrap',gap:6,marginBottom:10}}>
              {screenerPresets.map(p=>{
                const active = p.id === activePresetId
                // Synced presets carry ownership info; local presets are
                // always owned (created on this browser). Only owners may
                // rename/update/delete — teammates can apply but not edit.
                const canEdit = !screenerPresetsSynced || p.ownedByMe === true
                const showShared = p.shared === true
                const titleSuffix = showShared
                  ? (p.ownedByMe ? ' (shared with workspace)' : ' (shared by teammate)')
                  : ''
                const renaming = p.id === renamingPresetId
                const flashed = p.id === updatedFlashId
                return (
                  <span key={p.id} title={`${p.name}${titleSuffix}`} style={{
                    display:'inline-flex',alignItems:'center',gap:2,
                    border:`1px solid ${flashed?'var(--success, #16a34a)':active?'var(--accent-text)':'var(--border)'}`,
                    background: active ? 'var(--accent-bg, rgba(99,102,241,0.12))' : 'transparent',
                    borderRadius:14,padding:'2px 4px 2px 10px',fontSize:11,
                    color:active?'var(--accent-text)':'var(--text-primary)',
                    maxWidth:'100%',
                    transition:'border-color 200ms',
                  }}>
                    {renaming ? (
                      <input
                        className="input"
                        autoFocus
                        value={renameDraft}
                        onChange={e=>setRenameDraft(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e=>{
                          if(e.key==='Enter'){ e.preventDefault(); commitRename() }
                          if(e.key==='Escape'){ setRenamingPresetId(null); setRenameDraft('') }
                        }}
                        maxLength={60}
                        aria-label={`Rename preset ${p.name}`}
                        style={{fontSize:11,fontWeight:600,padding:'1px 6px',height:18,minWidth:90,maxWidth:160}}
                      />
                    ) : (
                      <button
                        onClick={()=>applyPreset(p)}
                        onDoubleClick={()=>{ if (canEdit) startRename(p) }}
                        title={`Load preset "${p.name}"${titleSuffix}${canEdit ? ' (double-click to rename)' : ''}`}
                        aria-pressed={active}
                        aria-label={`Load preset ${p.name}${titleSuffix}`}
                        style={{
                          background:'transparent',border:'none',padding:0,cursor:'pointer',
                          color:'inherit',fontSize:11,fontWeight:active?700:600,
                          maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',
                        }}
                      >{p.name}</button>
                    )}
                    {!renaming && showShared && (
                      <span
                        aria-label="Shared with workspace"
                        title={p.ownedByMe ? 'Shared with workspace' : 'Shared by a teammate'}
                        style={{fontSize:9,fontWeight:700,letterSpacing:'0.04em',padding:'1px 5px',borderRadius:8,
                          border:'1px solid var(--border)',color:'var(--text-secondary)',textTransform:'uppercase'}}
                      >Team</span>
                    )}
                    {!renaming && canEdit && (
                      <>
                        <button
                          onClick={()=>startRename(p)}
                          title={`Rename preset "${p.name}"`}
                          aria-label={`Rename preset ${p.name}`}
                          style={{
                            background:'transparent',border:'none',cursor:'pointer',
                            color:'var(--text-secondary)',fontSize:11,lineHeight:1,
                            padding:'0 4px',borderRadius:10,
                          }}
                        >✎</button>
                        <button
                          onClick={()=>{
                            if (activePresetId === p.id) setActivePresetId(null)
                            deleteScreenerPreset(p.id).catch(()=>{ /* swallow — list will refresh on next mount */ })
                          }}
                          title={`Delete preset "${p.name}"`}
                          aria-label={`Delete preset ${p.name}`}
                          style={{
                            background:'transparent',border:'none',cursor:'pointer',
                            color:'var(--text-secondary)',fontSize:13,lineHeight:1,
                            padding:'0 4px',borderRadius:10,
                          }}
                        >×</button>
                      </>
                    )}
                  </span>
                )
              })}
            </div>
          )}

          {activePresetId && !renamingPresetId && (
            <div style={{marginBottom:14}}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={updateActivePresetFromCurrent}
                title="Overwrite the active preset's filters with what's currently set"
                style={{fontSize:11,padding:'3px 8px',width:'100%'}}
                aria-label="Update active preset with current filters"
              >
                {updatedFlashId === activePresetId ? '✓ Preset updated' : '↻ Update with current filters'}
              </button>
            </div>
          )}

          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Filters</div>

          <div style={{marginBottom:14}}>
            <label style={lbl}>Search</label>
            <input className="input" placeholder="Ticker or company" value={search} onChange={e=>setSearch(e.target.value)} style={{fontSize:13}}/>
          </div>

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:18}}>
            <div>
              <label style={lbl}>Sector</label>
              <select className="input" value={sector} onChange={e=>setSector(e.target.value)} style={{fontSize:12}}>
                {SECTORS.map(s=><option key={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>Exchange</label>
              <select className="input" value={exchange} onChange={e=>setExchange(e.target.value)} style={{fontSize:12}}>
                {EXCHANGES.map(e=><option key={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em',marginBottom:10}}>Factor Sliders</div>

          <RangeSlider label="Market Cap ($B)" min={0} max={4000} step={10}
            value={factors.marketCap} onChange={v=>setFactors(f=>({...f,marketCap:v}))} fmt={n=>n>=1000?`${(n/1000).toFixed(1)}T`:`${n}B`}/>
          <RangeSlider label="P/E Ratio" min={0} max={100} step={1}
            value={factors.pe} onChange={v=>setFactors(f=>({...f,pe:v}))}/>
          <RangeSlider label="Day Change %" min={-15} max={15} step={0.5}
            value={factors.changePct} onChange={v=>setFactors(f=>({...f,changePct:v}))} fmt={n=>`${n>0?'+':''}${n}%`}/>
          <RangeSlider label="Dividend Yield %" min={0} max={10} step={0.1}
            value={factors.dividend} onChange={v=>setFactors(f=>({...f,dividend:v}))} fmt={n=>`${n}%`}/>
          <RangeSlider label="Beta" min={0} max={3} step={0.05}
            value={factors.beta} onChange={v=>setFactors(f=>({...f,beta:v}))}/>

          {/* ── Geography (Census ACS5) ─────────────────────────────────── */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:6,marginBottom:8}}>
            <div style={{fontSize:11,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.05em'}}>
              HQ Geography
            </div>
            <span style={{fontSize:9,fontWeight:700,color:'var(--text-muted)',letterSpacing:'0.05em'}}>U.S. CENSUS</span>
          </div>
          <label style={{display:'flex',alignItems:'center',gap:6,marginBottom:8,fontSize:12,color:'var(--text-primary)',cursor:'pointer'}}>
            <input
              type="checkbox"
              checked={geo.enabled}
              onChange={e=>setGeo(g=>({...g, enabled:e.target.checked}))}
              aria-label="Filter by HQ in counties matching Census criterion"
              style={{margin:0}}
            />
            HQ in US states matching Census criterion
          </label>
          {geo.enabled && (
            <div style={{marginBottom:14}}>
              <RangeSlider
                label="Min state median household income"
                min={0} max={100} step={1}
                value={[geo.minStateMedianIncomeK, 100]}
                onChange={v=>setGeo(g=>({...g, minStateMedianIncomeK:v[0]}))}
                fmt={n=>`$${n}K`}
              />
              <div style={{fontSize:10,color:'var(--text-muted)',lineHeight:1.4}}>
                {stateRowsErr ? (
                  <span style={{color:'var(--neg)'}}>Census error: {stateRowsErr}</span>
                ) : qualifyingStates ? (
                  <>
                    {qualifyingStates.size} of {stateRows.length} states qualify · ACS5 2022 (B19013).
                    {hqLoading ? ' Resolving HQ states…' : ''}
                  </>
                ) : (
                  'Loading Census state-income table…'
                )}
              </div>
            </div>
          )}
        </Card>

        {/* RIGHT: results */}
        <Card padding={0} style={{overflow:'hidden'}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:12,color:'var(--text-secondary)'}}>
            <span><b style={{color:'var(--text-primary)'}}>{filtered.length}</b> results · live filtered</span>
            <span>Sort: {String(sortBy)} {sortDir==='desc'?'↓':'↑'}</span>
          </div>
          <DataTable
            columns={columns}
            rows={filtered}
            sortBy={sortBy as string}
            sortDir={sortDir}
            onSort={toggleSort}
            getRowKey={s => s.symbol}
            emptyMessage="No stocks match your factor ranges. Try widening sliders."
          />
        </Card>
      </div>
    </div>
  )
}

const lbl: React.CSSProperties = { fontSize:11,fontWeight:600,color:'var(--text-secondary)',display:'block',marginBottom:6,textTransform:'uppercase',letterSpacing:'0.05em' }

function RangeSlider({label, min, max, step, value, onChange, fmt}:{
  label:string; min:number; max:number; step:number; value:[number,number];
  onChange:(v:[number,number])=>void; fmt?:(n:number)=>string
}){
  const f = fmt || (n=>String(n))
  function setLo(v:number){ onChange([Math.min(v, value[1]-step), value[1]]) }
  function setHi(v:number){ onChange([value[0], Math.max(v, value[0]+step)]) }
  return (
    <div style={{marginBottom:14}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline',marginBottom:6}}>
        <span style={{fontSize:12,fontWeight:600,color:'var(--text-primary)'}}>{label}</span>
        <span style={{fontSize:11,fontWeight:700,color:'var(--accent-text)'}}>{f(value[0])} — {f(value[1])}</span>
      </div>
      <div style={{position:'relative',height:24}}>
        <input type="range" min={min} max={max} step={step} value={value[0]} onChange={e=>setLo(Number(e.target.value))}
          style={sliderStyle} aria-label={`${label} min`}/>
        <input type="range" min={min} max={max} step={step} value={value[1]} onChange={e=>setHi(Number(e.target.value))}
          style={{...sliderStyle, top:0}} aria-label={`${label} max`}/>
      </div>
    </div>
  )
}

const sliderStyle: React.CSSProperties = {
  position:'absolute', left:0, right:0, top:0, width:'100%', appearance:'none',
  background:'transparent', pointerEvents:'auto', height:24,
}
