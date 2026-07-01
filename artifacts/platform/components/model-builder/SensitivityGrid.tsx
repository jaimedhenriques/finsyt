'use client'
import type { SensitivityGrid as SensitivityGridType } from './types'

interface Props {
  grid: SensitivityGridType
  baseWacc: number
  baseTg: number
  currentPrice?: number | null
}

function fmtVal(v: number): string {
  if (!Number.isFinite(v)) return '—'
  if (Math.abs(v) >= 1e9) return '$' + (v / 1e9).toFixed(1) + 'B'
  if (Math.abs(v) >= 1e6) return '$' + (v / 1e6).toFixed(1) + 'M'
  return '$' + v.toFixed(2)
}

export default function SensitivityGrid({ grid, baseWacc, baseTg, currentPrice }: Props) {
  const { rowLabel, colLabel, rowValues, colValues, values } = grid

  // Find min/max for heat mapping
  const flat = values.flat().filter(v => Number.isFinite(v))
  const min = Math.min(...flat)
  const max = Math.max(...flat)
  const range = max - min || 1

  function heatColor(v: number): string {
    if (!Number.isFinite(v)) return 'transparent'
    const t = (v - min) / range // 0 = min (cold), 1 = max (hot)
    // Blue (low) → neutral → green (high) in dark-mode friendly tones
    if (t < 0.5) {
      const s = t * 2
      return `rgba(99,102,241,${0.08 + s * 0.18})`
    } else {
      const s = (t - 0.5) * 2
      return `rgba(16,185,129,${0.08 + s * 0.22})`
    }
  }

  const isBaseRow = (r: number) => Math.abs(rowValues[r] - baseWacc) < 0.001
  const isBaseCol = (c: number) => Math.abs(colValues[c] - baseTg) < 0.001

  const rowPct = rowValues.map(v => (v * 100).toFixed(2) + '%')
  const colPct = colValues.map(v => (v * 100).toFixed(2) + '%')

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
        Sensitivity: {rowLabel} (rows) × {colLabel} (columns)
        {currentPrice != null && (
          <span style={{ marginLeft: 12, color: 'var(--text-secondary)', textTransform: 'none', fontWeight: 500 }}>
            Current price: ${currentPrice.toFixed(2)}
          </span>
        )}
      </div>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, fontFamily: 'inherit', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ padding: '4px 10px', textAlign: 'right', color: 'var(--text-muted)', fontWeight: 700, fontSize: 10, borderBottom: '1px solid var(--border)' }}>
              WACC \ g
            </th>
            {colPct.map((label, c) => (
              <th key={c} style={{
                padding: '4px 10px', textAlign: 'right', fontWeight: isBaseCol(c) ? 800 : 600,
                color: isBaseCol(c) ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 10, borderBottom: '1px solid var(--border)',
                background: isBaseCol(c) ? 'rgba(99,102,241,0.06)' : undefined,
              }}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowValues.map((rv, r) => (
            <tr key={r}>
              <td style={{
                padding: '4px 10px', textAlign: 'right', fontWeight: isBaseRow(r) ? 800 : 600,
                color: isBaseRow(r) ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 10, borderBottom: '1px solid var(--border)',
                background: isBaseRow(r) ? 'rgba(99,102,241,0.06)' : undefined,
              }}>
                {rowPct[r]}
              </td>
              {colValues.map((_cv, c) => {
                const v = values[r][c]
                const isBase = isBaseRow(r) && isBaseCol(c)
                const abovePrice = currentPrice != null && Number.isFinite(v) && v > currentPrice
                return (
                  <td key={c} style={{
                    padding: '5px 10px', textAlign: 'right',
                    background: heatColor(v),
                    fontWeight: isBase ? 800 : 500,
                    color: isBase ? 'var(--accent)' : abovePrice ? 'var(--pos)' : 'var(--text-primary)',
                    borderBottom: '1px solid var(--border)',
                    borderLeft: isBaseCol(c) ? '1px solid rgba(99,102,241,0.2)' : undefined,
                    fontSize: 12,
                    outline: isBase ? '2px solid var(--accent)' : undefined,
                    outlineOffset: -2,
                  }}>
                    {fmtVal(v)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>
        Bold/outlined cell = base assumptions. Green = above current market price.
      </div>
    </div>
  )
}
