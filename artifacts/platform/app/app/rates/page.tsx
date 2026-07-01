'use client'
import { useEffect, useState, useCallback, useMemo } from 'react'
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from 'recharts'
import { ContextualAskBar } from '@/components/ui'

const API = (process.env.NEXT_PUBLIC_BASE_PATH || '')

// ── Types ─────────────────────────────────────────────────────────────────────
interface CurvePoint { tenor: string; symbol: string; months: number; yield: number | null; source: string; asOf?: string }
interface YieldCurve { date: string | null; asOf: string | null; points: CurvePoint[]; spreads: { label: string; key: string; value: number | null }[]; source: string; error?: string }
interface ReferenceRate { key: string; label: string; name: string; region: string; value: number | null; prev: number | null; change: number | null; asOf?: string; source: string; spark: { date: string; value: number }[] }
interface CreditLatest { key: string; label: string; name: string; value: number | null; prev: number | null; change: number | null; asOf?: string; source: string }
interface CreditSpreads { latest: CreditLatest[]; history: { date: string; ig: number | null; hy: number | null }[]; differential: number | null; source: string; error?: string }

// Source attribution → human label.
const SOURCE_LABEL: Record<string, string> = {
  fred: 'FRED (St. Louis Fed)',
  'fred-public': 'FRED public (keyless)',
  yahoo: 'Yahoo Finance',
  twelvedata: 'Twelve Data',
  massive: 'Massive / Polygon',
  alphav: 'Alpha Vantage',
  none: 'No source',
}
function sourceLabel(s?: string) { return s ? (SOURCE_LABEL[s] || s) : '—' }

const COMPARE_PRESETS = [
  { label: '1M ago', days: 30 },
  { label: '3M ago', days: 91 },
  { label: '6M ago', days: 182 },
  { label: '1Y ago', days: 365 },
]
function daysAgoISO(days: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

const CurveTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, boxShadow:'0 4px 16px rgba(0,0,0,0.08)' }}>
      <div style={{ fontWeight:700, color:'var(--text-primary)', marginBottom:4 }}>{label} Treasury</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color: p.color, fontWeight:600 }}>{p.name}: {p.value != null ? `${p.value.toFixed(2)}%` : '—'}</div>
      ))}
    </div>
  )
}

export default function RatesDeskPage() {
  const [curve, setCurve]               = useState<YieldCurve | null>(null)
  const [compareCurve, setCompareCurve] = useState<YieldCurve | null>(null)
  const [compareDate, setCompareDate]   = useState<string | null>(null)
  const [reference, setReference]       = useState<{ rates: ReferenceRate[]; source: string } | null>(null)
  const [credit, setCredit]             = useState<CreditSpreads | null>(null)
  const [loadingCurve, setLoadingCurve] = useState(true)
  const [loadingRef, setLoadingRef]     = useState(true)
  const [loadingCredit, setLoadingCredit] = useState(true)
  const [lastUpdated, setLastUpdated]   = useState<Date | null>(null)

  const loadCurve = useCallback(async () => {
    setLoadingCurve(true)
    try {
      const res = await fetch(`${API}/api/rates/yield-curve`)
      setCurve(await res.json())
    } catch (e) { setCurve({ date:null, asOf:null, points:[], spreads:[], source:'none', error:(e as Error).message }) }
    finally { setLoadingCurve(false); setLastUpdated(new Date()) }
  }, [])

  const loadCompare = useCallback(async (date: string | null) => {
    if (!date) { setCompareCurve(null); return }
    try {
      const res = await fetch(`${API}/api/rates/yield-curve?date=${encodeURIComponent(date)}`)
      setCompareCurve(await res.json())
    } catch { setCompareCurve(null) }
  }, [])

  const loadReference = useCallback(async () => {
    setLoadingRef(true)
    try {
      const res = await fetch(`${API}/api/rates/reference`)
      setReference(await res.json())
    } catch { setReference({ rates:[], source:'none' }) }
    finally { setLoadingRef(false) }
  }, [])

  const loadCredit = useCallback(async () => {
    setLoadingCredit(true)
    try {
      const res = await fetch(`${API}/api/rates/credit-spreads?periods=365`)
      setCredit(await res.json())
    } catch (e) { setCredit({ latest:[], history:[], differential:null, source:'none', error:(e as Error).message }) }
    finally { setLoadingCredit(false) }
  }, [])

  useEffect(() => { loadCurve(); loadReference(); loadCredit() }, [loadCurve, loadReference, loadCredit])
  useEffect(() => { loadCompare(compareDate) }, [compareDate, loadCompare])

  function refreshAll() { loadCurve(); loadCompare(compareDate); loadReference(); loadCredit() }

  // ── Curve chart data (merge current + comparison by tenor) ──────────────────
  const curveChart = useMemo(() => {
    const pts = (curve?.points || []).filter(p => p.yield != null)
    const cmpMap = new Map((compareCurve?.points || []).map(p => [p.symbol, p.yield]))
    return pts.map(p => ({ tenor: p.tenor, months: p.months, current: p.yield, compare: cmpMap.get(p.symbol) ?? null }))
      .sort((a, b) => a.months - b.months)
  }, [curve, compareCurve])

  const curveHasData = curveChart.length > 0
  const curveInverted = (() => {
    const s = curve?.spreads?.find(x => x.key === '2s10s')?.value
    return s != null && s < 0
  })()

  return (
    <div className="page-content">
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="page-title">Fixed Income & Rates Desk</h1>
          <p style={{ fontSize:13, marginTop:2, color:'#7D8FA9' }}>Government yield curve · benchmark reference rates · credit spreads</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          {lastUpdated && <span style={{ fontSize:11, color:'#B0BCD0' }}>Updated {lastUpdated.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span>}
          <button onClick={refreshAll}
            style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid var(--border)', background:'#fff', cursor:'pointer', fontSize:12, fontWeight:600, color:'#4A5568' }}>
            ↻ Refresh
          </button>
        </div>
      </div>

      <ContextualAskBar
        context="Fixed Income & Rates Desk"
        contextData={{ page: 'rates', curveSource: curve?.source, creditSource: credit?.source }}
        chips={[
          { label: 'Curve shape',     prompt: 'Interpret the current US Treasury yield curve shape (use get_yield_curve) — what is it pricing in for growth and Fed policy 12 months out?' },
          { label: '2s10s vs history', prompt: 'Compare the current 2s10s and 3m10y Treasury spreads (get_yield_curve) to a snapshot from 1 year ago and explain what the change implies.' },
          { label: 'Funding stress',  prompt: 'Read the SOFR, EFFR, SONIA and €STR reference rates (get_rates kind=reference) and flag any funding-market stress.' },
          { label: 'Credit risk',     prompt: 'Read the IG and HY credit spreads (get_rates kind=credit) and assess where we are in the credit cycle.' },
        ]}
        placeholder="Ask Finsyt about rates, the curve, or credit…"
        style={{ margin: '0 0 16px' }}
      />

      {/* ── Yield curve ─────────────────────────────────────────────────────── */}
      <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>US Treasury Yield Curve</span>
            <span style={{ marginLeft:8, fontSize:11, color:'#B0BCD0' }}>
              {curve?.asOf ? `as of ${curve.asOf} · ` : ''}source: {sourceLabel(curve?.source)}
              {curveInverted && <span style={{ marginLeft:8, color:'var(--neg)', fontWeight:700 }}>· Inverted</span>}
            </span>
          </div>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
            <span style={{ fontSize:11, color:'#7D8FA9', fontWeight:600 }}>Compare:</span>
            <button onClick={() => setCompareDate(null)}
              style={chipStyle(compareDate === null)}>None</button>
            {COMPARE_PRESETS.map(p => {
              const iso = daysAgoISO(p.days)
              return (
                <button key={p.label} onClick={() => setCompareDate(iso)}
                  style={chipStyle(compareDate === iso)}>{p.label}</button>
              )
            })}
            <input type="date" value={compareDate || ''} max={new Date().toISOString().slice(0,10)}
              onChange={e => setCompareDate(e.target.value || null)}
              style={{ padding:'4px 8px', borderRadius:8, border:'1.5px solid var(--border)', fontSize:11, fontFamily:'inherit', color:'var(--text-primary)' }} />
          </div>
        </div>

        {/* Spread KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'#E2E8F2' }}>
          {(curve?.spreads || [
            { label:'2s10s (10Y − 2Y)', key:'2s10s', value:null },
            { label:'3m10y (10Y − 3M)', key:'3m10y', value:null },
            { label:'5s30s (30Y − 5Y)', key:'5s30s', value:null },
          ]).map(s => {
            const inverted = s.value != null && s.value < 0
            return (
              <div key={s.key} style={{ background:'#fff', padding:'12px 16px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em' }}>{s.label}</div>
                <div style={{ fontWeight:900, fontSize:'1.4rem', letterSpacing:'-0.02em', marginTop:4, color: s.value == null ? '#B0BCD0' : inverted ? 'var(--neg)' : 'var(--pos)' }}>
                  {s.value == null ? '—' : `${s.value > 0 ? '+' : ''}${(s.value * 100).toFixed(0)} bps`}
                </div>
                <div style={{ fontSize:11, color:'#B0BCD0', marginTop:4 }}>{inverted ? 'Inverted' : s.value == null ? 'No data' : 'Positive'}</div>
              </div>
            )
          })}
        </div>

        <div style={{ padding:16, height:300 }}>
          {loadingCurve ? (
            <div style={emptyBox}>Loading yield curve…</div>
          ) : curve?.error ? (
            <div style={{ ...emptyBox, color:'var(--neg)' }}>Yield curve error: {curve.error}</div>
          ) : !curveHasData ? (
            <div style={emptyBox}>No yield-curve data available from any keyless source.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={curveChart} margin={{ top:8, right:16, bottom:0, left:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F0F4FA" />
                <XAxis dataKey="tenor" tick={{ fontSize:11, fill:'#7D8FA9' }} tickLine={false} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} tickLine={false} axisLine={false}
                  domain={['auto','auto']} tickFormatter={v => `${v.toFixed(1)}%`} width={48} />
                <Tooltip content={<CurveTooltip />} />
                {compareCurve && <Legend wrapperStyle={{ fontSize:11 }} />}
                {compareCurve && (
                  <Line type="monotone" dataKey="compare" name={compareDate || 'Comparison'} stroke="#B0BCD0" strokeWidth={2}
                    strokeDasharray="5 4" dot={{ fill:'#B0BCD0', r:3 }} activeDot={{ r:5 }} connectNulls />
                )}
                <Line type="monotone" dataKey="current" name={curve?.asOf || 'Current'} stroke='var(--accent)' strokeWidth={2.5}
                  dot={{ fill:'var(--accent)', r:4 }} activeDot={{ r:6 }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Reference rates board ───────────────────────────────────────────── */}
      <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>Benchmark Reference Rates</span>
          <span style={{ fontSize:11, color:'#B0BCD0' }}>source: {sourceLabel(reference?.source)}</span>
        </div>
        <div style={{ padding:16 }}>
          {loadingRef ? (
            <div style={{ ...emptyBox, height:120 }}>Loading reference rates…</div>
          ) : !reference?.rates?.some(r => r.value != null) ? (
            <div style={{ ...emptyBox, height:120 }}>No reference-rate data available from any keyless source.</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))', gap:12 }}>
              {reference.rates.map(r => <ReferenceCard key={r.key} r={r} />)}
            </div>
          )}
        </div>
      </div>

      {/* ── Credit spreads ──────────────────────────────────────────────────── */}
      <div className="card" style={{ overflow:'hidden', marginBottom:24 }}>
        <div style={{ padding:'12px 20px', borderBottom:'1px solid #E2E8F2', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
          <div>
            <span style={{ fontWeight:700, fontSize:14, color:'#0A1628' }}>Credit Spreads — IG vs HY (OAS)</span>
            <span style={{ marginLeft:8, fontSize:11, color:'#B0BCD0' }}>ICE BofA option-adjusted spreads · source: {sourceLabel(credit?.source)}</span>
          </div>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:1, background:'#E2E8F2' }}>
          {(credit?.latest?.length ? credit.latest : [
            { key:'IG', label:'Investment Grade', name:'', value:null, prev:null, change:null, source:'none' },
            { key:'HY', label:'High Yield', name:'', value:null, prev:null, change:null, source:'none' },
          ]).map(c => (
            <div key={c.key} style={{ background:'#fff', padding:'12px 16px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em' }}>{c.label} OAS</div>
              <div style={{ fontWeight:900, fontSize:'1.4rem', color: c.value == null ? '#B0BCD0' : '#0A1628', letterSpacing:'-0.02em', marginTop:4 }}>
                {c.value == null ? '—' : `${c.value.toFixed(2)}%`}
              </div>
              <div style={{ fontSize:11, color:'#B0BCD0', marginTop:4, display:'flex', gap:8 }}>
                {c.asOf && <span>{c.asOf}</span>}
                {c.change != null && <span style={{ color: c.change > 0 ? 'var(--neg)' : c.change < 0 ? 'var(--pos)' : '#7D8FA9', fontWeight:700 }}>{c.change > 0 ? '+' : ''}{(c.change * 100).toFixed(0)} bps</span>}
              </div>
            </div>
          ))}
          <div style={{ background:'#fff', padding:'12px 16px' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', textTransform:'uppercase', letterSpacing:'0.04em' }}>HY − IG Differential</div>
            <div style={{ fontWeight:900, fontSize:'1.4rem', color: credit?.differential == null ? '#B0BCD0' : '#0A1628', letterSpacing:'-0.02em', marginTop:4 }}>
              {credit?.differential == null ? '—' : `${credit.differential.toFixed(2)}%`}
            </div>
            <div style={{ fontSize:11, color:'#B0BCD0', marginTop:4 }}>Risk premium HY over IG</div>
          </div>
        </div>

        <div style={{ padding:16, height:280 }}>
          {loadingCredit ? (
            <div style={emptyBox}>Loading credit spreads…</div>
          ) : credit?.error ? (
            <div style={{ ...emptyBox, color:'var(--neg)' }}>Credit spreads error: {credit.error}</div>
          ) : !credit?.history?.length ? (
            <div style={emptyBox}>No credit-spread data available from any keyless source.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={credit.history} margin={{ top:8, right:16, bottom:0, left:0 }}>
                <defs>
                  <linearGradient id="hyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E5484D" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#E5484D" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="igGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize:10, fill:'var(--text-muted)' }} tickLine={false}
                  tickFormatter={v => v?.slice(0,7)} interval="preserveStartEnd" minTickGap={40} />
                <YAxis tick={{ fontSize:10, fill:'var(--text-muted)' }} tickLine={false} axisLine={false}
                  tickFormatter={v => `${v.toFixed(1)}%`} width={48} />
                <Tooltip formatter={(v: number, n: string) => [v != null ? `${v.toFixed(2)}%` : '—', n === 'hy' ? 'High Yield' : 'Investment Grade']}
                  contentStyle={{ background:'#fff', border:'1px solid var(--border)', borderRadius:8, fontSize:12 }} />
                <Legend wrapperStyle={{ fontSize:11 }} formatter={(v) => v === 'hy' ? 'High Yield OAS' : 'Investment Grade OAS'} />
                <Area type="monotone" dataKey="hy" stroke="#E5484D" strokeWidth={2} fill="url(#hyGrad)" dot={false} connectNulls />
                <Area type="monotone" dataKey="ig" stroke="var(--accent)" strokeWidth={2} fill="url(#igGrad)" dot={false} connectNulls />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Helpers / sub-components ────────────────────────────────────────────────
const emptyBox: React.CSSProperties = { display:'flex', alignItems:'center', justifyContent:'center', height:'100%', color:'#B0BCD0', fontSize:13, textAlign:'center', padding:'0 16px' }

function chipStyle(active: boolean): React.CSSProperties {
  return {
    padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:600, cursor:'pointer', border:'1.5px solid', transition:'all 0.1s',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'var(--accent)' : '#fff',
    color: active ? '#fff' : '#7D8FA9',
  }
}

function ReferenceCard({ r }: { r: ReferenceRate }) {
  const up = r.change != null && r.change > 0
  const down = r.change != null && r.change < 0
  const color = up ? 'var(--neg)' : down ? 'var(--pos)' : '#7D8FA9'
  return (
    <div className="metric-card" style={{ borderRadius:12, border:'1px solid var(--border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
        <span style={{ fontSize:13, fontWeight:800, color:'#0A1628' }}>{r.label}</span>
        <span style={{ fontSize:10, fontWeight:700, color:'#7D8FA9', background:'#F0F4FA', borderRadius:6, padding:'2px 6px' }}>{r.region}</span>
      </div>
      <div style={{ fontSize:11, color:'#7D8FA9', marginBottom:8, minHeight:28, lineHeight:1.3 }}>{r.name}</div>
      {r.value == null ? (
        <div style={{ fontWeight:900, fontSize:'1.4rem', color:'#B0BCD0' }}>—</div>
      ) : (
        <>
          <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
            <span style={{ fontWeight:900, fontSize:'1.6rem', color:'#0A1628', letterSpacing:'-0.03em' }}>{r.value.toFixed(2)}%</span>
            {r.change != null && <span style={{ fontSize:12, fontWeight:700, color }}>{up ? '+' : ''}{(r.change * 100).toFixed(0)} bps</span>}
          </div>
          {r.spark.length > 1 && (
            <div style={{ height:36, marginTop:6 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={r.spark} margin={{ top:2, right:0, bottom:0, left:0 }}>
                  <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}
      <div style={{ fontSize:10, color:'#B0BCD0', marginTop:6 }}>
        {r.asOf ? `${r.asOf} · ` : ''}{sourceLabel(r.source)}
      </div>
    </div>
  )
}
