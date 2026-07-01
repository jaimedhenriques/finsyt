'use client'
import { useEffect, useState } from 'react'
import { Card, PageHero, ContextualAskBar } from '@/components/ui'
import YahooComplianceNote from '@/components/YahooComplianceNote'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

type SectorRef = { etf: string; label: string }
type Holding = { symbol: string | null; name: string | null; pct: number | null }
type Weight = { sector: string; pct: number | null }
type Fund = {
  symbol: string
  name: string | null
  holdings: Holding[]
  sectorWeightings: Weight[]
}

const SECTOR_LABEL: Record<string, string> = {
  realestate: 'Real Estate', consumer_cyclical: 'Consumer Cyclical', basic_materials: 'Basic Materials',
  consumer_defensive: 'Consumer Defensive', technology: 'Technology', communication_services: 'Communication Services',
  financial_services: 'Financial Services', utilities: 'Utilities', industrials: 'Industrials',
  energy: 'Energy', healthcare: 'Healthcare',
}
function pretty(s: string) { return SECTOR_LABEL[s] || s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()) }

export default function SectorsPage() {
  const [sectors, setSectors] = useState<SectorRef[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [fund, setFund] = useState<Fund | null>(null)
  const [etf, setEtf] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState<string | null>(null)

  useEffect(() => {
    fetch(`${BASE}/api/sector`)
      .then(r => r.json())
      .then(d => { setSectors(d?.sectors || []); if (d?.sectors?.[0]) setActive(d.sectors[0].label) })
      .catch(() => setSectors([]))
  }, [])

  useEffect(() => {
    if (!active) return
    let live = true
    setLoading(true); setNote(null)
    fetch(`${BASE}/api/sector?sector=${encodeURIComponent(active)}`)
      .then(r => r.json())
      .then(d => { if (!live) return; setFund(d?.fund || null); setEtf(d?.etf || null); setNote(d?.note || null) })
      .catch(() => { if (live) { setFund(null); setNote('Sector aggregate unavailable.') } })
      .finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [active])

  return (
    <div style={{ background: 'var(--bg-page)', minHeight: '100vh' }}>
      <PageHero
        eyebrow="Markets"
        title="Sector Aggregates"
        accentWord="Aggregates"
        subtitle="The largest constituents and intra-sector mix of each GICS sector, proxied through its SPDR Select-Sector ETF. Supplementary data sourced from Yahoo Finance."
      />

      <div style={{ padding: '0 1.75rem 2.5rem', display: 'grid', gap: 18, maxWidth: 1100 }}>
        <ContextualAskBar
          context="Sectors"
          contextData={{ page: 'sectors', sector: active }}
          chips={[
            { label: 'Which sector is most concentrated?', prompt: 'Across the GICS sectors, which one has the highest top-holding concentration and why does that matter?' },
            { label: 'Explain SPDR sector ETFs', prompt: 'Explain how the SPDR Select-Sector ETFs (XLK, XLF, XLE, etc.) map to GICS sectors.' },
          ]}
          placeholder="Ask Finsyt about a sector…"
          style={{ margin: '0 0 8px' }}
        />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {sectors.map(s => (
            <button
              key={s.etf}
              onClick={() => setActive(s.label)}
              style={{
                padding: '7px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: '1px solid', borderColor: active === s.label ? 'var(--accent)' : 'var(--border)',
                background: active === s.label ? 'var(--accent)' : 'var(--bg-card)',
                color: active === s.label ? '#fff' : 'var(--text-secondary)',
              }}
            >
              {s.label} <span style={{ opacity: 0.65, fontWeight: 600 }}>· {s.etf}</span>
            </button>
          ))}
        </div>

        {loading && (
          <Card padding="20px"><span className="skeleton" style={{ width: '100%', height: 200, display: 'block' }} /></Card>
        )}

        {!loading && !fund && (
          <Card padding="32px 20px" style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
            {note || 'Select a sector to view its aggregate.'}
          </Card>
        )}

        {!loading && fund && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 20 }}>
              {fund.holdings.length > 0 && (
                <div className="card" style={{ overflow: 'hidden' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Top Constituents</span>
                    {etf && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>via {etf}</span>}
                  </div>
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

              {fund.sectorWeightings.length > 0 && (
                <div className="card" style={{ overflow: 'hidden', alignSelf: 'start' }}>
                  <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--text-primary)' }}>Intra-sector Mix</div>
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
            </div>
            <YahooComplianceNote />
          </>
        )}
      </div>
    </div>
  )
}
