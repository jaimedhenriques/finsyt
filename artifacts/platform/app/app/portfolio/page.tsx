'use client'
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import Link from 'next/link'
import { AreaChart, Area, ResponsiveContainer, PieChart, Pie, Cell, Tooltip as RTooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts'
import { Card, Button, Input, DataTable, PageHero, ContextualAskBar, InlineAgentMenu, Drawer, type DataColumn } from '@/components/ui'
import { AltDataSection, FocusPicker, AltDataCitationView, usePersistentFocusSymbol, type AltDataCitation } from '@/components/alt-data/cards'

interface Position {
  id: string
  symbol: string
  shares: number
  costBasis: number
  openedAt: string
  sector?: string | null
  note?: string | null
  mine: boolean
  // Live overlay
  price?: number
  changePct?: number
  marketCap?: number
  spark?: number[]
  exchange?: string
  name?: string
}

const SECTOR_COLORS: Record<string, string> = {
  'Technology':    '#3B82F6',
  'Healthcare':    '#10B981',
  'Financials':    '#F59E0B',
  'Energy':        '#EF4444',
  'Consumer Disc.':'#8B5CF6',
  'Industrials':   '#14B8A6',
  'Utilities':     '#84CC16',
  'Materials':     '#F97316',
  'Communication': '#EC4899',
  'Real Estate':   '#06B6D4',
  'Unknown':       '#6B7280',
}
function colorFor(sector?: string | null) { return SECTOR_COLORS[sector || 'Unknown'] || '#6B7280' }
function fmt(n: number | undefined | null, dp = 2) {
  if (n == null || isNaN(n)) return '—'
  return Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
}
function fmtMoney(n: number | undefined | null) {
  if (n == null || isNaN(n)) return '—'
  return '$' + Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function fmtPct(n: number | undefined | null) {
  if (n == null || isNaN(n)) return '—'
  return (n >= 0 ? '+' : '') + Number(n).toFixed(2) + '%'
}

export default function PortfolioPage() {
  const [positions, setPositions] = useState<Position[]>([])
  const [loading, setLoading]     = useState(true)
  const [synced, setSynced]       = useState(false)
  const [reason, setReason]       = useState<string | null>(null)
  const [adding, setAdding]       = useState(false)
  const [draft, setDraft]         = useState({ symbol: '', shares: '', costBasis: '' })
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    try {
      const res  = await fetch('/api/portfolio')
      const data = await res.json()
      const rows: Position[] = data.positions || []
      setSynced(!!data.synced); setReason(data.reason || null)
      setPositions(rows)

      // Hydrate quotes in parallel (one per symbol — small N for now).
      if (rows.length) {
        const overlays = await Promise.all(rows.map(async (p) => {
          try {
            const r = await fetch('/api/quote?symbol=' + encodeURIComponent(p.symbol))
            if (!r.ok) return null
            const q = await r.json()
            return { id: p.id, price: q.price, changePct: q.changePct, marketCap: q.marketCap, exchange: q.exchange, name: q.name, sector: q.sector }
          } catch { return null }
        }))
        setPositions(prev => prev.map(p => {
          const o = overlays.find(x => x?.id === p.id)
          if (!o) return p
          return { ...p, price: o.price, changePct: o.changePct, marketCap: o.marketCap, exchange: o.exchange, name: o.name, sector: p.sector || o.sector }
        }))
      }
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // ── Aggregates ─────────────────────────────────────────────────────────────
  const enriched = useMemo(() => positions.map(p => {
    const price = p.price ?? p.costBasis
    const marketValue = price * p.shares
    const cost = p.costBasis * p.shares
    const unrealised = marketValue - cost
    const unrealisedPct = cost ? (unrealised / cost) * 100 : 0
    return { ...p, price, marketValue, cost, unrealised, unrealisedPct }
  }), [positions])

  // Focus ticker for the alt-data cards — defaults to the top holding and
  // resets when it leaves the book. One ticker → one Apify run.
  const { focusSymbol, setFocusSymbol, reconcileFocus } = usePersistentFocusSymbol('finsyt.focus.portfolio')
  useEffect(() => {
    reconcileFocus(enriched.map(p => p.symbol))
  }, [enriched, reconcileFocus])
  const focusName = focusSymbol ? (enriched.find(p => p.symbol === focusSymbol)?.name || focusSymbol) : ''

  // Shared citation drawer for the alt-data cards (parity with company page).
  const [citation, setCitation] = useState<{ open: boolean; label: string; body: string; source?: AltDataCitation }>({ open: false, label: '', body: '' })

  const totals = useMemo(() => {
    const value = enriched.reduce((s, p) => s + p.marketValue, 0)
    const cost  = enriched.reduce((s, p) => s + p.cost, 0)
    const dayChange = enriched.reduce((s, p) => s + (p.changePct ?? 0) / 100 * p.marketValue, 0)
    return {
      value, cost,
      unrealised: value - cost,
      unrealisedPct: cost ? ((value - cost) / cost) * 100 : 0,
      dayChange,
      dayChangePct: value ? (dayChange / value) * 100 : 0,
      positions: enriched.length,
    }
  }, [enriched])

  const sectorBreakdown = useMemo(() => {
    const m = new Map<string, number>()
    enriched.forEach(p => {
      const s = p.sector || 'Unknown'
      m.set(s, (m.get(s) || 0) + p.marketValue)
    })
    return Array.from(m, ([name, value]) => ({ name, value, pct: totals.value ? (value / totals.value) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)
  }, [enriched, totals.value])

  const concentration = useMemo(() => {
    return [...enriched]
      .sort((a, b) => b.marketValue - a.marketValue)
      .slice(0, 5)
      .map(p => ({ symbol: p.symbol, pct: totals.value ? (p.marketValue / totals.value) * 100 : 0 }))
  }, [enriched, totals.value])

  const concentrationFlag = concentration[0]?.pct >= 25
  const top5Pct = concentration.reduce((s, x) => s + x.pct, 0)

  // ── Actions ────────────────────────────────────────────────────────────────
  async function addPosition() {
    const sym = draft.symbol.trim().toUpperCase()
    const sh  = parseFloat(draft.shares)
    const cb  = parseFloat(draft.costBasis)
    if (!sym || !isFinite(sh) || sh <= 0 || !isFinite(cb) || cb <= 0) return
    const res = await fetch('/api/portfolio', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: sym, shares: sh, costBasis: cb }),
    })
    if (res.ok) {
      setDraft({ symbol: '', shares: '', costBasis: '' })
      setAdding(false)
      load()
    } else {
      const err = await res.json().catch(() => ({}))
      alert(err.error || 'Could not add position')
    }
  }

  async function removePosition(id: string) {
    if (!confirm('Remove this position?')) return
    const res = await fetch('/api/portfolio?id=' + id, { method: 'DELETE' })
    if (res.ok) setPositions(prev => prev.filter(p => p.id !== id))
    else alert('Could not remove')
  }

  function exportCSV() {
    const header = ['Symbol','Shares','Cost Basis','Market Value','Unrealised $','Unrealised %','Sector','Opened']
    const rows = enriched.map(p => [
      p.symbol, p.shares, p.costBasis.toFixed(4), p.marketValue.toFixed(2),
      p.unrealised.toFixed(2), p.unrealisedPct.toFixed(2),
      p.sector || '', p.openedAt.slice(0, 10),
    ])
    const csv = [header, ...rows].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `portfolio-${new Date().toISOString().slice(0,10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function importCSV(file: File) {
    setImportError(null); setImporting(true)
    try {
      const text = await file.text()
      const lines = text.split(/\r?\n/).filter(l => l.trim())
      if (!lines.length) throw new Error('Empty file')
      // Detect header
      const first = lines[0].toLowerCase()
      const dataLines = first.includes('symbol') || first.includes('ticker') ? lines.slice(1) : lines
      const rows = dataLines.map(l => {
        const cells = l.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
        const [symbol, shares, costBasis] = cells
        return { symbol: symbol?.toUpperCase(), shares: parseFloat(shares), costBasis: parseFloat(costBasis) }
      }).filter(r => r.symbol && isFinite(r.shares) && isFinite(r.costBasis) && r.shares > 0 && r.costBasis > 0)
      if (!rows.length) throw new Error('No valid rows. Format: Symbol,Shares,CostBasis')
      const res = await fetch('/api/portfolio', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rows),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `Import failed (${res.status})`)
      }
      load()
    } catch (e) {
      setImportError(e instanceof Error ? e.message : 'Import failed')
    } finally {
      setImporting(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  // ── Table columns ──────────────────────────────────────────────────────────
  const columns: DataColumn<typeof enriched[number]>[] = [
    { key:'symbol', header:'Symbol', sortable:true, render: p => (
      <Link href={`/app/company/${p.symbol}`} style={{textDecoration:'none',display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:32,height:32,borderRadius:8,background:'var(--bg-elevated)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:800,color:'var(--text-primary)',flexShrink:0}}>{p.symbol.slice(0,2)}</div>
        <div>
          <div style={{fontSize:13,fontWeight:700,color:'var(--text-primary)'}}>{p.symbol}</div>
          <div style={{fontSize:10,color:'var(--text-secondary)',maxWidth:140,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.name || p.sector || ''}</div>
        </div>
      </Link>
    )},
    { key:'shares', header:'Shares', sortable:true, align:'right', render: p => <span>{fmt(p.shares, p.shares < 10 ? 4 : 2)}</span> },
    { key:'costBasis', header:'Avg Cost', sortable:true, align:'right', render: p => <span>{fmtMoney(p.costBasis)}</span> },
    { key:'price', header:'Last', sortable:true, align:'right', render: p => (
      <div>
        <div style={{fontWeight:700}}>{fmtMoney(p.price)}</div>
        {p.changePct != null && (
          <div className={p.changePct >= 0 ? 'pos' : 'neg'} style={{fontSize:11,fontWeight:600}}>{fmtPct(p.changePct)}</div>
        )}
      </div>
    )},
    { key:'marketValue', header:'Mkt Value', sortable:true, align:'right', render: p => <span style={{fontWeight:700}}>{fmtMoney(p.marketValue)}</span> },
    { key:'unrealised', header:'Unrealised P&L', sortable:true, align:'right', render: p => (
      <div>
        <div className={p.unrealised >= 0 ? 'pos' : 'neg'} style={{fontWeight:700}}>{p.unrealised >= 0 ? '+' : ''}{fmtMoney(p.unrealised).replace('$','$')}</div>
        <div className={p.unrealisedPct >= 0 ? 'pos' : 'neg'} style={{fontSize:11,fontWeight:600}}>{fmtPct(p.unrealisedPct)}</div>
      </div>
    )},
    { key:'_weight', header:'Weight', align:'right', render: p => {
      const pct = totals.value ? (p.marketValue / totals.value) * 100 : 0
      return (
        <div style={{minWidth:80}}>
          <div style={{fontSize:12,fontWeight:600}}>{pct.toFixed(1)}%</div>
          <div style={{height:3,marginTop:3,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden'}}>
            <div style={{height:'100%',width:Math.min(pct,100)+'%',background:'var(--accent)',borderRadius:2}}/>
          </div>
        </div>
      )
    }},
    { key:'sector', header:'Sector', render: p => (
      <span style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:11,color:'var(--text-secondary)'}}>
        <span style={{width:8,height:8,borderRadius:2,background:colorFor(p.sector)}}/>
        {p.sector || '—'}
      </span>
    )},
    { key:'_actions', header:'', render: p => (
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <Link href={`/app/company/${p.symbol}`} className="btn btn-outline btn-sm">View</Link>
        <InlineAgentMenu
          subject={p.symbol}
          variant="icon"
          align="right"
          contextData={{ page:'portfolio', symbol:p.symbol, name:p.name, sector:p.sector, costBasis:p.costBasis, marketValue:p.marketValue, shares:p.shares }}
          actions={[
            { label:`Why does ${p.symbol} sit at this size?`,   prompt:`Tell me whether ${p.symbol} (${p.name}) is sized appropriately in my book at $${(p.marketValue||0).toLocaleString()} and whether it is overweight, underweight, or in line vs ${p.sector || 'sector'} benchmarks.` },
            { label:`Performance attribution for ${p.symbol}`,  prompt:`Attribute ${p.symbol}'s contribution to the portfolio's YTD performance and break down the drivers (price, FX, dividends).` },
            { label:`Risk check: ${p.symbol}`,                  prompt:`Run a risk check on ${p.symbol} — sector exposure, correlation with the rest of the book, and stress test against a 10% market drop.` },
            { label:`Trim or add to ${p.symbol}?`,              prompt:`Based on valuation, momentum, and consensus revisions, should I trim, hold, or add to ${p.symbol}? Walk me through the trade-offs.` },
          ]}
        />
        {p.mine && <button className="btn btn-ghost btn-sm" onClick={() => removePosition(p.id)} aria-label={`Remove ${p.symbol}`}>×</button>}
      </div>
    )},
  ]

  return (
    <div style={{padding:'0 0 80px',maxWidth:1500,margin:'0 auto'}}>
      <PageHero
        eyebrow="Portfolio"
        title="The book, in one room."
        accentWord="book"
        subtitle="Live mark-to-market, factor exposures, and concentration alerts — all driven by the same providers as the rest of Finsyt."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>＋ Add position</Button>
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()}>Import CSV</Button>
            <Button variant="ghost" size="sm" onClick={exportCSV} disabled={!enriched.length}>Export CSV</Button>
            <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={e => { const f = e.target.files?.[0]; if (f) importCSV(f) }}/>
          </>
        }
      />

      <div style={{ padding: '0 1.75rem' }}>
        <ContextualAskBar
          context="Portfolio"
          contextData={{ page: 'portfolio', positions: enriched.length }}
          chips={[
            { label: 'YTD attribution',  prompt: 'Decompose my YTD performance: top contributors and detractors with attribution by sector and factor.' },
            { label: "Today's P&L",      prompt: "Explain today's portfolio P&L — which positions and themes are driving it?" },
            { label: 'Concentration',    prompt: 'Where am I most concentrated and what are the largest single-position risks if any name drops 20%?' },
            { label: 'Rebalance ideas',  prompt: 'Suggest rebalancing trades that lower factor risk while preserving my biggest theses.' },
          ]}
          placeholder="Ask Finsyt about your portfolio…"
          style={{ margin: '0 0 16px' }}
        />
      </div>

      {!synced && reason === 'no_workspace' && (
        <div style={{margin:'0 1.75rem 14px',padding:'10px 14px',borderRadius:8,background:'var(--amber-dim, rgba(245,158,11,0.1))',border:'1px solid var(--amber-dim, rgba(245,158,11,0.3))',fontSize:12,color:'var(--text-primary)'}}>
          Create or join a workspace to save positions. Until then, this page is empty.
        </div>
      )}
      {importError && (
        <div role="alert" style={{margin:'0 1.75rem 14px',padding:'10px 14px',borderRadius:8,background:'rgba(239,68,68,0.1)',border:'1px solid rgba(239,68,68,0.3)',fontSize:12,color:'var(--neg)'}}>
          {importError}
        </div>
      )}

      {/* KPI strip */}
      <div style={{padding:'0 1.75rem 18px',display:'grid',gridTemplateColumns:'repeat(5, minmax(0,1fr))',gap:12}}>
        <KPI label="Market value"   value={fmtMoney(totals.value)}   tone="primary"/>
        <KPI label="Cost basis"     value={fmtMoney(totals.cost)}    tone="muted"/>
        <KPI label="Unrealised P&L" value={fmtMoney(totals.unrealised)} sub={fmtPct(totals.unrealisedPct)} tone={totals.unrealised >= 0 ? 'pos' : 'neg'}/>
        <KPI label="Today's change" value={fmtMoney(totals.dayChange)} sub={fmtPct(totals.dayChangePct)} tone={totals.dayChange >= 0 ? 'pos' : 'neg'}/>
        <KPI label="Positions"      value={String(totals.positions)}  sub={`Top 5 = ${top5Pct.toFixed(1)}%`} tone="primary"/>
      </div>

      {/* Risk row */}
      <div style={{padding:'0 1.75rem 18px',display:'grid',gridTemplateColumns:'minmax(0,2fr) minmax(0,1fr)',gap:14}}>
        <Card padding={16}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:11,fontWeight:800,color:'var(--text-primary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Sector exposure</span>
            <span style={{fontSize:10,color:'var(--text-muted)'}}>By market value</span>
          </div>
          {sectorBreakdown.length ? (
            <div style={{display:'grid',gridTemplateColumns:'180px 1fr',gap:18,alignItems:'center'}}>
              <div style={{height:180}}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={sectorBreakdown} dataKey="value" innerRadius={45} outerRadius={75} paddingAngle={2}>
                      {sectorBreakdown.map(s => <Cell key={s.name} fill={colorFor(s.name)}/>)}
                    </Pie>
                    <RTooltip formatter={(v: number) => fmtMoney(v)} contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}}/>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div>
                {sectorBreakdown.map(s => (
                  <div key={s.name} style={{display:'flex',alignItems:'center',gap:10,padding:'4px 0'}}>
                    <span style={{width:10,height:10,borderRadius:3,background:colorFor(s.name)}}/>
                    <span style={{fontSize:12,fontWeight:600,minWidth:120,color:'var(--text-primary)'}}>{s.name}</span>
                    <div style={{flex:1,height:4,background:'rgba(255,255,255,0.08)',borderRadius:2,overflow:'hidden'}}>
                      <div style={{height:'100%',width:s.pct+'%',background:colorFor(s.name)}}/>
                    </div>
                    <span style={{fontSize:11,color:'var(--text-secondary)',width:54,textAlign:'right'}}>{s.pct.toFixed(1)}%</span>
                    <span style={{fontSize:11,color:'var(--text-muted)',width:80,textAlign:'right'}}>{fmtMoney(s.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyHint text="Add positions to see your sector mix."/>
          )}
        </Card>
        <Card padding={16}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
            <span style={{fontSize:11,fontWeight:800,color:'var(--text-primary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>Concentration</span>
            {concentrationFlag && (
              <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:999,background:'var(--neg-dim, rgba(239,68,68,0.15))',color:'var(--neg)',letterSpacing:'0.04em'}}>RISK</span>
            )}
          </div>
          {concentration.length ? (
            <>
              <div style={{height:120,marginBottom:8}}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={concentration} margin={{top:5,right:5,left:0,bottom:0}}>
                    <CartesianGrid strokeDasharray="2 2" stroke="rgba(255,255,255,0.05)"/>
                    <XAxis dataKey="symbol" tick={{fontSize:10,fill:'var(--text-secondary)'}} axisLine={false} tickLine={false}/>
                    <YAxis tick={{fontSize:10,fill:'var(--text-secondary)'}} axisLine={false} tickLine={false} width={28} unit="%"/>
                    <RTooltip formatter={(v: number) => v.toFixed(1) + '%'} contentStyle={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:8,fontSize:12}}/>
                    <Bar dataKey="pct" fill="var(--accent)" radius={[3,3,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div style={{fontSize:11,color:'var(--text-secondary)',lineHeight:1.5}}>
                Top 5 positions = <b style={{color:'var(--text-primary)'}}>{top5Pct.toFixed(1)}%</b> of book.
                {concentrationFlag && <> Largest single name <b style={{color:'var(--neg)'}}>{concentration[0].symbol} ({concentration[0].pct.toFixed(1)}%)</b> exceeds 25%.</>}
              </div>
            </>
          ) : <EmptyHint text="Add positions to surface concentration risk."/>}
        </Card>
      </div>

      {/* Add row inline */}
      {adding && (
        <div style={{padding:'0 1.75rem 18px'}}>
          <Card padding={14}>
            <div style={{display:'flex',gap:10,alignItems:'flex-end',flexWrap:'wrap'}}>
              <div style={{flex:'0 0 140px'}}>
                <label style={{fontSize:11,color:'var(--text-secondary)',display:'block',marginBottom:4}}>Symbol</label>
                <Input value={draft.symbol} onChange={e => setDraft(d => ({...d, symbol: e.target.value.toUpperCase()}))} placeholder="AAPL" maxLength={12}/>
              </div>
              <div style={{flex:'0 0 120px'}}>
                <label style={{fontSize:11,color:'var(--text-secondary)',display:'block',marginBottom:4}}>Shares</label>
                <Input value={draft.shares} onChange={e => setDraft(d => ({...d, shares: e.target.value}))} placeholder="100" inputMode="decimal"/>
              </div>
              <div style={{flex:'0 0 140px'}}>
                <label style={{fontSize:11,color:'var(--text-secondary)',display:'block',marginBottom:4}}>Avg cost basis</label>
                <Input value={draft.costBasis} onChange={e => setDraft(d => ({...d, costBasis: e.target.value}))} placeholder="173.50" inputMode="decimal"/>
              </div>
              <Button variant="primary" size="md" onClick={addPosition}>Add</Button>
              <Button variant="ghost" size="md" onClick={() => { setAdding(false); setDraft({ symbol: '', shares: '', costBasis: '' }) }}>Cancel</Button>
              <span style={{fontSize:11,color:'var(--text-muted)',marginLeft:'auto'}}>Tip: import a CSV with columns Symbol,Shares,CostBasis</span>
            </div>
          </Card>
        </div>
      )}

      {/* Positions table */}
      <div style={{padding:'0 1.75rem'}}>
        <Card padding={0} style={{overflow:'hidden'}}>
          <div style={{padding:'10px 14px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',justifyContent:'space-between',fontSize:12,color:'var(--text-secondary)'}}>
            <span><b style={{color:'var(--text-primary)'}}>{enriched.length}</b> position{enriched.length===1?'':'s'} · live marked</span>
            <span>{importing ? 'Importing…' : loading ? 'Loading…' : ''}</span>
          </div>
          <DataTable
            columns={columns}
            rows={enriched}
            getRowKey={p => p.id}
            onRowClick={p => setFocusSymbol(p.symbol)}
            isRowActive={p => p.symbol === focusSymbol}
            emptyMessage={synced ? 'No positions yet — add one or import a CSV to get started.' : 'Sign in to a workspace to track positions.'}
          />
        </Card>

        {focusSymbol && (
          <div style={{marginTop:18}}>
            <FocusPicker label="Alt-data for" symbols={enriched.map(p=>p.symbol)} value={focusSymbol} onChange={setFocusSymbol} />
            <AltDataSection symbol={focusSymbol} companyName={focusName} onCite={(label, body, source) => setCitation({ open: true, label, body, source })} />
          </div>
        )}
      </div>

      {/* Citation drawer — structured source view (provider, link, key fields, retrieved-at) */}
      <Drawer open={citation.open} onClose={() => setCitation({ open: false, label: '', body: '' })} title={citation.label || 'Source'} width={460}>
        {citation.source ? (
          <AltDataCitationView source={citation.source} />
        ) : (
          <>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Source citation · provider record.
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-primary)', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {citation.body || 'No additional context available for this citation.'}
            </div>
          </>
        )}
      </Drawer>
    </div>
  )
}

function KPI({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone: 'primary' | 'muted' | 'pos' | 'neg' }) {
  const color = tone === 'pos' ? 'var(--pos)' : tone === 'neg' ? 'var(--neg)' : 'var(--text-primary)'
  return (
    <div style={{background:'var(--bg-card)',border:'1px solid var(--border)',borderRadius:12,padding:'12px 14px'}}>
      <div style={{fontSize:10,fontWeight:700,color:'var(--text-secondary)',textTransform:'uppercase',letterSpacing:'0.06em'}}>{label}</div>
      <div style={{fontSize:20,fontWeight:800,color,marginTop:4,lineHeight:1.1}}>{value}</div>
      {sub && <div style={{fontSize:11,fontWeight:600,color,marginTop:2,opacity:0.85}}>{sub}</div>}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return <div style={{padding:'24px 8px',textAlign:'center',fontSize:12,color:'var(--text-secondary)'}}>{text}</div>
}
