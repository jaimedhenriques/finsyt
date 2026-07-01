'use client'
import { useEffect, useMemo, useState } from 'react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell,
} from 'recharts'
import { Badge, Drawer, CitationChip } from '@/components/ui'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// ── Types (mirror lib/fixed-income.ts response) ──────────────────────────────
interface DebtSummary {
  totalDebt: number | null; longTermDebt: number | null; shortTermDebt: number | null
  netDebt: number | null; cash: number | null; ebitda: number | null; interestExpense: number | null
  leverage: number | null; coverage: number | null; weightedAvgCouponPct: number | null
  source: string; asOf: string | null
}
interface Instrument {
  id: string; isin: string; description: string; coupon: number; maturity: string
  maturityYear: number; yearsToMaturity: number; amountOutstanding: number; currency: string
  rank: string; benchmarkYield: number; yieldToMaturity: number; currentYield: number
  spreadToBenchmarkBps: number; modifiedDuration: number; price: number; liquidity: string
  callable: boolean; source: string
}
interface MaturityBucket { year: number; amount: number; count: number }
interface RatingPoint { date: string; rating: string; notch: number; outlook: string; source: string }
interface SpreadPoint { date: string; issuerBps: number | null; igBps: number | null; hyBps: number | null }
interface Issuer {
  symbol: string; name: string; sector: string; currency: string
  rating: { label: string; notch: number; grade: 'IG' | 'HY'; outlook: string; source: string }
  spreadBps: number; cdsBps: number | null; benchmarkTenor: string
  debt: DebtSummary; instruments: Instrument[]; maturityWall: MaturityBucket[]
  ratingHistory: RatingPoint[]; spreadHistory: SpreadPoint[]; curveSource: string
  generatedAt: string; notes: string[]
}

// ── Formatters ───────────────────────────────────────────────────────────────
function fmtUsd(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `$${(n / 1e12).toFixed(2)}T`
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`
  return `$${n.toLocaleString()}`
}
function fmtNum(n: number | null | undefined, dp = 2, suffix = '') {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${n.toFixed(dp)}${suffix}`
}
function fmtDate(d: string) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ── Source label map (consistent with equities source convention) ────────────
const SOURCE_LABELS: Record<string, string> = {
  fmp: 'Financial Modeling Prep',
  fred: 'FRED (St. Louis Fed)',
  derived: 'Finsyt implied model',
  synthetic: 'Finsyt model (demo)',
  none: 'No source',
}
function sourceChipLabel(src: string) { return SOURCE_LABELS[src] || src }

function gradeTone(grade: string): 'green' | 'amber' { return grade === 'IG' ? 'green' : 'amber' }
function liquidityTone(l: string): 'gray' | 'green' | 'amber' {
  return l === 'High' ? 'green' : l === 'Medium' ? 'amber' : 'gray'
}

export default function FixedIncomeTab({ symbol }: { symbol: string }) {
  const [data, setData] = useState<Issuer | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Instrument | null>(null)
  const [cite, setCite] = useState<{ open: boolean; label: string; body: string }>({ open: false, label: '', body: '' })

  useEffect(() => {
    let alive = true
    setLoading(true); setError(null)
    fetch(`${BASE}/api/fixed-income/issuer?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        if (d?.error) { setError(d.error); return }
        setData(d)
      })
      .catch(e => { if (alive) setError(String(e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [symbol])

  const wallData = useMemo(() => (data?.maturityWall || []).map(b => ({
    year: String(b.year), amount: b.amount, count: b.count,
  })), [data])

  const spreadData = useMemo(() => (data?.spreadHistory || []).map(p => ({
    date: fmtDate(p.date), issuer: p.issuerBps, ig: p.igBps, hy: p.hyBps,
  })), [data])

  const ratingData = useMemo(() => (data?.ratingHistory || []).map(p => ({
    date: fmtDate(p.date), notch: p.notch, rating: p.rating,
  })), [data])

  if (loading) {
    return (
      <div style={{ display: 'grid', gap: 16 }}>
        {Array(3).fill(0).map((_, i) => (
          <div key={i} className="card" style={{ height: i === 0 ? 120 : 220 }}>
            <span className="skeleton" style={{ width: '40%', height: 14, display: 'block', margin: 16 }} />
          </div>
        ))}
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
        Unable to load fixed-income data{error ? `: ${error}` : ''}.
      </div>
    )
  }

  const { rating, debt } = data

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      {/* ── Credit profile header ── */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Issuer Credit Profile
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
              <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                {rating.label}
              </span>
              <Badge tone={gradeTone(rating.grade)}>{rating.grade === 'IG' ? 'Investment Grade' : 'High Yield'}</Badge>
              <Badge tone={rating.outlook === 'Positive' ? 'green' : rating.outlook === 'Negative' ? 'red' : 'gray'}>
                {rating.outlook} outlook
              </Badge>
            </div>
            <div style={{ marginTop: 8 }}>
              <CitationChip label={`◆ ${sourceChipLabel(rating.source)}`} onClick={() => setCite({
                open: true, label: 'Implied rating methodology',
                body: `Finsyt derives an implied credit rating of ${rating.label} (${rating.grade}) from reported leverage (Net Debt / EBITDA = ${fmtNum(debt.leverage, 2, '×')}) and interest coverage (EBITDA / interest = ${fmtNum(debt.coverage, 1, '×')}). This is a transparent ratio model, not an agency rating. Underlying debt totals source: ${sourceChipLabel(debt.source)}.`,
              })} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
            <HeaderStat label={`Credit spread (vs ${data.benchmarkTenor})`} value={`${data.spreadBps} bps`} />
            <HeaderStat label="5Y CDS (indicative)" value={data.cdsBps != null ? `${data.cdsBps} bps` : '—'} />
            <HeaderStat label="Net leverage" value={fmtNum(debt.leverage, 2, '×')} />
            <HeaderStat label="Interest coverage" value={fmtNum(debt.coverage, 1, '×')} />
          </div>
        </div>
      </div>

      {/* ── Debt summary tiles ── */}
      <div>
        <SectionHeader title="Outstanding Debt" source={debt.source} asOf={debt.asOf}
          onCite={() => setCite({
            open: true, label: 'Outstanding debt',
            body: `Total debt ${fmtUsd(debt.totalDebt)} (long-term ${fmtUsd(debt.longTermDebt)}, short-term ${fmtUsd(debt.shortTermDebt)}); cash ${fmtUsd(debt.cash)}; net debt ${fmtUsd(debt.netDebt)}. Weighted-average coupon ${fmtNum(debt.weightedAvgCouponPct, 2, '%')} (interest expense ${fmtUsd(debt.interestExpense)} / total debt). Source: ${sourceChipLabel(debt.source)}${debt.asOf ? `, as of ${debt.asOf}` : ''}.`,
          })} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
          <Tile label="Total Debt" value={fmtUsd(debt.totalDebt)} />
          <Tile label="Long-Term" value={fmtUsd(debt.longTermDebt)} />
          <Tile label="Short-Term" value={fmtUsd(debt.shortTermDebt)} />
          <Tile label="Net Debt" value={fmtUsd(debt.netDebt)} />
          <Tile label="Wtd-Avg Coupon" value={fmtNum(debt.weightedAvgCouponPct, 2, '%')} />
        </div>
      </div>

      {/* ── Maturity wall ── */}
      <div className="card" style={{ padding: 20 }}>
        <SectionHeader title="Maturity Wall" source="synthetic"
          onCite={() => setCite({
            open: true, label: 'Maturity wall',
            body: 'Aggregate principal coming due by year, summed across the modelled bond ladder. The ladder is derived deterministically from reported long-term debt and the implied rating — connect a premium FI feed for issued-instrument data.',
          })} />
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={wallData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis tickFormatter={(v) => fmtUsd(v)} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={56} />
            <Tooltip formatter={(v: any, _n, p: any) => [`${fmtUsd(v)} · ${p?.payload?.count} bond(s)`, 'Maturing']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
            <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
              {wallData.map((_, i) => <Cell key={i} fill="var(--accent)" />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* ── Bond ladder ── */}
      <div className="card" style={{ overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Outstanding Bonds · Debt Ladder</span>
          <CitationChip label="◆ Finsyt model (demo)" onClick={() => setCite({
            open: true, label: 'Bond ladder',
            body: 'Each row is a modelled tranche derived from the issuer\'s reported long-term debt split across tenors, priced off the live treasury curve plus the implied credit spread. CUSIP/ISIN, coupon and price are deterministic model values — not a live bond feed. Click a row for instrument detail.',
          })} />
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Instrument</th>
              <th className="right">Coupon</th>
              <th className="right">Maturity</th>
              <th className="right">Amount</th>
              <th className="right">YTM</th>
              <th className="right">Spread</th>
              <th className="right">Price</th>
              <th className="right">Duration</th>
              <th>Liquidity</th>
            </tr>
          </thead>
          <tbody>
            {data.instruments.length ? data.instruments.map((ins) => (
              <tr key={ins.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(ins)}>
                <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                  {ins.description}
                  <span style={{ display: 'block', fontSize: 11, color: 'var(--text-muted)', fontWeight: 400 }}>{ins.rank} · {ins.id}</span>
                </td>
                <td className="right">{fmtNum(ins.coupon, 3, '%')}</td>
                <td className="right">{fmtDate(ins.maturity)}</td>
                <td className="right">{fmtUsd(ins.amountOutstanding)}</td>
                <td className="right">{fmtNum(ins.yieldToMaturity, 2, '%')}</td>
                <td className="right" style={{ fontWeight: 600 }}>{ins.spreadToBenchmarkBps} bps</td>
                <td className="right">{fmtNum(ins.price, 2)}</td>
                <td className="right">{fmtNum(ins.modifiedDuration, 1)}</td>
                <td><Badge tone={liquidityTone(ins.liquidity)}>{ins.liquidity}</Badge></td>
              </tr>
            )) : (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)', fontSize: 13 }}>
                No outstanding debt instruments modelled for this issuer.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ── Issuer spread vs aggregate (reconciliation with Rates Desk) ── */}
      <div className="card" style={{ padding: 20 }}>
        <SectionHeader title="Credit Spread vs Market (OAS)" source={data.spreadHistory.some(s => s.igBps != null || s.hyBps != null) ? 'fred' : 'synthetic'}
          onCite={() => setCite({
            open: true, label: 'Credit spread vs market',
            body: `The issuer's option-adjusted spread is tracked against the aggregate Investment-Grade (BAMLC0A0CM) and High-Yield (BAMLH0A0HYM2) OAS indices published by FRED — the same series shown on the Rates Desk. The issuer line is reconciled to the relevant ${rating.grade} benchmark via its implied rating, so it moves with the broad market plus an idiosyncratic basis.`,
          })} />
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={spreadData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} minTickGap={32} />
            <YAxis tickFormatter={(v) => `${v}`} tick={{ fontSize: 11, fill: 'var(--text-muted)' }} width={44}
              label={{ value: 'bps', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: 'var(--text-muted)' } }} />
            <Tooltip formatter={(v: any, n: any) => [`${v} bps`, n === 'issuer' ? data.symbol : n === 'ig' ? 'IG OAS' : 'HY OAS']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
            <Line type="monotone" dataKey="ig" stroke="#7D8FA9" strokeWidth={1.5} dot={false} name="ig" />
            <Line type="monotone" dataKey="hy" stroke="#C99A3B" strokeWidth={1.5} dot={false} name="hy" />
            <Line type="monotone" dataKey="issuer" stroke="var(--accent)" strokeWidth={2.5} dot={false} name="issuer" />
          </LineChart>
        </ResponsiveContainer>
        <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 11, color: 'var(--text-muted)' }}>
          <Legend color="var(--accent)" label={`${data.symbol} issuer OAS`} />
          <Legend color="#7D8FA9" label="IG index OAS" />
          <Legend color="#C99A3B" label="HY index OAS" />
        </div>
      </div>

      {/* ── Rating history ── */}
      <div className="card" style={{ padding: 20 }}>
        <SectionHeader title="Implied Rating History" source={data.ratingHistory[0]?.source || 'derived'}
          onCite={() => setCite({
            open: true, label: 'Rating history',
            body: 'Implied rating over time, re-derived each year from the issuer\'s reported leverage and interest coverage. A lower line means a stronger rating (AAA at top).',
          })} />
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={ratingData} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--text-muted)' }} />
            <YAxis reversed domain={[0, 21]} tickFormatter={(v) => ratingFromNotch(v)} tick={{ fontSize: 10, fill: 'var(--text-muted)' }} width={44} />
            <Tooltip formatter={(_v: any, _n, p: any) => [p?.payload?.rating, 'Implied rating']}
              contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }} />
            <ReferenceLine y={9.5} stroke="var(--neg)" strokeDasharray="4 4" label={{ value: 'IG / HY', position: 'right', style: { fontSize: 9, fill: 'var(--neg)' } }} />
            <Line type="stepAfter" dataKey="notch" stroke="var(--accent)" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {data.notes?.length > 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
          {data.notes.map((n, i) => <div key={i}>• {n}</div>)}
        </div>
      )}

      {/* ── Instrument detail drawer ── */}
      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.description || 'Instrument'} width={460}>
        {selected && (
          <div style={{ display: 'grid', gap: 14 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <Badge tone="gray">{selected.rank}</Badge>
              <Badge tone={liquidityTone(selected.liquidity)}>{selected.liquidity} liquidity</Badge>
              {selected.callable && <Badge tone="amber">Callable</Badge>}
            </div>
            <DetailGrid rows={[
              ['CUSIP (model)', selected.id],
              ['ISIN (model)', selected.isin],
              ['Coupon', fmtNum(selected.coupon, 3, '%')],
              ['Maturity', new Date(selected.maturity).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })],
              ['Years to maturity', fmtNum(selected.yearsToMaturity, 0)],
              ['Amount outstanding', fmtUsd(selected.amountOutstanding)],
              ['Currency', selected.currency],
              ['Clean price', fmtNum(selected.price, 2)],
              ['Yield to maturity', fmtNum(selected.yieldToMaturity, 3, '%')],
              ['Current yield', fmtNum(selected.currentYield, 3, '%')],
              ['Benchmark yield', fmtNum(selected.benchmarkYield, 3, '%')],
              ['Spread to benchmark', `${selected.spreadToBenchmarkBps} bps`],
              ['Modified duration', fmtNum(selected.modifiedDuration, 2)],
            ]} />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
              Instrument-level fields are a deterministic Finsyt model derived from the issuer&apos;s reported debt and the live treasury curve. Source: {sourceChipLabel(selected.source)}.
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Citation drawer ── */}
      <Drawer open={cite.open} onClose={() => setCite({ ...cite, open: false })} title={cite.label} width={420}>
        <p style={{ fontSize: 13, lineHeight: 1.7, color: 'var(--text-secondary)' }}>{cite.body}</p>
      </Drawer>
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────────
function ratingFromNotch(n: number): string {
  const scale = ['AAA', 'AA+', 'AA', 'AA-', 'A+', 'A', 'A-', 'BBB+', 'BBB', 'BBB-', 'BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-', 'CC', 'C', 'D']
  return scale[Math.max(0, Math.min(scale.length - 1, Math.round(n)))]
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card" style={{ padding: 14 }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  )
}

function SectionHeader({ title, source, asOf, onCite }: { title: string; source: string; asOf?: string | null; onCite: () => void }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{title}</span>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {asOf && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>As of {asOf}</span>}
        <CitationChip label={`◆ ${sourceChipLabel(source)}`} onClick={onCite} />
      </div>
    </div>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ width: 12, height: 3, background: color, borderRadius: 2, display: 'inline-block' }} />
      {label}
    </span>
  )
}

function DetailGrid({ rows }: { rows: [string, string][] }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 16px' }}>
      {rows.map(([k, v]) => (
        <div key={k}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>{k}</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{v}</div>
        </div>
      ))}
    </div>
  )
}
