'use client'
import { useState } from 'react'
import type { LboResult, LboAssumptionsSpec } from './types'

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return (n * 100).toFixed(1) + '%'
}
function fmtM(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'T'
  if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'B'
  return '$' + n.toFixed(1) + 'M'
}
function fmtMult(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(2) + 'x'
}
function fmtNum(n: number | null | undefined, dec = 2): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(dec)
}
function cell(v: string, right = false, bold = false) {
  return (
    <td style={{
      padding: '6px 12px', borderBottom: '1px solid var(--border)',
      textAlign: right ? 'right' : 'left',
      fontWeight: bold ? 700 : 400,
      fontSize: 12, fontVariantNumeric: 'tabular-nums',
      color: 'var(--text-primary)',
    }}>{v}</td>
  )
}
function th(label: string, right = false) {
  return (
    <th style={{
      padding: '6px 12px', textAlign: right ? 'right' : 'left',
      fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
      textTransform: 'uppercase', color: 'var(--text-muted)',
      borderBottom: '1px solid var(--border-strong)',
    }}>{label}</th>
  )
}

function SensitivityTable({ grid, label }: { grid: { rowLabel: string; colLabel: string; rowValues: number[]; colValues: number[]; irrGrid: number[][]; moicGrid: number[][] }; label: 'irr' | 'moic' }) {
  const data = label === 'irr' ? grid.irrGrid : grid.moicGrid
  const fmt = label === 'irr' ? (v: number) => fmtPct(v) : (v: number) => v.toFixed(2) + 'x'
  const midRow = Math.floor(grid.rowValues.length / 2)
  const midCol = Math.floor(grid.colValues.length / 2)

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 360 }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-strong)', textAlign: 'left' }}>
              {grid.rowLabel} ↓ / {grid.colLabel} →
            </th>
            {grid.colValues.map(c => (
              <th key={c} style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border-strong)', textAlign: 'right' }}>
                {c.toFixed(1)}x
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, ri) => (
            <tr key={ri} style={{ background: ri % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
              <td style={{ padding: '5px 12px', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                {grid.rowValues[ri]?.toFixed(1)}x
              </td>
              {row.map((v, ci) => {
                const isBase = ri === midRow && ci === midCol
                const good = label === 'irr' ? v >= 0.20 : v >= 2.5
                const warn = label === 'irr' ? v < 0.15 : v < 1.5
                return (
                  <td key={ci} style={{
                    padding: '5px 12px', fontSize: 12, textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: isBase ? 800 : 400,
                    borderBottom: '1px solid var(--border)',
                    background: isBase ? 'var(--accent-dim)' : undefined,
                    color: isBase ? 'var(--accent-text)' : good ? 'var(--pos)' : warn ? 'var(--neg)' : 'var(--text-primary)',
                  }}>
                    {Number.isFinite(v) ? fmt(v) : '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function LboPanel({ lbo, ticker, onExportCsv }: {
  lbo: LboResult
  ticker?: string
  onExportCsv?: (rows: string[][]) => void
}) {
  const [sensTab, setSensTab] = useState<'irr' | 'moic'>('irr')
  const [scheduleOpen, setScheduleOpen] = useState(true)

  if (lbo.error) {
    return (
      <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--neg)', background: 'var(--neg-dim)', color: 'var(--neg)', fontSize: 13 }}>
        <strong>LBO Error:</strong> {lbo.error}
      </div>
    )
  }
  if (!lbo.sourcesUses || !lbo.schedule || !lbo.returns) return null

  const su = lbo.sourcesUses
  const ret = lbo.returns

  function buildCsv() {
    if (!lbo.sourcesUses || !lbo.schedule || !lbo.returns) return
    const rows: string[][] = []
    rows.push([`LBO Model — ${ticker ?? 'Target'}`])
    rows.push([])
    rows.push(['=== SOURCES & USES ==='])
    rows.push(['Item', 'Amount ($M)'])
    rows.push(['Purchase EV', su.purchaseEv.toFixed(1)])
    rows.push(['Transaction Fees', su.transactionFees.toFixed(1)])
    rows.push(['Total Uses', su.totalUses.toFixed(1)])
    rows.push([])
    for (const t of su.tranches) rows.push([t.name + ' (Source)', t.principal.toFixed(1)])
    rows.push(['Sponsor Equity', su.sponsorEquity.toFixed(1)])
    rows.push(['Total Sources', su.totalUses.toFixed(1)])
    rows.push([])
    rows.push(['=== DEBT SCHEDULE ==='])
    rows.push(['Year', 'EBITDA', 'Levered FCF', 'Interest', 'Amort', 'Debt Balance', 'Equity Value'])
    for (const y of lbo.schedule) {
      rows.push([String(y.year), y.ebitda.toFixed(1), y.lFcf.toFixed(1), y.totalInterest.toFixed(1), y.totalAmortization.toFixed(1), y.debtBalance.toFixed(1), y.equityValue.toFixed(1)])
    }
    rows.push([])
    rows.push(['=== RETURNS ==='])
    rows.push(['IRR', fmtPct(ret.irr)])
    rows.push(['MOIC', ret.moic.toFixed(2) + 'x'])
    rows.push(['Exit EV', ret.exitEv.toFixed(1)])
    rows.push(['Net Equity Proceeds', ret.netEquityProceeds.toFixed(1)])
    onExportCsv?.(rows)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Returns KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10 }}>
        {[
          { label: 'IRR', value: fmtPct(ret.irr), good: ret.irr >= 0.20, warn: ret.irr < 0.15 },
          { label: 'MOIC', value: fmtMult(ret.moic), good: ret.moic >= 2.5, warn: ret.moic < 2.0 },
          { label: 'Exit EV', value: fmtM(ret.exitEv), good: false, warn: false },
          { label: 'Net Equity Proceeds', value: fmtM(ret.netEquityProceeds), good: false, warn: false },
          { label: 'Residual Debt', value: fmtM(ret.residualDebt), good: false, warn: false },
          { label: 'Equity Cushion', value: fmtPct(su.equityPct), good: su.equityPct >= 0.35, warn: su.equityPct < 0.25 },
        ].map((k, i) => (
          <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: k.good ? 'var(--pos)' : k.warn ? 'var(--neg)' : 'var(--text-primary)' }}>
              {k.value}
            </div>
          </div>
        ))}
      </div>

      {/* Warnings from the engine */}
      {lbo.warnings && lbo.warnings.length > 0 && (
        <div style={{ padding: '12px 16px', borderRadius: 8, border: '1px solid var(--warn)', background: 'rgba(245,158,11,0.06)', display: 'grid', gap: 4 }}>
          {lbo.warnings.map((w, i) => (
            <div key={i} style={{ fontSize: 12, color: 'var(--warn)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, fontWeight: 800 }}>⚠</span>
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Sources & Uses */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Sources &amp; Uses
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
          {/* Uses */}
          <div style={{ borderRight: '1px solid var(--border)' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Uses</th>
                <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>$M</th>
              </tr></thead>
              <tbody>
                <tr><td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>Purchase EV</td><td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)' }}>{fmtM(su.purchaseEv)}</td></tr>
                <tr><td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>Transaction Fees</td><td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)' }}>{fmtM(su.transactionFees)}</td></tr>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px 12px', fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>Total Uses</td>
                  <td style={{ padding: '6px 12px', fontSize: 12, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(su.totalUses)}</td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* Sources */}
          <div>
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead><tr>
                <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>Sources</th>
                <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>$M</th>
                <th style={{ padding: '6px 12px', fontSize: 10, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>Rate</th>
              </tr></thead>
              <tbody>
                {su.tranches.map((t, i) => (
                  <tr key={i}>
                    <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>{t.name}</td>
                    <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)' }}>{fmtM(t.principal)}</td>
                    <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)', color: 'var(--text-muted)' }}>{fmtPct(t.rate)}</td>
                  </tr>
                ))}
                {su.managementRollover > 0 && (
                  <tr>
                    <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>Mgmt Rollover</td>
                    <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)' }}>{fmtM(su.managementRollover)}</td>
                    <td style={{ padding: '6px 12px', borderBottom: '1px solid var(--border)' }} />
                  </tr>
                )}
                <tr>
                  <td style={{ padding: '6px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)' }}>Sponsor Equity</td>
                  <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)' }}>{fmtM(su.sponsorEquity)}</td>
                  <td style={{ padding: '6px 12px', fontSize: 12, textAlign: 'right', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{fmtPct(su.equityPct)}</td>
                </tr>
                <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                  <td style={{ padding: '6px 12px', fontSize: 12, fontWeight: 800 }}>Total Sources</td>
                  <td style={{ padding: '6px 12px', fontSize: 12, fontWeight: 800, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtM(su.totalUses)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Debt schedule */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setScheduleOpen(o => !o)}
          style={{ width: '100%', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', borderBottom: scheduleOpen ? '1px solid var(--border)' : 'none' }}
        >
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Debt Schedule &amp; FCF Projection</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{scheduleOpen ? '▲' : '▼'}</span>
        </button>
        {scheduleOpen && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 600 }}>
              <thead>
                <tr>
                  {[
                    { label: 'Year', right: false },
                    { label: 'EBITDA ($M)', right: true },
                    { label: 'Levered FCF ($M)', right: true },
                    { label: 'Interest ($M)', right: true },
                    { label: 'Amort ($M)', right: true },
                    { label: 'Debt Balance ($M)', right: true },
                    { label: 'Equity Value ($M)', right: true },
                  ].map(h => th(h.label, h.right))}
                </tr>
              </thead>
              <tbody>
                {lbo.schedule!.map((y, i) => (
                  <tr key={y.year} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    {cell(`Year ${y.year}`)}
                    {cell(fmtM(y.ebitda), true)}
                    {cell(fmtM(y.lFcf), true, false)}
                    {cell(fmtM(y.totalInterest), true)}
                    {cell(fmtM(y.totalAmortization), true)}
                    {cell(fmtM(y.debtBalance), true)}
                    {cell(fmtM(y.equityValue), true, true)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Sensitivity */}
      {lbo.sensitivity && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Sensitivity — Entry × Exit Multiple
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['irr', 'moic'] as const).map(t => (
                <button key={t} type="button" onClick={() => setSensTab(t)}
                  style={{
                    padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                    border: '1px solid',
                    borderColor: sensTab === t ? 'var(--accent)' : 'var(--border)',
                    background: sensTab === t ? 'var(--accent-dim)' : 'transparent',
                    color: sensTab === t ? 'var(--accent-text)' : 'var(--text-muted)',
                    cursor: 'pointer', fontFamily: 'inherit',
                  }}>
                  {t.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={{ padding: 14 }}>
            <SensitivityTable grid={lbo.sensitivity} label={sensTab} />
            <div style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
              Base case (shaded). IRR: green ≥ 20%, red &lt; 15%. MOIC: green ≥ 2.5x, red &lt; 2.0x.
            </div>
          </div>
        </div>
      )}

      {/* Export */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={buildCsv}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>
          ⬇ Export LBO CSV
        </button>
      </div>
    </div>
  )
}
