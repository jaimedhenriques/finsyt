'use client'
import { useEffect, useMemo, useState } from 'react'
import { ContextualAskBar } from '@/components/ui'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Types ─────────────────────────────────────────────────────────────────────
// Deal shape mirrors `/api/deals`. M&A data comes from FMP today
// (`/stable/mergers-acquisitions-latest` and `…-search`); the route exposes
// a `source` attribution field so any future provider added behind the same
// waterfall can replace FMP without a UI change.
interface Deal {
  id:                  string
  acquirer:            string
  acquirerSymbol:      string | null
  target:              string
  targetSymbol:        string | null
  status:              string
  type:                string
  value:               number | null   // USD (raw)
  cashConsideration:   number | null
  stockConsideration:  number | null
  announceDate:        string | null
  description:         string
  link:                string | null
}

interface DealsApiResponse {
  deals?: Deal[]
  source?: 'fmp' | 'none'
  count?: number
  providerError?: string | null
  fetchedAt?: string
}

const STATUS_TONE: Record<string, string> = {
  Announced:    'var(--accent)',
  Pending:      'var(--amber)',
  Completed:    'var(--pos)',
  Terminated:   'var(--neg)',
  'Tender Offer': '#7C3AED',
}
function statusColor(status: string): string {
  return STATUS_TONE[status] || 'var(--text-muted)'
}

const STATUS_OPTIONS = ['All','Announced','Pending','Completed','Terminated','Tender Offer']
const SOURCE_LABELS: Record<string, string> = { fmp: 'Financial Modeling Prep', none: 'No provider data' }

function formatValue(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return '—'
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`
  if (v >= 1e3) return `$${(v / 1e3).toFixed(0)}K`
  return `$${v.toFixed(0)}`
}

function formatDate(d: string | null): string {
  if (!d) return '—'
  try { return new Date(d).toISOString().slice(0, 10) }
  catch { return d.slice(0, 10) }
}

export default function DealsPage() {
  const [deals, setDeals]       = useState<Deal[]>([])
  const [hydrated, setHydrated] = useState(false)
  const [source, setSource]     = useState<'fmp' | 'none' | null>(null)
  const [providerError, setProviderError] = useState<string | null>(null)
  const [fetchedAt, setFetchedAt] = useState<string | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [search, setSearch]     = useState('')
  const [status, setStatus]     = useState('All')
  const [sortBy, setSortBy]     = useState<'value' | 'announced'>('announced')
  const [selected, setSelected] = useState<Deal | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  async function loadDeals(symbol: string = '') {
    setRefreshing(true)
    setLoadError(null)
    try {
      const qs = symbol ? `?symbol=${encodeURIComponent(symbol)}&limit=100` : '?limit=100'
      const res = await fetch(`${BASE}/api/deals${qs}`, { cache: 'no-store' })
      if (!res.ok) {
        setLoadError(`Failed to load deals (${res.status})`)
        return
      }
      const data: DealsApiResponse = await res.json().catch(() => ({}))
      setDeals(Array.isArray(data.deals) ? data.deals : [])
      setSource(data.source ?? 'none')
      setProviderError(data.providerError ?? null)
      setFetchedAt(data.fetchedAt ?? null)
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setRefreshing(false)
      setHydrated(true)
    }
  }

  useEffect(() => { loadDeals() }, [])

  const filtered = useMemo(() => {
    return deals
      .filter(d => {
        if (status !== 'All' && d.status !== status) return false
        if (search) {
          const q = search.toLowerCase()
          const hay = `${d.acquirer} ${d.target} ${d.acquirerSymbol ?? ''} ${d.targetSymbol ?? ''} ${d.description}`.toLowerCase()
          if (!hay.includes(q)) return false
        }
        return true
      })
      .sort((a, b) => {
        if (sortBy === 'value') return (b.value ?? 0) - (a.value ?? 0)
        return (b.announceDate ?? '').localeCompare(a.announceDate ?? '')
      })
  }, [deals, search, status, sortBy])

  const totalValue = filtered.reduce((s, d) => s + (d.value ?? 0), 0)
  const pendingCount = filtered.filter(d => d.status.toLowerCase() === 'pending').length
  const sourceLabel = source ? (SOURCE_LABELS[source] || source) : '—'

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Deals & M&A</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>
            Live M&A filings · source: <strong style={{ color: source === 'fmp' ? 'var(--pos)' : 'var(--text-muted)' }}>{sourceLabel}</strong>
            {fetchedAt && <> · updated {new Date(fetchedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'value' | 'announced')}
            style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:12, fontFamily:'inherit', color:'var(--text-primary)', background:'var(--bg-card)', cursor:'pointer' }}>
            <option value="announced">Sort: Date</option>
            <option value="value">Sort: Value</option>
          </select>
          <button onClick={() => loadDeals(search)}
            disabled={refreshing}
            style={{ padding:'7px 14px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:12, fontWeight:700, fontFamily:'inherit', color:'var(--text-primary)', background:'var(--bg-card)', cursor: refreshing ? 'wait' : 'pointer' }}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>

      <ContextualAskBar
        context="Deals & M&A"
        contextData={{ page: 'deals', total: filtered.length, totalValue, source }}
        chips={[
          { label: 'Read-across',         prompt: 'Pick the largest pending deal on this page and explain the read-across implications for the rest of the sector.' },
          { label: 'Premium analysis',    prompt: 'Analyse the deal premiums on this page versus historical norms and tell me which look rich or cheap.' },
          { label: 'Likely next targets', prompt: 'Based on the M&A activity on this page, predict the most likely next acquisition targets and explain why.' },
          { label: 'Antitrust risk',      prompt: 'Flag the deals on this page with the highest regulatory or antitrust risk and explain the concern.' },
        ]}
        placeholder="Ask Finsyt about M&A activity…"
        style={{ margin: '0 0 16px' }}
      />

      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Deals Shown', value: String(filtered.length),                                   color:'var(--accent)' },
          { label:'Total Value',       value: formatValue(totalValue),                                  color:'var(--text-primary)' },
          { label:'Pending',           value: String(pendingCount),                                     color:'var(--amber)' },
          { label:'Source',            value: source === 'fmp' ? 'FMP' : (source === 'none' ? 'None' : '—'), color: source === 'fmp' ? 'var(--pos)' : 'var(--text-muted)' },
        ].map(card => (
          <div key={card.label} className="metric-card">
            <div style={{ fontSize:11, fontWeight:600, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:6 }}>{card.label}</div>
            <div style={{ fontWeight:900, fontSize:'1.5rem', color: card.color, letterSpacing:'-0.03em' }}>{card.value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search acquirer, target, ticker…"
          onKeyDown={e => { if (e.key === 'Enter') loadDeals(search.toUpperCase().trim().match(/^[A-Z]{1,6}$/) ? search.trim() : '') }}
          style={{ flex:1, minWidth:200, padding:'8px 12px', borderRadius:8, border:'1.5px solid #E2E8F2', fontSize:13, fontFamily:'inherit', outline:'none' }} />
        <select value={status} onChange={e => setStatus(e.target.value)}
          style={{ padding:'8px 12px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:13, fontFamily:'inherit', color:'var(--text-primary)', background:'var(--bg-card)', cursor:'pointer' }}>
          {STATUS_OPTIONS.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      {/* Provider warnings */}
      {providerError && (
        <div style={{ padding:'8px 12px', marginBottom:12, borderRadius:8, background:'var(--neg-dim)', color:'var(--neg)', fontSize:12, fontWeight:600 }}>
          Provider error: {providerError}
        </div>
      )}
      {loadError && (
        <div style={{ padding:'8px 12px', marginBottom:12, borderRadius:8, background:'var(--neg-dim)', color:'var(--neg)', fontSize:12, fontWeight:600 }}>
          {loadError}
        </div>
      )}

      {/* Deals table */}
      <div className="card" style={{ overflow:'hidden' }}>
        {!hydrated ? (
          <div style={{ padding:40, textAlign:'center', color:'#7D8FA9', fontSize:13 }}>Loading deals…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding:40, textAlign:'center', color:'#7D8FA9', fontSize:13 }}>
            {deals.length === 0
              ? (source === 'none' ? 'No M&A provider configured. Add an FMP API key to see live deals.' : 'No deals returned by the provider.')
              : 'No deals match these filters.'}
          </div>
        ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Acquirer</th><th>Target</th><th className="right">Value</th>
              <th>Type</th><th>Status</th><th>Announced</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(deal => (
              <tr key={deal.id} style={{ cursor:'pointer' }} onClick={() => setSelected(deal)}>
                <td style={{ fontWeight:700, fontSize:13, color:'#0A1628' }}>
                  {deal.acquirer}
                  {deal.acquirerSymbol && <span style={{ marginLeft:6, fontSize:11, color:'var(--text-muted)' }}>{deal.acquirerSymbol}</span>}
                </td>
                <td style={{ fontSize:13, color:'#1C2B4A' }}>
                  {deal.target}
                  {deal.targetSymbol && <span style={{ marginLeft:6, fontSize:11, color:'var(--text-muted)' }}>{deal.targetSymbol}</span>}
                </td>
                <td className="right" style={{ fontWeight:700, fontSize:13 }}>{formatValue(deal.value)}</td>
                <td>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#F0F4FA', color:'#4A5568' }}>
                    {deal.type}
                  </span>
                </td>
                <td>
                  <span style={{ fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20,
                    background:`${statusColor(deal.status)}18`, color:statusColor(deal.status) }}>
                    {deal.status}
                  </span>
                </td>
                <td style={{ fontSize:12, color:'#7D8FA9' }}>{formatDate(deal.announceDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>

      {/* Deal detail modal */}
      {selected && (
        <>
          <div onClick={() => setSelected(null)} style={{ position:'fixed', inset:0, background:'rgba(8,14,26,0.4)', zIndex:1000, backdropFilter:'blur(2px)' }} />
          <div style={{ position:'fixed', top:'50%', left:'50%', transform:'translate(-50%,-50%)', zIndex:1001, width:560, maxWidth:'calc(100vw - 32px)', background:'var(--bg-card)', borderRadius:16, boxShadow:'0 16px 64px rgba(0,0,0,0.15)', overflow:'hidden', maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ padding:'16px 20px', background:'linear-gradient(135deg,#080E1A,#0A1220)', display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0 }}>
              <div>
                <div style={{ fontWeight:800, fontSize:15, color: '#fff' }}>{selected.acquirer} → {selected.target}</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>{selected.type}</div>
              </div>
              <button onClick={() => setSelected(null)} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.5)', fontSize:20, cursor:'pointer' }}>×</button>
            </div>
            <div style={{ padding:24 }}>
              <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
                {[
                  { label:'Deal Value', value: formatValue(selected.value) },
                  { label:'Cash',       value: formatValue(selected.cashConsideration) },
                  { label:'Stock',      value: formatValue(selected.stockConsideration) },
                  { label:'Status',     value: selected.status },
                ].map(kv => (
                  <div key={kv.label} style={{ flex:1, minWidth:110, padding:'12px 14px', borderRadius:10, background:'#F8FAFD', border:'1px solid #E2E8F2' }}>
                    <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:4 }}>{kv.label}</div>
                    <div style={{ fontWeight:900, fontSize:'1.15rem', color:'#0A1628', letterSpacing:'-0.02em' }}>{kv.value}</div>
                  </div>
                ))}
              </div>
              {selected.description && (
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', marginBottom:8 }}>Filing description</div>
                  <p style={{ fontSize:13, color:'#1C2B4A', lineHeight:1.7, margin:0 }}>{selected.description}</p>
                </div>
              )}
              <div style={{ display:'flex', gap:16, fontSize:12, color:'var(--text-secondary)', flexWrap:'wrap' }}>
                <div><span style={{fontWeight:700,color:'var(--text-primary)'}}>Announced:</span> {formatDate(selected.announceDate)}</div>
                {selected.acquirerSymbol && <div><span style={{fontWeight:700,color:'var(--text-primary)'}}>Acquirer ticker:</span> {selected.acquirerSymbol}</div>}
                {selected.targetSymbol && <div><span style={{fontWeight:700,color:'var(--text-primary)'}}>Target ticker:</span> {selected.targetSymbol}</div>}
              </div>
              {selected.link && (
                <div style={{ marginTop:16 }}>
                  <a href={selected.link} target="_blank" rel="noreferrer" style={{ fontSize:12, color:'var(--accent)', fontWeight:700 }}>
                    View SEC filing ↗
                  </a>
                </div>
              )}
              <div style={{ marginTop:16 }}>
                <span style={{ fontSize:12, fontWeight:700, padding:'4px 14px', borderRadius:20,
                  background:`${statusColor(selected.status)}18`, color:statusColor(selected.status) }}>
                  {selected.status}
                </span>
              </div>
              <div style={{ marginTop:16, fontSize:11, color:'var(--text-muted)' }}>
                Source: {sourceLabel}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
