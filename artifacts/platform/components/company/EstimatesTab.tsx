"use client"
import { useEffect, useState } from "react"
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts"

// Visible-Alpha-style estimates surface for a single ticker. Every value
// rendered comes from /api/estimates which forwards FMP /stable endpoints.
// We deliberately render "—" when a field isn't returned and never seed
// example numbers.

type Props = { symbol: string; spotPrice?: number | null }

// /stable/analyst-estimates uses short keys (revenueAvg, epsAvg, ...).
// We accept the legacy v3 names (estimatedRevenueAvg) too so this component
// keeps working if FMP renames keys again.
type EstimateRow = {
  date: string
  symbol: string
  // /stable shape
  revenueLow?:   number | null
  revenueHigh?:  number | null
  revenueAvg?:   number | null
  ebitdaLow?:    number | null
  ebitdaHigh?:   number | null
  ebitdaAvg?:    number | null
  epsLow?:       number | null
  epsHigh?:      number | null
  epsAvg?:       number | null
  numAnalystsRevenue?: number | null
  numAnalystsEps?:     number | null
  // legacy v3 fallbacks
  estimatedRevenueLow?:    number | null
  estimatedRevenueHigh?:   number | null
  estimatedRevenueAvg?:    number | null
  estimatedEbitdaLow?:     number | null
  estimatedEbitdaHigh?:    number | null
  estimatedEbitdaAvg?:     number | null
  estimatedEpsLow?:        number | null
  estimatedEpsHigh?:       number | null
  estimatedEpsAvg?:        number | null
  numberAnalystEstimatedRevenue?: number | null
  numberAnalystsEstimatedEps?:    number | null
}

const pick = (r: any, ...keys: string[]) => {
  for (const k of keys) {
    const v = r?.[k]
    if (v != null && v !== '') return v
  }
  return null
}

type SurpriseRow = {
  date:           string
  symbol:         string
  actualEarningResult?: number | null
  estimatedEarning?:    number | null
}

type PriceTargetRow = {
  symbol:          string
  publishedDate?:  string
  newsURL?:        string
  newsTitle?:      string
  analystName?:    string
  priceTarget?:    number | null
  adjPriceTarget?: number | null
  priceWhenPosted?:number | null
  newsPublisher?:  string
  newGrade?:       string
  previousGrade?:  string
  gradingCompany?: string | null
  analystCompany?: string
  action?:         string
}

type Bundle = {
  symbol: string
  rating: string | null
  priceTarget: number | null
  priceTargetHigh: number | null
  priceTargetLow: number | null
  priceTargetMedian: number | null
  numAnalysts: number | null
  strongBuy: number | null
  buy:       number | null
  hold:      number | null
  sell:      number | null
  strongSell:number | null
  estimatesAnnual:    EstimateRow[]
  estimatesQuarterly: EstimateRow[]
  priceTargets:       PriceTargetRow[]
  priceTargetNews:    PriceTargetRow[]
  surprises:          SurpriseRow[]
  recommendations:    any[]
  upgrades:           any
  priceTargetConsensus: any
}

const fmtNum = (n: any, dp = 2) => (n == null || n === '' || !isFinite(Number(n))) ? '—' : Number(n).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })
const fmtUsd = (n: any, dp = 2) => (n == null || !isFinite(Number(n))) ? '—' : '$' + fmtNum(n, dp)
const fmtBig = (n: any) => {
  if (n == null || !isFinite(Number(n))) return '—'
  const v = Number(n)
  const abs = Math.abs(v)
  if (abs >= 1e12) return (v / 1e12).toFixed(2) + 'T'
  if (abs >= 1e9)  return (v / 1e9).toFixed(2)  + 'B'
  if (abs >= 1e6)  return (v / 1e6).toFixed(1)  + 'M'
  return v.toLocaleString()
}
const fmtPct = (n: any) => (n == null || !isFinite(Number(n))) ? '—' : (Number(n) >= 0 ? '+' : '') + Number(n).toFixed(1) + '%'
const fmtDate = (s: any) => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 10)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: '2-digit' })
}
const quarterLabel = (s: any) => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return String(s).slice(0, 7)
  const m = d.getUTCMonth() + 1
  const q = m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4
  return `Q${q} '${String(d.getUTCFullYear()).slice(2)}`
}

// Tiny low-mean-high range bar. Renders an inline SVG so callers don't need
// to pull in any chart deps.
function RangeBar({ low, mean, high }: { low: number | null; mean: number | null; high: number | null }) {
  if (low == null || high == null || mean == null || !isFinite(Number(low)) || !isFinite(Number(high))) {
    return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
  }
  const lo = Number(low), hi = Number(high), mid = Number(mean)
  const span = hi - lo || 1
  const pos = ((mid - lo) / span) * 100
  return (
    <div style={{ position: 'relative', height: 16, width: '100%', minWidth: 100 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 7, height: 2, background: 'var(--border)', borderRadius: 1 }} />
      <div style={{ position: 'absolute', left: 0, top: 4, width: 2, height: 8, background: 'var(--text-muted)', borderRadius: 1 }} />
      <div style={{ position: 'absolute', right: 0, top: 4, width: 2, height: 8, background: 'var(--text-muted)', borderRadius: 1 }} />
      <div style={{ position: 'absolute', left: `calc(${pos}% - 4px)`, top: 2, width: 8, height: 12, background: 'var(--accent)', borderRadius: 2 }} title={`Mean ${mid}`} />
    </div>
  )
}

function TilesCard({ tiles }: { tiles: { l: string; v: string; tone?: 'pos' | 'neg' | 'neutral' }[] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}>
      {tiles.map((t, i) => (
        <div key={t.l} style={{ padding: '14px 18px', borderRight: (i + 1) % 4 !== 0 ? '1px solid var(--border)' : 'none', borderBottom: i < tiles.length - 4 ? '1px solid var(--border)' : 'none' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{t.l}</div>
          <div style={{ fontSize: 15, fontWeight: 800, color: t.tone === 'pos' ? 'var(--pos)' : t.tone === 'neg' ? 'var(--neg)' : 'var(--text-primary)' }}>{t.v}</div>
        </div>
      ))}
    </div>
  )
}

export default function EstimatesTab({ symbol, spotPrice }: Props) {
  const [data, setData]       = useState<Bundle | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError(null)
    fetch(`/api/estimates?symbol=${symbol}`)
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then(j => { if (!cancelled) setData(j) })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="card" style={{ height: 120 }}>
            <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 12 }} />
          </div>
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card" style={{ padding: '24px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Failed to load estimates{error ? ` · ${error}` : ''}.
      </div>
    )
  }

  const upside = (data.priceTarget != null && spotPrice && spotPrice > 0)
    ? ((data.priceTarget - spotPrice) / spotPrice) * 100
    : null

  const recBuckets = [
    { l: 'Strong Buy',  v: data.strongBuy   ?? '—' },
    { l: 'Buy',         v: data.buy         ?? '—' },
    { l: 'Hold',        v: data.hold        ?? '—' },
    { l: 'Sell',        v: data.sell        ?? '—' },
    { l: 'Strong Sell', v: data.strongSell  ?? '—' },
  ].map(b => ({ ...b, v: String(b.v) }))

  const headlineTiles = [
    { l: 'Consensus',     v: data.rating ?? '—' },
    { l: 'Price Target',  v: data.priceTarget != null ? fmtUsd(data.priceTarget) : '—' },
    { l: 'Upside',        v: upside == null ? '—' : (upside >= 0 ? '+' : '') + upside.toFixed(1) + '%', tone: upside == null ? 'neutral' : upside >= 0 ? 'pos' : 'neg' as const },
    { l: '# Analysts',    v: data.numAnalysts != null ? String(data.numAnalysts) : '—' },
    { l: 'PT High',       v: data.priceTargetHigh   != null ? fmtUsd(data.priceTargetHigh)   : '—' },
    { l: 'PT Low',        v: data.priceTargetLow    != null ? fmtUsd(data.priceTargetLow)    : '—' },
    { l: 'PT Median',     v: data.priceTargetMedian != null ? fmtUsd(data.priceTargetMedian) : '—' },
    { l: 'Spot',          v: spotPrice != null ? fmtUsd(spotPrice) : '—' },
  ]

  // ── Forward estimates: quarterly + annual, sorted ascending by date ─────
  const today = new Date().toISOString().slice(0, 10)
  const fwdQ = (data.estimatesQuarterly || [])
    .filter(r => String(r.date || '') >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 8)
  const fwdA = (data.estimatesAnnual || [])
    .filter(r => String(r.date || '') >= today)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(0, 5)

  const renderEstimateRow = (r: EstimateRow, label: string) => {
    const revAvg  = pick(r, 'revenueAvg',  'estimatedRevenueAvg')
    const revLow  = pick(r, 'revenueLow',  'estimatedRevenueLow')
    const revHigh = pick(r, 'revenueHigh', 'estimatedRevenueHigh')
    const epsAvg  = pick(r, 'epsAvg',      'estimatedEpsAvg')
    const epsLow  = pick(r, 'epsLow',      'estimatedEpsLow')
    const epsHigh = pick(r, 'epsHigh',     'estimatedEpsHigh')
    const ebAvg   = pick(r, 'ebitdaAvg',   'estimatedEbitdaAvg')
    const nAna    = pick(r, 'numAnalystsEps', 'numAnalystsRevenue', 'numberAnalystsEstimatedEps', 'numberAnalystEstimatedRevenue')
    return (
      <tr key={`${label}-${r.date}`}>
        <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{label}</td>
        <td className="right">{fmtBig(revAvg)}</td>
        <td><RangeBar low={revLow} mean={revAvg} high={revHigh} /></td>
        <td className="right" style={{ fontWeight: 700 }}>{epsAvg != null ? '$' + fmtNum(epsAvg) : '—'}</td>
        <td><RangeBar low={epsLow} mean={epsAvg} high={epsHigh} /></td>
        <td className="right">{fmtBig(ebAvg)}</td>
        <td className="right" style={{ color: 'var(--text-muted)' }}>{nAna ?? '—'}</td>
      </tr>
    )
  }

  // ── Surprise history bar chart ──────────────────────────────────────────
  const surpriseData = (data.surprises || [])
    .filter(s => s.actualEarningResult != null && s.estimatedEarning != null)
    .sort((a, b) => String(a.date).localeCompare(String(b.date)))
    .slice(-8)
    .map(s => {
      const actual = Number(s.actualEarningResult)
      const est    = Number(s.estimatedEarning)
      const surprisePct = est === 0 ? null : ((actual - est) / Math.abs(est)) * 100
      return { period: quarterLabel(s.date), actual, est, surprisePct }
    })

  // ── Per-analyst price targets (latest per analyst-firm) ─────────────────
  const ptRows = (data.priceTargets || [])
    .filter(p => p.priceTarget != null || p.adjPriceTarget != null)
    .sort((a, b) => String(b.publishedDate || '').localeCompare(String(a.publishedDate || '')))

  // Recent PT changes feed
  const ptChanges = (data.priceTargetNews || [])
    .sort((a, b) => String(b.publishedDate || '').localeCompare(String(a.publishedDate || '')))
    .slice(0, 12)

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ── 1. Headline consensus tiles ───────────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Analyst Consensus</span>
          {data.rating && (
            <span className={`badge ${data.rating === 'Buy' || data.rating === 'Strong Buy' ? 'badge-green' : data.rating === 'Sell' || data.rating === 'Strong Sell' ? 'badge-red' : 'badge-amber'}`}>
              {data.rating}
            </span>
          )}
        </div>
        <TilesCard tiles={headlineTiles as any} />
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 20px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8 }}>
          {recBuckets.map(b => (
            <div key={b.l} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 700, marginBottom: 4 }}>{b.l}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{b.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── 2. Forward estimates table (quarterly + annual) ───────────── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Forward Estimates</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Range bars show low → high · marker is mean</span>
        </div>
        {fwdQ.length === 0 && fwdA.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No forward estimates returned by the data provider.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Period</th>
                  <th className="right">Revenue Mean</th>
                  <th style={{ minWidth: 120 }}>Rev Range</th>
                  <th className="right">EPS Mean</th>
                  <th style={{ minWidth: 120 }}>EPS Range</th>
                  <th className="right">EBITDA Mean</th>
                  <th className="right"># Analysts</th>
                </tr>
              </thead>
              <tbody>
                {fwdQ.length > 0 && <tr><td colSpan={7} style={{ background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quarterly</td></tr>}
                {fwdQ.map(r => renderEstimateRow(r, quarterLabel(r.date)))}
                {fwdA.length > 0 && <tr><td colSpan={7} style={{ background: 'var(--bg-elevated)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Annual</td></tr>}
                {fwdA.map(r => renderEstimateRow(r, `FY${String(r.date).slice(0, 4)}`))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── 3. Surprise history ──────────────────────────────────────── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Earnings Surprises · last {surpriseData.length || 0} quarters</div>
        </div>
        {surpriseData.length === 0 ? (
          <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
            No surprise history available for {symbol}.
          </div>
        ) : (
          <div style={{ padding: '12px 12px 6px' }}>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={surpriseData} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(0) + '%'} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: any, name: any, props: any) => {
                    if (name === 'surprisePct') {
                      const row = props?.payload || {}
                      return [`${(row.actual ?? 0).toFixed(2)} vs est ${(row.est ?? 0).toFixed(2)} (${Number(v).toFixed(1)}%)`, 'Actual vs Est']
                    }
                    return [v, name]
                  }}
                />
                <Bar dataKey="surprisePct" radius={[4, 4, 0, 0]}>
                  {surpriseData.map((d, i) => (
                    <Cell key={i} fill={(d.surprisePct ?? 0) >= 0 ? 'var(--pos)' : 'var(--neg)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        {/* ── 4. Per-analyst price targets ──────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Per-Analyst Price Targets</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sorted newest → oldest · {ptRows.length} entries</div>
          </div>
          {ptRows.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              No per-analyst price targets returned.
            </div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr><th>Date</th><th>Analyst / Firm</th><th className="right">PT</th><th className="right">Upside</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {ptRows.map((p, i) => {
                    const pt = p.adjPriceTarget ?? p.priceTarget
                    const ups = (pt != null && spotPrice && spotPrice > 0) ? ((Number(pt) - spotPrice) / spotPrice) * 100 : null
                    return (
                      <tr key={i}>
                        <td style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(p.publishedDate)}</td>
                        <td>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{p.analystName || p.gradingCompany || '—'}</div>
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{p.analystCompany || p.newsPublisher || ''}</div>
                        </td>
                        <td className="right" style={{ fontWeight: 700 }}>{pt != null ? fmtUsd(pt) : '—'}</td>
                        <td className="right" style={{ color: ups == null ? 'var(--text-muted)' : ups >= 0 ? 'var(--pos)' : 'var(--neg)', fontWeight: 600 }}>{ups == null ? '—' : (ups >= 0 ? '+' : '') + ups.toFixed(1) + '%'}</td>
                        <td>
                          {p.action || (p.newGrade && p.previousGrade && p.newGrade !== p.previousGrade ? `${p.previousGrade} → ${p.newGrade}` : p.newGrade) || '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── 5. Recent PT changes feed ─────────────────────────────── */}
        <div className="card" style={{ overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Recent PT Changes</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{ptChanges.length} headlines</div>
          </div>
          {ptChanges.length === 0 ? (
            <div style={{ padding: '24px 20px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              No recent price-target changes.
            </div>
          ) : (
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              {ptChanges.map((p, i) => (
                <a
                  key={i}
                  href={p.newsURL || '#'}
                  target="_blank"
                  rel="noreferrer"
                  style={{ display: 'block', padding: '12px 16px', borderBottom: '1px solid var(--border)', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{p.analystCompany || p.newsPublisher || '—'}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fmtDate(p.publishedDate)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 4 }}>{p.newsTitle || '—'}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: 11 }}>
                    {p.priceTarget != null && <span style={{ color: 'var(--text-muted)' }}>PT <strong style={{ color: 'var(--text-primary)' }}>{fmtUsd(p.priceTarget)}</strong></span>}
                    {p.priceWhenPosted != null && <span style={{ color: 'var(--text-muted)' }}>From <strong style={{ color: 'var(--text-primary)' }}>{fmtUsd(p.priceWhenPosted)}</strong></span>}
                    {p.newGrade && <span style={{ color: 'var(--text-muted)' }}>Grade <strong style={{ color: 'var(--text-primary)' }}>{p.newGrade}</strong></span>}
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
