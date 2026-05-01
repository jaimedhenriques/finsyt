'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import LiveNowStrip from '@/components/LiveNowStrip'
import ActivityFeed from '@/components/ActivityFeed'
import { track } from '@/lib/analytics'
import { ContextualAskBar } from '@/components/ui'

interface CalEvent {
  symbol: string; name: string; date: string; eventType: string;
  reportType: string; country: string; industry: string; marketCap: number; timing: 'BMO' | 'AMC' | 'DMH';
  consensusEps?: number; consensusRev?: number;
}

const EVENT_TYPES = ['Earnings', 'Conference', 'Capital markets day', 'Investor day', 'Product launch']
const REPORT_TYPES = ['Q1', 'Q2', 'Q3', 'Q4', 'FY', 'H1', 'H2']
const COUNTRIES = ['US', 'UK', 'DE', 'FR', 'IT', 'JP', 'NL']
const INDUSTRIES = ['Technology', 'Communication', 'Consumer', 'Financials', 'Energy', 'Healthcare', 'Industrials', 'Automotive']
const MARKET_CAPS = [
  { id: 'mega', label: 'Mega ($200B+)', min: 200e9 },
  { id: 'large', label: 'Large ($10–200B)', min: 10e9, max: 200e9 },
  { id: 'mid', label: 'Mid ($2–10B)', min: 2e9, max: 10e9 },
  { id: 'small', label: 'Small (<$2B)', max: 2e9 },
]
const TIMINGS = ['BMO', 'AMC', 'DMH']

interface SavedFilter { id: string; name: string; state: any }

const STORAGE_KEY = 'finsyt_calendar_saved_filters_v1'

export default function CalendarPage() {
  const [events, setEvents] = useState<CalEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [source, setSource] = useState<string>('')
  const [watchlist, setWatchlist] = useState<string[]>([])
  const [eventTypes, setEventTypes] = useState<string[]>([])
  const [reportTypes, setReportTypes] = useState<string[]>([])
  const [companies, setCompanies] = useState<string[]>([])
  const [countries, setCountries] = useState<string[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [marketCaps, setMarketCaps] = useState<string[]>([])
  const [timings, setTimings] = useState<string[]>([])
  const [watchlistOnly, setWatchlistOnly] = useState(false)
  const [companyInput, setCompanyInput] = useState('')
  const [saved, setSaved] = useState<SavedFilter[]>([])
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')

  useEffect(() => {
    track('calendar_view')
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) setSaved(JSON.parse(raw))
    } catch {}

    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const today = new Date().toISOString().slice(0,10)
    const end   = new Date(Date.now() + 7 * 86400000).toISOString().slice(0,10)

    let cancelled = false

    fetch(`${base}/api/watchlist`)
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled && Array.isArray(d?.watchlist)) setWatchlist(d.watchlist.map((s: string) => s.toUpperCase())) })
      .catch(() => {})

    fetch(`${base}/api/earnings-calendar?from=${today}&to=${end}`)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (cancelled) return
        if (!Array.isArray(data?.earnings)) {
          setLoadError(data?.error || 'No events returned')
          setEvents([])
          return
        }
        setSource(data.source || '')
        const apiEvents: CalEvent[] = data.earnings.map((e: any) => ({
          symbol:       String(e.symbol || ''),
          name:         e.name || e.symbol,
          country:      e.country || 'US',
          industry:     e.industry || 'Other',
          marketCap:    Number(e.marketCap) || 0,
          eventType:    e.eventType || 'Earnings',
          reportType:   e.reportType || 'Q1',
          timing:       (e.timing === 'BMO' || e.timing === 'AMC') ? e.timing : 'DMH',
          date:         e.date,
          consensusEps: e.consensusEps != null ? Number(e.consensusEps) : undefined,
          consensusRev: e.consensusRev != null ? Number(e.consensusRev) : undefined,
        })).filter((e: CalEvent) => e.symbol && e.date)
        setEvents(apiEvents)
      })
      .catch(err => { if (!cancelled) { setLoadError(err.message || 'Failed to load events'); setEvents([]) } })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [])

  function persist(next: SavedFilter[]) {
    setSaved(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}
  }

  function currentState() {
    return { eventTypes, reportTypes, companies, countries, industries, marketCaps, timings, watchlistOnly }
  }

  function applyState(s: any) {
    setEventTypes(s.eventTypes || [])
    setReportTypes(s.reportTypes || [])
    setCompanies(s.companies || [])
    setCountries(s.countries || [])
    setIndustries(s.industries || [])
    setMarketCaps(s.marketCaps || [])
    setTimings(s.timings || [])
    setWatchlistOnly(!!s.watchlistOnly)
  }

  function saveFilter() {
    if (!saveName.trim()) return
    const f: SavedFilter = { id: Date.now().toString(), name: saveName.trim(), state: currentState() }
    const next = [...saved, f]
    persist(next)
    setActiveSavedId(f.id)
    setSaveName('')
    track('calendar_filter_saved', { name: f.name })
  }

  function deleteFilter(id: string) {
    persist(saved.filter(f => f.id !== id))
    if (activeSavedId === id) setActiveSavedId(null)
  }

  function loadFilter(id: string) {
    const f = saved.find(x => x.id === id)
    if (!f) return
    applyState(f.state)
    setActiveSavedId(id)
    track('calendar_filter_loaded', { name: f.name })
  }

  function clearAll() {
    setEventTypes([]); setReportTypes([]); setCompanies([]); setCountries([])
    setIndustries([]); setMarketCaps([]); setTimings([]); setWatchlistOnly(false)
    setActiveSavedId(null)
  }

  function addCompany() {
    const s = companyInput.trim().toUpperCase()
    if (s && !companies.includes(s)) setCompanies([...companies, s])
    setCompanyInput('')
  }

  const filtered = useMemo(() => events.filter(e => {
    if (eventTypes.length && !eventTypes.includes(e.eventType)) return false
    if (reportTypes.length && !reportTypes.includes(e.reportType)) return false
    if (companies.length && !companies.includes(e.symbol)) return false
    if (countries.length && !countries.includes(e.country)) return false
    if (industries.length && !industries.includes(e.industry)) return false
    if (timings.length && !timings.includes(e.timing)) return false
    if (watchlistOnly && !watchlist.includes(e.symbol)) return false
    if (marketCaps.length) {
      const ok = marketCaps.some(id => {
        const m = MARKET_CAPS.find(x => x.id === id)!
        return (m.min == null || e.marketCap >= m.min) && (m.max == null || e.marketCap < m.max)
      })
      if (!ok) return false
    }
    return true
  }), [events, eventTypes, reportTypes, companies, countries, industries, marketCaps, timings, watchlistOnly, watchlist])

  // Group by date for day-columns
  const days = useMemo(() => {
    const today = new Date()
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today); d.setDate(today.getDate() + i)
      const iso = d.toISOString().slice(0, 10)
      return { iso, date: d, items: filtered.filter(e => e.date === iso) }
    })
  }, [filtered])

  function toggle<T,>(arr: T[], setter: (a: T[]) => void, val: T) {
    setter(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val])
  }

  return (
    <div style={{ padding: '1.75rem', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ marginBottom: 18, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 900, color: '#E2EEFF', letterSpacing: '-0.025em' }}>Earnings Calendar</h1>
          <p style={{ fontSize: 13, color: '#7B96B8', marginTop: 4 }}>Day-by-day events across watchlist, sectors, and geographies. Save filters to revisit instantly.</p>
        </div>
        <div style={{ fontSize: 11, color: '#4A6280', textAlign: 'right' }}>
          {loading && <span>Loading live events…</span>}
          {!loading && loadError && <span style={{ color: 'var(--neg)' }}>Live data unavailable: {loadError}</span>}
          {!loading && !loadError && source && <span>Source: <span style={{ color: '#7B96B8', fontWeight: 700 }}>{source.toUpperCase()}</span> · {events.length} events</span>}
        </div>
      </div>

      <ContextualAskBar
        context="Earnings Calendar"
        contextData={{ page: 'calendar', watchlistOnly, eventCount: events.length }}
        chips={[
          { label: 'Must-watch this week', prompt: 'Which earnings prints this week are most likely to move my watchlist? Rank them and tell me what to listen for.' },
          { label: 'BMO vs AMC mix',       prompt: "Show me this week's BMO versus AMC earnings split and which mornings are most crowded." },
          { label: 'Watchlist next 30d',   prompt: 'Build me a 30-day calendar view restricted to my watchlist with one-line setups for each name.' },
          { label: 'Set alerts',           prompt: 'Suggest earnings-event alerts I should set across my coverage for the next 30 days.' },
        ]}
        placeholder="Ask Finsyt about the earnings calendar…"
        style={{ margin: '0 0 14px' }}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16, marginBottom: 18 }}>
        <LiveNowStrip />
        <ActivityFeed limit={5} />
      </div>

      {/* Filter bar */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: 14, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginBottom: 10 }}>
          <FilterPill label={`Watchlist${watchlistOnly ? ' ✓' : ''}`} active={watchlistOnly} onClick={() => setWatchlistOnly(v => !v)} />
          <Multi label="Event Type" opts={EVENT_TYPES} sel={eventTypes} onToggle={v => toggle(eventTypes, setEventTypes, v)} />
          <Multi label="Report Type" opts={REPORT_TYPES} sel={reportTypes} onToggle={v => toggle(reportTypes, setReportTypes, v)} />
          <Multi label="Countries" opts={COUNTRIES} sel={countries} onToggle={v => toggle(countries, setCountries, v)} />
          <Multi label="Industries" opts={INDUSTRIES} sel={industries} onToggle={v => toggle(industries, setIndustries, v)} />
          <Multi label="Market Cap" opts={MARKET_CAPS.map(m => m.id)} optLabels={MARKET_CAPS.map(m => m.label)} sel={marketCaps} onToggle={v => toggle(marketCaps, setMarketCaps, v)} />
          <Multi label="Time" opts={TIMINGS} sel={timings} onToggle={v => toggle(timings, setTimings, v)} />
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 6px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
            <input value={companyInput} onChange={e => setCompanyInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && addCompany()} placeholder="Add company..."
              style={{ background: 'none', border: 'none', outline: 'none', color: '#E2EEFF', fontSize: 12, width: 110, fontFamily: 'inherit' }} />
            <button onClick={addCompany} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>+</button>
          </div>
          <button onClick={clearAll} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(255,255,255,0.12)', color: '#7B96B8', borderRadius: 8, padding: '5px 12px', fontSize: 12, cursor: 'pointer' }}>Clear all</button>
        </div>
        {companies.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
            {companies.map(s => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 6px 2px 10px', borderRadius: 14, background: 'rgba(27,79,255,0.18)', color: '#93B4FF', fontSize: 11, fontWeight: 700 }}>
                {s}
                <button onClick={() => setCompanies(companies.filter(x => x !== s))} style={{ background: 'none', border: 'none', color: '#93B4FF', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}>×</button>
              </span>
            ))}
          </div>
        )}

        {/* Saved filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,0.06)', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, color: '#7B96B8', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Saved filters</span>
          {saved.length === 0 && <span style={{ fontSize: 11, color: '#4A6280' }}>None yet — set filters above and save below.</span>}
          {saved.map(f => (
            <span key={f.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 4px 4px 10px', borderRadius: 14, background: activeSavedId === f.id ? 'rgba(27,79,255,0.25)' : 'rgba(255,255,255,0.05)', color: activeSavedId === f.id ? '#93B4FF' : '#E2EEFF', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
              onClick={() => loadFilter(f.id)}>
              {f.name}
              <button onClick={(e) => { e.stopPropagation(); deleteFilter(f.id) }} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 4px' }}>×</button>
            </span>
          ))}
          <div style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6 }}>
            <input value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="Name this view..."
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '5px 10px', color: '#E2EEFF', fontSize: 12, fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={saveFilter} disabled={!saveName.trim()} style={{ background: 'var(--gradient-brand)', color: '#fff', border: 'none', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: saveName.trim() ? 'pointer' : 'not-allowed', opacity: saveName.trim() ? 1 : 0.5 }}>Save</button>
          </div>
        </div>
      </div>

      {/* Day columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 10 }}>
        {days.map(d => (
          <div key={d.iso} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 12, overflow: 'hidden', minHeight: 320 }}>
            <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: '#7B96B8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {d.date.toLocaleDateString('en-US', { weekday: 'short' })}
              </div>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#E2EEFF', letterSpacing: '-0.02em' }}>{d.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              <div style={{ fontSize: 10, color: '#4A6280', marginTop: 2 }}>{d.items.length} events</div>
            </div>
            <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {d.items.length === 0 && <div style={{ padding: '20px 8px', textAlign: 'center', color: '#4A6280', fontSize: 11 }}>—</div>}
              {d.items.map(e => (
                <Link key={e.symbol + e.date} href={`/app/company/${e.symbol}`}
                  onClick={() => track('calendar_event_click', { symbol: e.symbol, type: e.eventType })}
                  style={{ display: 'block', padding: 10, borderRadius: 10, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', textDecoration: 'none', transition: 'background 0.15s' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--gradient-brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9, fontWeight: 900, flexShrink: 0 }}>
                      {e.symbol.slice(0, 4)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 800, color: '#E2EEFF' }}>{e.symbol}</div>
                      <div style={{ fontSize: 10, color: '#7B96B8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.name}</div>
                    </div>
                    <span style={{ fontSize: 8, fontWeight: 800, padding: '1px 5px', borderRadius: 4, background: e.timing === 'BMO' ? 'rgba(251,191,36,0.18)' : e.timing === 'AMC' ? 'rgba(27,79,255,0.18)' : 'rgba(124,58,237,0.18)', color: e.timing === 'BMO' ? 'var(--amber)' : e.timing === 'AMC' ? '#93B4FF' : '#C4B5FD', flexShrink: 0 }}>{e.timing}</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#93B4FF', fontWeight: 700 }}>{e.eventType}</span>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#7B96B8', fontWeight: 700 }}>{e.reportType}</span>
                    <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 4, background: 'rgba(255,255,255,0.06)', color: '#7B96B8', fontWeight: 700 }}>{e.country}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '5px 12px', borderRadius: 18, fontSize: 12, fontWeight: 700, cursor: 'pointer',
      border: '1px solid', borderColor: active ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
      background: active ? 'rgba(27,79,255,0.2)' : 'rgba(255,255,255,0.04)',
      color: active ? '#93B4FF' : '#E2EEFF',
    }}>{label}</button>
  )
}

function Multi({ label, opts, optLabels, sel, onToggle }: { label: string; opts: string[]; optLabels?: string[]; sel: string[]; onToggle: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: '5px 12px', borderRadius: 18, fontSize: 12, fontWeight: 700, cursor: 'pointer',
        border: '1px solid', borderColor: sel.length ? 'var(--accent)' : 'rgba(255,255,255,0.1)',
        background: sel.length ? 'rgba(27,79,255,0.2)' : 'rgba(255,255,255,0.04)',
        color: sel.length ? '#93B4FF' : '#E2EEFF',
      }}>
        {label}{sel.length ? ` (${sel.length})` : ''} ▾
      </button>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
          <div style={{ position: 'absolute', top: '110%', left: 0, zIndex: 50, minWidth: 180, background: 'var(--bg-elevated)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, boxShadow: '0 12px 40px rgba(0,0,0,0.5)', padding: 6, maxHeight: 280, overflowY: 'auto' }}>
            {opts.map((o, i) => (
              <button key={o} onClick={() => onToggle(o)}
                style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 8, padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#E2EEFF', textAlign: 'left', borderRadius: 6, fontFamily: 'inherit' }}>
                <span style={{ width: 14, height: 14, borderRadius: 3, border: '1.5px solid', borderColor: sel.includes(o) ? 'var(--accent)' : 'rgba(255,255,255,0.2)', background: sel.includes(o) ? 'var(--accent)' : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 9 }}>
                  {sel.includes(o) ? '✓' : ''}
                </span>
                {optLabels?.[i] || o}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
