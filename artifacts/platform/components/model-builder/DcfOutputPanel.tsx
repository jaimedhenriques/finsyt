'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DcfResult, ModelAssumptions } from './types'
import SensitivityGrid from './SensitivityGrid'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface Props {
  dcf: DcfResult
  initialAssumptions: ModelAssumptions
  currentPrice?: number | null
  onExportCsv?: (rows: string[][]) => void
}

function fmt(n: number | null | undefined, prefix = '', suffix = ''): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return prefix + n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + suffix
}
function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return (n * 100).toFixed(2) + '%'
}
function fmtM(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'T'
  if (Math.abs(n) >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'B'
  return '$' + n.toFixed(1) + 'M'
}
function fmtPx(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return '$' + n.toFixed(2)
}

const LABEL: Record<string, string> = {
  wacc: 'WACC', terminalGrowth: 'Terminal Growth',
  growthStage1: 'Stage 1 Growth', growthStage2: 'Stage 2 Growth',
  stage1Years: 'Stage 1 Years', stage2Years: 'Stage 2 Years',
}

const PROVIDER_LABELS: Record<string, string> = {
  fmp: 'Financial Modeling Prep',
  financialdatasets: 'Financial Datasets',
  eodhd: 'EODHD',
  finnhub: 'Finnhub',
  synthetic: 'Synthetic (demo)',
  financials: 'Financials provider',
}

function ProvenanceBadge({ provider, asOf, sourceUrl }: { provider?: string; asOf?: string | null; sourceUrl?: string }) {
  const label = provider ? (PROVIDER_LABELS[provider] ?? provider) : 'Financials provider'
  const dateStr = asOf ? new Date(asOf).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ padding: '2px 7px', borderRadius: 999, background: 'rgba(99,102,241,0.08)', color: 'var(--accent)', fontSize: 10, fontWeight: 700, letterSpacing: '0.04em' }}>
        SOURCE
      </span>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: 'var(--accent)', textDecoration: 'underline', textDecorationStyle: 'dotted' }}>
          {label}
        </a>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{label}</span>
      )}
      {dateStr && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· as of {dateStr}</span>
      )}
      <span style={{ fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic' }}>· trailing 12-month financials</span>
    </div>
  )
}

export default function DcfOutputPanel({ dcf, initialAssumptions, currentPrice, onExportCsv }: Props) {
  const [assumptions, setAssumptions] = useState<ModelAssumptions>(initialAssumptions)
  const [liveResult, setLiveResult] = useState<DcfResult>(dcf)
  const [recomputing, setRecomputing] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const baseFcf = dcf.derivedFromFinancials?.baseFcf ?? (dcf.assumptions as any)?.baseFcf
  const netDebt = dcf.derivedFromFinancials?.netDebt ?? (dcf.assumptions as any)?.netDebt ?? 0
  const shares = dcf.derivedFromFinancials?.sharesOutstanding ?? (dcf.assumptions as any)?.sharesOutstanding

  // Debounced recompute on assumption change
  const recompute = useCallback(async (a: ModelAssumptions) => {
    if (!baseFcf) return
    setRecomputing(true)
    try {
      const r = await fetch(`${BASE}/api/model-builder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseFcf,
          netDebt,
          sharesOutstanding: shares,
          wacc: a.wacc,
          terminalGrowth: a.terminalGrowth,
          growthStage1: a.growthStage1,
          growthStage2: a.growthStage2,
          stage1Years: a.stage1Years,
          stage2Years: a.stage2Years,
          terminalExitMultiple: a.terminalExitMultiple,
        }),
      })
      if (r.ok) {
        const j = await r.json()
        setLiveResult(j)
      }
    } finally {
      setRecomputing(false)
    }
  }, [baseFcf, netDebt, shares])

  function updateAssumption<K extends keyof ModelAssumptions>(key: K, raw: string) {
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    // Percentages come in as display-% — convert to decimal
    const val = (['wacc','terminalGrowth','growthStage1','growthStage2'] as string[]).includes(key)
      ? n / 100
      : n
    const next = { ...assumptions, [key]: val }
    setAssumptions(next)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => recompute(next), 500)
  }

  useEffect(() => { return () => clearTimeout(debounceRef.current) }, [])

  function pct(v: number) { return (v * 100).toFixed(2) }

  const result = liveResult
  const upside = (currentPrice != null && result.intrinsicValuePerShare != null && currentPrice > 0)
    ? ((result.intrinsicValuePerShare - currentPrice) / currentPrice) * 100
    : null

  // Build rows for CSV export
  function buildCsvRows(): string[][] {
    const rows: string[][] = []
    rows.push(['DCF Model Output'])
    rows.push(['Ticker', dcf.ticker || ''])
    const prov = dcf.derivedFromFinancials
    if (prov?.provider) {
      const provLabel = PROVIDER_LABELS[prov.provider] ?? prov.provider
      rows.push(['Data Source', provLabel + (prov.asOf ? ` (as of ${prov.asOf})` : '')])
      if (prov.sourceUrl) rows.push(['Source URL', prov.sourceUrl])
    }
    rows.push([])
    rows.push(['Assumptions'])
    rows.push(['WACC', pct(assumptions.wacc) + '%'])
    rows.push(['Terminal Growth', pct(assumptions.terminalGrowth) + '%'])
    rows.push(['Stage 1 Growth', pct(assumptions.growthStage1) + '%'])
    rows.push(['Stage 2 Growth', pct(assumptions.growthStage2) + '%'])
    rows.push(['Stage 1 Years', String(assumptions.stage1Years)])
    rows.push(['Stage 2 Years', String(assumptions.stage2Years)])
    if (baseFcf) rows.push(['Base FCF (TTM, $M)', baseFcf.toFixed(1), prov?.provider ? `Source: ${prov.provider}` : ''])
    if (netDebt) rows.push(['Net Debt ($M)', netDebt.toFixed(1), prov?.provider ? `Source: ${prov.provider}` : ''])
    if (shares)  rows.push(['Shares Outstanding (M)', shares.toFixed(1), prov?.provider ? `Source: ${prov.provider}` : ''])
    rows.push([])
    rows.push(['Year-by-Year FCF Projections'])
    rows.push(['Year', 'FCF ($M)', 'Growth %', 'Discount Factor', 'PV ($M)'])
    for (const y of result.years || []) {
      rows.push([String(y.year), y.fcf.toFixed(1), fmtPct(y.growth), y.discountFactor.toFixed(4), y.presentValue.toFixed(1)])
    }
    rows.push([])
    rows.push(['Summary'])
    rows.push(['PV of Explicit FCF ($M)', result.pvOfExplicitFcf?.toFixed(1) ?? ''])
    rows.push(['Terminal Value ($M)',      result.terminalValue?.toFixed(1) ?? ''])
    rows.push(['PV of Terminal Value ($M)',result.pvOfTerminalValue?.toFixed(1) ?? ''])
    rows.push(['Enterprise Value ($M)',    result.enterpriseValue?.toFixed(1) ?? ''])
    rows.push(['Equity Value ($M)',        result.equityValue?.toFixed(1) ?? ''])
    rows.push(['Intrinsic Value/Share',    result.intrinsicValuePerShare?.toFixed(2) ?? ''])
    rows.push(['TV % of EV',              fmtPct(result.terminalValuePctOfEv)])
    if (currentPrice != null) rows.push(['Current Market Price', '$' + currentPrice.toFixed(2)])
    if (upside != null) rows.push(['Implied Upside / Downside', upside.toFixed(1) + '%'])
    return rows
  }

  const pctFields: Array<keyof ModelAssumptions> = ['wacc', 'terminalGrowth', 'growthStage1', 'growthStage2']
  const intFields: Array<keyof ModelAssumptions> = ['stage1Years', 'stage2Years']

  if (dcf.error) {
    return (
      <div style={{ padding: '24px', color: 'var(--text-secondary)', background: 'var(--bg-card)', borderRadius: 10, border: '1px solid var(--border)' }}>
        <div style={{ fontWeight: 700, color: 'var(--neg)', marginBottom: 6 }}>DCF could not run</div>
        <div style={{ fontSize: 13 }}>{dcf.error}</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { label: 'Intrinsic Value/Share', value: fmtPx(result.intrinsicValuePerShare), highlight: true },
          { label: 'Equity Value', value: fmtM(result.equityValue != null ? result.equityValue * 1 : null) },
          { label: 'Enterprise Value', value: fmtM(result.enterpriseValue) },
          { label: 'PV Explicit FCF', value: fmtM(result.pvOfExplicitFcf) },
          { label: 'PV Terminal Value', value: fmtM(result.pvOfTerminalValue) },
          { label: 'TV % of EV', value: fmtPct(result.terminalValuePctOfEv) },
          ...(upside != null ? [{ label: 'Implied Upside', value: upside.toFixed(1) + '%', pos: upside >= 0 }] : []),
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: k.highlight ? 20 : 16, fontWeight: 800, color: 'pos' in k ? (k.pos ? 'var(--pos)' : 'var(--neg)') : k.highlight ? 'var(--accent)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', opacity: recomputing ? 0.5 : 1, transition: 'opacity 0.2s' }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Editable assumptions */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>Assumptions</div>
          <div style={{ display: 'flex', gap: 8 }}>
            {recomputing && (
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>Recomputing…</span>
            )}
            <button
              onClick={() => onExportCsv?.(buildCsvRows())}
              style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontSize: 11, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              ⬇ Export DCF CSV
            </button>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
          {(Object.keys(LABEL) as Array<keyof ModelAssumptions>).filter(k => k !== 'terminalExitMultiple').map((key) => {
            const isPct = pctFields.includes(key)
            const isInt = intFields.includes(key)
            const rawVal = assumptions[key] as number
            const displayVal = isPct ? pct(rawVal) : rawVal
            return (
              <div key={key}>
                <label style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>
                  {LABEL[key]} {isPct ? '(%)' : isInt ? '(yrs)' : ''}
                </label>
                <input
                  type="number"
                  step={isPct ? 0.25 : 1}
                  min={isPct ? 0.01 : 1}
                  max={isPct ? 99 : 20}
                  value={displayVal}
                  onChange={e => updateAssumption(key, isPct ? e.target.value : String(Number(e.target.value)))}
                  style={{
                    width: '100%', padding: '6px 10px', borderRadius: 6, fontSize: 13,
                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                    color: 'var(--text-primary)', fontFamily: 'inherit', outline: 'none',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                />
              </div>
            )
          })}
        </div>
        {baseFcf != null && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
              <span>
                Base FCF (TTM):&nbsp;
                <strong style={{ color: 'var(--text-secondary)' }}>{fmtM(baseFcf)}</strong>
              </span>
              <span>
                Net Debt:&nbsp;
                <strong style={{ color: 'var(--text-secondary)' }}>{fmtM(netDebt)}</strong>
              </span>
              {shares != null && (
                <span>
                  Shares:&nbsp;
                  <strong style={{ color: 'var(--text-secondary)' }}>{shares.toFixed(0)}M</strong>
                </span>
              )}
            </div>
            <ProvenanceBadge
              provider={dcf.derivedFromFinancials?.provider}
              asOf={dcf.derivedFromFinancials?.asOf}
              sourceUrl={dcf.derivedFromFinancials?.sourceUrl}
            />
          </div>
        )}
      </div>

      {/* Year-by-year projections */}
      {result.years && result.years.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>FCF Projections</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ width: '100%' }}>
              <thead>
                <tr>
                  <th>Year</th>
                  <th className="right">FCF ($M)</th>
                  <th className="right">Growth</th>
                  <th className="right">Discount Factor</th>
                  <th className="right">PV ($M)</th>
                </tr>
              </thead>
              <tbody>
                {result.years.map((y) => (
                  <tr key={y.year} style={{ opacity: recomputing ? 0.5 : 1, transition: 'opacity 0.2s' }}>
                    <td style={{ fontWeight: 700 }}>Year {y.year}</td>
                    <td className="right">{fmtM(y.fcf)}</td>
                    <td className="right" style={{ color: y.growth >= 0 ? 'var(--pos)' : 'var(--neg)' }}>{fmtPct(y.growth)}</td>
                    <td className="right">{y.discountFactor.toFixed(4)}</td>
                    <td className="right">{fmtM(y.presentValue)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: 'var(--bg-elevated)' }}>
                  <td style={{ fontWeight: 800 }}>Terminal Value</td>
                  <td className="right" style={{ fontWeight: 700 }} colSpan={3}>{fmtM(result.terminalValue)}</td>
                  <td className="right" style={{ fontWeight: 700 }}>{fmtM(result.pvOfTerminalValue)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Sensitivity grid */}
      {result.sensitivity && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 12 }}>Sensitivity Analysis</div>
          <SensitivityGrid
            grid={result.sensitivity}
            baseWacc={assumptions.wacc}
            baseTg={assumptions.terminalGrowth}
            currentPrice={currentPrice ?? undefined}
          />
        </div>
      )}
    </div>
  )
}
