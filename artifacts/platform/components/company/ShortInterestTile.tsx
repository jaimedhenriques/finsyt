'use client'
/**
 * Short Interest tile (Task #410)
 * ───────────────────────────────
 * Equity short-positioning for the company page overview tab. Fetches
 * `/api/short-interest?symbol=…` which aggregates public, keyless signals:
 * FINRA daily short-sale volume (latest %, multi-day trend) and best-effort
 * SEC fails-to-deliver.
 *
 * Like the prediction-markets tile, this needs no connector. When no short
 * volume is published for the symbol it renders a neutral empty state (not a
 * connect CTA) and exposes a citation chip that feeds the page-level drawer.
 */
import { useEffect, useState } from 'react'
import { Badge, Skeleton } from '@/components/ui'
import type { CiteFn, AltDataCitation } from '@/components/alt-data/cards'

interface ShortVolumeDay {
  date: string
  shortVolume: number
  shortExemptVolume: number
  totalVolume: number
  shortPct: number | null
}

interface FtdRecord { date: string; quantity: number; price: number | null }

interface ApiResult {
  symbol: string
  shortVolume: ShortVolumeDay[]
  latest: ShortVolumeDay | null
  avgShortPct: number | null
  ftd: FtdRecord[]
  latestFtd: FtdRecord | null
  source: string
  providerError: string | null
  fetchedAt: string
}

const cardHeaderStyle: React.CSSProperties = {
  padding: '14px 16px', borderBottom: '1px solid var(--border)',
  fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
}

function pct(p: number | null): string {
  return p == null ? '—' : `${(p * 100).toFixed(1)}%`
}

function fmtVol(v: number | null): string {
  if (v == null) return '—'
  const abs = Math.abs(v)
  if (abs >= 1e9) return `${(v / 1e9).toFixed(2)}B`
  if (abs >= 1e6) return `${(v / 1e6).toFixed(1)}M`
  if (abs >= 1e3) return `${(v / 1e3).toFixed(0)}K`
  return String(v)
}

function fmtDate(d: string): string {
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

/** Compact inline sparkline of the short% trend. */
function Sparkline({ rows }: { rows: ShortVolumeDay[] }) {
  const pts = rows.map(r => r.shortPct).filter((p): p is number => p != null)
  if (pts.length < 2) return null
  const min = Math.min(...pts)
  const max = Math.max(...pts)
  const range = max - min || 1
  const W = 120, H = 28
  const step = W / (pts.length - 1)
  const path = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(H - ((p - min) / range) * H).toFixed(1)}`)
    .join(' ')
  const rising = pts[pts.length - 1] >= pts[0]
  return (
    <svg width={W} height={H} style={{ display: 'block' }} aria-hidden>
      <path d={path} fill="none" stroke={rising ? '#DC2626' : '#16A34A'} strokeWidth={1.75} />
    </svg>
  )
}

function buildCitation(data: ApiResult): AltDataCitation {
  const fields = [
    { label: 'Latest short %', value: pct(data.latest?.shortPct ?? null) },
    { label: 'Short volume', value: fmtVol(data.latest?.shortVolume ?? null) },
    { label: 'Total volume', value: fmtVol(data.latest?.totalVolume ?? null) },
    { label: 'Avg short % (window)', value: pct(data.avgShortPct) },
    { label: 'As of', value: data.latest ? fmtDate(data.latest.date) : '—' },
  ]
  if (data.latestFtd) {
    fields.push({ label: 'Latest FTD shares', value: fmtVol(data.latestFtd.quantity) })
    fields.push({ label: 'FTD as of', value: fmtDate(data.latestFtd.date) })
  }
  return {
    provider: data.source,
    title: `${data.symbol} short positioning`,
    subtitle: 'FINRA short-sale volume + SEC fails-to-deliver',
    fields,
    retrievedAt: data.fetchedAt,
    raw: data,
  }
}

export default function ShortInterestTile({
  symbol, onCite,
}: { symbol: string; onCite?: CiteFn }) {
  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    fetch(`${base}/api/short-interest?symbol=${encodeURIComponent(symbol)}&days=10`)
      .then(r => r.json())
      .then((res: ApiResult) => { if (!cancelled) setData(res) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol])

  const latest = data?.latest || null
  const rows = data?.shortVolume || []

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={cardHeaderStyle}>
        <span>Short Positioning</span>
        <Badge tone="violet" style={{ fontSize: 9 }}>FINRA + SEC FTD</Badge>
      </div>

      {loading ? (
        <div style={{ padding: '16px' }}>
          <Skeleton style={{ height: 14, marginBottom: 10 }} />
          <Skeleton style={{ height: 28 }} />
        </div>
      ) : error ? (
        <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Short-positioning data is unavailable right now.
        </div>
      ) : !latest ? (
        <div style={{ padding: '22px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.55 }}>
          No published short-sale volume for {symbol} in the recent window.
          <div style={{ marginTop: 6, fontSize: 11 }}>
            FINRA only publishes consolidated off-exchange volume for U.S.-listed equities.
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Short volume / total ({fmtDate(latest.date)})</div>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{pct(latest.shortPct)}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {fmtVol(latest.shortVolume)} of {fmtVol(latest.totalVolume)} shares
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <Sparkline rows={rows} />
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>
                {rows.length}-day trend · avg {pct(data?.avgShortPct ?? null)}
              </div>
            </div>
          </div>

          {data?.latestFtd && (
            <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600 }}>Fails-to-deliver ({fmtDate(data.latestFtd.date)})</span>
              <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>{fmtVol(data.latestFtd.quantity)} shares</span>
            </div>
          )}

          <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <span>Read-only research signal · source: {data?.source && data.source !== 'none' ? data.source : 'FINRA + SEC'}</span>
            {onCite && (
              <button
                type="button"
                title="View source"
                onClick={() => onCite(`${data?.source || 'FINRA'} — short positioning`, `${symbol} short positioning`, buildCitation(data!))}
                style={{
                  padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800,
                  border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                  color: 'var(--accent-text)', cursor: 'pointer', flexShrink: 0,
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                }}
              >[1]</button>
            )}
          </div>
        </>
      )}
    </div>
  )
}
