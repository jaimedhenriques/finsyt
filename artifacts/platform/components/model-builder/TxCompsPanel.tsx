'use client'
import type { TxCompsResult } from './types'

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
function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return (n >= 0 ? '+' : '') + (n * 100).toFixed(1) + '%'
}

const PILL_COLORS: Record<string, string> = {
  completed: 'var(--pos)',
  pending: 'var(--warn)',
  announced: '#6366f1',
  terminated: 'var(--neg)',
  withdrawn: 'var(--neg)',
}

function StatusPill({ status }: { status: string }) {
  const color = PILL_COLORS[status.toLowerCase()] ?? 'var(--text-muted)'
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 999, fontSize: 10, fontWeight: 800,
      letterSpacing: '0.04em', textTransform: 'uppercase',
      background: color + '22', color,
    }}>
      {status}
    </span>
  )
}

export default function TxCompsPanel({ txComps, ticker, onExportCsv }: {
  txComps: TxCompsResult
  ticker?: string
  onExportCsv?: (rows: string[][]) => void
}) {
  if (txComps.error) {
    return (
      <div style={{ padding: '14px 18px', borderRadius: 10, border: '1px solid var(--neg)', background: 'var(--neg-dim)', color: 'var(--neg)', fontSize: 13 }}>
        <strong>Tx Comps Error:</strong> {txComps.error}
      </div>
    )
  }

  if (txComps.skipped || !txComps.deals || txComps.deals.length === 0) {
    return (
      <div style={{ padding: '28px 24px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center' }}>
        <div style={{ fontWeight: 700, marginBottom: 6, color: 'var(--text-primary)' }}>No precedent transactions found</div>
        <div style={{ maxWidth: 420, margin: '0 auto' }}>
          No M&amp;A deals were found for {ticker ?? 'this ticker'} via the deals provider.
          Transaction comps require deal history for the target or a comparable peer in the same sector.
        </div>
      </div>
    )
  }

  const stats = txComps.stats

  function buildCsv() {
    if (!txComps.deals) return
    const rows: string[][] = []
    rows.push([`Precedent Transaction Comps — ${ticker ?? 'Target'}`])
    if (txComps.source) rows.push(['Source', txComps.source])
    rows.push([])
    if (stats) {
      rows.push(['=== SUMMARY STATS ==='])
      rows.push(['Transactions', String(stats.count)])
      rows.push(['Median EV/EBITDA', stats.medianEvEbitda?.toFixed(2) ?? '—'])
      rows.push(['Mean EV/EBITDA', stats.meanEvEbitda?.toFixed(2) ?? '—'])
      rows.push(['Q1 / Q3 EV/EBITDA', `${stats.q1EvEbitda?.toFixed(2) ?? '—'} / ${stats.q3EvEbitda?.toFixed(2) ?? '—'}`])
      rows.push(['Median EV/Revenue', stats.medianEvRevenue?.toFixed(2) ?? '—'])
      rows.push(['Avg Deal Value', stats.meanDealValue ? fmtM(stats.meanDealValue) : '—'])
      rows.push([])
    }
    rows.push(['=== TRANSACTIONS ==='])
    rows.push(['Acquirer', 'Target', 'Date', 'Status', 'Type', 'Deal Value', 'EV/EBITDA', 'EV/Revenue', 'Premium'])
    for (const d of txComps.deals) {
      rows.push([d.acquirer, d.target, d.announceDate ?? '', d.status, d.type, d.dealValue?.toFixed(1) ?? '', d.evEbitda?.toFixed(2) ?? '', d.evRevenue?.toFixed(2) ?? '', d.premium != null ? (d.premium * 100).toFixed(1) + '%' : ''])
    }
    onExportCsv?.(rows)
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* Stats strip */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 10 }}>
          {[
            { label: 'Transactions', value: String(stats.count) },
            { label: 'Median EV/EBITDA', value: fmtMult(stats.medianEvEbitda) },
            { label: 'EV/EBITDA Range', value: stats.q1EvEbitda != null && stats.q3EvEbitda != null ? `${fmtMult(stats.q1EvEbitda)}–${fmtMult(stats.q3EvEbitda)}` : '—' },
            { label: 'Median EV/Revenue', value: fmtMult(stats.medianEvRevenue) },
            { label: 'Avg Deal Value', value: fmtM(stats.meanDealValue) },
          ].map((k, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{k.label}</div>
              <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: 'var(--text-primary)' }}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Deals table */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Precedent Transactions
          </span>
          {txComps.source && (
            <span style={{ fontSize: 10, color: 'var(--text-muted)', padding: '2px 8px', borderRadius: 999, background: 'rgba(99,102,241,0.08)', fontWeight: 700 }}>
              SOURCE: {txComps.source.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 700 }}>
            <thead>
              <tr>
                {[
                  { label: 'Acquirer', right: false },
                  { label: 'Target', right: false },
                  { label: 'Date', right: false },
                  { label: 'Status', right: false },
                  { label: 'Type', right: false },
                  { label: 'Deal Value', right: true },
                  { label: 'EV/EBITDA', right: true },
                  { label: 'EV/Revenue', right: true },
                  { label: 'Premium', right: true },
                ].map(h => (
                  <th key={h.label} style={{
                    padding: '6px 12px', textAlign: h.right ? 'right' : 'left',
                    fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
                    textTransform: 'uppercase', color: 'var(--text-muted)',
                    borderBottom: '1px solid var(--border-strong)',
                    whiteSpace: 'nowrap',
                  }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {txComps.deals.map((d, i) => (
                <tr key={d.id} style={{ background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', fontWeight: 600, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.acquirer}
                    {d.acquirerSymbol && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{d.acquirerSymbol}</span>}
                  </td>
                  <td style={{ padding: '7px 12px', fontSize: 12, color: 'var(--text-primary)', borderBottom: '1px solid var(--border)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {d.target}
                    {d.targetSymbol && <span style={{ marginLeft: 5, fontSize: 10, color: 'var(--text-muted)', fontWeight: 700 }}>{d.targetSymbol}</span>}
                  </td>
                  <td style={{ padding: '7px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{d.announceDate ?? '—'}</td>
                  <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border)' }}><StatusPill status={d.status} /></td>
                  <td style={{ padding: '7px 12px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>{d.type}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)' }}>{fmtM(d.dealValue)}</td>
                  <td style={{
                    padding: '7px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)',
                    fontWeight: d.evEbitda != null ? 700 : 400,
                    color: d.evEbitda != null ? 'var(--text-primary)' : 'var(--text-muted)',
                  }}>{fmtMult(d.evEbitda)}</td>
                  <td style={{ padding: '7px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)', color: 'var(--text-secondary)' }}>{fmtMult(d.evRevenue)}</td>
                  <td style={{
                    padding: '7px 12px', fontSize: 12, textAlign: 'right', fontVariantNumeric: 'tabular-nums', borderBottom: '1px solid var(--border)',
                    color: d.premium != null ? (d.premium > 0 ? 'var(--pos)' : 'var(--neg)') : 'var(--text-muted)',
                  }}>{fmtPct(d.premium)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Attribution + export */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Precedent transactions via {txComps.source ?? 'FMP M&A'}.
          EV/EBITDA multiples are estimated from disclosed deal values where target EBITDA is available;
          transactions without public financials show —.
        </div>
        <button onClick={buildCsv}
          style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)', fontWeight: 700, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>
          ⬇ Export CSV
        </button>
      </div>
    </div>
  )
}
