'use client'
import { useEffect, useState } from 'react'
import YahooComplianceNote from '@/components/YahooComplianceNote'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type Fund = {
  symbol: string
  quoteType: string | null
  name: string | null
  family: string | null
  category: string | null
  legalType: string | null
  feesExpensesNet: number | null
  feesExpensesGross: number | null
  summary: string | null
  holdings: { symbol: string | null; name: string | null; pct: number | null }[]
  sectorWeightings: { sector: string; pct: number | null }[]
  assetWeightings: Record<string, number | null> | null
  bondRatings: { rating: string; pct: number | null }[]
}

const SECTOR_LABEL: Record<string, string> = {
  realestate: 'Real Estate', consumer_cyclical: 'Consumer Cyclical', basic_materials: 'Basic Materials',
  consumer_defensive: 'Consumer Defensive', technology: 'Technology', communication_services: 'Communication Services',
  financial_services: 'Financial Services', utilities: 'Utilities', industrials: 'Industrials',
  energy: 'Energy', healthcare: 'Healthcare',
}
const ASSET_LABEL: Record<string, string> = {
  stockPosition: 'Stocks', bondPosition: 'Bonds', cashPosition: 'Cash', otherPosition: 'Other',
  preferredPosition: 'Preferred', convertiblePosition: 'Convertible',
}

function pretty(s: string) { return SECTOR_LABEL[s] || s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

/**
 * Shared fund/ETF profile surface. Used on the company page Fund tab and on the
 * dedicated /app/funds/[symbol] view. Data is keyless-Yahoo (source: yahoo),
 * supplementary, and degrades to an empty state for non-funds.
 */
export default function FundProfile({ symbol }: { symbol: string }) {
  const [fund, setFund] = useState<Fund | null>(null)
  const [loading, setLoading] = useState(true)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    fetch(`${BASE}/api/fund?symbol=${encodeURIComponent(symbol)}`)
      .then(r => r.json())
      .then(d => { if (!live) return; setFund(d?.fund || null); setNote(d?.note || null) })
      .catch(() => { if (live) { setFund(null); setNote('Fund/ETF data unavailable.') } })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [symbol])

  if (loading) {
    return (
      <div className="card" style={{ padding: 20 }}>
        <span className="skeleton" style={{ width: 200, height: 16, display: 'block', marginBottom: 14 }} />
        <span className="skeleton" style={{ width: '100%', height: 120, display: 'block' }} />
      </div>
    )
  }
  if (!fund) {
    return (
      <div className="card" style={{ padding: '32px 20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
        {note || `No fund/ETF profile for ${symbol}. This view applies to ETFs and mutual funds (e.g. SPY, QQQ, VTI).`}
      </div>
    )
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <div className="card" style={{ padding: '16px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{fund.name || fund.symbol}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              {[fund.quoteType, fund.family, fund.category].filter(Boolean).join(' · ')}
            </div>
          </div>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>source: yahoo</span>
        </div>
        {(fund.feesExpensesNet != null || fund.feesExpensesGross != null) && (
          <div style={{ display: 'flex', gap: 24, marginTop: 12 }}>
            {fund.feesExpensesNet != null && (
              <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Net expense </span><strong style={{ color: 'var(--text-primary)' }}>{(fund.feesExpensesNet * 100).toFixed(2)}%</strong></div>
            )}
            {fund.feesExpensesGross != null && (
              <div><span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Gross expense </span><strong style={{ color: 'var(--text-primary)' }}>{(fund.feesExpensesGross * 100).toFixed(2)}%</strong></div>
            )}
          </div>
        )}
        {fund.summary && <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 12, lineHeight: 1.55 }}>{fund.summary}</p>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
        {fund.holdings.length > 0 && (
          <div className="card" style={{ overflow: 'hidden' }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Top Holdings</div>
            <table className="data-table">
              <thead><tr><th>Symbol</th><th>Name</th><th className="right">Weight</th></tr></thead>
              <tbody>
                {fund.holdings.map((h, i) => (
                  <tr key={i}>
                    <td style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{h.symbol || '—'}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{h.name || '—'}</td>
                    <td className="right" style={{ fontWeight: 600 }}>{h.pct == null ? '—' : `${h.pct.toFixed(2)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={{ display: 'grid', gap: 20, alignContent: 'start' }}>
          {fund.sectorWeightings.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Sector Weightings</div>
              <div style={{ padding: '12px 20px', display: 'grid', gap: 8 }}>
                {fund.sectorWeightings.sort((a, b) => (b.pct || 0) - (a.pct || 0)).map((w, i) => (
                  <div key={i} style={{ display: 'grid', gap: 3 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span style={{ color: 'var(--text-muted)' }}>{pretty(w.sector)}</span>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{w.pct == null ? '—' : `${w.pct.toFixed(1)}%`}</span>
                    </div>
                    <div style={{ height: 5, background: 'var(--border)', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${Math.min(100, w.pct || 0)}%`, height: '100%', background: 'var(--accent)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fund.assetWeightings && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Asset Allocation</div>
              <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {Object.entries(fund.assetWeightings).filter(([, v]) => v != null && v !== 0).map(([k, v]) => (
                  <div key={k}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)' }}>{(v as number).toFixed(1)}%</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{ASSET_LABEL[k] || k}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fund.bondRatings.length > 0 && (
            <div className="card" style={{ overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Bond Credit Quality</div>
              <div style={{ padding: '12px 20px', display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                {fund.bondRatings.map((b, i) => (
                  <div key={i}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--text-primary)' }}>{b.pct == null ? '—' : `${b.pct.toFixed(1)}%`}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{b.rating}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <YahooComplianceNote />
    </div>
  )
}
