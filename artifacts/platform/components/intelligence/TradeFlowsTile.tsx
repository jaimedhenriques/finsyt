'use client'
import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

interface TradeFlowResult {
  query: string
  reporterCountry?: string
  commodity?: string
  latestYear?: number
  exportValueUsd?: number | null
  importValueUsd?: number | null
  tradeBalanceUsd?: number | null
  exportsGdpPct?: number | null
  importsGdpPct?: number | null
  signals?: string[]
  source: string
  fetchedAt: string
  unavailable?: boolean
  unavailableReason?: string
}

const COMMODITIES = [
  { key: 'semiconductors', label: 'Semiconductors' },
  { key: 'oil', label: 'Oil' },
  { key: 'lng', label: 'LNG' },
  { key: 'steel', label: 'Steel' },
  { key: 'copper', label: 'Copper' },
  { key: 'wheat', label: 'Wheat' },
  { key: 'lithium', label: 'Lithium' },
  { key: 'pharmaceuticals', label: 'Pharma' },
]

function fmtUsd(n?: number | null): string {
  if (n == null || !isFinite(n)) return '—'
  const a = Math.abs(n)
  if (a >= 1e12) return `$${(n / 1e12).toFixed(1)}T`
  if (a >= 1e9)  return `$${(n / 1e9).toFixed(1)}B`
  if (a >= 1e6)  return `$${(n / 1e6).toFixed(0)}M`
  return `$${n.toLocaleString()}`
}

interface Props {
  defaultCountry?: string
  defaultCommodity?: string
  compact?: boolean
}

export default function TradeFlowsTile({ defaultCountry = 'US', defaultCommodity = 'semiconductors', compact }: Props) {
  const [country, setCountry] = useState(defaultCountry)
  const [commodity, setCommodity] = useState(defaultCommodity)
  const [data, setData] = useState<TradeFlowResult | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`${BASE}/api/intelligence/trade-flows?country=${country}&commodity=${commodity}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) { setData(d); setLoading(false) } })
      .catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [country, commodity])

  const balance = data?.tradeBalanceUsd
  const balanceColor = balance == null ? 'var(--text-primary)'
    : balance > 0 ? 'var(--pos)' : balance < 0 ? 'var(--neg)' : 'var(--text-primary)'

  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          Trade Flow Signals
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {['US','CN','DE','JP','KR','TW','IN','GB','FR','SG'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select
            value={commodity}
            onChange={e => setCommodity(e.target.value)}
            style={{ fontSize: 11, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', cursor: 'pointer' }}
          >
            {COMMODITIES.map(c => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div style={{ height: 60, background: 'var(--bg-secondary)', borderRadius: 6, animation: 'pulse 1.5s infinite' }} />
      ) : !data || data.unavailable ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {data?.unavailableReason || 'Source unavailable'}
          <div style={{ fontSize: 10, marginTop: 4 }}>Source: UN Comtrade / World Bank Trade</div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
            <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--pos)' }}>{fmtUsd(data.exportValueUsd)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Exports {data.latestYear}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: 'var(--neg)' }}>{fmtUsd(data.importValueUsd)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Imports {data.latestYear}</div>
            </div>
            <div style={{ padding: '8px 10px', borderRadius: 6, background: 'var(--bg-secondary)', textAlign: 'center' }}>
              <div style={{ fontWeight: 800, fontSize: 13, color: balanceColor }}>{fmtUsd(data.tradeBalanceUsd)}</div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>Balance</div>
            </div>
          </div>

          {!compact && (data.exportsGdpPct != null || data.importsGdpPct != null) && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              {data.exportsGdpPct != null && (
                <div style={{ fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Exports / GDP </span>
                  <span style={{ fontWeight: 700 }}>{data.exportsGdpPct.toFixed(1)}%</span>
                </div>
              )}
              {data.importsGdpPct != null && (
                <div style={{ fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)' }}>Imports / GDP </span>
                  <span style={{ fontWeight: 700 }}>{data.importsGdpPct.toFixed(1)}%</span>
                </div>
              )}
            </div>
          )}

          {data.signals && data.signals.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
              {data.signals.map((s, i) => (
                <div key={i} style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 6 }}>
                  <span style={{ color: 'var(--accent)' }}>→</span>
                  {s}
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', paddingTop: 8 }}>
            Source: {data.source} · {data.fetchedAt ? new Date(data.fetchedAt).toLocaleDateString() : ''}
          </div>
        </>
      )}
    </div>
  )
}
