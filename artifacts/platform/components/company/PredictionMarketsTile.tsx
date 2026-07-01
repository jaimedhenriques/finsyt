'use client'
/**
 * Prediction Markets tile (Task #395)
 * ───────────────────────────────────
 * Read-only company-relevant prediction-market odds for the company page
 * overview tab. Fetches `/api/prediction-markets?symbol=…&name=…` which
 * ranks active Polymarket + Kalshi markets by relevance to the company.
 *
 * Unlike the Apify-backed alt-data tiles, this tile needs no connector —
 * both venues are queried through their public read-only APIs. When no
 * relevant markets exist it renders a neutral empty state (not a connect
 * CTA). Each row links back to the originating market and exposes a
 * citation chip that feeds the page-level drawer.
 */
import { useEffect, useState } from 'react'
import { Badge, Skeleton } from '@/components/ui'
import type { CiteFn, AltDataCitation } from '@/components/alt-data/cards'

interface PredictionMarket {
  id: string
  provider: 'polymarket' | 'kalshi'
  source: string
  question: string
  category: string | null
  yesProbability: number | null
  oneDayChange: number | null
  volume: number | null
  liquidity: number | null
  closeDate: string | null
  url: string
}

interface ApiResult {
  markets: PredictionMarket[]
  source: string
  count: number
  providerError: string | null
  fetchedAt: string
}

const cardHeaderStyle: React.CSSProperties = {
  padding: '14px 16px', borderBottom: '1px solid var(--border)',
  fontSize: 13, fontWeight: 700, color: 'var(--text-primary)',
  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
}

function pct(p: number | null): string {
  return p == null ? '—' : `${Math.round(p * 100)}%`
}

function fmtVol(v: number | null): string {
  if (v == null) return '—'
  return v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}K` : `$${v.toFixed(0)}`
}

function fmtDate(d: string | null): string {
  if (!d) return ''
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildCitation(m: PredictionMarket, fetchedAt: string): AltDataCitation {
  return {
    provider: m.source,
    title: m.question,
    subtitle: m.category || undefined,
    url: m.url,
    fields: [
      { label: 'Implied probability', value: pct(m.yesProbability) },
      { label: '24h change', value: m.oneDayChange == null ? '—' : `${m.oneDayChange >= 0 ? '+' : ''}${(m.oneDayChange * 100).toFixed(1)} pts` },
      { label: 'Volume', value: fmtVol(m.volume) },
      { label: 'Closes', value: fmtDate(m.closeDate) || '—' },
      { label: 'Venue', value: m.source },
    ],
    retrievedAt: fetchedAt,
    raw: m,
  }
}

export default function PredictionMarketsTile({
  symbol, companyName, onCite, limit = 6,
}: { symbol: string; companyName?: string; onCite?: CiteFn; limit?: number }) {
  const [data, setData] = useState<ApiResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const base = process.env.NEXT_PUBLIC_BASE_PATH || ''
    const sp = new URLSearchParams({ symbol, limit: String(limit) })
    if (companyName) sp.set('name', companyName)
    fetch(`${base}/api/prediction-markets?${sp.toString()}`)
      .then(r => r.json())
      .then((res: ApiResult) => { if (!cancelled) setData(res) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [symbol, companyName, limit])

  const markets = data?.markets || []

  return (
    <div className="card" style={{ overflow: 'hidden' }}>
      <div style={cardHeaderStyle}>
        <span>Prediction Markets</span>
        <Badge tone="violet" style={{ fontSize: 9 }}>Polymarket + Kalshi</Badge>
      </div>

      {loading ? (
        <div style={{ padding: '4px 0' }}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ padding: '12px 16px', borderBottom: i === 2 ? 'none' : '1px solid var(--border)', display: 'flex', gap: 10 }}>
              <Skeleton style={{ height: 12, flex: 1 }} />
              <Skeleton style={{ height: 12, width: 48 }} />
            </div>
          ))}
        </div>
      ) : error ? (
        <div style={{ padding: '20px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          Prediction-market odds are unavailable right now.
        </div>
      ) : markets.length === 0 ? (
        <div style={{ padding: '22px 16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.55 }}>
          No active prediction markets reference {companyName || symbol} right now.
          <div style={{ marginTop: 6, fontSize: 11 }}>
            Browse all markets on the <a href={`${process.env.NEXT_PUBLIC_BASE_PATH || ''}/app/markets`} style={{ color: 'var(--accent-text)' }}>Markets → Predictions</a> tab.
          </div>
        </div>
      ) : (
        <>
          {markets.map((m, i) => (
            <div key={m.id} style={{ padding: '10px 16px', borderBottom: i === markets.length - 1 ? 'none' : '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <a href={m.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.question}</span>
                </a>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Badge tone={m.provider === 'kalshi' ? 'blue' : 'violet'} style={{ fontSize: 9 }}>{m.source}</Badge>
                  {m.closeDate && <span>closes {fmtDate(m.closeDate)}</span>}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>{pct(m.yesProbability)}</div>
                {m.oneDayChange != null && (
                  <div className={m.oneDayChange >= 0 ? 'pos' : 'neg'} style={{ fontSize: 11, fontWeight: 600 }}>
                    {(m.oneDayChange >= 0 ? '+' : '') + (m.oneDayChange * 100).toFixed(1)}pts
                  </div>
                )}
              </div>
              {onCite && (
                <button
                  type="button"
                  title="View source"
                  onClick={() => onCite(`${m.source} — prediction market`, m.question, buildCitation(m, data?.fetchedAt || new Date().toISOString()))}
                  style={{
                    marginLeft: 4, padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 800,
                    border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                    color: 'var(--accent-text)', cursor: 'pointer', flexShrink: 0,
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  }}
                >[{i + 1}]</button>
              )}
            </div>
          ))}
          <div style={{ padding: '8px 16px', fontSize: 10, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
            Implied odds · read-only research signal · source: {data?.source && data.source !== 'none' ? data.source : 'Polymarket + Kalshi'}
          </div>
        </>
      )}
    </div>
  )
}
